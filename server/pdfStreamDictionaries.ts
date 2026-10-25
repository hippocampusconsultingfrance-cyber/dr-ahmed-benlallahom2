/**
 * Which dictionary each `stream` keyword of a PDF belongs to, read the way
 * pdf.js reads an object (REC-02). The PDF checks need it to tell an object
 * stream (whose content must then be searched) or an image from any other
 * stream. A window guessed before the keyword can be moved by a long string,
 * a fake `obj` or a comment, and misses the /F and /DP spellings of /Filter
 * and /DecodeParms; so the dictionary is parsed forwards from every `obj`
 * keyword, with pdf.js's rules: strings are single tokens, a token that is
 * not a name where a key is expected is skipped, and the dictionary ends at
 * the `>>` met where a key is expected. When several `obj` lead to the same
 * stream (a fake one written inside a dictionary), the earliest one wins: the
 * text checked can only be larger than the one pdf.js reads.
 *
 * Bytes that read two ways make the whole file "unclear", and the checks
 * then refuse it: a stream that no `obj` leads to, a stream nested in a
 * value, an inline image (`BI`) where a value is expected, comments around
 * a `stream` keyword, absurd nesting, or more work than the size of the
 * file justifies. No PDF producer writes them.
 */

export const UNCLEAR_PDF_STRUCTURE = Symbol("unclear_pdf_structure");

/** Steps the readings below may take for one file: linear in its size, whatever its content. */
export type PdfScanWork = { steps: number };

export function pdfScanWork(source: string): PdfScanWork {
  // A real PDF needs about its own size (each object is read once).
  return { steps: source.length * 2 + 256 * 1024 };
}

/** Character classes of pdf.js's lexer: 1 white-space, 2 delimiter, 0 regular. */
const CHAR_CLASS = new Uint8Array(256);
for (const char of "\0\t\n\f\r ") CHAR_CLASS[char.charCodeAt(0)] = 1;
for (const char of "()<>[]{}/%") CHAR_CLASS[char.charCodeAt(0)] = 2;
const MAX_NESTING = 64;

/** pdf.js cannot read this object either (illegal `)`, end of file): it leads to no stream. */
const UNREADABLE_OBJECT = Symbol("unreadable_object");

type Token = { kind: "eof" | "name" | "string" | "<<" | ">>" | "[" | "]" | "other"; start: number; end: number };

function isRegular(code: number) {
  return code > 255 || CHAR_CLASS[code] === 0;
}

function isWhitespace(code: number) {
  return code < 256 && CHAR_CLASS[code] === 1;
}

function spend(work: PdfScanWork, steps: number) {
  work.steps -= steps;
  if (work.steps < 0) throw UNCLEAR_PDF_STRUCTURE;
}

/** Next token from `from`, white-space and `%` comments skipped (pdf.js Lexer.getObj). */
function nextToken(source: string, from: number, work: PdfScanWork): Token {
  const length = source.length;
  let index = from;
  for (; index < length; index += 1) {
    const code = source.charCodeAt(index);
    if (code === 0x25) {
      while (index + 1 < length && source.charCodeAt(index + 1) !== 0x0a && source.charCodeAt(index + 1) !== 0x0d) index += 1;
    } else if (!isWhitespace(code)) break;
  }
  const start = index;
  const code = index < length ? source.charCodeAt(index) : -1;
  let kind: Token["kind"] = "other";
  let end = index + 1;
  if (code === -1) {
    kind = "eof";
    end = index;
  } else if (code === 0x28) {
    // "(": balanced parentheses; a backslash escapes the next character.
    kind = "string";
    end = length;
    for (let depth = 0; index < length; index += 1) {
      const char = source.charCodeAt(index);
      if (char === 0x5c) index += 1;
      else if (char === 0x28) depth += 1;
      else if (char === 0x29 && --depth === 0) {
        end = index + 1;
        break;
      }
    }
  } else if (code === 0x3c && source.charCodeAt(index + 1) === 0x3c) {
    kind = "<<";
    end = index + 2;
  } else if (code === 0x3c) {
    kind = "string";
    const close = source.indexOf(">", index + 1);
    end = close === -1 ? length : close + 1;
  } else if (code === 0x3e && source.charCodeAt(index + 1) === 0x3e) {
    kind = ">>";
    end = index + 2;
  } else if (code === 0x5b || code === 0x5d) {
    kind = code === 0x5b ? "[" : "]";
  } else if (code === 0x29) {
    throw UNREADABLE_OBJECT;
  } else if (code !== 0x3e && code !== 0x7b && code !== 0x7d) {
    kind = code === 0x2f ? "name" : "other";
    while (end < length && isRegular(source.charCodeAt(end))) end += 1;
  }
  spend(work, end - from + 1);
  return { kind, start, end };
}

