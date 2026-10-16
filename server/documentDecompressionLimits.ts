import { constants, inflateRawSync, inflateSync } from "node:zlib";

/**
 * Bounds applied before any text extraction, so a small upload cannot expand
 * into gigabytes in the worker (decompression bomb) or store a huge text.
 * Every refusal is a `cv_validation_*` error: the analysis job treats it as a
 * final failure instead of retrying it.
 */
export const DOCUMENT_DECOMPRESSION_LIMITS = {
  /** Sum of the actually inflated sizes of every DOCX (ZIP) entry. */
  docxMaxUncompressedBytes: 20 * 1024 * 1024,
  docxMaxEntries: 1_000,
  /** Sum of the inflated Flate streams of a PDF, images excepted. */
  pdfMaxInflatedBytes: 40 * 1024 * 1024,
  /** Largest image a PDF may declare (pixels), since rendering decodes it. */
  pdfMaxImagePixels: 40_000_000,
  /** Pages handed to the text extractor. */
  pdfMaxExtractedPages: 25,
  /** Characters of extracted text kept for the analysis and the database. */
  extractedTextMaxChars: 200_000,
} as const;

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

/**
 * Inflates every Flate stream of a PDF with a shared output cap (content,
 * fonts, object streams: what the text extractor decodes). Image streams are
 * not inflated; their declared dimensions are bounded instead.
 */
export function assertPdfDecompressionWithinLimits(buffer: Buffer, limits = DOCUMENT_DECOMPRESSION_LIMITS) {
  const source = buffer.toString("latin1");
  const streamStart = /stream\r?\n/g;
  let inflatedBytes = 0;
  let match: RegExpExecArray | null;
  while ((match = streamStart.exec(source))) {
    if (source.slice(Math.max(0, match.index - 3), match.index) === "end") continue;
    const dataStart = match.index + match[0].length;
    const dataEnd = source.indexOf("endstream", dataStart);
    if (dataEnd < 0) break;
    streamStart.lastIndex = dataEnd + "endstream".length;
    const objectStart = source.lastIndexOf(" obj", match.index);
    const dictionary = source.slice(Math.max(objectStart, match.index - 4_096, 0), match.index);
    if (/\/Subtype\s*\/Image\b/.test(dictionary)) {
      const width = Number(/\/Width\s+(\d+)/.exec(dictionary)?.[1] ?? 0);
      const height = Number(/\/Height\s+(\d+)/.exec(dictionary)?.[1] ?? 0);
      if (width * height > limits.pdfMaxImagePixels) throw new Error("cv_validation_pdf_image_too_large");
      continue;
    }
    if (!/\/FlateDecode\b|\/Fl\b/.test(dictionary)) continue;
    const remaining = limits.pdfMaxInflatedBytes - inflatedBytes;
    try {
      const inflated = inflateSync(buffer.subarray(dataStart, dataEnd), { maxOutputLength: Math.max(1, remaining), finishFlush: constants.Z_SYNC_FLUSH });
      inflatedBytes += inflated.length;
    } catch (error) {
      if (isBufferTooLarge(error)) throw new Error("cv_validation_pdf_decompressed_size_exceeded");
      // A stream with another filter first, or damaged data: the extractor
      // decodes it the same bounded way or skips it.
    }
    if (inflatedBytes > limits.pdfMaxInflatedBytes) throw new Error("cv_validation_pdf_decompressed_size_exceeded");
  }
  return { inflatedBytes };
}

/** Keeps the stored and analysed text bounded. */
export function truncateExtractedText(text: string, maxChars: number = DOCUMENT_DECOMPRESSION_LIMITS.extractedTextMaxChars) {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}
