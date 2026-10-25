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
  /** Streams whose zlib data runs on past the next `stream` keyword (never in a real PDF): each is inflated to the end of the file. */
  pdfMaxOverlappingStreams: 32,
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

/** Inflates at most `cap` bytes; null when the data is not valid zlib. Trailing bytes are ignored; `read` counts the input bytes used. */
function inflateWithCap(data: Buffer, cap: number): { output: Buffer; read: number } | typeof INFLATE_OVERFLOW | null {
  try {
    const result = inflateSync(data, { maxOutputLength: Math.max(1, cap), finishFlush: constants.Z_SYNC_FLUSH, info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
    return { output: result.buffer, read: result.engine.bytesWritten };
  } catch (error) {
    return isBufferTooLarge(error) ? INFLATE_OVERFLOW : null;
  }
}

/**
 * Inflates the zlib data of a stream, at most `cap` bytes. The data of a
 * real stream ends before the next `stream` keyword (its own `endstream` at
 * the latest), so it is first inflated up to there (`window`): each stream is
 * then read once. Only zlib data still running at that point, which may
 * cover the next streams, is inflated again from the whole rest of the file
 * (`data`), at most `pdfMaxOverlappingStreams` times: 2,000 such streams
 * chained through empty zlib blocks took 5 s on 4 MB.
 */
function inflateStreamData(window: Buffer, data: Buffer, cap: number, overlaps: { count: number; max: number }) {
  const read = inflateWithCap(window, cap);
  if (read === INFLATE_OVERFLOW || read === null || read.read < window.length || window.length === data.length) return read;
  if (++overlaps.count > overlaps.max) throw new Error("cv_validation_pdf_stream_count_exceeded");
  return inflateWithCap(data, cap);
}

/** Plain integer value of a dictionary key; null when absent or indirect (`7 0 R`). */
function directInteger(dictionary: string, key: string) {
  const match = new RegExp(`/${key}\\s+(\\d+)(\\s+\\d+\\s+R\\b)?`).exec(dictionary);
  return match && !match[2] ? Number(match[1]) : null;
}

/** What ends a name (`/A/B`, `/A B`): white-space as \s reads it in a latin1 string, the PDF delimiters and NUL. */
const ENDS_PDF_NAME = new Uint8Array(256);
for (const char of "\t\n\v\f\r \xa0<>[]()%{}\0") ENDS_PDF_NAME[char.charCodeAt(0)] = 1;

/** Value of a hexadecimal digit, -1 for any other character. */
function hexValue(code: number) {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  const lower = code | 0x20;
  return lower >= 0x61 && lower <= 0x66 ? lower - 0x57 : -1;
}

/**
 * PDF names may spell any character as #xx (`/J#61vaScript` is /JavaScript,
 * `/#4A#53` is /JS): they are decoded before any keyword is searched. One
 * pass over the text, without a regular expression per name: 4 MB of `/#41`
 * took 0.7 s.
 */
export function decodePdfNames(text: string) {
  if (!text.includes("#")) return text;
  const parts: string[] = [];
  let copied = 0;
  let inName = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x2f) inName = true;
    else if (code < 256 && ENDS_PDF_NAME[code]) inName = false;
    else if (code === 0x23 && inName) {
      const high = hexValue(text.charCodeAt(index + 1));
      const low = high === -1 ? -1 : hexValue(text.charCodeAt(index + 2));
      if (low === -1) continue;
      if (index > copied) parts.push(text.slice(copied, index));
      parts.push(String.fromCharCode(high * 16 + low));
      index += 2;
      copied = index + 1;
    }
  }
  parts.push(text.slice(copied));
  return parts.join("");
}

/** pdf.js reads an object stream from its /N and /First entries, whatever its /Type says. */
function isObjectStreamDictionary(names: string) {
  return /\/Type\s*\/ObjStm\b/.test(names) || (/\/First\b/.test(names) && /\/N\b/.test(names));
}

const PDF_NAME_END = "(?=[\\0\\t\\n\\f\\r /<>\\[\\]()%{}]|$)";
const PDF_SPACE = "[\\0\\t\\n\\f\\r ]*";
/** pdf.js reads /F as /Filter and /DP as /DecodeParms. */
const FILTER_KEY = new RegExp(`/(?:Filter|F)${PDF_NAME_END}`);
const DECODE_PARMS_KEY = new RegExp(`/(?:DecodeParms|DP)${PDF_NAME_END}`);
const FLATE_NAME = `/(?:FlateDecode|Fl)${PDF_NAME_END}`;
const FLATE_ONLY_VALUE = new RegExp(`^${PDF_SPACE}(?:${FLATE_NAME}|\\[${PDF_SPACE}(?:${FLATE_NAME}${PDF_SPACE})+\\])`);