function isKeyword(source: string, token: Token, keyword: string) {
  return token.kind === "other" && token.end - token.start === keyword.length && source.startsWith(keyword, token.start);
}

type Value = { end: number; stream?: number };

/** The object that starts with `token` (pdf.js Parser.getObj); `stream` is the keyword after a dictionary, if any. */
function readValue(source: string, token: Token, work: PdfScanWork, depth: number): Value {
  if (depth > MAX_NESTING) throw UNCLEAR_PDF_STRUCTURE;
  if (token.kind === "eof") throw UNREADABLE_OBJECT;
  if (token.kind === "<<") return readDictionary(source, token.end, work, depth + 1);
  if (token.kind === "[") {
    let next = nextToken(source, token.end, work);
    while (next.kind !== "]") {
      const element = readValue(source, next, work, depth + 1);
      if (element.stream !== undefined) throw UNCLEAR_PDF_STRUCTURE;
      next = nextToken(source, element.end, work);
    }
    return { end: next.end };
  }
  // pdf.js reads an inline image there, over bytes read here as keys.
  if (isKeyword(source, token, "BI")) throw UNCLEAR_PDF_STRUCTURE;
  return { end: token.end };
}

function readDictionary(source: string, from: number, work: PdfScanWork, depth: number): Value {
  for (let index = from; ;) {
    const token = nextToken(source, index, work);
    if (token.kind === "eof") throw UNREADABLE_OBJECT;
    if (token.kind === ">>") {
      const after = nextToken(source, token.end, work);
      return isKeyword(source, after, "stream") ? { end: token.end, stream: after.start } : { end: token.end };
    }
    index = token.end;
    // Where a key is expected, pdf.js skips any token that is not a name ("<<", "[", a number…).
    if (token.kind !== "name") continue;
    const value = readValue(source, nextToken(source, index, work), work, depth);
    if (value.stream !== undefined) throw UNCLEAR_PDF_STRUCTURE;
    index = value.end;
  }
}

export type PdfStreamDictionaries = {
  /** Start (`<<`) and end (after `>>`) of the dictionary of each `stream` keyword, by the keyword's index. */
  byKeyword: Map<number, { start: number; end: number }>;
  /**
   * Where pdf.js may read objects in the raw file, sorted by start: from
   * every `obj` keyword to the end of its value, and from every `trailer`
   * keyword to the end of its dictionary (or of the file: pdf.js reads a
   * trailer in recovery mode). Stream data that one of them reaches is
   * searched by the checks like the rest of the file.
   */
  values: Array<{ start: number; end: number }>;
  unclear: boolean;
};

/** Parses the object after every `obj` keyword of the raw file, as pdf.js does from an xref offset, and the dictionary after every `trailer`. */
export function readPdfStreamDictionaries(source: string, work: PdfScanWork): PdfStreamDictionaries {
  const byKeyword = new Map<number, { start: number; end: number }>();
  const values: Array<{ start: number; end: number }> = [];
  const objKeyword = /obj/g;
  const trailerKeyword = /trailer/g;
  let match: RegExpExecArray | null;
  try {
    while ((match = objKeyword.exec(source))) {
      // "12 0 obj" or "12 0obj"; not "endobj", not "object".
      const before = match.index > 0 ? source.charCodeAt(match.index - 1) : 0x20;
      const after = match.index + 3 < source.length ? source.charCodeAt(match.index + 3) : 0x20;
      if ((isRegular(before) && (before < 0x30 || before > 0x39)) || isRegular(after)) continue;
      let value: Value;
      try {
        value = readValue(source, nextToken(source, match.index + 3, work), work, 0);
      } catch (error) {
        if (error === UNREADABLE_OBJECT) continue;
        throw error;
      }
      values.push({ start: match.index, end: value.end });
      if (value.stream === undefined) continue;
      const start = nextToken(source, match.index + 3, work).start;
      const known = byKeyword.get(value.stream);
      if (!known || start < known.start) byKeyword.set(value.stream, { start, end: value.end });
    }
    // pdf.js reads a trailer from these bytes whatever precedes them (XRef.indexObjects finds "trailer" anywhere after "xref").
    while ((match = trailerKeyword.exec(source))) {
      if (match.index + 7 < source.length && isRegular(source.charCodeAt(match.index + 7))) continue;
      let end = source.length;
      try {
        end = readValue(source, nextToken(source, match.index + 7, work), work, 0).end;
      } catch (error) {
        if (error !== UNREADABLE_OBJECT) throw error;
      }
      values.push({ start: match.index, end });
    }
  } catch (error) {
    if (error === UNCLEAR_PDF_STRUCTURE) return { byKeyword, values, unclear: true };
    throw error;
  }
  values.sort((left, right) => left.start - right.start);
  return { byKeyword, values, unclear: false };
}

