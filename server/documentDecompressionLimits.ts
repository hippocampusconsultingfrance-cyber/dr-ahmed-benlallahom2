import { constants, inflateRawSync, inflateSync } from "node:zlib";

/**
 * Bounds applied before and during text extraction, so a small upload cannot
 * expand into gigabytes in the worker (decompression bomb) or store a huge
 * text. Every refusal is a `cv_validation_*` error: the analysis job treats
 * it as a final failure instead of retrying it.
 *
 * Two layers for PDF: a fast static check at upload (below), which refuses
 * the common bombs with a clear message, and the isolated reader
 * (`pdfExtractionSandbox.ts`) where pdf.js really decodes the file, under a
 * memory and time limit — the static check cannot see every filter chain
 * pdf.js accepts (LZW, ASCIIHex, names written with #xx escapes…).
 */
export const DOCUMENT_DECOMPRESSION_LIMITS = {
  /** Sum of the actually inflated sizes of every DOCX (ZIP) entry. */
  docxMaxUncompressedBytes: 20 * 1024 * 1024,
  docxMaxEntries: 1_000,
  /** Sum of the inflated zlib streams of a PDF (every layer), images excepted. */
  pdfMaxInflatedBytes: 40 * 1024 * 1024,
  /** Largest image a PDF may declare (pixels), since rendering decodes it. */
  pdfMaxImagePixels: 40_000_000,
  /** An image stream is checked against its declared size when that size is at most this. */
  pdfImageProbeBytes: 64 * 1024 * 1024,
  /** Pages handed to the text extractor. */
  pdfMaxExtractedPages: 25,
  /** Isolated PDF reader: process memory growth allowed while pdf.js runs. */
  pdfReaderMaxMemoryGrowthBytes: 512 * 1024 * 1024,
  /** Isolated PDF reader: JavaScript heap of the worker. */
  pdfReaderMaxHeapMb: 256,
  /** Isolated PDF reader: time allowed for the text of 25 pages / the rendering of 3 pages. */
  pdfTextTimeoutMs: 12_000,
  pdfRenderTimeoutMs: 15_000,
  /** Characters of extracted text kept for the analysis and the database. */
  extractedTextMaxChars: 200_000,
} as const;

export type DocumentDecompressionLimits = { [Key in keyof typeof DOCUMENT_DECOMPRESSION_LIMITS]: number };

function isBufferTooLarge(error: unknown) {
  return error instanceof RangeError || (error instanceof Error && (error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE");
}

export type DocxArchiveInspection = {
  entryNames: string[];
  uncompressedBytes: number;
  /** Inflated content of the relationship parts (`*.rels`). */
  relationships: string[];
};

/**
 * Walks the ZIP central directory of a DOCX and inflates every entry with a
 * hard output cap: the declared sizes cannot be trusted, the real ones are
 * measured. ZIP64, encrypted entries and unknown compression methods are
 * refused (never needed by a CV produced by a word processor).
 */
export function inspectDocxArchive(buffer: Buffer, limits = DOCUMENT_DECOMPRESSION_LIMITS): DocxArchiveInspection {
  const invalid = () => new Error("cv_validation_docx_container_invalid");
  const searchStart = Math.max(0, buffer.length - 22 - 0xffff);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw invalid();
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) throw invalid();
  if (entryCount > limits.docxMaxEntries) throw new Error("cv_validation_docx_decompressed_size_exceeded");

  const entryNames: string[] = [];
  const relationships: string[] = [];
  let uncompressedBytes = 0;
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw invalid();
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;
    if (flags & 0x1) throw new Error("cv_validation_docx_encrypted");
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) throw invalid();
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw invalid();
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > buffer.length) throw invalid();
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    const remaining = limits.docxMaxUncompressedBytes - uncompressedBytes;
    let content: Buffer;
    if (method === 0) {
      content = data;
    } else if (method === 8) {
      try {
        content = inflateRawSync(data, { maxOutputLength: Math.max(1, remaining) });
      } catch (error) {
        if (isBufferTooLarge(error)) throw new Error("cv_validation_docx_decompressed_size_exceeded");
        throw invalid();
      }
    } else {
      throw invalid();
    }
    uncompressedBytes += content.length;
    if (uncompressedBytes > limits.docxMaxUncompressedBytes) throw new Error("cv_validation_docx_decompressed_size_exceeded");
    entryNames.push(name);
    if (/\.rels$/i.test(name)) relationships.push(content.toString("utf8"));
  }
  return { entryNames, uncompressedBytes, relationships };
}