/** Flate, alone or chained, without /DecodeParms. */
function isFlateOnly(names: string) {
  if (DECODE_PARMS_KEY.test(names)) return false;
  // One key at a time, not matchAll: a dictionary of 4 MB of "/F/Fl" holds 800,000 keys.
  const filterKey = new RegExp(FILTER_KEY.source, "g");
  let keys = 0;
  for (let key = filterKey.exec(names); key; key = filterKey.exec(names)) {
    if (!FLATE_ONLY_VALUE.test(names.slice(filterKey.lastIndex))) return false;
    keys += 1;
  }
  return keys > 0;
}

type PlainValue =
  | { kind: "name"; name: string }
  | { kind: "integer" }
  | { kind: "reference" }
  | { kind: "names" }
  | { kind: "integers"; entries: Map<string, number> };

/** A token of a plain dictionary, followed by white-space or a delimiter. */
const PLAIN_TOKEN = /[\0\t\n\f\r ]*(\/[A-Za-z0-9]+|\d+|<<|>>|\[|\]|R)(?=[\0\t\n\f\r /<>[\]]|$)/;
const INTEGER = /^\d+$/;

/**
 * Top-level entries of a dictionary written plainly, the way producers write
 * an object stream's: names of letters and digits, integers, references,
 * arrays of names and dictionaries of integers. Null for anything else
 * (strings, #xx escapes, comments, a key given twice, a value where a key is
 * expected…), which pdf.js might read another way than this check.
 */
function plainDictionaryEntries(text: string): Map<string, PlainValue> | null {
  const tokens: string[] = [];
  const token = new RegExp(PLAIN_TOKEN.source, "y");
  while (token.lastIndex < text.length) {
    const match = token.exec(text);
    if (!match) return null;
    tokens.push(match[1]!);
  }
  let index = 0;
  const entriesUntilEnd = <T>(value: () => T | null) => {
    const entries = new Map<string, T>();
    for (let key = tokens[index++]; key !== ">>"; key = tokens[index++]) {
      if (!key?.startsWith("/") || entries.has(key)) return null;
      const read = value();
      if (read === null) return null;
      entries.set(key, read);
    }
    return entries;
  };
  const value = (): PlainValue | null => {
    const first = tokens[index++];
    if (first === undefined) return null;
    if (first.startsWith("/")) return { kind: "name", name: first };
    if (INTEGER.test(first)) {
      if (!INTEGER.test(tokens[index] ?? "") || tokens[index + 1] !== "R") return { kind: "integer" };
      index += 2;
      return { kind: "reference" };
    }
    if (first === "[") {
      for (let item = tokens[index++]; item !== "]"; item = tokens[index++]) if (!item?.startsWith("/")) return null;
      return { kind: "names" };
    }
    if (first !== "<<") return null;
    const entries = entriesUntilEnd(() => {
      const integer = tokens[index++];
      return integer !== undefined && INTEGER.test(integer) ? Number(integer) : null;
    });
    return entries && { kind: "integers", entries };
  };
  if (tokens[index++] !== "<<") return null;
  const entries = entriesUntilEnd(value);
  return entries && index === tokens.length ? entries : null;
}

/** Parameters of the PNG predictor pdf.js applies after Flate (PredictorStream). */
type PngPredictor = { pixelBytes: number; rowBytes: number };

/**
 * Predictor of a Flate object stream that carries /DecodeParms, read from a
 * plain dictionary with one /Filter /FlateDecode and one /DecodeParms
 * dictionary, with pdf.js's defaults: null for none (/Predictor 1),
 * undefined when it cannot be decoded here (TIFF predictor, arrays,
 * indirect values…).
 */
function flatePredictor(dictionary: string): PngPredictor | null | undefined {
  const entries = plainDictionaryEntries(dictionary);
  if (!entries) return undefined;
  // pdf.js reads /F before /Filter and /DP before /DecodeParms: a dictionary with both is not decoded here.
  const filterKeys = ["/F", "/Filter"].filter(key => entries.has(key));
  const parmsKeys = ["/DP", "/DecodeParms"].filter(key => entries.has(key));
  if (filterKeys.length !== 1 || parmsKeys.length !== 1) return undefined;
  const filter = entries.get(filterKeys[0]!)!;
  const parms = entries.get(parmsKeys[0]!)!;
  if (filter.kind !== "name" || (filter.name !== "/FlateDecode" && filter.name !== "/Fl") || parms.kind !== "integers") return undefined;
  const parameter = (key: string, fallback: number) => parms.entries.get(key) || fallback;
  const predictor = parameter("/Predictor", 1);
  if (predictor <= 1) return null;
  if (predictor < 10 || predictor > 15) return undefined;
  const colors = parameter("/Colors", 1);
  const bits = (parms.entries.has("/BPC") ? parms.entries.get("/BPC") : parms.entries.get("/BitsPerComponent")) || 8;
  const columns = parameter("/Columns", 1);
  // Beyond 32-bit integers, pdf.js's row size wraps around.
  if (colors * bits > 1 << 20 || columns * colors * bits > 1 << 30) return undefined;
  return { pixelBytes: (colors * bits + 7) >> 3, rowBytes: (columns * colors * bits + 7) >> 3 };
}