function whitespaceStart(source: string, index: number, work: PdfScanWork) {
  let start = index;
  while (start > 0 && isWhitespace(source.charCodeAt(start - 1))) start -= 1;
  spend(work, index - start + 1);
  return start;
}

function lineStart(source: string, index: number, work: PdfScanWork) {
  let start = index;
  while (start > 0 && source[start - 1] !== "\n" && source[start - 1] !== "\r") start -= 1;
  spend(work, index - start + 1);
  return start;
}

/**
 * End (after `>>`) of a dictionary written just before the `stream` keyword
 * at `keyword`, read backwards; null when there is none, so that the keyword
 * is not a stream for pdf.js (text, binary data). pdf.js also accepts `%`
 * comments in between, which can hide or fake a `>>`: when more than one
 * reading remains, the answer is unclear.
 */
export function dictionaryEndBefore(source: string, keyword: number, work: PdfScanWork): number | null | typeof UNCLEAR_PDF_STRUCTURE {
  try {
    // "upstream", "/Bitstream": not the keyword.
    if (keyword > 0 && isRegular(source.charCodeAt(keyword - 1))) return null;
    const ends: number[] = [];
    let at = whitespaceStart(source, keyword, work);
    for (let line = 0; ; line += 1) {
      if (at >= 2 && source.startsWith(">>", at - 2)) {
        ends.push(at);
        break;
      }
      const start = lineStart(source, at, work);
      const text = source.slice(start, at);
      if (!text.includes("%")) break;
      for (let percent = text.indexOf("%"); percent !== -1; percent = text.indexOf("%", percent + 1)) {
        const end = whitespaceStart(source, start + percent, work);
        if (end - 2 >= start && source.startsWith(">>", end - 2)) ends.push(end);
      }
      // A line that is only a comment: the dictionary may end on the line before.
      if (!/^[\0\t\f ]*%/.test(text)) break;
      if (line === 8) return UNCLEAR_PDF_STRUCTURE;
      at = whitespaceStart(source, start, work);
    }
    if (ends.length > 1) return UNCLEAR_PDF_STRUCTURE;
    return ends[0] ?? null;
  } catch (error) {
    if (error === UNCLEAR_PDF_STRUCTURE) return error;
    throw error;
  }
}

/**
 * The dictionary text of the `stream` keyword(s) found on one line (they
 * share the same data), null when none is a stream, unclear when the
 * forward and backward readings disagree.
 */
export function streamDictionaryText(source: string, keywords: number[], dictionaries: PdfStreamDictionaries, work: PdfScanWork): string | null | typeof UNCLEAR_PDF_STRUCTURE {
  if (dictionaries.unclear) return UNCLEAR_PDF_STRUCTURE;
  let text: string | null = null;
  for (const keyword of keywords) {
    const end = dictionaryEndBefore(source, keyword, work);
    const parsed = dictionaries.byKeyword.get(keyword);
    if (end === null && !parsed) continue;
    if (end === UNCLEAR_PDF_STRUCTURE || !parsed || parsed.end !== end || text !== null) return UNCLEAR_PDF_STRUCTURE;
    text = source.slice(parsed.start, parsed.end);
  }
  return text;
}

/**
 * Whether decoded object stream content holds a stream. ISO 32000-1 (7.5.7)
 * forbids it, but pdf.js still reads one, and its content would escape the
 * checks: such an object stream counts as unreadable.
 */
export function containsStream(content: string, work: PdfScanWork) {
  for (let keyword = content.indexOf("stream"); keyword !== -1; keyword = content.indexOf("stream", keyword + 6)) {
    if (dictionaryEndBefore(content, keyword, work) !== null) return true;
  }
  return false;
}
