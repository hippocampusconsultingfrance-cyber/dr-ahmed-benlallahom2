import { constants, inflateRawSync, inflateSync } from "node:zlib";
import { containsStream, pdfScanWork, readPdfStreamDictionaries, streamDictionaryText, UNCLEAR_PDF_STRUCTURE, type PdfScanWork } from "./pdfStreamDictionaries";

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
  /** `stream` keywords examined in one PDF: a CV has a few hundred at most. */
  pdfMaxStreams: 5_000,
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
 * PDF names may spell any character as #xx (`/J#61vaScript` is /JavaScript,
 * `/#4A#53` is /JS): they are decoded before any keyword is searched.
 */
export function decodePdfNames(text: string) {
  return text.replace(/\/[^\s/<>[\]()%{}\0]*/g, name => name.includes("#")
    ? name.replace(/#([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    : name);
}

/** pdf.js reads an object stream from its /N and /First entries, whatever its /Type says. */
function isObjectStreamDictionary(names: string) {
  return /\/Type\s*\/ObjStm\b/.test(names) || (/\/First\b/.test(names) && /\/N\b/.test(names));
}

const PDF_NAME_END = "(?=[\\0\\t\\n\\f\\r /<>\\[\\]()%{}]|$)";
const PDF_SPACE = "[\\0\\t\\n\\f\\r ]*";
/** pdf.js reads /F as /Filter and /DP as /DecodeParms. */
const FILTER_KEY = new RegExp(`/(?:Filter|F)${PDF_NAME_END}`, "g");
const DECODE_PARMS_KEY = new RegExp(`/(?:DecodeParms|DP)${PDF_NAME_END}`);
const FLATE_NAME = `/(?:FlateDecode|Fl)${PDF_NAME_END}`;
const FLATE_ONLY_VALUE = new RegExp(`^${PDF_SPACE}(?:${FLATE_NAME}|\\[${PDF_SPACE}(?:${FLATE_NAME}${PDF_SPACE})+\\])`);

/** Only Flate, without predictor, is decoded here; any other filter (or none) leaves an object stream unreadable. */
function isFlateOnly(names: string) {
  const keys = Array.from(names.matchAll(FILTER_KEY));
  return keys.length > 0 && !DECODE_PARMS_KEY.test(names) && keys.every(key => FLATE_ONLY_VALUE.test(names.slice(key.index + key[0].length)));
}

/** Decoded object stream: it starts with the "object number, offset" pairs. */
const OBJECT_STREAM_HEADER = /^\s*\d+\s+\d+\s/;

/** Content of an object stream searched by the checks; null when it cannot be read here. */
function readableObjectStream(names: string, decoded: Buffer | null, work: PdfScanWork) {
  if (!decoded || !isFlateOnly(names)) return null;
  const content = decoded.toString("latin1");
  if (!OBJECT_STREAM_HEADER.test(content.slice(0, 64)) || containsStream(content, work)) return null;
  return content;
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
 *
 * The inflated content of each object stream (PDF 1.5+, where pdf-lib,
 * Acrobat "optimised" or Word put the page and action dictionaries) is
 * returned for the safety checks (REC-02); `null` marks an object stream
 * whose content could not be read here, or a stream whose dictionary reads
 * two ways (see pdfStreamDictionaries.ts). The work stays linear in the size
 * of the file, and the number of streams is capped.
 */
export function assertPdfDecompressionWithinLimits(buffer: Buffer, limits: Pick<DocumentDecompressionLimits, "pdfMaxInflatedBytes" | "pdfMaxImagePixels" | "pdfImageProbeBytes" | "pdfMaxStreams"> = DOCUMENT_DECOMPRESSION_LIMITS) {
  const source = buffer.toString("latin1");
  const streamKeyword = /stream[^\r\n]*(?:\r\n|\r|\n)/g;
  const exceeded = () => new Error("cv_validation_pdf_decompressed_size_exceeded");
  const work = pdfScanWork(source);
  const dictionaries = readPdfStreamDictionaries(source, work);
  let inflatedBytes = 0;
  let streams = 0;
  const objectStreams: Array<string | null> = [];
  let match: RegExpExecArray | null;
  while ((match = streamKeyword.exec(source))) {
    const dataStart = match.index + match[0].length;
    // Scan the stream data too: a wrong /Length or an "endstream" inside the
    // data must not hide a stream from the check.
    streamKeyword.lastIndex = dataStart;
    // Every keyword of the line shares this data ("endstream endobj 5 0 obj <<…>>stream").
    const keywords: number[] = [];
    for (let at = match.index; at !== -1 && at < dataStart; at = source.indexOf("stream", at + 6)) {
      if (source.slice(Math.max(0, at - 3), at) !== "end") keywords.push(at);
    }
    if (keywords.length === 0) continue;
    if (++streams > limits.pdfMaxStreams) throw new Error("cv_validation_pdf_stream_count_exceeded");
    const data = buffer.subarray(dataStart);
    const dictionary = streamDictionaryText(source, keywords, dictionaries, work);
    const unclear = dictionary === UNCLEAR_PDF_STRUCTURE;
    const names = typeof dictionary === "string" ? decodePdfNames(dictionary) : "";
    // A dictionary that reads two ways may be an object stream's.
    const objectStream = unclear || isObjectStreamDictionary(names);
    if (!startsWithZlibHeader(data)) {
      if (objectStream) objectStreams.push(null);
      continue;
    }
    if (!objectStream && /\/Subtype\s*\/Image\b/.test(names)) {
      const width = directInteger(names, "Width");
      const height = directInteger(names, "Height");
      if (width !== null && height !== null) {
        if (width * height > limits.pdfMaxImagePixels) throw new Error("cv_validation_pdf_image_too_large");
        const declaredBytes = width * height * 8 + 65_536;
        if (declaredBytes <= limits.pdfImageProbeBytes && inflateWithCap(data, declaredBytes) === INFLATE_OVERFLOW) throw exceeded();
        continue;
      }
    }
    let layer: Buffer = data;
    let decoded = false;
    while (startsWithZlibHeader(layer)) {
      const inflated = inflateWithCap(layer, limits.pdfMaxInflatedBytes - inflatedBytes);
      if (inflated === INFLATE_OVERFLOW) throw exceeded();
      if (!inflated) break;
      inflatedBytes += inflated.length;
      if (inflatedBytes > limits.pdfMaxInflatedBytes) throw exceeded();
      layer = inflated;
      decoded = true;
    }
    if (objectStream) objectStreams.push(unclear ? null : readableObjectStream(names, decoded ? layer : null, work));
  }
  return { inflatedBytes, objectStreams };
}

const PDF_ACTIVE_CONTENT = /\/(?:JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|ImportData|SubmitForm)\b/;

export type PdfStructureInspection = {
  encrypted: boolean;
  /** JavaScript, launch, embedded file, rich media or form submission/import action. */
  activeContent: boolean;
  /** Object streams whose content could not be searched (no filter or another than Flate, corrupt data, a stream inside), and streams whose dictionary reads two ways. */
  unreadableObjectStreams: number;
  pageCount: number;
};

/**
 * What the CV and vault PDF checks look at (REC-02): the raw bytes plus the
 * inflated object streams, inside the bounded loop above, with #xx name
 * escapes decoded. An /OpenAction alone is not active content (LibreOffice
 * writes one to open the first page); a JavaScript one is found by /JS.
 */
export function inspectPdfStructure(buffer: Buffer, limits: Pick<DocumentDecompressionLimits, "pdfMaxInflatedBytes" | "pdfMaxImagePixels" | "pdfImageProbeBytes" | "pdfMaxStreams"> = DOCUMENT_DECOMPRESSION_LIMITS): PdfStructureInspection {
  const { objectStreams } = assertPdfDecompressionWithinLimits(buffer, limits);
  const readable = objectStreams.filter((content): content is string => content !== null);
  const text = decodePdfNames([buffer.toString("latin1"), ...readable].join("\n"));
  return {
    encrypted: /\/Encrypt\b/.test(text),
    activeContent: PDF_ACTIVE_CONTENT.test(text),
    unreadableObjectStreams: objectStreams.length - readable.length,
    pageCount: (text.match(/\/Type\s*\/Page\b/g) ?? []).length,
  };
}

/** Keeps the stored and analysed text bounded. */
export function truncateExtractedText(text: string, maxChars: number = DOCUMENT_DECOMPRESSION_LIMITS.extractedTextMaxChars) {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}