/**
 * PNG prediction undone row by row as pdf.js does it (readBlockPng): each
 * row starts with its type (0 none, 1 sub, 2 up, 3 average, 4 Paeth). pdf.js
 * completes a short last row with zeros, white-space that is left out here,
 * so that a huge /Columns allocates nothing. Null for another row type,
 * which pdf.js cannot read either.
 */
function undoPngPredictor(data: Buffer, { pixelBytes, rowBytes }: PngPredictor): Buffer | null {
  const output = Buffer.alloc(data.length);
  let end = 0;
  for (let at = 0, length = 0; at + 1 < data.length; at += rowBytes + 1, length += rowBytes) {
    const type = data[at]!;
    if (type > 4) return null;
    const rawLength = Math.min(rowBytes, data.length - at - 1);
    for (let index = 0; index < rawLength; index += 1) {
      const left = index >= pixelBytes ? output[length + index - pixelBytes]! : 0;
      const up = length > 0 ? output[length - rowBytes + index]! : 0;
      const upLeft = length > 0 && index >= pixelBytes ? output[length - rowBytes + index - pixelBytes]! : 0;
      let predicted = 0;
      if (type === 1) predicted = left;
      else if (type === 2) predicted = up;
      else if (type === 3) predicted = (left + up) >> 1;
      else if (type === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        predicted = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      }
      output[length + index] = (predicted + data[at + 1 + index]!) & 0xff;
    }
    end = length + rawLength;
  }
  return output.subarray(0, end);
}

/** Decoded object stream: it starts with the "object number, offset" pairs. */
const OBJECT_STREAM_HEADER = /^\s*\d+\s+\d+\s/;

/**
 * Content of an object stream searched by the checks; null when it cannot be
 * read here. Without any filter (ISO 32000 allows it), pdf.js reads the bytes
 * as they are, and they are searched with the rest of the file: nothing more
 * to add. Flate is decoded, with its PNG predictor if /DecodeParms has one.
 */
function readableObjectStream(dictionary: string, names: string, inflated: Buffer | null, work: PdfScanWork) {
  if (!FILTER_KEY.test(names)) return "";
  const predictor = DECODE_PARMS_KEY.test(names) ? flatePredictor(dictionary) : isFlateOnly(names) ? null : undefined;
  if (!inflated || predictor === undefined) return null;
  const decoded = predictor ? undoPngPredictor(inflated, predictor) : inflated;
  if (!decoded) return null;
  const content = decoded.toString("latin1");
  if (!OBJECT_STREAM_HEADER.test(content.slice(0, 64)) || containsStream(content, work)) return null;
  return content;
}

/**
 * First CR or LF at or after `from`, -1 when there is none. `from` only
 * grows: each character is read at most once per kind of end of line, so a
 * file without any end of line, or with LF only, stays linear.
 */