const INFLATE_OVERFLOW = Symbol("inflate_overflow");

/** zlib header (RFC 1950), what pdf.js requires at the start of Flate data. */
function startsWithZlibHeader(data: Buffer) {
  return data.length >= 2 && (data[0]! & 0x0f) === 8 && data[0]! >> 4 <= 7 && ((data[0]! << 8) | data[1]!) % 31 === 0;
}

/** Inflates at most `cap` bytes; null when the data is not valid zlib. Trailing bytes are ignored. */
function inflateWithCap(data: Buffer, cap: number): Buffer | typeof INFLATE_OVERFLOW | null {
  try {
    return inflateSync(data, { maxOutputLength: Math.max(1, cap), finishFlush: constants.Z_SYNC_FLUSH });
  } catch (error) {
    return isBufferTooLarge(error) ? INFLATE_OVERFLOW : null;
  }
}

/** Plain integer value of a dictionary key; null when absent or indirect (`7 0 R`). */
function directInteger(dictionary: string, key: string) {
  const match = new RegExp(`/${key}\\s+(\\d+)(\\s+\\d+\\s+R\\b)?`).exec(dictionary);
  return match && !match[2] ? Number(match[1]) : null;
}

/**
 * Fast static bound on the zlib data of a PDF, before storage. It does not
 * trust the dictionaries: every `stream` keyword followed by an end of line
 * (CR, LF or CRLF, as pdf.js accepts) whose data starts with a zlib header is
 * inflated, whatever its /Filter says (indirect, #xx-escaped, chained), and
 * the inflated output is inflated again while it is itself zlib data. All of
 * it counts against one shared cap. A stream declared as an image with plain
 * /Width and /Height is checked against that declared size instead (a real
 * image never inflates beyond 8 bytes per pixel); with indirect or missing
 * dimensions it counts like any other stream. What this cannot see (LZW,
 * ASCIIHex or ASCII85 first, very large declared images) is bounded where
 * pdf.js decodes it: in the isolated reader.
 */
export function assertPdfDecompressionWithinLimits(buffer: Buffer, limits: Pick<DocumentDecompressionLimits, "pdfMaxInflatedBytes" | "pdfMaxImagePixels" | "pdfImageProbeBytes"> = DOCUMENT_DECOMPRESSION_LIMITS) {
  const source = buffer.toString("latin1");
  const streamKeyword = /stream[^\r\n]*(?:\r\n|\r|\n)/g;
  const exceeded = () => new Error("cv_validation_pdf_decompressed_size_exceeded");
  let inflatedBytes = 0;
  let match: RegExpExecArray | null;
  while ((match = streamKeyword.exec(source))) {
    const dataStart = match.index + match[0].length;
    // Scan the stream data too: a wrong /Length or an "endstream" inside the
    // data must not hide a stream from the check.
    streamKeyword.lastIndex = dataStart;
    if (source.slice(Math.max(0, match.index - 3), match.index) === "end") continue;
    const data = buffer.subarray(dataStart);
    if (!startsWithZlibHeader(data)) continue;
    const objectStart = source.lastIndexOf(" obj", match.index);
    const dictionary = source.slice(Math.max(objectStart, match.index - 4_096, 0), match.index);
    if (/\/Subtype\s*\/Image\b/.test(dictionary)) {
      const width = directInteger(dictionary, "Width");
      const height = directInteger(dictionary, "Height");
      if (width !== null && height !== null) {
        if (width * height > limits.pdfMaxImagePixels) throw new Error("cv_validation_pdf_image_too_large");
        const declaredBytes = width * height * 8 + 65_536;
        if (declaredBytes <= limits.pdfImageProbeBytes && inflateWithCap(data, declaredBytes) === INFLATE_OVERFLOW) throw exceeded();
        continue;
      }
    }
    let layer: Buffer = data;
    while (startsWithZlibHeader(layer)) {
      const inflated = inflateWithCap(layer, limits.pdfMaxInflatedBytes - inflatedBytes);
      if (inflated === INFLATE_OVERFLOW) throw exceeded();
      if (!inflated) break;
      inflatedBytes += inflated.length;
      if (inflatedBytes > limits.pdfMaxInflatedBytes) throw exceeded();
      layer = inflated;
    }
  }
  return { inflatedBytes };
}

/** Keeps the stored and analysed text bounded. */
export function truncateExtractedText(text: string, maxChars: number = DOCUMENT_DECOMPRESSION_LIMITS.extractedTextMaxChars) {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}