function lineEndFinder(source: string) {
  let cr = -2;
  let lf = -2;
  return (from: number) => {
    if (cr !== -1 && cr < from) cr = source.indexOf("\r", from);
    if (lf !== -1 && lf < from) lf = source.indexOf("\n", from);
    return cr === -1 ? lf : lf === -1 ? cr : Math.min(cr, lf);
  };
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
 * returned for the safety checks (REC-02), an empty string for one written
 * without filter (its bytes are the file's); `null` marks an object stream
 * whose content could not be read here, or a stream whose dictionary reads
 * two ways (see pdfStreamDictionaries.ts). The work stays linear in the size
 * of the file, and the number of streams is capped. The keywords are found
 * with indexOf, never a regular expression: /stream[^\r\n]*\n/ took minutes
 * on 4 MB of "stream stream…" without an end of line.
 */
export function assertPdfDecompressionWithinLimits(buffer: Buffer, limits: Pick<DocumentDecompressionLimits, "pdfMaxInflatedBytes" | "pdfMaxImagePixels" | "pdfImageProbeBytes" | "pdfMaxStreams" | "pdfMaxOverlappingStreams"> = DOCUMENT_DECOMPRESSION_LIMITS) {
  const source = buffer.toString("latin1");
  const nextLineEnd = lineEndFinder(source);
  const exceeded = () => new Error("cv_validation_pdf_decompressed_size_exceeded");
  const work = pdfScanWork(source);
  const dictionaries = readPdfStreamDictionaries(source, work);
  let inflatedBytes = 0;
  let streams = 0;
  const overlaps = { count: 0, max: limits.pdfMaxOverlappingStreams };
  const objectStreams: Array<string | null> = [];
  for (let at = source.indexOf("stream"); at !== -1;) {
    const lineEnd = nextLineEnd(at + 6);
    // No end of line left: no keyword further on starts stream data either.
    if (lineEnd === -1) break;
    const dataStart = lineEnd + (source.startsWith("\r\n", lineEnd) ? 2 : 1);
    // Every keyword of the line shares this data ("endstream endobj 5 0 obj <<…>>stream").
    // The search then goes on in the stream data: a wrong /Length or an
    // "endstream" inside the data must not hide a stream from the check.
    const keywords: number[] = [];
    for (; at !== -1 && at < dataStart; at = source.indexOf("stream", at + 6)) {
      if (source.slice(Math.max(0, at - 3), at) !== "end") keywords.push(at);
    }
    if (keywords.length === 0) continue;
    if (++streams > limits.pdfMaxStreams) throw new Error("cv_validation_pdf_stream_count_exceeded");
    const data = buffer.subarray(dataStart);
    // Up to the next "stream" keyword, `at` (see inflateStreamData).
    const window = at === -1 ? data : buffer.subarray(dataStart, at + 6);
    const dictionary = streamDictionaryText(source, keywords, dictionaries, work);
    const unclear = dictionary === UNCLEAR_PDF_STRUCTURE;
    const names = typeof dictionary === "string" ? decodePdfNames(dictionary) : "";
    // A dictionary that reads two ways may be an object stream's.
    const objectStream = unclear || isObjectStreamDictionary(names);
    const readObjectStream = (inflated: Buffer | null) => typeof dictionary === "string" ? readableObjectStream(dictionary, names, inflated, work) : null;
    if (!startsWithZlibHeader(data)) {
      if (objectStream) objectStreams.push(readObjectStream(null));
      continue;
    }
    if (!objectStream && /\/Subtype\s*\/Image\b/.test(names)) {
      const width = directInteger(names, "Width");
      const height = directInteger(names, "Height");
      if (width !== null && height !== null) {
        if (width * height > limits.pdfMaxImagePixels) throw new Error("cv_validation_pdf_image_too_large");
        const declaredBytes = width * height * 8 + 65_536;
        if (declaredBytes <= limits.pdfImageProbeBytes && inflateStreamData(window, data, declaredBytes, overlaps) === INFLATE_OVERFLOW) throw exceeded();
        continue;
      }
    }
    let layer: Buffer = data;
    let decoded = false;
    while (startsWithZlibHeader(layer)) {
      const cap = limits.pdfMaxInflatedBytes - inflatedBytes;
      // The first layer is read from the file, the next ones from memory.
      const inflated = decoded ? inflateWithCap(layer, cap) : inflateStreamData(window, data, cap, overlaps);
      if (inflated === INFLATE_OVERFLOW) throw exceeded();
      if (!inflated) break;
      inflatedBytes += inflated.output.length;
      if (inflatedBytes > limits.pdfMaxInflatedBytes) throw exceeded();
      layer = inflated.output;
      decoded = true;
    }
    if (objectStream) objectStreams.push(readObjectStream(decoded ? layer : null));
  }
  return { inflatedBytes, objectStreams };
}

const PDF_ACTIVE_CONTENT = /\/(?:JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|ImportData|SubmitForm)\b/;

export type PdfStructureInspection = {
  encrypted: boolean;
  /** JavaScript, launch, embedded file, rich media or form submission/import action. */
  activeContent: boolean;
  /** Object streams whose content could not be searched (a filter other than Flate, a predictor other than PNG, corrupt data, a stream inside), and streams whose dictionary reads two ways. */
  unreadableObjectStreams: number;
  pageCount: number;
};

/**
 * What the CV and vault PDF checks look at (REC-02): the raw bytes plus the
 * inflated object streams, inside the bounded loop above, with #xx name
 * escapes decoded. An /OpenAction alone is not active content (LibreOffice
 * writes one to open the first page); a JavaScript one is found by /JS.
 */
export function inspectPdfStructure(buffer: Buffer, limits: Pick<DocumentDecompressionLimits, "pdfMaxInflatedBytes" | "pdfMaxImagePixels" | "pdfImageProbeBytes" | "pdfMaxStreams" | "pdfMaxOverlappingStreams"> = DOCUMENT_DECOMPRESSION_LIMITS): PdfStructureInspection {
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
