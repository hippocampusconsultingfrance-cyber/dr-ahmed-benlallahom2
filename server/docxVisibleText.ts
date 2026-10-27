import { crc32 } from "node:zlib";
import { DOCUMENT_DECOMPRESSION_LIMITS, inspectDocxArchive } from "./documentDecompressionLimits";

/**
 * DOCX text Word does not show (IA-01): runs marked hidden (w:vanish,
 * w:specVanish, w:webHidden), smaller than 4 pt (w:sz, or w:szCs for complex
 * script text: Arabic, Hebrew…), squeezed to less than 1 pt a character
 * (w:w, w:spacing), raised or lowered out of their line (w:position
 * beyond twice their size), in a text box placed off the page, or without
 * contrast with what lies under them: as the PDF check, less than 32/255 apart
 * on each channel from the first colour under it, the colour of the text being
 * w:color, or its theme colour, tinted or shaded, as Word draws it, and the
 * first colour under it the highlight, the shading of the run, its paragraph,
 * table cell or table (set on them, by their style, the document's defaults or
 * the table style's formats for the cell's place), the fill of its text box,
 * the page colour when Word shows it (w:displayBackgroundShape), else white.
 * Black on black, dark blue on dark blue, yellow on a yellow highlight, white
 * or E0E0E0 on white fall under it; light grey (D9D9D9), bright yellow, green
 * or cyan on white and white on a coloured band are read. Text in the automatic
 * colour is always seen: Word draws it black or white, against its background.
 * mammoth reads such runs like any other text, so they are cut out of the main
 * document part, text boxes included, before it reads the file (it reads
 * neither headers, footers nor notes). Run formatting is resolved as Word does:
 * document defaults, table style, paragraph style, character style, then the
 * run's own properties.
 *
 * Text its place may hide is only read once shown to fit there. Where room is
 * scarce (a table row of exact height, w:trHeight exact, below the cell's top
 * margin; a text box, by its VML style or its DrawingML wp:extent, less its
 * insets, with the boxes its text flows on into up to one placed off the
 * page; a frame of exact height, w:framePr; an exact line spacing; a right
 * indent past the page's right edge), the text is laid out twice (LAYOUTS):
 * taking the most room it may take, and the least. Its lines wrap at the
 * width of their cell, text box, frame or column less their indents, tab
 * stops move them along (the text a right or centred stop aligns stays on its
 * line, even past its edge, as Word and LibreOffice keep it there), and the
 * lines before them fill the container: the
 * spacing before and after paragraphs (w:spacing, but between paragraphs of
 * one style that drop it, w:contextualSpacing), empty paragraphs at their
 * size, nested tables row by row, how far a run is lowered (w:position). A
 * line needs 60 % of its size to be read, on the page. Text that does not fit
 * even when it takes the least room is hidden; text that only fits then is
 * set aside as unverifiable (its visibility cannot be established), never
 * counted as hidden. In an exact line spacing, lines closer than 0.7 times
 * their size run into the line above (LibreOffice draws them over it, Word
 * cuts their top), in their paragraph, or the last line of text above them:
 * in their cell or the body, in the row above, before their table, at the
 * bottom of a table above them. They are set aside, hidden under half their
 * size, but a drop cap's letter, and the first line of a paragraph over a
 * line of ordinary spacing, only hidden under 0.4 times its size; the line
 * they run into, whatever its spacing, is set aside with them. Only a line
 * with no text above it, in the part or its text box, is read down to 0.4
 * times its size.
 * A table its indent (w:tblInd) places off the page hides its text.
 * Past a count of layout work (docxLayoutWorkUnits), what is left to lay out
 * is set aside, and the line a line of an exact spacing left so may run
 * into. Text the indents of its paragraph (w:ind, its style's or the
 * document's) place, where it starts, beyond an edge of the page of its
 * section (w:pgSz, w:pgMar, w:cols; A4 with margins of 2.5 cm when not given)
 * is hidden. Hidden text (w:vanish, w:specVanish), its line breaks and
 * paragraph marks take no room; deleted text (w:del) only when it takes the
 * most, as LibreOffice shows it. Rows of height at least, text boxes that grow
 * with their text (a:spAutoFit, mso-fit-shape-to-text) or run top to bottom,
 * merged cells and cells of text run top to bottom do not cut their text.
 *
 * Of a mc:AlternateContent, mammoth reads mc:Fallback, but Word draws the
 * mc:Choice it understands (a DrawingML text box, w14…): a passage of the
 * fallback is only read if the choice draws it too, and as visibly (its
 * fill, its place on the page).
 *
 * Text without contrast with the page may still show on a picture or a shape,
 * as the white text of many CV templates: in a text box without fill, in a
 * paragraph that holds a drawing or next to one, in the paragraphs and tables
 * a picture behind the text may cover from its paragraph (as many as its
 * height could hold), or anywhere when Word places such a picture from the
 * page (a header band, a sidebar), in a header, or as the page colour shown.
 * In a cell coloured by the table style only, in a table that does not say
 * which of its formats it shows (w:tblLook), another format could show it. Its
 * visibility cannot be established: it is cut out too, but returned apart as
 * `unverifiableText`, never counted as hidden text. Such text beyond the reach
 * of any picture, or on a colour of its own (shading, highlight, filled text
 * box), is invisible.
 */

/** Canonical prefixes, whatever prefix the file binds to these namespaces (as mammoth reads them). */
const NAMESPACES: Record<string, string> = {
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main": "w",
  "http://purl.oclc.org/ooxml/wordprocessingml/main": "w",
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing": "wp",
  "http://schemas.openxmlformats.org/drawingml/2006/main": "a",
  "http://purl.oclc.org/ooxml/drawingml/main": "a",
  "urn:schemas-microsoft-com:vml": "v",
  "http://schemas.microsoft.com/office/word/2010/wordprocessingShape": "wps",
  "http://schemas.openxmlformats.org/markup-compatibility/2006": "mc",
  "http://schemas.openxmlformats.org/package/2006/relationships": "relationships",
};
const OFFICE_DOCUMENT_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const STYLES_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const THEME_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
const SETTINGS_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings";
/** Smallest text read, in points, as the PDF check (w:sz 8 half-points). */
const MIN_FONT_SIZE_PT = 4;
/** Narrowest advance of a character, in points, as the PDF check: squeezed more, letters run into one another. */
const MIN_ADVANCE_PT = 1;
/** Text this close to what lies under it on each channel (of 255) is not seen, as the PDF contrast check. */
const MIN_CHANNEL_GAP = 32;
/** Raised or lowered by more than this many times its size, text has left its line: off the page, or onto other lines. */
const MAX_SHIFT_IN_SIZES = 2;
/** Word's size when no style gives one (w:sz 20). */
const DEFAULT_FONT_SIZE_PT = 10;
/** VML shapes that can hold a text box. */
const VML_SHAPES = new Set(["v:shape", "v:rect", "v:roundrect", "v:oval"]);
/** What a run holds that moves the text after it along its paragraph. */
const IN_FLOW = new Set(["w:t", "w:br", "w:cr", "w:tab", "w:ptab", "w:sym"]);
/** What draws a picture or a shape in a paragraph. */
const DRAWINGS = new Set(["w:drawing", "w:pict", "w:object"]);
/** Elements whose paragraphs follow one another, for « next to a drawing ». */
const PARAGRAPH_CONTAINERS = new Set(["w:body", "w:tc", "w:txbxContent", "w:hdr", "w:ftr", "w:footnote", "w:endnote", "w:comment"]);
/** Elements of the body laid one under the other: a table counts as one, however tall. */
const BODY_BLOCKS = new Set(["w:p", "w:tbl", "w:sdt", "w:customXml"]);
/** Lowest height of a paragraph (a line of 7 pt type): a picture covers at most its height's worth of them. */
const MIN_PARAGRAPH_PT = 8;
const EMU_PER_PT = 12_700;
/** Share of its size a line of text needs in its row, text box or frame to be read: less cuts most of its letters (as LibreOffice draws them). */
const MIN_LINE_SHARE = 0.6;
/** Exact line spacing: lines closer than this share of their size run into the line above them (LibreOffice draws them over it, Word cuts their top). */
const LEGIBLE_EXACT_LINE_SHARE = 0.7;
/** ...and closer than this share, into its letters: neither is read. */
const MIN_EXACT_LINE_SHARE = 0.5;
/** A line with nothing above it to run into: under this share of its size, Word cuts more than the top half of its letters, LibreOffice draws them whole. */
const MIN_ALONE_EXACT_LINE_SHARE = 0.4;
/** Lowest height of a line of single spacing, in sizes of its text (fonts give it 1.1 to 1.3 times their size). */
const MIN_LINE_HEIGHT_IN_SIZES = 0.9;
/** Widest advance of a character, in sizes of its text (W, a dash, a Chinese character). */
const MAX_ADVANCE_IN_SIZES = 1;
/**
 * The two layouts of text whose place may hide it: taking the most room it
 * may take (lines of 1.15 times their size; characters, in sizes of their
 * text, about as wide as in the widest common fonts: capitals 0.68, figures
 * 0.56, other letters 0.5, punctuation 0.4, other signs 0.8, spaces 0.3,
 * Chinese, Japanese or Korean ones 1, all 0.6 in a typewriter font; words
 * kept whole on their line; the insets of text boxes and the side margins of
 * cells; deleted text shown, as LibreOffice shows it), and the least (lines of
 * 0.9 times their size, characters a fifth as wide, wide ones 0.9, lines
 * broken anywhere, no inset nor margin, deleted text not shown).
 */
const LAYOUTS: ReadonlyArray<{ lineHeight: number; widths: Record<CharacterKind, number>; typewriter: number }> = [
  { lineHeight: 1.15, widths: { capital: 0.68, figure: 0.56, letter: 0.5, punctuation: 0.4, sign: 0.8, space: 0.3, wide: 1 }, typewriter: 0.6 },
  { lineHeight: MIN_LINE_HEIGHT_IN_SIZES, widths: { capital: 0.2, figure: 0.2, letter: 0.2, punctuation: 0.2, sign: 0.2, space: 0.2, wide: 0.9 }, typewriter: 0.2 },
];
/** A length in each of LAYOUTS: in the one where text takes the most room, then the least. */
type Pair = [number, number];
const MOST = 0;
const LEAST = 1;
/** Word's tab stops when the settings give none (w:defaultTabStop, 720 twips). */
const DEFAULT_TAB_STOP_PT = 36;
/** A cell's side margins when its table gives none: Word's « Table Normal », 108 twips each. */
const DEFAULT_CELL_SIDES_PT = 10.8;
/** A text box's insets when it gives none: 0.1 in across, 0.05 in down (VML inset, DrawingML lIns, tIns…). */
const DEFAULT_INSETS = { left: 7.2, top: 3.6, right: 7.2, bottom: 3.6 };
/** Word's page when a section gives none: A4 (11906 twips) with margins of 2.5 cm (1417 twips), in points. */
const DEFAULT_PAGE = { width: 595.3, margin: 70.85 };
/** Table cell text directions that keep lines across (w:textDirection); others run top to bottom. */
const ACROSS = /^(lrTb|tb|lrTbV|tbV)$/;
/** Vertical positions Word takes from the page or its margins rather than from the anchor paragraph (DrawingML, VML). */
const FROM_PAGE = /^(page|margin|topMargin|bottomMargin|insideMargin|outsideMargin|top-margin-area|bottom-margin-area|inner-margin-area|outer-margin-area)$/i;
/** Namespaces of Office and of the standard: Word draws the mc:Choice that requires them (wps, w14, w15, wpg…). */
const OFFICE_NAMESPACE = /^(http:\/\/schemas\.microsoft\.com\/office\/|http:\/\/schemas\.openxmlformats\.org\/|http:\/\/purl\.oclc\.org\/ooxml\/|urn:schemas-microsoft-com:)/;
/** What fills a DrawingML shape: none, a colour, or what may not be one (gradient, picture, pattern, the group's). */
const DRAWING_FILLS = new Set(["a:noFill", "a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill", "a:grpFill"]);
const DRAWING_COLOURS = new Set(["a:srgbClr", "a:schemeClr", "a:sysClr", "a:prstClr", "a:scrgbClr", "a:hslClr"]);

/** `namespaces`: the namespace each prefix is bound to there (mc:Choice Requires names prefixes). */
type XmlTag = { readonly name: string; readonly attributes: Map<string, string>; readonly namespaces: Map<string, string>; readonly closing: boolean; readonly selfClosing: boolean; readonly start: number; readonly end: number };

/**
 * A text without its comments, its character data as text, as
 * /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->/g replaces them, in one pass:
 * once one is left open to the end, none after it closes either.
 */
function withoutComments(text: string) {
  let result = "";
  let copied = 0;
  let dataCloses = true;
  let commentsClose = true;
  for (let at = text.indexOf("<!"); at !== -1; ) {
    let end = -1;
    let data = "";
    if (dataCloses && text.startsWith("<![CDATA[", at)) {
      const close = text.indexOf("]]>", at + 9);
      if (close === -1) dataCloses = false;
      else [end, data] = [close + 3, text.slice(at + 9, close)];
    } else if (commentsClose && text.startsWith("<!--", at)) {
      const close = text.indexOf("-->", at + 4);
      if (close === -1) commentsClose = false;
      else end = close + 3;
    }
    if (end === -1) {
      at = text.indexOf("<!", at + 1);
      continue;
    }
    result += text.slice(copied, at) + data;
    copied = end;
    at = text.indexOf("<!", end);
  }
  return copied ? result + text.slice(copied) : text;
}

function decodeXml(text: string) {
  if (!text.includes("&") && !text.includes("<")) return text;
  return withoutComments(text)
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
      if (entity[0] !== "#") return named[entity.toLowerCase()]!;
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

/** The canonical name of each qualified name met under a namespace scope. */
const canonicalNames = new WeakMap<Map<string, string>, Map<string, string>>();
/** Those of the scope met last: a part rarely changes scope. */
let lastScope: Map<string, string> | undefined;
let lastNames = new Map<string, string>();

function canonical(qualifiedName: string, scope: Map<string, string>) {
  if (scope !== lastScope) {
    let names = canonicalNames.get(scope);
    if (!names) canonicalNames.set(scope, (names = new Map()));
    lastScope = scope;
    lastNames = names;
  }
  let name = lastNames.get(qualifiedName);
  if (name === undefined) {
    const colon = qualifiedName.indexOf(":");
    const prefix = colon === -1 ? "" : qualifiedName.slice(0, colon);
    const known = NAMESPACES[scope.get(prefix) ?? ""];
    name = known ? `${known}:${qualifiedName.slice(colon + 1)}` : qualifiedName;
    lastNames.set(qualifiedName, name);
  }
  return name;
}

const ATTRIBUTE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function attributePairs(text: string) {
  const pairs: Array<[string, string]> = [];
  ATTRIBUTE.lastIndex = 0;
  for (let match = ATTRIBUTE.exec(text); match; match = ATTRIBUTE.exec(text)) pairs.push([match[1]!, decodeXml(match[2] ?? match[3] ?? "")]);
  return pairs;
}
const NO_ATTRIBUTES: Map<string, string> = new Map();

/**
 * The tags of an XML part, read once and visited as often as needed
 * (visitXmlTags): the canonical name of each (by its index in `names`), where
 * it and its attributes start and end, whether it opens, closes or closes
 * itself, its namespace scope (by its index in `scopes`); `count` of them.
 */
type XmlTags = {
  xml: string;
  count: number;
  names: string[];
  scopes: Array<Map<string, string>>;
  name: Int32Array;
  start: Int32Array;
  end: Int32Array;
  attributesStart: Int32Array;
  attributesEnd: Int32Array;
  kind: Uint8Array;
  scope: Int32Array;
};
const OPENING = 0;
const CLOSING = 1;
const SELF_CLOSING = 2;

/** The characters \s matches in a regular expression, by UTF-16 unit. */
const SPACES = new Uint8Array(0x10000);
for (const code of [0x9, 0xa, 0xb, 0xc, 0xd, 0x20, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]) SPACES[code] = 1;
for (let code = 0x2000; code <= 0x200a; code += 1) SPACES[code] = 1;

/** Where the spaces from `at` end. */
function skipSpaces(xml: string, at: number) {
  while (at < xml.length && SPACES[xml.charCodeAt(at)] === 1) at += 1;
  return at;
}

const QUOTE = 0x22;
const APOSTROPHE = 0x27;
const SLASH = 0x2f;
const LESS = 0x3c;
const EQUALS = 0x3d;
const GREATER = 0x3e;

/**
 * Reads the tags of an XML part as this expression finds them, without its
 * cost of strings and matches on a part of millions of tags:
 * <!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>
 * (comments, character data and declarations are skipped), but that a name
 * ends at a « < », which no XML name holds: only a malformed part reads
 * otherwise, and its brackets are each read once, not up to the part's end.
 */
function readXmlTags(xml: string): XmlTags {
  // As many as the part has opening brackets, at most.
  let capacity = 1;
  for (let at = xml.indexOf("<"); at !== -1; at = xml.indexOf("<", at + 1)) capacity += 1;
  const tags: XmlTags = {
    xml, count: 0, names: [], scopes: [new Map()], name: new Int32Array(capacity), start: new Int32Array(capacity), end: new Int32Array(capacity),
    attributesStart: new Int32Array(capacity), attributesEnd: new Int32Array(capacity), kind: new Uint8Array(capacity), scope: new Int32Array(capacity),
  };
  const grow = () => {
    capacity *= 2;
    for (const key of ["name", "start", "end", "attributesStart", "attributesEnd", "scope"] as const) {
      const larger = new Int32Array(capacity);
      larger.set(tags[key]);
      tags[key] = larger;
    }
    const kinds = new Uint8Array(capacity);
    kinds.set(tags.kind);
    tags.kind = kinds;
  };
  /** The qualified names met, by a hash of their characters: each is sliced from the part once. */
  const qualifiedNames = new Map<number, string[]>();
  /** The index in `names` of each qualified name, by scope. */
  const ids: Array<Map<string, number>> = [];
  const canonicalIds = new Map<string, number>();
  const open = [0];
  const length = xml.length;
  // Once a comment or character data is left open to the end of the part, none after it closes either.
  let commentsClose = true;
  let dataCloses = true;
  let at = xml.indexOf("<");
  while (at !== -1) {
    const second = xml.charCodeAt(at + 1);
    if (second === 0x21 || second === 0x3f) {
      // <!-- … -->, <![CDATA[ … ]]>, else <? … > or <! … >.
      let close = -1;
      if (xml.startsWith("<!--", at)) {
        if (commentsClose) close = xml.indexOf("-->", at + 4);
        commentsClose = close !== -1;
      } else if (xml.startsWith("<![CDATA[", at)) {
        if (dataCloses) close = xml.indexOf("]]>", at + 9);
        dataCloses = close !== -1;
      }
      if (close !== -1) close += 3;
      else {
        close = xml.indexOf(">", at + 2);
        if (close === -1) break;
        close += 1;
      }
      at = xml.indexOf("<", close);
      continue;
    }
    const closing = second === SLASH;
    const nameStart = at + (closing ? 2 : 1);
    let index = nameStart;
    let hash = 0;
    for (; index < length; index += 1) {
      const code = xml.charCodeAt(index);
      if (code === SLASH || code === GREATER || code === LESS || SPACES[code] === 1) break;
      hash = (Math.imul(hash, 31) + code) | 0;
    }
    const nameEnd = index;
    let attributesEnd = nameEnd;
    let declares = false;
    // Attributes: spaces, a name, =, a quoted value; as many as follow.
    for (let cursor = attributesEnd; nameEnd > nameStart && SPACES[xml.charCodeAt(cursor)] === 1; cursor = attributesEnd) {
      cursor = skipSpaces(xml, cursor);
      const attributeName = cursor;
      for (; cursor < length; cursor += 1) {
        const code = xml.charCodeAt(cursor);
        if (code === EQUALS || code === SLASH || code === GREATER || code === LESS || SPACES[code] === 1) break;
      }
      if (cursor === attributeName) break;
      cursor = skipSpaces(xml, cursor);
      if (xml.charCodeAt(cursor) !== EQUALS) break;
      cursor = skipSpaces(xml, cursor + 1);
      const quote = xml.charCodeAt(cursor);
      if (quote !== QUOTE && quote !== APOSTROPHE) break;
      const valueEnd = xml.indexOf(quote === QUOTE ? '"' : "'", cursor + 1);
      if (valueEnd === -1) break;
      if (xml.startsWith("xmlns", attributeName)) declares = true;
      attributesEnd = valueEnd + 1;
    }
    let tagEnd = skipSpaces(xml, attributesEnd);
    const selfClosing = xml.charCodeAt(tagEnd) === SLASH;
    if (selfClosing) tagEnd += 1;
    if (nameEnd === nameStart || xml.charCodeAt(tagEnd) !== GREATER) {
      at = xml.indexOf("<", at + 1);
      continue;
    }
    tagEnd += 1;
    let qualifiedName: string | undefined;
    const known = qualifiedNames.get(hash);
    for (const candidate of known ?? []) {
      if (candidate.length === nameEnd - nameStart && xml.startsWith(candidate, nameStart)) {
        qualifiedName = candidate;
        break;
      }
    }
    if (qualifiedName === undefined) {
      qualifiedName = xml.slice(nameStart, nameEnd);
      if (known) known.push(qualifiedName);
      else qualifiedNames.set(hash, [qualifiedName]);
    }
    let scope = closing ? (open.length > 1 ? open.pop()! : 0) : open[open.length - 1]!;
    // Only a tag that declares namespaces has its attributes read here.
    if (!closing && declares) {
      for (const [name, value] of attributePairs(xml.slice(nameEnd, attributesEnd))) {
        if (name !== "xmlns" && !name.startsWith("xmlns:")) continue;
        if (scope === open[open.length - 1]) scope = tags.scopes.push(new Map(tags.scopes[scope])) - 1;
        tags.scopes[scope]!.set(name === "xmlns" ? "" : name.slice(6), value);
      }
    }
    if (!closing && !selfClosing) open.push(scope);
    const scopeIds = ids[scope] ?? (ids[scope] = new Map());
    let id = scopeIds.get(qualifiedName);
    if (id === undefined) {
      const name = canonical(qualifiedName, tags.scopes[scope]!);
      id = canonicalIds.get(name);
      // As a property name, the name is the one string of its letters, which the visitors' comparisons find at once.
      if (id === undefined) canonicalIds.set(name, (id = tags.names.push(Object.keys({ [name]: 0 })[0]!) - 1));
      scopeIds.set(qualifiedName, id);
    }
    if (tags.count === capacity) grow();
    const count = tags.count;
    tags.name[count] = id;
    tags.start[count] = at;
    tags.end[count] = tagEnd;
    tags.attributesStart[count] = nameEnd;
    tags.attributesEnd[count] = attributesEnd;
    tags.kind[count] = closing ? CLOSING : selfClosing ? SELF_CLOSING : OPENING;
    tags.scope[count] = scope;
    tags.count = count + 1;
    at = xml.indexOf("<", tagEnd);
  }
  return tags;
}

/** The tag being visited: valid while it is, but for its attributes, which are only read when asked for (most tags are never asked). */
class TagCursor implements XmlTag {
  name = "";
  namespaces: Map<string, string> = NO_ATTRIBUTES;
  closing = false;
  selfClosing = false;
  start = 0;
  end = 0;
  private attributesStart = 0;
  private attributesEnd = 0;
  private read?: Map<string, string>;
  constructor(private readonly tags: XmlTags) {}
  moveTo(index: number) {
    const tags = this.tags;
    this.name = tags.names[tags.name[index]!]!;
    this.namespaces = tags.scopes[tags.scope[index]!]!;
    this.closing = tags.kind[index] === CLOSING;
    this.selfClosing = tags.kind[index] === SELF_CLOSING;
    this.start = tags.start[index]!;
    this.end = tags.end[index]!;
    this.attributesStart = tags.attributesStart[index]!;
    this.attributesEnd = tags.attributesEnd[index]!;
    this.read = undefined;
  }
  get attributes() {
    if (!this.read) {
      this.read = this.attributesEnd > this.attributesStart ? new Map() : NO_ATTRIBUTES;
      // Unprefixed attributes have no namespace (VML fillcolor, relationship Type and Target).
      if (this.attributesEnd > this.attributesStart) {
        for (const [name, value] of attributePairs(this.tags.xml.slice(this.attributesStart, this.attributesEnd))) this.read.set(name.includes(":") ? canonical(name, this.namespaces) : name, value);
      }
    }
    return this.read;
  }
}

/** Calls each visitor with each tag of an XML part (or of its tags already read), in order, with namespace-resolved names and attributes: one visit for all of them. */
function visitXmlTags(source: string | XmlTags, ...visitors: Array<(tag: XmlTag) => void>) {
  const tags = typeof source === "string" ? readXmlTags(source) : source;
  const tag = new TagCursor(tags);
  for (let index = 0; index < tags.count; index += 1) {
    tag.moveTo(index);
    for (const visit of visitors) visit(tag);
  }
}

/** What a reading of an XML part (visitXmlTags) gathers: its visitor, then what it found. */
type Survey<T> = { visit: (tag: XmlTag) => void; done: () => T };

/** The colours a layer paints under the text: one, or both colours of a striped pattern; null when it paints none. */
type Paint = string[] | null;

/** What one layer of run formatting says; keys left unset inherit from the layer below. Lengths in points. */
type RunLayer = Partial<Record<"w:vanish" | "w:specVanish" | "w:webHidden" | "w:cs" | "w:rtl", boolean> & {
  size: number;
  complexScriptSize: number;
  /** "auto", or RRGGBB. */
  colour: string;
  shading: Paint;
  highlight: string | null;
  /** w:w, in percent of the letters' width. */
  scale: number;
  /** w:spacing, added after each character. */
  spacing: number;
  /** w:position, raised above the line (lowered when negative). */
  position: number;
  /** A typewriter font (w:rFonts), all of whose characters are as wide. */
  typewriter: boolean;
}>;

const hexColour = (value: string | undefined) => (value !== undefined && /^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : undefined);
const channels = (hex: string) => [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16));
const toHex = (values: number[]) => values.map(value => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** Two colours told apart: 32/255 or more apart on a channel, as the PDF contrast check (bright yellow on white is, E0E0E0 is not). */
const distinct = (left: string, right: string) => {
  const under = channels(right);
  return channels(left).some((value, index) => Math.abs(value - under[index]!) >= MIN_CHANNEL_GAP);
};
/** A colour each channel of which is within 32/255 of white (FEFEFE looks white too). */
const isNearWhite = (hex: string) => !distinct(hex, "FFFFFF");

/** A colour with its HSL lightness changed, as Word tints or shades a theme colour. */
function withLightness(hex: string, change: (lightness: number) => number) {
  const [red, green, blue] = channels(hex).map(value => value / 255) as [number, number, number];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  const hue = max === min ? 0 : max === red ? ((green - blue) / (max - min) + 6) % 6 : max === green ? (blue - red) / (max - min) + 2 : (red - green) / (max - min) + 4;
  const changed = Math.min(1, Math.max(0, change(lightness)));
  const chroma = (1 - Math.abs(2 * changed - 1)) * saturation;
  const second = chroma * (1 - Math.abs((hue % 2) - 1));
  const sextants = [[chroma, second, 0], [second, chroma, 0], [0, chroma, second], [0, second, chroma], [second, 0, chroma], [chroma, 0, second]];
  return toHex(sextants[Math.min(5, Math.floor(hue))]!.map(value => (value + changed - chroma / 2) * 255));
}

/** The colour of a theme colour name (w:themeColor…), as the settings map it to the theme's colour scheme. */
type Theme = (name: string) => string | undefined;

/** Theme colour names, and the colour of the theme's scheme each one is. */
const THEME_SLOTS: Record<string, string> = {
  dark1: "dk1", light1: "lt1", dark2: "dk2", light2: "lt2", accent1: "accent1", accent2: "accent2", accent3: "accent3",
  accent4: "accent4", accent5: "accent5", accent6: "accent6", hyperlink: "hlink", followedHyperlink: "folHlink",
};
/** Names Word maps to a colour of the scheme: the w:clrSchemeMapping attribute that may change it, and Word's default. */
const THEME_MAPPING: Record<string, [string, string]> = { background1: ["bg1", "light1"], text1: ["t1", "dark1"], background2: ["bg2", "light2"], text2: ["t2", "dark2"] };
const SYSTEM_COLOURS: Record<string, string> = { window: "FFFFFF", windowText: "000000" };

/** The colour scheme of the theme part, as the settings part maps it (w:clrSchemeMapping). */
function readTheme(themeXml: string | undefined, settingsXml: string | undefined): Theme {
  const scheme = new Map<string, string>();
  const path: string[] = [];
  visitXmlTags(themeXml ?? "", tag => {
    if (tag.closing) {
      path.pop();
      return;
    }
    const slot = path.at(-1)?.replace(/^a:/, "");
    if (slot && path.at(-2) === "a:clrScheme" && path.at(-3) === "a:themeElements" && !scheme.has(slot)) {
      const value = tag.name === "a:srgbClr" ? tag.attributes.get("val") : tag.name === "a:sysClr" ? tag.attributes.get("lastClr") ?? SYSTEM_COLOURS[tag.attributes.get("val") ?? ""] : undefined;
      const hex = hexColour(value);
      if (hex) scheme.set(slot, hex);
    }
    if (!tag.selfClosing) path.push(tag.name);
  });
  const mapping = new Map<string, string>();
  visitXmlTags(settingsXml ?? "", tag => {
    if (tag.closing || tag.name !== "w:clrSchemeMapping") return;
    for (const [name, [attribute]] of Object.entries(THEME_MAPPING)) {
      const value = tag.attributes.get(`w:${attribute}`);
      if (value) mapping.set(name, value);
    }
  });
  return name => scheme.get(THEME_SLOTS[mapping.get(name) ?? THEME_MAPPING[name]?.[1] ?? name] ?? "");
}

/** Whether Word shows the page colour (w:background) in its page view: only when the settings say so, as LibreOffice. */
function showsPageColour(settingsXml: string | undefined) {
  let shown = false;
  visitXmlTags(settingsXml ?? "", tag => {
    if (!tag.closing && tag.name === "w:displayBackgroundShape") shown = !/^(false|0|off)$/i.test(tag.attributes.get("w:val") ?? "");
  });
  return shown;
}

/** The distance between Word's default tab stops (w:defaultTabStop), in points. */
function defaultTabStop(settingsXml: string | undefined) {
  let stop = DEFAULT_TAB_STOP_PT;
  visitXmlTags(settingsXml ?? "", tag => {
    if (!tag.closing && tag.name === "w:defaultTabStop") stop = measurePt(tag.attributes.get("w:val"), 20) ?? stop;
  });
  return stop > 0 ? stop : DEFAULT_TAB_STOP_PT;
}

/** The colour of w:color, w:shd or w:background: its theme colour, tinted or shaded, else its value; "auto"; undefined when unreadable. */
function colourOf(theme: Theme, value: string | undefined, themeName: string | undefined, tint: string | undefined, shade: string | undefined) {
  const themed = themeName ? theme(themeName) : undefined;
  if (!themed) return value !== undefined && /^auto$/i.test(value) ? "auto" : hexColour(value);
  const share = (byte: string | undefined) => (byte !== undefined && /^[0-9a-f]{2}$/i.test(byte) ? Number.parseInt(byte, 16) / 255 : undefined);
  const tinted = share(tint);
  const shaded = share(shade);
  if (tinted === undefined && shaded === undefined) return themed;
  return withLightness(themed, lightness => {
    const darker = shaded === undefined ? lightness : lightness * shaded;
    return tinted === undefined ? darker : darker * tinted + 1 - tinted;
  });
}

const blend = (under: string, over: string, share: number) => {
  const below = channels(under);
  return toHex(channels(over).map((value, index) => below[index]! * (1 - share) + value * share));
};

/** What a w:shd paints: its fill, or its pattern in its colour over the fill (Word blends a percentage into one colour). */
function shadingPaint(tag: XmlTag, theme: Theme): Paint {
  const attribute = (name: string) => tag.attributes.get(`w:${name}`);
  const pattern = attribute("val") ?? "clear";
  if (pattern === "nil") return null;
  const fillColour = colourOf(theme, attribute("fill"), attribute("themeFill"), attribute("themeFillTint"), attribute("themeFillShade"));
  const fill = fillColour === "auto" ? undefined : fillColour;
  if (pattern === "clear") return fill ? [fill] : null;
  const patternColour = colourOf(theme, attribute("color"), attribute("themeColor"), attribute("themeTint"), attribute("themeShade"));
  const colour = patternColour === undefined || patternColour === "auto" ? "000000" : patternColour;
  const share = pattern === "solid" ? 1 : Number(/^pct(\d+)$/.exec(pattern)?.[1]) / 100;
  return Number.isFinite(share) ? [blend(fill ?? "FFFFFF", colour, share)] : [fill ?? "FFFFFF", colour];
}

const HIGHLIGHTS: Record<string, string> = {
  black: "000000", blue: "0000FF", cyan: "00FFFF", green: "00FF00", magenta: "FF00FF", red: "FF0000", yellow: "FFFF00", white: "FFFFFF",
  darkblue: "000080", darkcyan: "008080", darkgreen: "008000", darkmagenta: "800080", darkred: "800000", darkyellow: "808000", darkgray: "808080", lightgray: "C0C0C0",
};
const VML_COLOURS: Record<string, string> = {
  white: "FFFFFF", black: "000000", silver: "C0C0C0", gray: "808080", grey: "808080", red: "FF0000", maroon: "800000", yellow: "FFFF00", olive: "808000",
  lime: "00FF00", green: "008000", aqua: "00FFFF", cyan: "00FFFF", teal: "008080", blue: "0000FF", navy: "000080", fuchsia: "FF00FF", magenta: "FF00FF", purple: "800080",
};

/** A VML fill colour (#rgb, #rrggbb, a colour name), possibly followed by a theme index; undefined when unknown. */
function vmlColour(fill: string) {
  const hex = /^#?([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(fill)?.[1];
  if (hex) return (hex.length === 3 ? Array.from(hex, digit => digit + digit).join("") : hex).toUpperCase();
  return VML_COLOURS[/^[a-z]+/i.exec(fill)?.[0]?.toLowerCase() ?? ""];
}

/** A VML opacity (0.5, 50%, 32768f), from 0 to 1. */
function vmlOpacity(value: string | undefined) {
  const match = /^\s*(\d*\.?\d+)\s*(f|%)?\s*$/i.exec(value ?? "");
  if (!match) return 1;
  const unit = match[2]?.toLowerCase();
  return Math.min(1, Number(match[1]) / (unit === "f" ? 65_536 : unit === "%" ? 100 : 1));
}

/** DrawingML scheme colours, and the theme colour name each one is in Word. */
const DRAWING_SCHEME: Record<string, string> = {
  bg1: "background1", tx1: "text1", bg2: "background2", tx2: "text2", dk1: "dark1", lt1: "light1", dk2: "dark2", lt2: "light2", hlink: "hyperlink", folHlink: "followedHyperlink",
  accent1: "accent1", accent2: "accent2", accent3: "accent3", accent4: "accent4", accent5: "accent5", accent6: "accent6",
};

/** The colour a DrawingML colour element names, before its modifiers; undefined when unknown (phClr, scrgbClr…). */
function drawingColour(tag: XmlTag, theme: Theme) {
  const value = tag.attributes.get("val") ?? "";
  if (tag.name === "a:srgbClr") return hexColour(value);
  if (tag.name === "a:schemeClr") return DRAWING_SCHEME[value] ? theme(DRAWING_SCHEME[value]) : undefined;
  if (tag.name === "a:sysClr") return hexColour(tag.attributes.get("lastClr")) ?? SYSTEM_COLOURS[value];
  if (tag.name === "a:prstClr") return VML_COLOURS[value.toLowerCase()];
  return undefined;
}

const UNIVERSAL_MEASURE_PT: Record<string, number> = { pt: 1, pc: 12, pi: 12, in: 72, cm: 72 / 2.54, mm: 72 / 25.4 };

/** A length in points: a number of 1/`perPoint` points (half-points, twips), or a strict file's universal measure (3pt, 1mm…). */
function measurePt(value: string | undefined, perPoint: number) {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*(pt|pc|pi|in|cm|mm)?\s*$/i.exec(value ?? "");
  if (!match) return undefined;
  return match[2] ? Number(match[1]) * UNIVERSAL_MEASURE_PT[match[2].toLowerCase()]! : Number(match[1]) / perPoint;
}

const VML_UNITS_PT: Record<string, number> = { pt: 1, px: 0.75, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, pc: 12 };

/** The pattern of each VML style property measured (vmlMeasure): read for every shape. */
const VML_PROPERTIES = new Map<string, RegExp>();

/** A length of a VML style, in points; undefined when absent or unreadable. */
function vmlMeasure(style: string, property: string) {
  let pattern = VML_PROPERTIES.get(property);
  if (!pattern) VML_PROPERTIES.set(property, (pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*(-?[\\d.]+)\\s*(pt|px|in|cm|mm|pc)?\\s*(?:;|$)`, "i")));
  const match = pattern.exec(style);
  const value = match ? Number(match[1]) * VML_UNITS_PT[(match[2] ?? "px").toLowerCase()]! : undefined;
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

/** A length of a VML style, in points (0 when absent). */
const vmlLength = (style: string, property: string) => vmlMeasure(style, property) ?? 0;

/** A DrawingML length (EMU) in points; undefined when unreadable. */
const emuPt = (value: string | undefined) => (value !== undefined && /^\s*-?\d+\s*$/.test(value) ? Number(value) / EMU_PER_PT : undefined);

/** `simple`: placed from the page by wp:simplePos rather than by wp:positionH and wp:positionV. */
type Box = { left: number; top: number; width: number; height: number; simple?: boolean };

/** A shape placed wholly off the page, whatever it is positioned from (page, margin, column or paragraph, all on the page). In points. */
const isOffPage = (box: Box, page: { width: number; height: number }) =>
  box.left >= page.width || box.top >= page.height || box.left + box.width <= -page.width || box.top + box.height <= -page.height;

/** A VML shape whose style places it wholly off the page. */
function vmlShapeIsOffPage(style: string | undefined, page: { width: number; height: number }) {
  if (!style || !/(^|;)\s*position\s*:\s*absolute/i.test(style)) return false;
  const length = (property: string) => vmlLength(style, property);
  return isOffPage({ left: length("margin-left") + length("left"), top: length("margin-top") + length("top"), width: length("width"), height: length("height") }, page);
}

/** A VML length (0.1in, 3.6pt, 2px), in points. */
function vmlValue(value: string | undefined) {
  const match = /^\s*(-?[\d.]+)\s*(pt|px|in|cm|mm|pc)?\s*$/i.exec(value ?? "");
  const length = match ? Number(match[1]) * VML_UNITS_PT[(match[2] ?? "px").toLowerCase()]! : undefined;
  return length !== undefined && Number.isFinite(length) ? Math.max(0, length) : undefined;
}

/** The space between a text box's edges and its text, in points. */
type Insets = { left: number; top: number; right: number; bottom: number };

/** A VML text box's insets (v:textbox inset="left,top,right,bottom"), Word's defaults for those not given. */
function vmlInsets(value: string | undefined): Insets {
  const [left, top, right, bottom] = (value ?? "").split(",").map(vmlValue);
  return { left: left ?? DEFAULT_INSETS.left, top: top ?? DEFAULT_INSETS.top, right: right ?? DEFAULT_INSETS.right, bottom: bottom ?? DEFAULT_INSETS.bottom };
}

/** The largest page of the document's sections, in points (w:pgSz is in twips); A4 or Letter when none is given. */
function largestPage(): Survey<{ width: number; height: number }> {
  const page = { width: 0, height: 0 };
  return {
    visit: tag => {
      if (tag.closing || tag.name !== "w:pgSz") return;
      page.width = Math.max(page.width, Number(tag.attributes.get("w:w")) / 20 || 0);
      page.height = Math.max(page.height, Number(tag.attributes.get("w:h")) / 20 || 0);
    },
    done: () => ({ width: page.width || 612, height: page.height || 842 }),
  };
}

/**
 * A section's page across, in points: its width, its widest side margin (the
 * gutter added) and its narrowest, how far beyond the margin its last column
 * may start, and its narrowest and widest columns (its text width when it has
 * one). Margins may swap from page to page (w:mirrorMargins): either may be on
 * either side.
 */
type PageAcross = { width: number; widestMargin: number; narrowestMargin: number; columnShift: number; narrowestColumn: number; widestColumn: number };

/** The page of each section, by where its w:sectPr starts: a paragraph lies in the first section that ends after it. */
function sectionPages(): Survey<Array<{ end: number; page: PageAcross }>> {
  const sections: Array<{ end: number; page: PageAcross }> = [];
  type Section = { start: number; width?: number; left?: number; right?: number; gutter?: number; columns: number; space?: number; widths: number[] };
  let section: Section | null = null;
  // A w:sectPrChange holds the section's former properties in a w:sectPr of its own.
  let depth = 0;
  const close = (current: Section) => {
    const width = current.width ?? DEFAULT_PAGE.width;
    const left = current.left ?? DEFAULT_PAGE.margin;
    const right = current.right ?? DEFAULT_PAGE.margin;
    const gutter = Math.max(0, current.gutter ?? 0);
    const text = width - left - right - gutter;
    const columns = current.widths.length > 1 ? current.widths.length : current.columns;
    const evenColumn = columns > 1 ? (text - (columns - 1) * (current.space ?? 36)) / columns : text;
    const narrowestColumn = current.widths.length > 1 ? Math.min(...current.widths) : evenColumn;
    const widestColumn = current.widths.length > 1 ? Math.max(...current.widths) : evenColumn;
    sections.push({ end: current.start, page: { width, widestMargin: Math.max(left, right) + gutter, narrowestMargin: Math.min(left, right), columnShift: columns > 1 ? Math.max(0, text - narrowestColumn) : 0, narrowestColumn, widestColumn } });
  };
  const twips = (tag: XmlTag, name: string) => measurePt(tag.attributes.get(`w:${name}`), 20);
  const visit = (tag: XmlTag) => {
    if (tag.name === "w:sectPr") {
      if (tag.closing) {
        if (depth === 1 && section) close(section);
        if (depth === 1) section = null;
        depth -= 1;
      } else if (depth === 0) {
        section = { start: tag.start, columns: 1, widths: [] };
        if (tag.selfClosing) {
          close(section);
          section = null;
        } else depth = 1;
      } else if (!tag.selfClosing) depth += 1;
      return;
    }
    if (!section || tag.closing || depth > 1) return;
    if (tag.name === "w:pgSz") section.width = twips(tag, "w");
    else if (tag.name === "w:pgMar") Object.assign(section, { left: twips(tag, "left"), right: twips(tag, "right"), gutter: twips(tag, "gutter") });
    else if (tag.name === "w:cols") Object.assign(section, { columns: Math.max(1, Number.parseInt(tag.attributes.get("w:num") ?? "1", 10) || 1), space: twips(tag, "space") });
    else if (tag.name === "w:col") {
      const width = twips(tag, "w");
      if (width !== undefined) section.widths.push(width);
    }
  };
  return { visit, done: () => sections };
}

/** A DrawingML text box (wps:wsp): whether its size does not cut its text (it grows with it, a:spAutoFit, or runs top to bottom, vert), whether its lines do not wrap (wrap none), its insets. */
type DrawingBox = { free: boolean; unwrapped: boolean; insets: Insets };

/** A VML text box style that grows the box with its text, or runs it top to bottom. */
const FREE_VML_TEXT = /mso-fit-shape-to-text\s*:\s*t|layout-flow\s*:\s*vertical/i;

/** The height a text box shows of its text in both layouts: less its insets in the first; infinite when unknown or free. */
const boxRoom = (height: number | undefined, insets: Insets, free: boolean): Pair =>
  free || height === undefined ? [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] : [Math.max(0, height - insets.top - insets.bottom), Math.max(0, height)];

/**
 * The text boxes of a part: each DrawingML one (DrawingBox, by where its
 * wps:wsp starts), and for those whose text flows on into others
 * (wps:linkedTxbx; VML mso-next-textbox) the height of the chain in both
 * layouts, by where the first box's wps:txbx or v:textbox starts: up to the
 * first box placed off the page, which shows none of it, nor any box after it;
 * infinite when a box before has no known height or a free one
 * (FREE_VML_TEXT, a VML shape in a group).
 */
function textBoxes(xml: string) {
  const shapes = new Map<number, DrawingBox>();
  /** A DrawingML anchor (or inline drawing): where it places its shape, and its height. */
  type Holder = { box: Box; height?: number };
  const chains = new Map<string, { start?: number; boxes: Array<{ order: number; holder?: Holder; shape?: DrawingBox }> }>();
  type VmlBox = { names: string[]; style: string; height?: number; insets: Insets; next?: string; textbox?: number };
  const vml: VmlBox[] = [];
  const path: string[] = [];
  const holders: Holder[] = [];
  const drawing: DrawingBox[] = [];
  const vmlOpen: VmlBox[] = [];
  let offset: { start: number; holder: Holder; across: boolean } | null = null;
  const visit = (tag: XmlTag) => {
    if (tag.closing) {
      const name = path.pop();
      if (name === "wp:posOffset" && offset) {
        offset.holder.box[offset.across ? "left" : "top"] = Number(xml.slice(offset.start, tag.start).trim()) / EMU_PER_PT || 0;
        offset = null;
      } else if (name === "wp:anchor" || name === "wp:inline") holders.pop();
      else if (name === "wps:wsp") drawing.pop();
      else if (name !== undefined && VML_SHAPES.has(name)) vmlOpen.pop();
      return;
    }
    const parent = path.at(-1);
    const shape = drawing.at(-1);
    if (tag.name === "wp:anchor" || tag.name === "wp:inline") {
      if (!tag.selfClosing) holders.push({ box: { left: 0, top: 0, width: 0, height: 0, simple: tag.name === "wp:anchor" && /^(1|true|on)$/i.test(tag.attributes.get("simplePos") ?? "") } });
    } else if (tag.name === "wp:simplePos" && parent === "wp:anchor" && holders.at(-1)?.box.simple) {
      Object.assign(holders.at(-1)!.box, { left: Number(tag.attributes.get("x")) / EMU_PER_PT || 0, top: Number(tag.attributes.get("y")) / EMU_PER_PT || 0 });
    } else if (tag.name === "wp:extent" && (parent === "wp:anchor" || parent === "wp:inline") && holders.length) {
      const holder = holders.at(-1)!;
      holder.height = emuPt(tag.attributes.get("cy"));
      Object.assign(holder.box, { width: Number(tag.attributes.get("cx")) / EMU_PER_PT || 0, height: Number(tag.attributes.get("cy")) / EMU_PER_PT || 0 });
    } else if (tag.name === "wp:posOffset" && !tag.selfClosing && (parent === "wp:positionH" || parent === "wp:positionV") && path.at(-2) === "wp:anchor" && holders.length && !holders.at(-1)!.box.simple) {
      offset = { start: tag.end, holder: holders.at(-1)!, across: parent === "wp:positionH" };
    } else if (tag.name === "wps:wsp") {
      const box: DrawingBox = { free: false, unwrapped: false, insets: { ...DEFAULT_INSETS } };
      shapes.set(tag.start, box);
      if (!tag.selfClosing) drawing.push(box);
    } else if (tag.name === "a:spAutoFit" && shape) {
      shape.free = true;
    } else if (tag.name === "wps:bodyPr" && shape) {
      const inset = (name: string, fallback: number) => Math.max(0, emuPt(tag.attributes.get(name)) ?? fallback);
      if (!/^(horz)?$/.test(tag.attributes.get("vert") ?? "")) shape.free = true;
      shape.unwrapped = tag.attributes.get("wrap") === "none";
      shape.insets = { left: inset("lIns", DEFAULT_INSETS.left), top: inset("tIns", DEFAULT_INSETS.top), right: inset("rIns", DEFAULT_INSETS.right), bottom: inset("bIns", DEFAULT_INSETS.bottom) };
    } else if (tag.name === "wps:txbx" || tag.name === "wps:linkedTxbx") {
      const id = tag.attributes.get("id") ?? "0";
      const chain = chains.get(id) ?? { boxes: [] };
      const order = tag.name === "wps:txbx" ? 0 : Number(tag.attributes.get("seq")) || chain.boxes.length;
      chain.boxes.push({ order, holder: holders.at(-1), shape });
      if (tag.name === "wps:txbx") chain.start = tag.start;
      chains.set(id, chain);
    } else if (VML_SHAPES.has(tag.name)) {
      const style = tag.attributes.get("style") ?? "";
      const top = parent === "w:pict" || parent === "w:object";
      // Word names a shape by its id, or by its o:spid.
      const names = Array.from(tag.attributes).filter(([name]) => name === "id" || /(^|:)spid$/.test(name)).map(([, value]) => value.trim());
      const box: VmlBox = { names, style, height: top && !FREE_VML_TEXT.test(style) ? vmlMeasure(style, "height") : undefined, insets: DEFAULT_INSETS };
      vml.push(box);
      if (!tag.selfClosing) vmlOpen.push(box);
    } else if (tag.name === "v:textbox" && vmlOpen.length) {
      const box = vmlOpen.at(-1)!;
      const style = tag.attributes.get("style") ?? "";
      if (FREE_VML_TEXT.test(style)) box.height = undefined;
      box.next = /(?:^|;)\s*mso-next-textbox\s*:\s*#?([^;]+)/i.exec(style)?.[1]?.trim();
      box.textbox = tag.start;
      box.insets = vmlInsets(tag.attributes.get("inset"));
    }
    if (!tag.selfClosing) path.push(tag.name);
  };
  const done = (page: { width: number; height: number }) => {
    const heights = new Map<number, Pair>();
    for (const chain of Array.from(chains.values())) {
      if (chain.start === undefined || chain.boxes.length < 2) continue;
      const height: Pair = [0, 0];
      for (const box of chain.boxes.sort((left, right) => left.order - right.order)) {
        if (box.holder && isOffPage(box.holder.box, page)) break;
        const room = boxRoom(box.holder?.height, box.shape?.insets ?? DEFAULT_INSETS, box.shape?.free ?? false);
        height[MOST] += room[MOST];
        height[LEAST] += room[LEAST];
      }
      heights.set(chain.start, height);
    }
    const byName = new Map(vml.flatMap(box => box.names.map(name => [name, box] as const)));
    // Height of the chain from each box, each box counted once: walked once per
    // box (linear in the number of boxes, a loop of boxes included), since a
    // file can chain thousands of boxes. A box off the page ends the chain.
    const chainHeights = new Map<VmlBox, Pair>();
    for (const box of vml) if (vmlShapeIsOffPage(box.style, page)) chainHeights.set(box, [0, 0]);
    const room = (box: VmlBox) => boxRoom(box.height, box.insets, false);
    for (const start of vml) {
      const path: VmlBox[] = [];
      const onPath = new Map<VmlBox, number>();
      let box: VmlBox | undefined = start;
      while (box && !chainHeights.has(box) && !onPath.has(box)) {
        onPath.set(box, path.length);
        path.push(box);
        box = box.next ? byName.get(box.next) : undefined;
      }
      let height: Pair = box ? [...(chainHeights.get(box) ?? [0, 0])] : [0, 0];
      const loop = box ? onPath.get(box) : undefined;
      if (loop !== undefined) {
        height = path.slice(loop).reduce<Pair>((total, item) => [total[MOST] + room(item)[MOST], total[LEAST] + room(item)[LEAST]], [0, 0]);
        for (const item of path.splice(loop)) chainHeights.set(item, height);
      }
      for (let index = path.length - 1; index >= 0; index -= 1) {
        const own = room(path[index]!);
        height = [height[MOST] + own[MOST], height[LEAST] + own[LEAST]];
        chainHeights.set(path[index]!, height);
      }
    }
    for (const first of vml) if (first.next && first.textbox !== undefined) heights.set(first.textbox, chainHeights.get(first)!);
    return { shapes, chains: heights };
  };
  return { visit, done };
}

/**
 * A tag visitor that also gives the paragraph (w:p) each tag is in, by a key
 * naming its place among the paragraphs of its container (body, table cell,
 * text box, header…): `${container}:${index ± 1}` names its neighbours.
 */
function inParagraphs(visit: (tag: XmlTag, paragraph: string | null) => void) {
  const top = { id: -1, next: 0 };
  const containers: Array<{ id: number; next: number }> = [];
  const paragraphs: string[] = [];
  let ids = 0;
  return (tag: XmlTag) => {
    const current = paragraphs.length ? paragraphs[paragraphs.length - 1]! : null;
    if (tag.closing) {
      visit(tag, current);
      if (PARAGRAPH_CONTAINERS.has(tag.name)) containers.pop();
      if (tag.name === "w:p") paragraphs.pop();
      return;
    }
    if (tag.name === "w:p") {
      const container = containers.length ? containers[containers.length - 1]! : top;
      const key = `${container.id}:${container.next++}`;
      if (!tag.selfClosing) paragraphs.push(key);
      visit(tag, key);
      return;
    }
    if (PARAGRAPH_CONTAINERS.has(tag.name) && !tag.selfClosing) containers.push({ id: ids++, next: 0 });
    visit(tag, current);
  };
}

/**
 * What white text the pictures and shapes of a part may lie under: the
 * paragraphs holding one (`drawings`), and for each picture behind the text
 * (wp:anchor behindDoc, VML z-index below 0) placed from its paragraph, the
 * blocks of the body its height may reach (`reaches`, by the index of the
 * block each paragraph is in, `blocks`, by paragraph in order); one placed
 * from the page may lie under any text (`fromPage`).
 */
function drawingReach(xml: string) {
  const reach = drawingReachSurvey(xml);
  visitXmlTags(xml, reach.visit);
  return reach.done();
}

function drawingReachSurvey(xml: string) {
  const drawings = new Set<string>();
  const blocks: number[] = [];
  const reaches: Array<[number, number]> = [];
  let fromPage = false;
  const path: string[] = [];
  let block = -1;
  let anchor: { block: number; behind: boolean; fromPage: boolean; offset: number; height: number } | null = null;
  let offsetStart: number | null = null;
  /** Offset and height in points, from the anchor paragraph's top. */
  const reach = (start: number, offset: number, height: number) => {
    const span = (length: number) => Math.ceil(Math.max(0, length) / MIN_PARAGRAPH_PT);
    reaches.push([start - span(-offset), start + span(offset + height)]);
  };
  const visit = inParagraphs((tag, paragraph) => {
    if (tag.closing) {
      path.pop();
      if (tag.name === "wp:posOffset" && offsetStart !== null && anchor) anchor.offset = Number(xml.slice(offsetStart, tag.start).trim()) / EMU_PER_PT || 0;
      offsetStart = null;
      if (tag.name === "wp:anchor" && anchor?.behind) {
        if (anchor.fromPage) fromPage = true;
        else reach(anchor.block, anchor.offset, anchor.height);
      }
      if (tag.name === "wp:anchor") anchor = null;
      return;
    }
    if (path.at(-1) === "w:body" && BODY_BLOCKS.has(tag.name)) block += 1;
    if (paragraph && tag.name === "w:p") blocks.push(block);
    if (paragraph && DRAWINGS.has(tag.name)) drawings.add(paragraph);
    if (tag.name === "wp:anchor") {
      anchor = { block, behind: /^(1|true|on)$/i.test(tag.attributes.get("behindDoc") ?? ""), fromPage: false, offset: 0, height: 0 };
    } else if (anchor && tag.name === "wp:positionV") {
      anchor.fromPage = FROM_PAGE.test(tag.attributes.get("relativeFrom") ?? "");
    } else if (anchor && tag.name === "wp:posOffset" && path.at(-1) === "wp:positionV" && !tag.selfClosing) {
      offsetStart = tag.end;
    } else if (anchor && tag.name === "wp:extent") {
      anchor.height = Number(tag.attributes.get("cy")) / EMU_PER_PT || 0;
    } else if (tag.name.startsWith("v:")) {
      const style = tag.attributes.get("style") ?? "";
      if (/(^|;)\s*z-index\s*:\s*-\d/i.test(style)) {
        const relative = /(?:^|;)\s*mso-position-vertical-relative\s*:\s*([\w-]+)/i.exec(style)?.[1] ?? "";
        if (FROM_PAGE.test(relative)) fromPage = true;
        else reach(block, vmlLength(style, "margin-top") + vmlLength(style, "top"), vmlLength(style, "height"));
      }
    }
    if (!tag.selfClosing) path.push(tag.name);
  });
  return { visit, done: () => ({ drawings, blocks, reaches, fromPage }) };
}

/** Scripts Word sets in the complex script size (w:szCs), like a run marked w:cs or w:rtl. */
const COMPLEX_SCRIPTS = "\\p{Script=Arabic}\\p{Script=Hebrew}\\p{Script=Syriac}\\p{Script=Thaana}\\p{Script=Thai}";
const COMPLEX_SCRIPT = new RegExp(`[${COMPLEX_SCRIPTS}]`, "u");
const OTHER_LETTER = new RegExp(`(?![${COMPLEX_SCRIPTS}])[\\p{L}\\p{N}]`, "u");
/** Characters about as wide as they are tall; others average half of that. */
const WIDE_CHARACTER = new RegExp("[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\uff01-\\uff60]", "u");
/** Kinds of characters of different widths (LAYOUTS). */
type CharacterKind = "capital" | "figure" | "letter" | "punctuation" | "sign" | "space" | "wide";
const NARROW_PUNCTUATION = /^[.,:;'"!|()[\]{}`-]$/;
const CHARACTER_KINDS: Array<[RegExp, CharacterKind]> = [
  [new RegExp("^\\s$", "u"), "space"],
  [WIDE_CHARACTER, "wide"],
  [new RegExp("^\\p{Lu}$", "u"), "capital"],
  [new RegExp("^\\p{Nd}$", "u"), "figure"],
  [new RegExp("^\\p{P}$", "u"), "punctuation"],
  [new RegExp("^\\p{S}$", "u"), "sign"],
];

/** The kind of a character (one code point), for its width. */
function characterKind(character: string): CharacterKind {
  const code = character.charCodeAt(0);
  if (code <= 32) return "space";
  if (code < 128) return code >= 65 && code <= 90 ? "capital" : code >= 48 && code <= 57 ? "figure" : code >= 97 && code <= 122 ? "letter" : NARROW_PUNCTUATION.test(character) ? "punctuation" : "sign";
  return CHARACTER_KINDS.find(([pattern]) => pattern.test(character))?.[1] ?? "letter";
}

/** How many characters (code points) a text holds. */
function codePoints(text: string) {
  let count = text.length;
  for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) >= 0xdc00 && text.charCodeAt(index) <= 0xdfff) count -= 1;
  return count;
}

/** Whether a line this far down its paragraph (and lowered), of this size, leaves one of the places that show it (`slack`: ParagraphLayout): it shows less than MIN_LINE_SHARE of its letters. */
const outOfPlace = (slack: Pair, model: number, top: number, lowered: number, size: number) => top + lowered + MIN_LINE_SHARE * size > slack[model]!;

/** The size of most of a run's letters: its complex script size (w:szCs) when it is marked so or holds only such scripts, else w:sz. */
const fontSize = (effective: RunLayer, text: string) =>
  (effective["w:cs"] || effective["w:rtl"] || (COMPLEX_SCRIPT.test(text) && !OTHER_LETTER.test(text)) ? effective.complexScriptSize : effective.size) ?? DEFAULT_FONT_SIZE_PT;

function applyRunProperty(layer: RunLayer, tag: XmlTag, theme: Theme) {
  const value = tag.attributes.get("w:val");
  if (tag.name === "w:vanish" || tag.name === "w:specVanish" || tag.name === "w:webHidden" || tag.name === "w:cs" || tag.name === "w:rtl") {
    layer[tag.name] = value === undefined || !/^(false|0|off)$/i.test(value);
  } else if (tag.name === "w:sz" || tag.name === "w:szCs") {
    const size = measurePt(value, 2);
    if (size !== undefined && size >= 0) layer[tag.name === "w:sz" ? "size" : "complexScriptSize"] = size;
  } else if (tag.name === "w:color") {
    const colour = colourOf(theme, value, tag.attributes.get("w:themeColor"), tag.attributes.get("w:themeTint"), tag.attributes.get("w:themeShade"));
    if (colour) layer.colour = colour;
  } else if (tag.name === "w:shd") {
    layer.shading = shadingPaint(tag, theme);
  } else if (tag.name === "w:highlight") {
    if (value === undefined || /^none$/i.test(value)) layer.highlight = null;
    else if (HIGHLIGHTS[value.toLowerCase()]) layer.highlight = HIGHLIGHTS[value.toLowerCase()]!;
  } else if (tag.name === "w:w") {
    const percent = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(value ?? "")?.[1];
    if (percent !== undefined) layer.scale = Number(percent);
  } else if (tag.name === "w:spacing" || tag.name === "w:position") {
    const length = measurePt(value, tag.name === "w:spacing" ? 20 : 2);
    if (length !== undefined) layer[tag.name === "w:spacing" ? "spacing" : "position"] = length;
  } else if (tag.name === "w:rFonts") {
    const font = tag.attributes.get("w:ascii") ?? tag.attributes.get("w:hAnsi");
    if (font !== undefined) layer.typewriter = /courier|mono|consolas|lucida console|typewriter/i.test(font);
  }
}

/** Text Word does not show (w:vanish, w:specVanish) takes no room: its line breaks do not move the text after it. */
const hides = (layer: RunLayer) => Boolean(layer["w:vanish"] || layer["w:specVanish"]);
/** The widest advance of a run's characters. */
const widestAdvance = (layer: RunLayer) =>
  Math.max(layer.size ?? DEFAULT_FONT_SIZE_PT, layer.complexScriptSize ?? DEFAULT_FONT_SIZE_PT) * MAX_ADVANCE_IN_SIZES * (layer.scale ?? 100) / 100 + Math.max(0, layer.spacing ?? 0);

/**
 * What one layer of paragraph formatting says; keys left unset inherit from
 * the layer below. Indents in points, from the edge the paragraph starts from
 * (w:start or w:left, its right edge in a right-to-left paragraph) and the
 * other; `firstLine` negative for a hanging indent. `line` as written: twips
 * for an exact or least spacing, 240ths of a line for a multiple. `before`,
 * `after`: the space above and below it, in points; `contextual`: dropped
 * next to a paragraph of its style (w:contextualSpacing). `tabs`: its tab
 * stops (w:tabs), from the start of its column, and their kind ("clear" takes
 * away the one a style sets there).
 */
type ParagraphLayer = Partial<{ start: number; end: number; firstLine: number; align: string; bidi: boolean; line: string; lineRule: string; before: number; after: number; contextual: boolean; tabs: Array<[number, string]> }>;

/** Reads a child of w:pPr, or a w:tab of its w:tabs. */
function applyParagraphProperty(layer: ParagraphLayer, tag: XmlTag) {
  const attribute = (name: string) => tag.attributes.get(`w:${name}`);
  if (tag.name === "w:tab") {
    const position = measurePt(attribute("pos"), 20);
    if (position !== undefined) (layer.tabs ??= []).push([position, attribute("val") ?? "left"]);
  } else if (tag.name === "w:ind") {
    const twips = (...names: string[]) => names.map(name => measurePt(attribute(name), 20)).find(length => length !== undefined);
    const start = twips("start", "left");
    const end = twips("end", "right");
    const hanging = twips("hanging");
    const firstLine = twips("firstLine");
    if (start !== undefined) layer.start = start;
    if (end !== undefined) layer.end = end;
    // A hanging indent wins over a first line one.
    if (hanging !== undefined) layer.firstLine = -hanging;
    else if (firstLine !== undefined) layer.firstLine = firstLine;
  } else if (tag.name === "w:jc") {
    const value = attribute("val");
    if (value) layer.align = value;
  } else if (tag.name === "w:bidi") {
    layer.bidi = !/^(false|0|off)$/i.test(attribute("val") ?? "");
  } else if (tag.name === "w:spacing") {
    const line = attribute("line");
    const rule = attribute("lineRule");
    if (line !== undefined) layer.line = line;
    if (rule) layer.lineRule = rule;
    // In lines (hundredths), counted at their lowest, it wins over the length; Word's automatic spacing (HTML's) is not counted.
    for (const side of ["before", "after"] as const) {
      const lines = attribute(`${side}Lines`);
      const space = /^(1|true|on)$/i.test(attribute(`${side}Autospacing`) ?? "") ? 0 : lines !== undefined ? Number(lines) / 100 * MIN_PARAGRAPH_PT : measurePt(attribute(side), 20);
      if (space !== undefined && Number.isFinite(space)) layer[side] = Math.max(0, space);
    }
  } else if (tag.name === "w:contextualSpacing") {
    layer.contextual = !/^(false|0|off)$/i.test(attribute("val") ?? "");
  }
}

/** A paragraph's layer once resolved; `line`: its exact or least line height in points, or its multiple of single spacing. */
type ParagraphFormat = { start: number; end: number; firstLine: number; align?: string; bidi: boolean; line: { rule: "exact" | "atLeast" | "auto"; value: number }; before: number; after: number; contextual: boolean };

/** `layers`: the document's defaults, the paragraph's styles from the base, its own. */
function paragraphFormat(layers: ParagraphLayer[]): ParagraphFormat {
  const layer: ParagraphLayer = Object.assign({}, ...layers);
  const rule: ParagraphFormat["line"]["rule"] = layer.lineRule === "exact" || layer.lineRule === "atLeast" ? layer.lineRule : "auto";
  const value = layer.line === undefined ? undefined : rule === "auto" ? Number(layer.line) / 240 : measurePt(layer.line, 20);
  const line: ParagraphFormat["line"] = value !== undefined && Number.isFinite(value) ? { rule, value: Math.abs(value) } : { rule: "auto", value: 1 };
  return { start: layer.start ?? 0, end: layer.end ?? 0, firstLine: layer.firstLine ?? 0, align: layer.align, bidi: layer.bidi ?? false, line, before: layer.before ?? 0, after: layer.after ?? 0, contextual: layer.contextual ?? false };
}

/** The tab stops of these layers (as paragraphFormat), each one's adding to, or clearing, those below; in order, but bar tabs, which stop no text. */
function tabStops(layers: ParagraphLayer[]) {
  const tabs = new Map<number, string>();
  for (const { tabs: stops } of layers) for (const [position, kind] of stops ?? []) if (kind === "clear") tabs.delete(position); else tabs.set(position, kind);
  return Array.from(tabs).filter(([, kind]) => kind !== "bar").sort((left, right) => left[0] - right[0]);
}

/** The lowest a line of text of this size can be in a paragraph: its exact spacing, else what its spacing gives single spacing at its lowest. */
const lineFloor = ({ line }: ParagraphFormat, size: number) =>
  line.rule === "exact" ? line.value : line.rule === "atLeast" ? Math.max(line.value, MIN_LINE_HEIGHT_IN_SIZES * size) : MIN_LINE_HEIGHT_IN_SIZES * size * line.value;

/** The height of a line of text of this size in one of LAYOUTS, a picture on it (`objects`) at least as tall, but in an exact spacing. */
const lineHeight = ({ line }: ParagraphFormat, size: number, layout: number, objects = 0) =>
  line.rule === "exact" ? line.value
    : Math.max(objects, line.rule === "atLeast" ? Math.max(line.value, LAYOUTS[layout]!.lineHeight * size) : LAYOUTS[layout]!.lineHeight * size * line.value);

/** Where a passage starts in its paragraph, for its indents: the widest the paragraph's text before it can be; after a tab, its place is unknown. In points. */
type TextPlace = { before: number; tabbed: boolean };

/**
 * Whether a paragraph's indents place a passage of it, where it starts, beyond
 * an edge of the page, across: before the edge the paragraph starts from (its
 * left one, its right one when right to left) or beyond the other; a passage
 * whose lines come back onto the page is cut out whole. `advance`: the
 * widest a character of the passage can be; `width`: the widest the passage
 * can be. Text starts at most from the widest margin and the last column, at
 * least from the narrowest margin; a line too narrow for its letters (its
 * indents crossing) is left alone, as Word and LibreOffice place them
 * elsewhere. In a table cell or a text box, which may lie anywhere on the
 * page, only text set before the page's start wherever it lies is.
 * LibreOffice ignores a positive indent of more than 32767 twips (57.8 cm)
 * and shows such text: the file, which places it off the page, is followed.
 */
function offPage(format: ParagraphFormat, page: PageAcross, place: TextPlace, advance: number, width: number, nested: boolean) {
  if (place.tabbed) return false;
  const { start, end, firstLine } = format;
  // Text aligned to its start runs from it; centred, justified to both ends or aligned to the other, it may reach the line's end.
  const fromStart = !format.align || format.align === "start" || format.align === "both" || (!format.bidi && format.align === "left");
  const from = nested ? page.width : page.widestMargin + page.columnShift;
  const lineEnd = nested ? Number.POSITIVE_INFINITY : page.width - page.narrowestMargin - end;
  const reach = (lineStart: number) => (fromStart ? lineStart + place.before : Math.max(lineEnd, lineStart + place.before)) + advance;
  // The narrowest the first line can be: when the text up to the passage's end fits in it, it is all on that line.
  const firstWidth = page.narrowestColumn - start - end - firstLine;
  const onFirstLine = !nested && place.before + width <= firstWidth;
  if (reach(from + start + Math.max(firstLine, 0)) <= 0 || (onFirstLine && reach(from + start + firstLine) <= 0)) return true;
  if (nested || firstWidth <= 0) return false;
  const lowest = page.narrowestMargin + start;
  return (firstWidth + firstLine > 0 && lowest + Math.min(firstLine, 0) >= page.width) || (onFirstLine && lowest + firstLine >= page.width);
}

/** What a style, or one of a table style's conditional formats (w:tblStylePr), sets for the text and under it. */
type Formats = { run: RunLayer; paragraphShading?: Paint; cellShading?: Paint };
/** Table styles: how many rows or columns each of their bands spans (w:tblStyleRowBandSize, w:tblStyleColBandSize). */
type BandSizes = { rowBandSize?: number; columnBandSize?: number };
/** `cellTop`: table styles, the top margin of their cells (w:tblCellMar), in points. */
type StyleDefinition = Formats & BandSizes & { basedOn?: string; tableShading?: Paint; conditions: Map<string, Formats>; paragraph: ParagraphLayer; cellTop?: number };
/** `defaults`, `paragraphShading`, `paragraph`: the document's defaults (w:docDefaults). */
type Styles = { byId: Map<string, StyleDefinition>; defaultIds: Map<string, string>; defaults: RunLayer; paragraphShading?: Paint; paragraph: ParagraphLayer; chains: Map<string, StyleDefinition[]> };

const BAND_SIZES: Record<string, keyof BandSizes> = { "w:tblStyleRowBandSize": "rowBandSize", "w:tblStyleColBandSize": "columnBandSize" };
const bandSize = (tag: XmlTag) => Math.max(1, Number.parseInt(tag.attributes.get("w:val") ?? "", 10) || 1);
/** A cell margin (w:top of w:tcMar or w:tblCellMar), in points: in twips, or none (nil). */
const cellMargin = (tag: XmlTag) => (/^(dxa)?$/i.test(tag.attributes.get("w:type") ?? "") ? Math.max(0, measurePt(tag.attributes.get("w:w"), 20) ?? 0) : 0);

function readStyles(xml: string | undefined, theme: Theme): Styles {
  const styles: Styles = { byId: new Map(), defaultIds: new Map(), defaults: {}, paragraph: {}, chains: new Map() };
  const path: string[] = [];
  let current: StyleDefinition | null = null;
  let condition: Formats | null = null;
  visitXmlTags(xml ?? "", tag => {
    if (tag.closing) {
      const closed = path.pop();
      if (closed === "w:style") current = null;
      if (closed === "w:tblStylePr") condition = null;
      return;
    }
    const parent = path.at(-1);
    const grandParent = path.at(-2);
    const formats = grandParent === "w:style" ? current : grandParent === "w:tblStylePr" ? condition : null;
    if (tag.name === "w:style") {
      current = { run: {}, conditions: new Map(), paragraph: {} };
      const id = tag.attributes.get("w:styleId");
      const type = tag.attributes.get("w:type") ?? "paragraph";
      if (id) styles.byId.set(id, current);
      if (id && /^(1|true|on)$/i.test(tag.attributes.get("w:default") ?? "")) styles.defaultIds.set(type, id);
    } else if (current && parent === "w:style" && tag.name === "w:basedOn") {
      current.basedOn = tag.attributes.get("w:val");
    } else if (current && parent === "w:style" && tag.name === "w:tblStylePr") {
      condition = { run: {} };
      current.conditions.set(tag.attributes.get("w:type") ?? "wholeTable", condition);
    } else if (parent === "w:rPr" && grandParent === "w:rPrDefault") {
      applyRunProperty(styles.defaults, tag, theme);
    } else if (parent === "w:pPr" && grandParent === "w:pPrDefault" && tag.name === "w:shd") {
      styles.paragraphShading = shadingPaint(tag, theme);
    } else if (tag.name === "w:tab" && parent === "w:tabs" && grandParent === "w:pPr" && (path.at(-3) === "w:pPrDefault" || (current && path.at(-3) === "w:style"))) {
      applyParagraphProperty(path.at(-3) === "w:pPrDefault" ? styles.paragraph : current!.paragraph, tag);
    } else if (parent === "w:pPr" && grandParent === "w:pPrDefault") {
      applyParagraphProperty(styles.paragraph, tag);
    } else if (current && parent === "w:tblPr" && grandParent === "w:style" && BAND_SIZES[tag.name]) {
      current[BAND_SIZES[tag.name]!] = bandSize(tag);
    } else if (current && tag.name === "w:top" && parent === "w:tblCellMar" && grandParent === "w:tblPr" && path.at(-3) === "w:style") {
      current.cellTop = cellMargin(tag);
    } else if (formats && parent === "w:rPr") {
      applyRunProperty(formats.run, tag, theme);
    } else if (formats && tag.name === "w:shd") {
      if (parent === "w:pPr") formats.paragraphShading = shadingPaint(tag, theme);
      else if (parent === "w:tcPr") formats.cellShading = shadingPaint(tag, theme);
      else if (parent === "w:tblPr" && current && formats === current) current.tableShading = shadingPaint(tag, theme);
    } else if (current && formats === current && parent === "w:pPr") {
      applyParagraphProperty(current.paragraph, tag);
    }
    if (!tag.selfClosing) path.push(tag.name);
  });
  return styles;
}

/** The last value set, in the order the layers apply. */
const lastSet = <T>(values: Array<T | undefined>) => values.reduce<T | undefined>((found, value) => (value !== undefined ? value : found), undefined);

/** Which conditional formats of its style a table shows (w:tblLook); Word's look for a new table without one (04A0). */
type TableLook = Record<"firstRow" | "lastRow" | "firstColumn" | "lastColumn" | "rowBands" | "columnBands", boolean>;

function tableLook(tag: XmlTag | null): TableLook {
  const mask = tag ? Number.parseInt(tag.attributes.get("w:val") ?? "0", 16) : 0x04a0;
  const on = (name: string, bit: number) => {
    const value = tag?.attributes.get(`w:${name}`);
    return value !== undefined ? /^(1|true|on)$/i.test(value) : Number.isFinite(mask) && (mask & bit) !== 0;
  };
  return { firstRow: on("firstRow", 0x20), lastRow: on("lastRow", 0x40), firstColumn: on("firstColumn", 0x80), lastColumn: on("lastColumn", 0x100), rowBands: !on("noHBand", 0x200), columnBands: !on("noVBand", 0x400) };
}

/** The conditional formats that apply to a cell, by its place in the table (cells of each row), in the order Word applies them. */
function cellConditions(look: TableLook, rows: number[], row: number, column: number, bands: Required<BandSizes>) {
  const firstRow = look.firstRow && row === 0;
  const lastRow = look.lastRow && row === rows.length - 1;
  const firstColumn = look.firstColumn && column === 0;
  const lastColumn = look.lastColumn && column === (rows[row] ?? 0) - 1;
  const rowBand = Math.floor((row - (look.firstRow ? 1 : 0)) / bands.rowBandSize);
  const columnBand = Math.floor((column - (look.firstColumn ? 1 : 0)) / bands.columnBandSize);
  return [
    "wholeTable",
    ...(look.columnBands && columnBand >= 0 ? [columnBand % 2 === 0 ? "band1Vert" : "band2Vert"] : []),
    ...(look.rowBands && rowBand >= 0 ? [rowBand % 2 === 0 ? "band1Horz" : "band2Horz"] : []),
    ...(firstColumn ? ["firstCol"] : []),
    ...(lastColumn ? ["lastCol"] : []),
    ...(firstRow ? ["firstRow"] : []),
    ...(lastRow ? ["lastRow"] : []),
    ...(firstRow && firstColumn ? ["nwCell"] : []),
    ...(firstRow && lastColumn ? ["neCell"] : []),
    ...(lastRow && firstColumn ? ["swCell"] : []),
    ...(lastRow && lastColumn ? ["seCell"] : []),
  ];
}

/** The cells of each row of each table, by where its w:tbl tag starts: which row is the last, which cell ends its row. */
function tableRows(): Survey<Map<number, number[]>> {
  const tables = new Map<number, number[]>();
  const open: Array<{ start: number; rows: number[] }> = [];
  const visit = (tag: XmlTag) => {
    if (tag.name === "w:tbl") {
      if (tag.closing) {
        const table = open.pop();
        if (table) tables.set(table.start, table.rows);
      } else if (!tag.selfClosing) {
        open.push({ start: tag.start, rows: [] });
      }
    } else if (!tag.closing && tag.name === "w:tr") {
      open.at(-1)?.rows.push(0);
    } else if (!tag.closing && tag.name === "w:tc") {
      const rows = open.at(-1)?.rows;
      if (rows?.length) rows.push(rows.pop()! + 1);
    }
  };
  return { visit, done: () => tables };
}

/** The attributes of the v:fill of each VML shape, by where the shape's tag starts: it may follow the text box. */
function vmlFills(): Survey<Map<number, Map<string, string>>> {
  const fills = new Map<number, Map<string, string>>();
  const names: string[] = [];
  const starts: number[] = [];
  const visit = (tag: XmlTag) => {
    if (tag.closing) {
      names.pop();
      starts.pop();
      return;
    }
    if (tag.name === "v:fill" && VML_SHAPES.has(names.at(-1) ?? "")) fills.set(starts.at(-1)!, tag.attributes);
    if (!tag.selfClosing) {
      names.push(tag.name);
      starts.push(tag.start);
    }
  };
  return { visit, done: () => fills };
}

/** A style and the ones it is based on, the base first; the type's default style when none is named. */
function styleChain(styles: Styles, id: string | undefined, type: string) {
  // Read for each run and paragraph: kept once found.
  const key = `${type}:${id ?? ""}`;
  const known = styles.chains.get(key);
  if (known) return known;
  const chain: StyleDefinition[] = [];
  const seen = new Set<string>();
  for (let current = id ?? styles.defaultIds.get(type); current && !seen.has(current); ) {
    seen.add(current);
    const style = styles.byId.get(current);
    if (!style) break;
    chain.push(style);
    current = style.basedOn;
  }
  chain.reverse();
  styles.chains.set(key, chain);
  return chain;
}

/**
 * What a table style sets for a cell's text and under it, by the cell's place;
 * in a table without w:tblLook, whose look is assumed, every colour its
 * formats may paint in a cell.
 */
type CellFormats = { runs: RunLayer[]; paragraphShading?: Paint; cellShading?: Paint; colours: string[] };

type Visibility = "visible" | "invisible" | "unverifiable";
const SEVERITY: Record<Visibility, number> = { visible: 0, unverifiable: 1, invisible: 2 };

/**
 * Why DOCX text was set aside as unverifiable: white or pale text that may lie
 * on a picture or a shape (`drawing`), text its row, text box, frame, line
 * spacing or the page's edge may cut (`layout`), text of such places left
 * unlaid once the layout work allowed is spent (`layout_unfinished`).
 */
export type DocxUnverifiableReason = "drawing" | "layout" | "layout_unfinished";
/** A verdict, and why when unverifiable. */
type Judgement = { verdict: Visibility; reason?: DocxUnverifiableReason };
const VISIBLE: Judgement = { verdict: "visible" };
/** The more severe of two judgements; of two unverifiable ones, the first's reason. */
const graver = (left: Judgement, right: Judgement) => (SEVERITY[right.verdict] > SEVERITY[left.verdict] ? right : left);

/**
 * A part of a passage (w:t) laid out alike: its UTF-16 units, where it lies in
 * the XML, its judgement; once its run is read (`settled`), whether its text
 * was recorded, in which paragraph, and the letters of the mc:Choice it drew,
 * so that a line laid later over it can still set it aside.
 */
type Segment = {
  from: number;
  to: number;
  start: number;
  end: number;
  text: string;
  judgement: Judgement;
  settled?: { recorded: boolean; paragraph?: Frame; drawn?: { verdicts: Judgement[]; from: number; to: number } };
};

/** A line of a paragraph in one of LAYOUTS: its index, the top of it, how far along it the text has gone, the largest size of its text, the tallest picture on it. In points. */
type Line = { index: number; top: number; x: number; size: number; objects: number };

/**
 * A paragraph whose place may hide its text: its format; how far down from
 * its top its lines may go before leaving one of the frames of fixed size
 * holding it (its row cell, text box, frame; infinite when none), in both
 * layouts; the width its lines take theirs from; for a paragraph of the body,
 * how far from the page's left edge its column starts (wherever it can, at
 * most then at least), and the page's width; whether its lines, in an exact
 * spacing, may run into one another, the free space above its first line
 * (infinite when no text lies above it) and whether the line above is in an
 * exact spacing too; its lines in both layouts; its tab stops once a tab is
 * met; the right or centred tab stop that aligns the text after it on its
 * line of the first layout, and how wide that text is so far; the visible
 * segments of its last two lines, which a cramped line below may still cover.
 */
type ParagraphLayout = {
  format: ParagraphFormat;
  slack: Pair;
  width: Pair;
  edge?: Pair;
  tight: boolean;
  gapAbove: number;
  tightAbove: boolean;
  lines: [Line, Line];
  pageWidth: number;
  stops?: Array<[number, string]>;
  tab?: { position: number; kind: string; line: number; width: number };
  pending: Array<{ line: number; segments: Segment[] }>;
};

/**
 * The last line of text above what a container (body, cell, text box…) holds
 * next: in it, else, for a cell, in the row above or before its table (the
 * lowest of those of the row's cells); whether its paragraph is in an exact
 * spacing, its visible segments, the free space below it since, at its
 * lowest. null: no text lies above, in the part or the text box.
 */
type LastLine = { tight: boolean; segments: Segment[]; gap: number } | null;

type Frame = BandSizes & {
  name: string;
  style?: string;
  key?: string;
  /** Paragraphs: how many came before it in the part. */
  ordinal?: number;
  layer?: RunLayer;
  /** Runs: their formatting once resolved (runFormat). */
  effective?: RunLayer;
  /** Runs: their passages (w:t), each in the segments its layout tells apart. */
  texts?: Array<{ text: string; place: TextPlace; segments: Segment[] }>;
  /** w:t: where its text starts in its paragraph, for its indents. */
  place?: TextPlace;
  passages?: Passages;
  /** Paragraphs: their own formatting, that of their mark (w:pPr/w:rPr), and the page of their section. */
  paragraph?: ParagraphLayer;
  mark?: RunLayer;
  format?: ParagraphFormat;
  page?: PageAcross;
  /** Paragraphs: the widest their text so far can be, and whether a tab moved it, for their indents (offPage); whether they show text; once read, closed. */
  flow?: { advance: number; tabbed: boolean };
  inked?: boolean;
  closed?: boolean;
  /** Paragraphs: their lines when their place may hide them (layoutOf; null: it cannot); else their visible segments, which a cramped line below may still cover. */
  layout?: ParagraphLayout | null;
  shown?: Segment[];
  /**
   * Containers of paragraphs (body, cell, text box…): how far their content fills them in both layouts (from a cell's top margin),
   * the last paragraph in them, for the space between it and the next, and their last line of text.
   */
  content?: { filled: Pair; above?: Spacing; last: LastLine };
  /** Cells of a row of exact height, text boxes of a fixed size, paragraphs in a frame of exact height: the height they show, in both layouts. */
  room?: Pair;
  /** Containers: whether they, or one holding them, show a fixed height: their paragraphs are laid out; once read, how far down their content may go before leaving one (`slack`). */
  fixed?: boolean;
  limit?: Pair;
  /** Text boxes (their anchor, inline drawing or VML shape), frames, cells once measured: the width of their text, in both layouts (infinite: lines do not wrap). */
  width?: Pair;
  /** Paragraphs: a drop cap (w:framePr w:dropCap), its letter set in a spacing smaller than its size. */
  dropCap?: boolean;
  /** Tables: the top margin of their cells (w:tblCellMar), in points; cells: theirs. */
  cellTop?: number;
  /** Tables: the side margins of their cells (w:tblCellMar), cells: theirs (w:tcMar), in points. */
  cellSides?: number;
  /** Table rows: their height rule (w:trHeight) and value; the tallest content of their cells, in both layouts; the grid column of their next cell. */
  height?: { rule: "exact" | "atLeast" | "auto"; value: number };
  tallest?: Pair;
  gridColumn?: number;
  /** Tables: the height of their rows read so far, in both layouts; their grid (w:gridCol), indent (w:tblInd), width (w:tblW), alignment, whether fixed (w:tblLayout) or floating (w:tblpPr). */
  rowsHeight?: Pair;
  /** Tables: the last line of text above the row being read (LastLine). Rows: that of each of their cells, and how far it fills them, at its lowest. Cells: the segments of the one above their row. */
  lineAbove?: LastLine;
  cellLines?: Array<{ last: LastLine; filled: number; own: boolean }>;
  inherited?: Segment[];
  grid?: number[];
  indent?: number;
  tableWidth?: number;
  align?: string;
  fixedLayout?: boolean;
  floating?: boolean;
  placed?: boolean;
  /** Cells: their grid column and span (w:gridSpan), their preferred width (w:tcW), whether merged with the cells above or below (w:vMerge). */
  span?: number;
  preferredWidth?: number;
  merged?: boolean;
  /** DrawingML anchors and inline drawings, VML shapes not in a group: the height their text box shows in both layouts, unless it grows with its text or runs top to bottom. */
  extent?: Pair;
  topShape?: boolean;
  /** The shading set on a paragraph, cell or table itself (null: none), or the fill of a text box (null: none known). */
  paint?: Paint;
  /** Placed off the page (hidden), or off it with some margins only (unplaced: unverifiable). */
  offPage?: boolean;
  unplaced?: boolean;
  /** DrawingML anchors: where they place their shape, in points. */
  box?: Box;
  /** DrawingML fills, and their colours being read: the shape they fill; the colour's lightness changes (lumMod, lumOff), its opacity. */
  fillOf?: Frame;
  colour?: { hex: string | undefined; scale: number; offset: number; alpha: number; shape: Frame };
  /** mc:AlternateContent: the text of the mc:Choice Word draws, without spaces, the judgement of each of its characters, and how far the fallback's text matched it. */
  drawn?: { text: string; verdicts: Judgement[]; cursor: number };
  /** mc:Choice: the one Word draws. */
  chosen?: boolean;
  /** Tables: their look and the cells of each row; rows: their index; cells: their place, and what the table style sets there. */
  look?: TableLook;
  rows?: number[];
  row?: number;
  column?: number;
  count?: number;
  formats?: CellFormats;
  /** Paragraphs: the table cell they are in, outside of a text box. */
  cell?: Frame;
};
type Passages = { invisible: string[]; unverifiable: Array<{ text: string; reason: DocxUnverifiableReason }> };
/** A paragraph's style, and the space it leaves below it (dropped next to its style when contextual). In points. */
type Spacing = { style: string | undefined; after: number; contextual: boolean };

/** For each UTF-16 unit of an XML text's value (decodeXml), where it starts and ends in the XML; undefined when they cannot be told apart. */
function textOffsets(raw: string, length: number) {
  const starts: number[] = [];
  const ends: number[] = [];
  const add = (value: string, start: number, end: number) => {
    for (let index = 0; index < value.length; index += 1) {
      starts.push(start);
      ends.push(end);
    }
  };
  for (let index = 0; index < raw.length; ) {
    if (raw.startsWith("<![CDATA[", index) || raw.startsWith("<!--", index)) return undefined;
    const match = raw[index] === "&" ? /^&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/i.exec(raw.slice(index, index + 12)) : null;
    if (match) {
      add(decodeXml(match[0]), index, index + match[0].length);
      index += match[0].length;
    } else {
      add(raw[index]!, index, index + 1);
      index += 1;
    }
  }
  return starts.length === length ? { starts, ends } : undefined;
}

/** A cell's formats when its table has no style (nor the document a default one). */
const NO_CELL_FORMATS: CellFormats = { runs: [], paragraphShading: undefined, cellShading: undefined, colours: [] };

function cellFormats(styles: Styles, table: Frame, row: number, column: number): CellFormats {
  const chain = styleChain(styles, table.style, "table");
  if (!chain.length) return NO_CELL_FORMATS;
  const bands = {
    rowBandSize: table.rowBandSize ?? lastSet(chain.map(style => style.rowBandSize)) ?? 1,
    columnBandSize: table.columnBandSize ?? lastSet(chain.map(style => style.columnBandSize)) ?? 1,
  };
  const conditions = cellConditions(table.look ?? tableLook(null), table.rows ?? [], row, column, bands);
  const formats: Formats[] = [...chain, ...conditions.flatMap(condition => chain.flatMap(style => style.conditions.get(condition) ?? []))];
  const anywhere = table.look ? [] : [...chain, ...chain.flatMap(style => Array.from(style.conditions.values()))];
  return {
    runs: formats.map(format => format.run),
    paragraphShading: lastSet(formats.map(format => format.paragraphShading)),
    cellShading: lastSet(formats.map(format => format.cellShading)),
    colours: anywhere.flatMap(format => [...(format.paragraphShading ?? []), ...(format.cellShading ?? [])]),
  };
}

/** The index of the next row of a table, or of the next cell of a row. */
function next(frame: Frame | undefined) {
  if (!frame) return 0;
  frame.count = (frame.count ?? 0) + 1;
  return frame.count - 1;
}

/** Whether Word draws a mc:Choice: it understands every namespace it requires. */
const drawnByWord = (choice: XmlTag) =>
  (choice.attributes.get("Requires") ?? "").split(/\s+/).filter(Boolean).every(prefix => OFFICE_NAMESPACE.test(choice.namespaces.get(prefix) ?? ""));

const INVISIBLE: Judgement = { verdict: "invisible" };
const OUT_OF_PLACE: Judgement = { verdict: "unverifiable", reason: "layout" };
const UNLAID: Judgement = { verdict: "unverifiable", reason: "layout_unfinished" };
const UNBOUNDED: Pair = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];

/**
 * The main document part without the text of its invisible runs, nor of
 * those that may show on a drawing or that their place may cut; the text of
 * each, paragraph by paragraph. `fromPage`: a picture behind the text may lie
 * under any text. `pageShown`: Word shows the page colour. `tabStop`: the
 * distance between default tab stops. `budget`: the layout work left
 * (docxLayoutWorkUnits).
 */
function cutInvisibleRuns(xml: string, styles: Styles, theme: Theme, fromPage: boolean, pageShown: boolean, tabStop: number, budget: { units: number }) {
  // One reading of the part for all that the main one needs to know ahead.
  const largest = largestPage();
  const rowCells = tableRows();
  const shapeFills = vmlFills();
  const boxes = textBoxes(xml);
  const sectionPage = sectionPages();
  const reach = drawingReachSurvey(xml);
  const tags = readXmlTags(xml);
  visitXmlTags(tags, largest.visit, rowCells.visit, shapeFills.visit, boxes.visit, sectionPage.visit, reach.visit);
  const page = largest.done();
  const tables = rowCells.done();
  const fills = shapeFills.done();
  const { shapes: drawingBoxes, chains: linkedHeights } = boxes.done(page);
  const sections = sectionPage.done();
  const pictures = reach.done();
  let section = 0;
  /** The page of the section a paragraph or table starting there is in (they come in order). */
  const pageAt = (position: number): PageAcross => {
    while (section < sections.length - 1 && sections[section]!.end < position) section += 1;
    const column = DEFAULT_PAGE.width - 2 * DEFAULT_PAGE.margin;
    return sections[section]?.page ?? { width: DEFAULT_PAGE.width, widestMargin: DEFAULT_PAGE.margin, narrowestMargin: DEFAULT_PAGE.margin, columnShift: 0, narrowestColumn: column, widestColumn: column };
  };
  const stack: Frame[] = [];
  /** The frames of the stack placed off the page, off it with some margins only, cells or text boxes, text boxes, deleted or moved away: counted as they come and go, not looked for at each run. */
  const held = { offPage: 0, unplaced: 0, nested: 0, textBoxes: 0, deleted: 0 };
  const hold = (frame: Frame, change: number) => {
    if (frame.offPage) held.offPage += change;
    if (frame.unplaced) held.unplaced += change;
    if (frame.name === "w:tc" || frame.name === "w:txbxContent") held.nested += change;
    if (frame.name === "w:txbxContent") held.textBoxes += change;
    if (frame.name === "w:del" || frame.name === "w:moveFrom") held.deleted += change;
  };
  /** Where the containers of paragraphs (body, cell, text box…) and the tables of the stack are in it, in order. */
  const containers: number[] = [];
  const tableIndices: number[] = [];
  /** How many of these indices of the stack are below `at`. */
  const countBelow = (indices: number[], at: number) => {
    let low = 0;
    for (let high = indices.length; low < high; ) {
      const middle = (low + high) >> 1;
      if (indices[middle]! < at) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  /** The innermost container of the stack, or the one holding it (`outer` 1). */
  const innermost = (outer = 0) => stack[containers[containers.length - 1 - outer] ?? -1];
  /** Places a frame of the stack off the page, or off it with some margins only. */
  const placeOff = (frame: Frame, placing: Pick<Frame, "offPage" | "unplaced">) => {
    hold(frame, -1);
    Object.assign(frame, placing);
    hold(frame, 1);
  };
  const cuts: Array<[number, number]> = [];
  const found: Passages = { invisible: [], unverifiable: [] };
  let textStart: number | null = null;
  let offsetStart: number | null = null;
  let pageColour = "FFFFFF";
  let pagePicture = false;
  // How much of the drawn text failed searches may scan: a fallback that matches nothing is then compared in place only.
  let searchBudget = xml.length;
  /** Paragraphs met so far (their ordinal). */
  let paragraphCount = 0;
  const nearDrawing = (paragraph: Frame | undefined) => {
    const key = paragraph?.key;
    if (!key) return false;
    const [container, index] = key.split(":");
    if ([-1, 0, 1].some(offset => pictures.drawings.has(`${container}:${Number(index) + offset}`))) return true;
    const block = pictures.blocks[paragraph.ordinal ?? -1];
    return block !== undefined && pictures.reaches.some(([from, to]) => block >= from && block <= to);
  };
  const nearest = (name: string) => {
    for (let index = stack.length - 1; index >= 0; index -= 1) if (stack[index]!.name === name) return stack[index];
    return undefined;
  };
  /** What the styles set for runs, by paragraph and character style, and for paragraph marks, by paragraph style: read once. */
  const styleFormats = new Map<string, RunLayer>();
  const markFormats = new Map<string, RunLayer>();
  /** Open mc:AlternateContent elements, whose choice and fallback are compared, and mc:Choice or w:drawing ones, whose text mammoth does not read. */
  let alternates = 0;
  let unread = 0;
  /** The table cell a paragraph is in, unless in a text box: the text box's text is not the table's. */
  const enclosingCell = () => {
    for (let index = containers.length - 1; index >= 0; index -= 1) {
      const frame = stack[containers[index]!]!;
      if (frame.name === "w:txbxContent") return undefined;
      if (frame.name === "w:tc") return frame;
    }
    return undefined;
  };
  /** Where the container of paragraphs (body, cell, text box…) holding the frame at `at` is in the stack; -1 when none. */
  const containerIndex = (at: number) => containers[countBelow(containers, at) - 1] ?? -1;
  /** The shading of a paragraph: its own, else its style's, else the table style's for its cell, else the document's default. */
  const paragraphPaint = (frame: Frame, fromTable = true) =>
    frame.paint !== undefined ? frame.paint : lastSet([styles.paragraphShading, fromTable ? frame.cell?.formats?.paragraphShading : undefined, ...styleChain(styles, frame.style, "paragraph").map(style => style.paragraphShading)]);
  /** The colours right under the text: highlight, shading of the run, of its paragraph, cell or table, fill of its text box; null for the page. */
  const layerUnder = (effective: RunLayer): Paint => {
    if (effective.highlight) return [effective.highlight];
    if (effective.shading) return effective.shading;
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const frame = stack[index]!;
      // A text box shows its fill, else what lies under it.
      if (VML_SHAPES.has(frame.name) || frame.name === "wps:wsp") return frame.paint ?? null;
      const paint = frame.name === "w:p" ? paragraphPaint(frame)
        : frame.name === "w:tc" ? (frame.paint !== undefined ? frame.paint : frame.formats?.cellShading)
        : frame.name === "w:tbl" ? (frame.paint !== undefined ? frame.paint : lastSet(styleChain(styles, frame.style, "table").map(style => style.tableShading)))
        : undefined;
      if (paint) return paint;
    }
    return null;
  };
  /** A run's formatting as Word resolves it: document defaults, table style for its cell, paragraph style, character style, its own (kept until its w:rPr changes). */
  const runFormat = (run: Frame): RunLayer => {
    if (run.effective) return run.effective;
    const paragraph = nearest("w:p");
    // What the styles set, kept for each pair of styles outside table cells, which the table style may also format.
    const key = paragraph?.cell?.formats?.runs.length ? undefined : `${paragraph?.style ?? ""}\u0000${run.style ?? ""}`;
    let base = key === undefined ? undefined : styleFormats.get(key);
    if (!base) {
      base = Object.assign({}, styles.defaults,
        ...(paragraph?.cell?.formats?.runs ?? []),
        ...styleChain(styles, paragraph?.style, "paragraph").map(style => style.run),
        ...styleChain(styles, run.style, "character").map(style => style.run)) as RunLayer;
      if (key !== undefined) styleFormats.set(key, base);
    }
    run.effective = Object.assign({}, base, run.layer);
    return run.effective;
  };
  /** A paragraph's indents, alignment, direction, spacing and tab stops: the document's defaults, its style's, its own (read once its w:pPr is). */
  const formatOf = (paragraph: Frame) => {
    paragraph.format ??= paragraphFormat([styles.paragraph, ...styleChain(styles, paragraph.style, "paragraph").map(style => style.paragraph), paragraph.paragraph ?? {}]);
    return paragraph.format;
  };
  const styleOf = (paragraph: Frame) => paragraph.style ?? styles.defaultIds.get("paragraph");
  /** The space above a paragraph's first line: its spacing before, and the spacing after the paragraph above, each dropped between paragraphs of one style when contextual. */
  const spaceAbove = (paragraph: Frame, above: Spacing | undefined) => {
    const format = formatOf(paragraph);
    const sameStyle = above !== undefined && above.style === styleOf(paragraph);
    return (format.contextual && sameStyle ? 0 : format.before) + (above && !(above.contextual && sameStyle) ? above.after : 0);
  };
  // Decided once the whole run is read, inside its paragraph, cell, table and text box.
  const visibility = (text: string, effective: RunLayer): Visibility => {
    const paragraph = nearest("w:p");
    const tableFormats = paragraph?.cell?.formats;
    const tiny = (size: number | undefined) => size !== undefined && size < MIN_FONT_SIZE_PT;
    // Word sets the whole run in the complex script size when it is marked so, else only those scripts.
    const marked = effective["w:cs"] || effective["w:rtl"];
    const complexScript = COMPLEX_SCRIPT.test(text);
    const otherLetter = OTHER_LETTER.test(text);
    const tinyText = marked ? tiny(effective.complexScriptSize) : (complexScript && tiny(effective.complexScriptSize)) || ((!complexScript || otherLetter) && tiny(effective.size));
    // How far the letters are squeezed or moved, at the size of most of them.
    const size = fontSize(effective, text);
    // Only scaled or condensed letters may be squeezed: others are at least half as wide as their size.
    const characters = effective.scale !== undefined || effective.spacing !== undefined ? Array.from(text) : [];
    const width = characters.reduce((sum, character) => sum + (WIDE_CHARACTER.test(character) ? 1 : 0.5), 0) * size * (effective.scale ?? 100) / 100;
    const squeezed = characters.length > 0 && width / characters.length + (effective.spacing ?? 0) < MIN_ADVANCE_PT;
    const shifted = Math.abs(effective.position ?? 0) > MAX_SHIFT_IN_SIZES * size;
    // A drop cap's letter only needs a line of text; other lines of an exact spacing are laid out (layText).
    const spacing = paragraph ? formatOf(paragraph).line : undefined;
    const cramped = paragraph?.dropCap === true && spacing?.rule === "exact" && spacing.value < MIN_FONT_SIZE_PT;
    if (effective["w:vanish"] || effective["w:specVanish"] || effective["w:webHidden"] || tinyText || squeezed || shifted || cramped || held.offPage > 0) return "invisible";
    // Word draws text in the automatic colour black or white, whichever shows on its background.
    const colour = effective.colour ?? "auto";
    if (colour === "auto") return "visible";
    const shows = (under: string) => distinct(colour, under);
    const layer = layerUnder(effective);
    if ((layer ?? [pageColour]).some(shows)) return "visible";
    // In a cell the table style alone colours, by an assumed look, a format for another place in the table might show it.
    const styledCell = paragraph?.cell !== undefined && paragraph.cell.paint === undefined && !effective.highlight && !effective.shading && !paragraphPaint(paragraph, false);
    if (styledCell && tableFormats?.colours.some(shows)) return "unverifiable";
    // On a colour of its own (shading, highlight, filled text box), it is not seen; on the page, it may lie on a picture:
    // in a text box without fill, in a paragraph a drawing holds, neighbours or covers, or on a picture as page colour.
    if (layer?.some(under => !isNearWhite(under))) return "invisible";
    const onDrawing = fromPage || pagePicture || pictures.fromPage || held.textBoxes > 0 || nearDrawing(paragraph);
    return onDrawing ? "unverifiable" : "invisible";
  };
  /** What mammoth reads of a mc:AlternateContent, its fallback, is seen only where the choice Word draws shows the same text. */
  const asDrawn = (text: string, seen: Judgement): { judgement: Judgement; drawn?: { verdicts: Judgement[]; from: number; to: number } } => {
    if (!alternates) return { judgement: seen };
    const alternate = stack.findLastIndex(item => item.name === "mc:AlternateContent");
    const drawn = stack[alternate]?.drawn;
    const branch = stack[alternate + 1];
    const letters = text.replace(/\s+/g, "");
    if (!drawn || !branch || !letters) return { judgement: seen };
    if (branch.chosen) {
      const from = drawn.verdicts.length;
      drawn.text += letters;
      for (let index = 0; index < letters.length; index += 1) drawn.verdicts.push(seen);
      return { judgement: seen, drawn: { verdicts: drawn.verdicts, from, to: drawn.verdicts.length } };
    }
    if (branch.name !== "mc:Fallback") return { judgement: seen };
    const at = searchBudget > 0 ? drawn.text.indexOf(letters, drawn.cursor) : drawn.text.startsWith(letters, drawn.cursor) ? drawn.cursor : -1;
    if (at === -1) {
      searchBudget -= drawn.text.length - drawn.cursor;
      return { judgement: INVISIBLE };
    }
    drawn.cursor = at + letters.length;
    return { judgement: drawn.verdicts.slice(at, drawn.cursor).reduce(graver, seen) };
  };
  /** Text its paragraph's indents set beyond an edge of the page, where it starts (offPage). */
  const offIndents = (passage: { text: string; place: TextPlace }, effective: RunLayer) => {
    const paragraph = nearest("w:p");
    if (!paragraph?.page) return false;
    const advance = widestAdvance(effective);
    const nested = held.nested > 0;
    return offPage(formatOf(paragraph), paragraph.page, passage.place, advance, codePoints(passage.text) * advance, nested);
  };
  /** The width of the text of the container at `index`, in both layouts: a cell's (from its width or its table's grid, less its side margins), a text box's, a column's. */
  const widthOf = (index: number, across: PageAcross): Pair => {
    // The cells of unknown width holding the text, out to one of known width or to what holds their tables; then each from the outermost.
    const cells: Array<{ cell: Frame; table?: Frame }> = [];
    let width: Pair;
    for (let at = index; ; ) {
      const frame = stack[at];
      if (frame?.width) {
        width = frame.width;
        break;
      }
      if (frame?.name !== "w:tc") {
        width = frame?.name === "w:txbxContent" ? [across.narrowestColumn, Number.POSITIVE_INFINITY] : [across.narrowestColumn, across.widestColumn];
        break;
      }
      const tableAt = tableIndices[countBelow(tableIndices, at) - 1] ?? -1;
      cells.push({ cell: frame, table: stack[tableAt] });
      at = containerIndex(Math.max(0, tableAt));
    }
    for (const { cell, table } of cells.reverse()) {
      const outer = width;
      const grid = table?.grid ?? [];
      const column = cell.gridColumn ?? 0;
      const span = cell.span ?? 1;
      const fromGrid = column + span <= grid.length ? grid.slice(column, column + span).reduce((sum, width) => sum + width, 0) : undefined;
      const known = cell.preferredWidth ?? fromGrid;
      // Without a width, it gets its share of the table's; an autofit table may widen it up to the whole of it.
      const most = (known ?? outer[MOST] / (table?.rows?.[cell.row ?? 0] || 1)) - (cell.cellSides ?? table?.cellSides ?? DEFAULT_CELL_SIDES_PT);
      const least = table?.fixedLayout && known !== undefined ? Math.max(known, fromGrid ?? 0) : Math.max(known ?? 0, outer[LEAST]);
      width = cell.width = [Math.max(0, most), least];
    }
    return width;
  };
  /** The last line of text above a table starting here (LastLine): that of its container, beyond the space below the paragraph above. */
  const lineAboveTable = (): LastLine => {
    const content = innermost()?.content;
    return content?.last ? { ...content.last, gap: content.last.gap + (content.above?.after ?? 0) } : null;
  };
  /**
   * The last line of text a row of this height leaves above the next one: of
   * each of its cells, the last line, the free space below it to the row's
   * bottom; the narrowest space, in an exact spacing only when all are, and
   * the segments of all, gathered without copying each one more than a few
   * times, however deep its tables are nested (counted as layout work). A
   * cell without text keeps the line above the row (`above`); in a row with
   * text, a line seen through such cells is not followed further down.
   */
  const rowBottom = (cells: NonNullable<Frame["cellLines"]>, height: number, above: LastLine): LastLine => {
    if (!cells.length) return above && { ...above, gap: above.gap + height };
    let line: LastLine = null;
    const own: Segment[][] = [];
    for (const cell of cells) {
      if (!cell.last) continue;
      const gap = cell.last.gap + Math.max(0, height - cell.filled);
      line = line ? { tight: line.tight && cell.last.tight, segments: line.segments, gap: Math.min(line.gap, gap) } : { tight: cell.last.tight, segments: cell.last.segments, gap };
      if (cell.own) own.push(cell.last.segments);
    }
    if (!line || !own.length) return line;
    // The longest list of segments takes the others' (they are not kept elsewhere once their cells are read).
    const longest = own.reduce((found, segments) => (segments.length > found.length ? segments : found));
    for (const segments of own) {
      if (segments === longest) continue;
      budget.units -= segments.length;
      for (const segment of segments) longest.push(segment);
    }
    line.segments = longest;
    return line;
  };
  /** Where the container holding the frame at `at` is in the stack (-1 when none), and the height of the rows of the tables in between, in both layouts. */
  const containerOf = (at: number) => {
    const index = containerIndex(at);
    let rows: Pair = [0, 0];
    const last = countBelow(tableIndices, at);
    for (let table = countBelow(tableIndices, index + 1); table < last; table += 1) {
      const height = stack[tableIndices[table]!]!.rowsHeight ?? [0, 0];
      rows = [rows[MOST] + height[MOST], rows[LEAST] + height[LEAST]];
      budget.units -= 1;
    }
    budget.units -= 1;
    return { index, rows };
  };
  /**
   * How far down from the top of the content of the container at `index` its
   * text may go before leaving it, when it shows a fixed height, or one of
   * the cells and text boxes of fixed size holding it, through the rows of
   * their tables and what fills them above it, in both layouts (infinite when
   * none does). Read once: what holds a container does not change while it is.
   */
  const limitOf = (index: number): Pair => {
    // The containers not read yet, out to one read or one whose height does not hold its text; then each from the outermost.
    const inner: Array<{ frame: Frame; holder: NonNullable<Frame["content"]>; rows: Pair }> = [];
    let limit: Pair;
    for (let at = index; ; ) {
      const frame = stack[at]!;
      if (frame.limit) {
        limit = frame.limit;
        break;
      }
      const outer = frame.fixed && frame.name !== "w:txbxContent" ? containerOf(at) : undefined;
      const holder = outer && stack[outer.index]?.content;
      if (!outer || !holder) {
        limit = frame.limit = frame.room ?? UNBOUNDED;
        break;
      }
      inner.push({ frame, holder, rows: outer.rows });
      at = outer.index;
    }
    for (const { frame, holder, rows } of inner.reverse()) {
      const upper = limit;
      const own = frame.room ?? UNBOUNDED;
      const above = holder.above?.after ?? 0;
      const room = (model: number) => Math.min(own[model]!, upper[model]! - holder.filled[model]! - above - rows[model]!);
      limit = frame.limit = [room(MOST), room(LEAST)];
    }
    return limit;
  };
  /**
   * The layout of the paragraph at `at` when its place may hide its text (in
   * a row, text box or frame of fixed size, in an exact line spacing, with a
   * right indent past the page's edge); null otherwise. Each frame of fixed
   * size holding it is found with how far its content fills it above the
   * paragraph, through the rows of the tables holding it (limitOf).
   */
  const layoutOf = (at: number): ParagraphLayout | null => {
    const paragraph = stack[at]!;
    if (paragraph.layout !== undefined) return paragraph.layout;
    const format = formatOf(paragraph);
    const { index: home, rows } = containerOf(at);
    const container = stack[home];
    const own = paragraph.room ? [paragraph.room[MOST] - format.before, paragraph.room[LEAST] - format.before] : UNBOUNDED;
    let slack: Pair = [own[MOST]!, own[LEAST]!];
    if (container?.content) {
      const limit = limitOf(home);
      const above = spaceAbove(paragraph, container.content.above);
      const room = (model: number) => Math.min(own[model]!, limit[model]! - container.content!.filled[model]! - above - rows[model]!);
      slack = [room(MOST), room(LEAST)];
    }
    budget.units -= 1;
    const across = paragraph.page ?? pageAt(0);
    // In a cell, a text box or a frame, a paragraph may lie anywhere across the page.
    const edge: Pair | undefined = paragraph.room || paragraph.width || container?.name !== "w:body" ? undefined : [across.widestMargin + across.columnShift, across.narrowestMargin];
    const tight = format.line.rule === "exact" && !paragraph.dropCap;
    const placed = slack[MOST] !== Number.POSITIVE_INFINITY || slack[LEAST] !== Number.POSITIVE_INFINITY;
    // The width of its lines, but of a paragraph of a cell or a text box that nothing constrains.
    const width = edge || placed || tight ? paragraph.width ?? widthOf(home, across) : UNBOUNDED;
    const pastEdge = edge !== undefined && (edge[MOST] + width[MOST] - format.end > across.width || edge[LEAST] + width[LEAST] - format.end > across.width);
    if (!placed && !tight && !pastEdge) return (paragraph.layout = null);
    const last = container?.content?.last;
    const line = (): Line => ({ index: 0, top: 0, x: 0, size: 0, objects: 0 });
    paragraph.layout = {
      format, slack, width, edge: pastEdge ? edge : undefined, pageWidth: across.width, tight,
      gapAbove: last ? last.gap + spaceAbove(paragraph, container?.content?.above) : Number.POSITIVE_INFINITY, tightAbove: last?.tight ?? false, lines: [line(), line()], pending: [],
    };
    return paragraph.layout;
  };
  const lineStart = ({ format }: ParagraphLayout, line: Line) => format.start + (line.index === 0 ? format.firstLine : 0);
  /** How wide a line of the paragraph is in a layout; its column's width when its indents cross, as Word and LibreOffice then set it. */
  const lineWidth = (layout: ParagraphLayout, line: Line, model: number) => {
    const width = layout.width[model]! - layout.format.start - layout.format.end - (line.index === 0 ? layout.format.firstLine : 0);
    return width > 0 ? width : layout.width[model]!;
  };
  /** Starts the next line of a paragraph in a layout; `size`: the size of the text that ends the line, for an empty one. */
  const newLine = (layout: ParagraphLayout, model: number, size = 0) => {
    const line = layout.lines[model];
    line.top += lineHeight(layout.format, Math.max(line.size, size), model, line.objects);
    Object.assign(line, { index: line.index + 1, x: 0, size: 0, objects: 0 });
  };
  /**
   * How far a line of the first layout may run before the next character goes
   * to the line below (`added`: the width it adds): its width, or the end of
   * the text a right or centred tab stop aligns, which Word and LibreOffice
   * keep on its line even past its edge.
   */
  const lineReach = (layout: ParagraphLayout, line: Line, model: number, added: number) => {
    const width = lineWidth(layout, line, model);
    const tab = layout.tab;
    if (model !== MOST || !tab || tab.line !== line.index) return width;
    const stop = tab.position - lineStart(layout, line);
    return Math.max(width, /^(right|end)$/i.test(tab.kind) ? stop : stop + (tab.width + added) / 2);
  };
  /** Where the text on a line of the first layout ends: past what it holds when a right or centred tab stop aligns its last text at the stop, or centres it there. */
  const lineEnd = (layout: ParagraphLayout, line: Line) => {
    const tab = layout.tab;
    if (!tab || tab.line !== line.index) return line.x;
    const stop = tab.position - lineStart(layout, line);
    return Math.max(line.x, /^(right|end)$/i.test(tab.kind) ? stop : stop + tab.width / 2);
  };
  /** The tab stops of each chain of paragraph styles (with the document's defaults), merged once. */
  const styleStops = new WeakMap<StyleDefinition[], Array<[number, string]>>();
  /** A paragraph's tab stops (tabStops): its style's, and its own; counted as layout work. */
  const stopsOf = (paragraph: Frame) => {
    const chain = styleChain(styles, paragraph.style, "paragraph");
    let inherited = styleStops.get(chain);
    if (!inherited) {
      const layers = [styles.paragraph, ...chain.map(style => style.paragraph)];
      styleStops.set(chain, (inherited = tabStops(layers)));
      budget.units -= layers.reduce((sum, layer) => sum + (layer.tabs?.length ?? 0), 0);
    }
    const own = paragraph.paragraph?.tabs;
    if (!own?.length) return inherited;
    budget.units -= inherited.length + own.length;
    return tabStops([{ tabs: inherited }, { tabs: own }]);
  };
  /** Moves a paragraph's lines on to its next tab stop (a stop of its own, the start of a hanging indent, else the next default one); a right or centred stop aligns the text after it at the stop, in the first layout. */
  const tabOn = (layout: ParagraphLayout, paragraph: Frame) => {
    budget.units -= 1;
    // Past the budget, the text is no longer laid out (layText).
    const stops = budget.units > 0 ? (layout.stops ??= stopsOf(paragraph)) : [];
    for (const model of [MOST, LEAST]) {
      const line = layout.lines[model]!;
      if (model === MOST) {
        line.x = lineEnd(layout, line);
        layout.tab = undefined;
      }
      const start = lineStart(layout, line);
      const column = start + line.x;
      // The first stop past the text, in the stops in order.
      let low = 0;
      for (let high = stops.length; low < high; ) {
        const middle = (low + high) >> 1;
        if (stops[middle]![0] > column + 0.01) high = middle;
        else low = middle + 1;
      }
      let stop = stops[low];
      if (line.index === 0 && layout.format.firstLine < 0 && layout.format.start > column + 0.01 && (!stop || layout.format.start < stop[0])) stop = [layout.format.start, "left"];
      const [position, kind] = stop ?? [(Math.floor(column / tabStop + 1e-6) + 1) * tabStop, "left"];
      // The least room keeps the text where it is: the stop may place it back to there.
      if (/^(left|start|num)$/i.test(kind)) line.x = position - start;
      else if (model === MOST) layout.tab = { position, kind, line: line.index, width: 0 };
      if (line.x > lineWidth(layout, line, model)) newLine(layout, model);
    }
  };
  /** Puts something of this width on a paragraph's lines (an inline picture, of this height; a symbol). */
  const placeObject = (layout: ParagraphLayout, width: number, height: number, size: number) => {
    for (const model of [MOST, LEAST]) {
      const line = layout.lines[model]!;
      if (line.x > 0 && line.x + width > lineWidth(layout, line, model)) newLine(layout, model);
      line.x += width;
      line.objects = Math.max(line.objects, height);
      line.size = Math.max(line.size, size);
    }
  };
  /**
   * The segments of a line that a line laid later over it covers, or may
   * cover (`judgement`: why): set aside those that were read, once; none of
   * them is visible after, wherever else they are kept.
   */
  const setAside = (segments: Segment[] | undefined, judgement: Judgement) => {
    for (const segment of segments ?? []) {
      if (segment.judgement.verdict !== "visible") continue;
      segment.judgement = judgement;
      const settled = segment.settled;
      if (!settled) continue;
      cuts.push([segment.start, segment.end]);
      if (settled.drawn) for (let index = settled.drawn.from; index < settled.drawn.to; index += 1) settled.drawn.verdicts[index] = graver(settled.drawn.verdicts[index]!, judgement);
      if (settled.recorded) record(judgement, segment.text, settled.paragraph);
    }
    if (segments) segments.length = 0;
  };
  /**
   * Lays a passage of a run on its paragraph's lines, in both layouts
   * (deleted text in the first only), and judges each of its UTF-16 units:
   * hidden when even the least room takes it out of its row, text box, frame
   * or page, or runs its line into the letters of the one above;
   * unverifiable when only the most room does, or when its line runs into the
   * one above, which is then set aside too. With its line in the first
   * layout, for the lines below that may run into it.
   */
  const layText = (layout: ParagraphLayout, text: string, effective: RunLayer, container: Frame | undefined, deleted: boolean) => {
    const judgements: Judgement[] = new Array<Judgement>(text.length).fill(VISIBLE);
    const lines: number[] = new Array<number>(text.length).fill(layout.lines[MOST].index);
    if (budget.units <= 0) {
      // Not laid out, a line of an exact spacing may still run into the lines above it.
      if (layout.tight) {
        setAside(container?.content?.last?.segments, UNLAID);
        for (const entry of layout.pending) setAside(entry.segments, UNLAID);
      }
      return { judgements: judgements.fill(UNLAID), lines };
    }
    budget.units -= text.length;
    const { format } = layout;
    const size = fontSize(effective, text);
    const scale = (effective.scale ?? 100) / 100;
    const lowered = Math.max(0, -(effective.position ?? 0));
    const models = deleted ? [MOST] : [MOST, LEAST];
    const advance = (model: number, character: string) => {
      const kind = characterKind(character);
      const share = effective.typewriter && kind !== "wide" ? LAYOUTS[model]!.typewriter : LAYOUTS[model]!.widths[kind];
      return Math.max(0, share * size * scale + (effective.spacing ?? 0));
    };
    const characters = Array.from(text);
    /** Lines of the paragraph in the first layout (-1: the last one of the container above it) that a line below runs into. */
    const covered = new Set<number>();
    let unit = 0;
    for (let index = 0; index < characters.length; ) {
      const space = SPACES[characters[index]!.charCodeAt(0)] === 1;
      let end = index;
      let width = 0;
      for (; end < characters.length && (SPACES[characters[end]!.charCodeAt(0)] === 1) === space; end += 1) width += advance(MOST, characters[end]!);
      // In the most room, a word goes whole to the next line when it does not fit on this one.
      const first = layout.lines[MOST];
      if (!space && first.x > 0 && first.x + width > lineReach(layout, first, MOST, width)) newLine(layout, MOST, size);
      for (; index < end; index += 1) {
        const character = characters[index]!;
        const out = [false, false];
        const overlap = [0, 0];
        for (const model of models) {
          const line = layout.lines[model]!;
          const step = advance(model, character);
          if (!space && line.x > 0 && line.x + step > lineReach(layout, line, model, step)) newLine(layout, model, size);
          const from = line.x;
          line.x += step;
          line.size = Math.max(line.size, size);
          if (model === MOST && layout.tab?.line === line.index) layout.tab.width += step;
          if (deleted) continue;
          const across = layout.edge && layout.edge[model]! + lineStart(layout, line);
          out[model] = outOfPlace(layout.slack, model, line.top, lowered, line.size)
            || (across !== undefined && (model === MOST ? across + lineEnd(layout, line) > layout.pageWidth : across + from >= layout.pageWidth));
          if (layout.tight) {
            // A line of an exact spacing smaller than its letters runs into the line above it, unless there is room enough between them.
            const room = format.line.value + (line.index === 0 ? layout.gapAbove : 0);
            overlap[model] = room < MIN_EXACT_LINE_SHARE * size ? 2 : room < LEGIBLE_EXACT_LINE_SHARE * size ? 1 : 0;
            // Its first line drawn over a line of ordinary spacing, in a spacing not far smaller than its letters: LibreOffice shows it
            // over that line, Word cuts its top; not manifestly unseen.
            if (line.index === 0 && !layout.tightAbove && format.line.value >= MIN_ALONE_EXACT_LINE_SHARE * size) overlap[model] = Math.min(overlap[model]!, 1);
          }
        }
        let judgement = VISIBLE;
        if (!deleted) {
          // A line alone in an exact spacing far smaller than its letters: Word cuts most of them, LibreOffice draws them over the space above.
          const alone = layout.tight && format.line.value < MIN_ALONE_EXACT_LINE_SHARE * size;
          if (out[LEAST] || overlap[LEAST] === 2) judgement = INVISIBLE;
          else if (out[MOST] || overlap[MOST]! > 0 || alone) judgement = OUT_OF_PLACE;
          if (overlap[MOST]! > 0) covered.add(layout.lines[MOST].index - 1);
        }
        for (const stop = unit + character.length; unit < stop; unit += 1) {
          judgements[unit] = judgement;
          lines[unit] = layout.lines[MOST].index;
        }
      }
    }
    // The line above in the same paragraph, or the last line of text above it (LastLine), whatever its spacing.
    for (const line of Array.from(covered)) setAside(line < 0 ? container?.content?.last?.segments : layout.pending.find(entry => entry.line === line)?.segments, OUT_OF_PLACE);
    if (covered.size) for (let index = 0; index < text.length; index += 1) if (judgements[index] === VISIBLE && covered.has(lines[index]!)) judgements[index] = OUT_OF_PLACE;
    return { judgements, lines };
  };
  /** A passage cut where its judgement or its line changes; its visible parts kept for the lines below (of its last lines when laid out). Whole when its XML cannot be cut apart. */
  const segmentsOf = (raw: string, start: number, text: string, paragraph: Frame | undefined, layout: ParagraphLayout | null, judged?: { judgements: Judgement[]; lines: number[] }): Segment[] => {
    const groups: Array<{ from: number; to: number; judgement: Judgement; line: number }> = [];
    for (let index = 0; index < text.length && judged; index += 1) {
      const group = groups.at(-1);
      if (group && group.judgement === judged.judgements[index] && group.line === judged.lines[index]) group.to = index + 1;
      else groups.push({ from: index, to: index + 1, judgement: judged.judgements[index]!, line: judged.lines[index]! });
    }
    const offsets = groups.length > 1 ? textOffsets(raw, text.length) : undefined;
    const parts = offsets
      ? groups.map(group => ({ ...group, start: start + offsets.starts[group.from]!, end: start + offsets.ends[group.to - 1]! }))
      : [{ from: 0, to: text.length, judgement: groups.map(group => group.judgement).reduce(graver, VISIBLE), line: groups.at(-1)?.line ?? 0, start, end: start + raw.length }];
    return parts.map(part => {
      const segment: Segment = { from: part.from, to: part.to, start: part.start, end: part.end, text: text.slice(part.from, part.to), judgement: part.judgement };
      if (part.judgement !== VISIBLE) return segment;
      if (layout) {
        // Only the last two lines may still be run into.
        while (layout.pending.length && layout.pending[0]!.line < part.line - 1) layout.pending.shift();
        let entry = layout.pending.find(item => item.line === part.line);
        if (!entry) layout.pending.push((entry = { line: part.line, segments: [] }));
        entry.segments.push(segment);
      } else if (paragraph) {
        // Its lines are not laid out: any of them may be its last.
        (paragraph.shown ??= []).push(segment);
      }
      return segment;
    });
  };
  const paintShape = ({ hex, scale, offset, alpha, shape }: NonNullable<Frame["colour"]>) => {
    const colour = hex && (scale === 1 && offset === 0 ? hex : withLightness(hex, lightness => lightness * scale + offset));
    // Partly transparent, it shows the page through it, as a VML fill.
    shape.paint = colour ? [alpha < 1 ? blend(pageColour, colour, alpha) : colour] : null;
  };
  /** Records text set aside in its paragraph, or apart once the paragraph is read. */
  const record = (judgement: Judgement, text: string, paragraph: Frame | undefined) => {
    const passages = paragraph && !paragraph.closed ? paragraph.passages! : found;
    if (judgement.verdict === "invisible") passages.invisible.push(text);
    else passages.unverifiable.push({ text, reason: judgement.reason ?? "drawing" });
  };
  /** Settles a segment once its run is read: cut out and recorded unless visible. */
  /**
   * Where the run being read lies: in the copy mammoth reads of what Word draws from mc:Choice, which takes its place from the
   * choice (its own, its VML box's insets, does not count); whether its text is counted (mammoth reads text boxes from
   * mc:Fallback and VML only: what mc:Choice repeats, or a DrawingML text box holds, is not); its paragraph.
   */
  const runPlace = () => {
    const alternate = alternates ? stack.findLastIndex(item => item.name === "mc:AlternateContent") : -1;
    return {
      copy: alternate !== -1 && stack[alternate]!.drawn !== undefined && stack[alternate + 1]?.name === "mc:Fallback",
      recorded: unread === 0,
      paragraph: nearest("w:p"),
    };
  };
  const settle = (segment: Segment, seen: Judgement, { copy, recorded, paragraph }: ReturnType<typeof runPlace>) => {
    const { judgement, drawn } = asDrawn(segment.text, copy ? seen : graver(seen, segment.judgement));
    segment.judgement = judgement;
    segment.settled = { recorded, paragraph, drawn };
    if (judgement.verdict === "visible") return;
    cuts.push([segment.start, segment.end]);
    if (recorded) record(judgement, segment.text, paragraph);
  };
  /** Whether a table's indent (w:tblInd) places it off the page: wherever its section's margins put it (hidden), or with some of them (unverifiable). */
  const placeTable = (table: Frame) => {
    table.placed = true;
    if (table.floating || (table.align !== undefined && !/^(left|start)$/i.test(table.align))) return;
    const indent = table.indent ?? 0;
    const width = table.tableWidth ?? (table.grid?.length ? table.grid.reduce((sum, column) => sum + column, 0) : undefined);
    const across = table.page ?? pageAt(0);
    if (held.nested > 0) {
      // In a cell or a text box, which may lie anywhere on the page.
      if (indent >= across.width || (width !== undefined && indent + width <= -across.width)) placeOff(table, { offPage: true });
      return;
    }
    const most = across.widestMargin + across.columnShift + indent;
    const least = across.narrowestMargin + indent;
    if (least >= across.width || (width !== undefined && most + width <= 0)) placeOff(table, { offPage: true });
    else if (most >= across.width || (width !== undefined && least + width <= 0)) placeOff(table, { unplaced: true });
  };
  visitXmlTags(tags, inParagraphs((tag, paragraph) => {
    if (tag.closing) {
      // A paragraph without text still fills its container, at the size of its mark.
      if (tag.name === "w:p" && stack.at(-1)?.flow && stack.at(-1)!.layout === undefined) layoutOf(stack.length - 1);
      const frame = stack.pop();
      if (frame) hold(frame, -1);
      if (frame?.content) containers.pop();
      if (frame?.name === "w:tbl") tableIndices.pop();
      if (frame?.name === "mc:AlternateContent") alternates -= 1;
      if (frame?.name === "mc:Choice" || frame?.name === "w:drawing") unread -= 1;
      if ((frame?.name === "w:t" || frame?.name === "w:delText") && textStart !== null) {
        const run = stack.at(-1);
        const raw = xml.slice(textStart, tag.start);
        const text = decodeXml(raw);
        const at = stack.findLastIndex(item => item.name === "w:p");
        const holder = stack[at];
        const effective = run?.texts ? runFormat(run) : undefined;
        let layout: ParagraphLayout | null = null;
        let judged: ReturnType<typeof layText> | undefined;
        if (holder?.flow && effective && !hides(effective)) {
          layout = layoutOf(at);
          const deleted = frame.name === "w:delText";
          if (!deleted) {
            // The text takes its width on its line, for its indents, and shows in its paragraph.
            holder.flow.advance += codePoints(text) * widestAdvance(effective);
            if (/\S/.test(text)) holder.inked = true;
          }
          if (layout) judged = layText(layout, text, effective, stack[containerIndex(at)], deleted);
        }
        if (frame.name === "w:t" && run?.texts) run.texts.push({ text, place: frame.place ?? { before: 0, tabbed: true }, segments: segmentsOf(raw, textStart, text, holder, layout, judged) });
        textStart = null;
      } else if (frame?.name === "w:r" && frame.texts?.length) {
        const effective = runFormat(frame);
        const seen = visibility(frame.texts.map(passage => passage.text).join(""), effective);
        const judgement = graver({ verdict: seen, reason: seen === "unverifiable" ? "drawing" : undefined }, held.unplaced > 0 ? OUT_OF_PLACE : VISIBLE);
        // Each passage of the run in its place: its indents may take it off the page, its row, text box or line spacing part of it.
        const place = runPlace();
        for (const passage of frame.texts) {
          const placed = offIndents(passage, effective) ? graver(judgement, INVISIBLE) : judgement;
          for (const segment of passage.segments) settle(segment, placed, place);
        }
      } else if (frame?.name === "w:p" && frame.passages) {
        frame.closed = true;
        if (frame.passages.invisible.length) found.invisible.push(frame.passages.invisible.join(""));
        // Its text set aside, by reason, in the order the reasons come.
        const unverifiable = frame.passages.unverifiable;
        const reasons: DocxUnverifiableReason[] = [];
        const texts: string[][] = [];
        for (const { text, reason } of unverifiable) {
          const at = reasons.indexOf(reason);
          if (at === -1) {
            reasons.push(reason);
            texts.push([text]);
          } else texts[at]!.push(text);
        }
        reasons.forEach((reason, index) => found.unverifiable.push({ text: texts[index]!.join(""), reason }));
        // The paragraph fills its container by the space above it and its lines; its last line of text is what the next may run into.
        const content = stack[containerIndex(stack.length)]?.content;
        if (content) {
          const format = formatOf(frame);
          const styleMark = markFormats.get(frame.style ?? "") ?? markFormats.set(frame.style ?? "", Object.assign({}, styles.defaults, ...styleChain(styles, frame.style, "paragraph").map(style => style.run))).get(frame.style ?? "")!;
          const mark: RunLayer = frame.mark && Object.keys(frame.mark).length ? Object.assign({}, styleMark, frame.mark) : styleMark;
          const markSize = fontSize(mark, "");
          const layout = frame.layout;
          const above = spaceAbove(frame, content.above);
          // A hidden paragraph mark ends no line: what the paragraph shows goes on with the next one.
          if (hides(mark)) {
            if (layout) content.filled = [content.filled[MOST] + layout.lines[MOST].top, content.filled[LEAST] + layout.lines[LEAST].top];
          } else {
            if (layout) {
              const height = (model: number) => above + layout.lines[model]!.top + lineHeight(format, layout.lines[model]!.size || markSize, model, layout.lines[model]!.objects);
              content.filled = [content.filled[MOST] + height(MOST), content.filled[LEAST] + height(LEAST)];
            }
            const lastLine = layout?.lines[MOST].index;
            const segments = layout ? layout.pending.find(entry => entry.line === lastLine)?.segments : frame.shown;
            if (frame.inked) content.last = { tight: layout?.tight ?? false, segments: segments ?? [], gap: 0 };
            else if (content.last) content.last.gap += above + lineFloor(format, markSize);
            content.above = { style: styleOf(frame), after: format.after, contextual: format.contextual };
          }
        }
      } else if (frame?.name === "w:tc") {
        // A row is as tall as its tallest cell, but a cell merged with others; its next cell starts after this one's columns.
        const row = stack.at(-1)?.name === "w:tr" ? stack.at(-1) : undefined;
        if (row) {
          row.gridColumn = (row.gridColumn ?? 0) + (frame.span ?? 1);
          const filled = frame.merged ? [0, 0] : frame.content?.filled ?? [0, 0];
          row.tallest = [Math.max(row.tallest?.[MOST] ?? 0, filled[MOST]!), Math.max(row.tallest?.[LEAST] ?? 0, filled[LEAST]!)];
          const last = frame.content?.last ?? null;
          (row.cellLines ??= []).push({ last, filled: frame.content?.filled[LEAST] ?? 0, own: last !== null && last.segments !== frame.inherited });
        }
      } else if (frame?.name === "w:tr") {
        const table = stack.at(-1)?.name === "w:tbl" ? stack.at(-1) : undefined;
        const tallest = frame.tallest ?? [0, 0];
        const rule = frame.height;
        const height: Pair = rule?.rule === "exact" ? [rule.value, rule.value] : [Math.max(rule?.value ?? 0, tallest[MOST]), Math.max(rule?.value ?? 0, tallest[LEAST])];
        if (table) {
          table.rowsHeight = [(table.rowsHeight?.[MOST] ?? 0) + height[MOST], (table.rowsHeight?.[LEAST] ?? 0) + height[LEAST]];
          table.lineAbove = rowBottom(frame.cellLines ?? [], height[LEAST], table.lineAbove ?? null);
        }
      } else if (frame?.name === "w:tbl") {
        // The table fills its container below the paragraph above it; what follows starts below its last row.
        const content = innermost()?.content;
        if (content) {
          const height = frame.rowsHeight ?? [0, 0];
          const after = content.above?.after ?? 0;
          content.filled = [content.filled[MOST] + after + height[MOST], content.filled[LEAST] + after + height[LEAST]];
          content.above = undefined;
          content.last = frame.lineAbove ?? null;
        }
      } else if (frame?.colour) {
        paintShape(frame.colour);
      } else if (frame?.name === "wp:posOffset" && offsetStart !== null) {
        const box = stack.at(-2)?.box;
        const offset = Number(xml.slice(offsetStart, tag.start).trim()) / EMU_PER_PT || 0;
        if (box) box[stack.at(-1)?.name === "wp:positionH" ? "left" : "top"] = offset;
        offsetStart = null;
      }
      return;
    }
    const parent = stack.at(-1);
    const grandParent = stack.at(-2);
    const frame: Frame = tag.name === "w:p"
      ? { name: tag.name, passages: { invisible: [], unverifiable: [] }, key: paragraph ?? undefined, ordinal: paragraphCount++, cell: enclosingCell(), paragraph: {}, mark: {}, page: pageAt(tag.start), flow: { advance: 0, tabbed: false } }
      : tag.name === "w:r" ? { name: tag.name, layer: {}, texts: [] }
      : tag.name === "w:tbl" ? { name: tag.name, rows: tables.get(tag.start) ?? [], page: pageAt(tag.start), lineAbove: lineAboveTable() }
      : { name: tag.name };
    if (tag.name === "w:tr") {
      const table = nearest("w:tbl");
      if (table && !table.placed) placeTable(table);
      frame.row = next(table);
      frame.gridColumn = 0;
    }
    if (tag.name === "w:tc") {
      const row = nearest("w:tr");
      const table = nearest("w:tbl");
      frame.row = row?.row ?? 0;
      frame.column = next(row);
      frame.gridColumn = row?.gridColumn ?? 0;
      if (table) frame.formats = cellFormats(styles, table, frame.row!, frame.column!);
      // A row of exact height shows no more of its cells (w:trHeight exact; omitted, its height is 0), below their top margin.
      frame.cellTop = table?.cellTop ?? lastSet(styleChain(styles, table?.style, "table").map(style => style.cellTop)) ?? 0;
      // The line above the row is above its first line, beyond its top margin.
      const above = table?.lineAbove ?? null;
      frame.inherited = above?.segments;
      frame.content = { filled: [frame.cellTop, frame.cellTop], last: above && { ...above, gap: above.gap + frame.cellTop } };
      if (row?.height?.rule === "exact") frame.room = [row.height.value, row.height.value];
      frame.fixed = Boolean(frame.room) || Boolean(innermost()?.fixed);
    }
    if (tag.name === "w:top" && parent?.name === "w:tblCellMar" && grandParent?.name === "w:tblPr" && stack.at(-3)?.name === "w:tbl") stack.at(-3)!.cellTop = cellMargin(tag);
    if (tag.name === "w:top" && parent?.name === "w:tcMar" && grandParent?.name === "w:tcPr" && stack.at(-3)?.name === "w:tc") {
      const cell = stack.at(-3)!;
      const change = cellMargin(tag) - (cell.cellTop ?? 0);
      if (cell.content) cell.content.filled = [cell.content.filled[MOST] + change, cell.content.filled[LEAST] + change];
      if (cell.content?.last) cell.content.last.gap += change;
      cell.cellTop = cellMargin(tag);
    }
    // The side margins of the cells, given by the table or by a cell, the other side as Word's when not given.
    if ((parent?.name === "w:tblCellMar" || parent?.name === "w:tcMar") && /^w:(left|right|start|end)$/.test(tag.name) && (stack.at(-3)?.name === "w:tbl" || stack.at(-3)?.name === "w:tc")) {
      const holder = stack.at(-3)!;
      holder.cellSides = (holder.cellSides ?? DEFAULT_CELL_SIDES_PT) - DEFAULT_CELL_SIDES_PT / 2 + cellMargin(tag);
    }
    if (tag.name === "w:trHeight" && parent?.name === "w:trPr" && grandParent?.name === "w:tr") {
      const rule = tag.attributes.get("w:hRule") ?? "atLeast";
      grandParent.height = { rule: /^exact$/i.test(rule) ? "exact" : /^auto$/i.test(rule) ? "auto" : "atLeast", value: Math.max(0, measurePt(tag.attributes.get("w:val"), 20) ?? 0) };
    }
    if (tag.name === "w:gridBefore" && parent?.name === "w:trPr" && grandParent?.name === "w:tr") grandParent.gridColumn = Math.max(0, Number.parseInt(tag.attributes.get("w:val") ?? "0", 10) || 0);
    if (parent?.name === "w:tcPr" && grandParent?.name === "w:tc") {
      if (tag.name === "w:gridSpan") grandParent.span = Math.max(1, Number.parseInt(tag.attributes.get("w:val") ?? "1", 10) || 1);
      if (tag.name === "w:tcW" && /^dxa$/i.test(tag.attributes.get("w:type") ?? "dxa")) grandParent.preferredWidth = measurePt(tag.attributes.get("w:w"), 20);
      // A cell merged with the rows below takes their height too; text run top to bottom fills its height along its lines.
      if (tag.name === "w:vMerge" || (tag.name === "w:textDirection" && !ACROSS.test(tag.attributes.get("w:val") ?? "lrTb"))) {
        grandParent.room = undefined;
        grandParent.fixed = Boolean(innermost(innermost() === grandParent ? 1 : 0)?.fixed);
        if (tag.name === "w:vMerge") grandParent.merged = true;
      }
    }
    // A VML shape, not in a group, of a set height and width (its text box's), unless its text grows it, runs top to bottom or does not wrap.
    if ((VML_SHAPES.has(tag.name) || tag.name === "v:group") && (parent?.name === "w:pict" || parent?.name === "w:object")) {
      const style = tag.attributes.get("style") ?? "";
      const height = FREE_VML_TEXT.test(style) ? undefined : vmlMeasure(style, "height");
      const width = vmlMeasure(style, "width");
      frame.topShape = true;
      frame.extent = height === undefined ? undefined : [height, height];
      frame.width = /mso-wrap-style\s*:\s*none/i.test(style) ? UNBOUNDED : width === undefined ? undefined : [width, width];
    }
    // Its text box shows its text within its insets.
    if (tag.name === "v:textbox") {
      const shape = stack.findLast(item => item.topShape);
      const insets = vmlInsets(tag.attributes.get("inset"));
      if (shape && FREE_VML_TEXT.test(tag.attributes.get("style") ?? "")) shape.extent = undefined;
      else if (shape?.extent) shape.extent = [Math.max(0, shape.extent[LEAST] - insets.top - insets.bottom), shape.extent[LEAST]];
      if (shape?.width && Number.isFinite(shape.width[LEAST])) shape.width = [Math.max(0, shape.width[LEAST] - insets.left - insets.right), shape.width[LEAST]];
    }
    // A DrawingML drawing's size; inline, it also takes its width and height on its line.
    if (tag.name === "wp:extent" && (parent?.name === "wp:anchor" || parent?.name === "wp:inline")) {
      const height = emuPt(tag.attributes.get("cy"));
      const width = emuPt(tag.attributes.get("cx"));
      parent.extent = height === undefined ? undefined : [height, height];
      parent.width = width === undefined ? undefined : [width, width];
      const at = stack.findLastIndex(item => item.name === "w:p");
      const holder = stack[at];
      if (parent.name === "wp:inline" && holder?.flow) {
        holder.flow.advance += Math.max(0, width ?? 0);
        const layout = layoutOf(at);
        if (layout) placeObject(layout, Math.max(0, width ?? 0), Math.max(0, height ?? 0), 0);
      }
    }
    // A DrawingML text box shows its text within its insets, unless it grows with it, runs top to bottom or does not wrap.
    if (tag.name === "wps:wsp") {
      const box = drawingBoxes.get(tag.start);
      const holder = stack.findLast(item => item.name === "wp:anchor" || item.name === "wp:inline");
      if (holder && box) {
        if (box.free) holder.extent = undefined;
        else if (holder.extent) holder.extent = [Math.max(0, holder.extent[LEAST] - box.insets.top - box.insets.bottom), holder.extent[LEAST]];
        if (box.unwrapped) holder.width = UNBOUNDED;
        else if (holder.width) holder.width = [Math.max(0, holder.width[LEAST] - box.insets.left - box.insets.right), holder.width[LEAST]];
      }
    }
    // A text box whose text flows on into others shows as much as all of them, up to one off the page.
    const chained = tag.name === "wps:txbx" || tag.name === "v:textbox" ? linkedHeights.get(tag.start) : undefined;
    if (chained !== undefined) {
      const holder = stack.findLast(item => (tag.name === "v:textbox" ? item.topShape === true : item.name === "wp:anchor" || item.name === "wp:inline"));
      if (holder) holder.extent = Number.isFinite(chained[MOST]) ? chained : undefined;
    }
    if (tag.name === "w:txbxContent") {
      const holder = stack.findLast(item => item.name === "wp:anchor" || item.name === "wp:inline" || item.topShape === true);
      if (holder?.extent) frame.room = [Math.max(0, holder.extent[MOST]), Math.max(0, holder.extent[LEAST])];
      frame.fixed = Boolean(frame.room);
      frame.width = holder?.width;
    }
    if (PARAGRAPH_CONTAINERS.has(tag.name) && !frame.content) frame.content = { filled: [0, 0], last: null };
    if (VML_SHAPES.has(tag.name)) {
      const fill = fills.get(tag.start);
      // As in VML, the colour of v:fill wins over the shape's fillcolor.
      const colour = (fill?.get("color") ?? tag.attributes.get("fillcolor"))?.trim();
      const filled = !/^(f|false)$/i.test(tag.attributes.get("filled") ?? "") && !/^(f|false)$/i.test(fill?.get("on") ?? "");
      // A fill that is not one colour (gradient, pattern, picture): what lies under may show, as under a DrawingML gradient.
      const solid = /^(solid)?$/i.test(fill?.get("type")?.trim() ?? "");
      const known = colour === undefined || !filled || !solid ? undefined : vmlColour(colour);
      // A fill partly transparent (v:fill opacity) shows the page through it; a transparent one, the page.
      const opacity = vmlOpacity(fill?.get("opacity"));
      frame.paint = known ? [opacity < 1 ? blend(pageColour, known, opacity) : known] : null;
      frame.offPage = vmlShapeIsOffPage(tag.attributes.get("style"), page);
    }
    // DrawingML shapes (Word's text boxes in mc:Choice): their fill, else their style's (fill style 1 is solid), placed by their anchor.
    if (parent?.name === "wps:spPr" && grandParent?.name === "wps:wsp" && DRAWING_FILLS.has(tag.name)) {
      // None, or a fill that may not be one colour (gradient, picture): what lies under may show, as under a picture.
      grandParent.paint = null;
      if (tag.name === "a:solidFill") frame.fillOf = grandParent;
    }
    if (tag.name === "a:fillRef" && parent?.name === "wps:style" && grandParent?.name === "wps:wsp" && grandParent.paint === undefined) {
      grandParent.paint = null;
      if (tag.attributes.get("idx") === "1") frame.fillOf = grandParent;
    }
    if (parent?.fillOf && DRAWING_COLOURS.has(tag.name)) {
      frame.colour = { hex: drawingColour(tag, theme), scale: 1, offset: 0, alpha: 1, shape: parent.fillOf };
      if (tag.selfClosing) paintShape(frame.colour);
    } else if (parent?.colour) {
      // Word's lighter and darker theme colours change the lightness, its transparency the opacity; another change makes the colour unknown.
      const amount = Number(tag.attributes.get("val")) / 100_000;
      if (tag.name === "a:lumMod" && Number.isFinite(amount)) parent.colour.scale = amount;
      else if (tag.name === "a:lumOff" && Number.isFinite(amount)) parent.colour.offset = amount;
      else if (tag.name === "a:alpha" && Number.isFinite(amount)) parent.colour.alpha = Math.min(1, Math.max(0, amount));
      else parent.colour.hex = undefined;
    }
    if (tag.name === "wp:anchor") frame.box = { left: 0, top: 0, width: 0, height: 0, simple: /^(1|true|on)$/i.test(tag.attributes.get("simplePos") ?? "") };
    if (tag.name === "wp:simplePos" && parent?.box?.simple) Object.assign(parent.box, { left: Number(tag.attributes.get("x")) / EMU_PER_PT || 0, top: Number(tag.attributes.get("y")) / EMU_PER_PT || 0 });
    if (tag.name === "wp:extent" && parent?.box) Object.assign(parent.box, { width: Number(tag.attributes.get("cx")) / EMU_PER_PT || 0, height: Number(tag.attributes.get("cy")) / EMU_PER_PT || 0 });
    if (tag.name === "wp:posOffset" && !tag.selfClosing && grandParent?.box && !grandParent.box.simple && (parent?.name === "wp:positionH" || parent?.name === "wp:positionV")) offsetStart = tag.end;
    // The shape follows its position and size.
    if (tag.name === "a:graphic" && parent?.box) placeOff(parent, { offPage: isOffPage(parent.box, page) });
    if (tag.name === "mc:Choice" && parent?.name === "mc:AlternateContent" && !parent.drawn && drawnByWord(tag)) {
      frame.chosen = true;
      parent.drawn = { text: "", verdicts: [], cursor: 0 };
    }
    // Word shows the page colour, and fill effects as the page colour (gradient, texture, picture) under all the text, when the settings say so.
    if (tag.name === "w:background" && parent?.name === "w:document" && pageShown) {
      const colour = colourOf(theme, tag.attributes.get("w:color"), tag.attributes.get("w:themeColor"), tag.attributes.get("w:themeTint"), tag.attributes.get("w:themeShade"));
      if (colour && colour !== "auto") pageColour = colour;
    }
    if (tag.name === "v:fill" && parent?.name === "v:background" && pageShown) pagePicture = true;
    if (parent?.name === "w:pPr" && grandParent?.name === "w:p") {
      if (tag.name === "w:pStyle") grandParent.style = tag.attributes.get("w:val");
      if (tag.name === "w:shd") grandParent.paint = shadingPaint(tag, theme);
      applyParagraphProperty(grandParent.paragraph!, tag);
      // A frame of exact height shows no more of its paragraph; its width is that of its lines.
      const height = measurePt(tag.attributes.get("w:h"), 20);
      const width = measurePt(tag.attributes.get("w:w"), 20);
      if (tag.name === "w:framePr" && /^exact$/i.test(tag.attributes.get("w:hRule") ?? "") && height !== undefined) grandParent.room = [Math.max(0, height), Math.max(0, height)];
      if (tag.name === "w:framePr" && width !== undefined && width > 0) grandParent.width = [width, width];
      if (tag.name === "w:framePr" && /^(drop|margin)$/i.test(tag.attributes.get("w:dropCap") ?? "")) grandParent.dropCap = true;
    }
    if (tag.name === "w:tab" && parent?.name === "w:tabs" && grandParent?.name === "w:pPr" && stack.at(-3)?.name === "w:p") applyParagraphProperty(stack.at(-3)!.paragraph!, tag);
    if (parent?.name === "w:rPr" && grandParent?.name === "w:pPr" && stack.at(-3)?.name === "w:p") applyRunProperty(stack.at(-3)!.mark!, tag, theme);
    if (tag.name === "w:shd" && ((parent?.name === "w:tcPr" && grandParent?.name === "w:tc") || (parent?.name === "w:tblPr" && grandParent?.name === "w:tbl"))) grandParent.paint = shadingPaint(tag, theme);
    if (parent?.name === "w:tblPr" && grandParent?.name === "w:tbl") {
      if (tag.name === "w:tblStyle") grandParent.style = tag.attributes.get("w:val");
      if (tag.name === "w:tblLook") grandParent.look = tableLook(tag);
      if (BAND_SIZES[tag.name]) grandParent[BAND_SIZES[tag.name]!] = bandSize(tag);
      // Where the table lies across the page, and how wide its columns are.
      const twips = /^(dxa)?$/i.test(tag.attributes.get("w:type") ?? "") ? measurePt(tag.attributes.get("w:w"), 20) : undefined;
      if (tag.name === "w:tblInd") grandParent.indent = twips;
      if (tag.name === "w:tblW") grandParent.tableWidth = twips;
      if (tag.name === "w:jc") grandParent.align = tag.attributes.get("w:val");
      if (tag.name === "w:tblLayout") grandParent.fixedLayout = /^fixed$/i.test(tag.attributes.get("w:type") ?? "");
      if (tag.name === "w:tblpPr") grandParent.floating = true;
    }
    if (tag.name === "w:gridCol" && parent?.name === "w:tblGrid" && grandParent?.name === "w:tbl") (grandParent.grid ??= []).push(Math.max(0, measurePt(tag.attributes.get("w:w"), 20) ?? 0));
    if (parent?.name === "w:rPr" && grandParent?.name === "w:r") {
      grandParent.effective = undefined;
      if (tag.name === "w:rStyle") grandParent.style = tag.attributes.get("w:val");
      else applyRunProperty(grandParent.layer!, tag, theme);
    }
    // Where the run's text lies in its paragraph: a line break starts a line below; a tab moves it to a tab stop (for its indents, anywhere along the line). Hidden, they move nothing; deleted, only in the most room.
    const flowing = parent?.name === "w:r" && (IN_FLOW.has(tag.name) || tag.name === "w:delText") && !hides(runFormat(parent));
    if (flowing) {
      const at = stack.findLastIndex(item => item.name === "w:p");
      const holder = stack[at];
      const flow = holder?.flow;
      const layout = flow && tag.name !== "w:t" && tag.name !== "w:delText" ? layoutOf(at) : null;
      const deleted = layout ? held.deleted > 0 : false;
      if (layout && (tag.name === "w:br" || tag.name === "w:cr")) for (const model of deleted ? [MOST] : [MOST, LEAST]) newLine(layout, model, fontSize(runFormat(parent), ""));
      if (flow && (tag.name === "w:tab" || tag.name === "w:ptab")) flow.tabbed = true;
      if (layout && tag.name === "w:tab" && !deleted) tabOn(layout, holder!);
      if (flow && tag.name === "w:sym") {
        flow.advance += widestAdvance(runFormat(parent));
        if (layout && !deleted) placeObject(layout, LAYOUTS[MOST]!.widths.sign * fontSize(runFormat(parent), ""), 0, fontSize(runFormat(parent), ""));
      }
    }
    if ((tag.name === "w:t" || tag.name === "w:delText") && !tag.selfClosing && parent?.name === "w:r") {
      textStart = tag.end;
      const flow = flowing ? nearest("w:p")?.flow : undefined;
      if (flow && tag.name === "w:t") frame.place = { before: flow.advance, tabbed: flow.tabbed };
    }
    if (!tag.selfClosing) {
      stack.push(frame);
      hold(frame, 1);
      if (frame.content) containers.push(stack.length - 1);
      if (frame.name === "w:tbl") tableIndices.push(stack.length - 1);
      if (tag.name === "mc:AlternateContent") alternates += 1;
      if (tag.name === "mc:Choice" || tag.name === "w:drawing") unread += 1;
    }
  }));
  // Text cut out, in order; a part cut twice is cut once.
  let visible = "";
  let from = 0;
  for (const [start, end] of cuts.sort((left, right) => left[0] - right[0])) {
    if (start > from) visible += xml.slice(from, start);
    from = Math.max(from, end);
  }
  return { xml: visible + xml.slice(from), cut: cuts.length > 0, invisibleText: found.invisible, unverifiableText: found.unverifiable };
}

/** The first existing target of a relationship of that type, resolved as mammoth resolves it. */
function relatedPart(parts: Map<string, Buffer>, relationshipsPath: string, type: string, basePath: string) {
  let found: string | undefined;
  visitXmlTags(parts.get(relationshipsPath)?.toString("utf8") ?? "", tag => {
    if (found || tag.closing || tag.name !== "relationships:Relationship" || tag.attributes.get("Type") !== type) return;
    const target = tag.attributes.get("Target") ?? "";
    const path = (target.startsWith("/") || !basePath ? target : `${basePath}/${target}`).replace(/^\//, "");
    if (parts.has(path)) found = path;
  });
  return found;
}

/** A ZIP of `parts`, stored without compression: it is only read back by mammoth, in memory. */
function storedZip(parts: Map<string, Buffer>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  parts.forEach((content, name) => {
    const fileName = Buffer.from(name, "utf8");
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, content);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + content.length;
  });
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.size, 8);
  end.writeUInt16LE(parts.size, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/**
 * The DOCX to hand to mammoth, without its invisible text nor the text whose
 * visibility cannot be established (its background, its place); the text of
 * each, and why the latter was set aside. Also bounds the decompression
 * (inspectDocxArchive) and the layout work (docxLayoutWorkUnits). An unchanged
 * file is returned as is.
 */
export function withoutInvisibleDocxText(buffer: Buffer, limits = DOCUMENT_DECOMPRESSION_LIMITS): {
  buffer: Buffer;
  invisibleText: string[];
  unverifiableText: Array<{ text: string; reason: DocxUnverifiableReason }>;
} {
  const parts = new Map<string, Buffer>();
  inspectDocxArchive(buffer, limits, (name, content) => parts.set(name, content));
  const mainDocument = relatedPart(parts, "_rels/.rels", OFFICE_DOCUMENT_RELATIONSHIP, "") ?? "word/document.xml";
  const xml = parts.get(mainDocument)?.toString("utf8");
  if (!xml) return { buffer, invisibleText: [], unverifiableText: [] };
  const folder = mainDocument.includes("/") ? mainDocument.slice(0, mainDocument.lastIndexOf("/")) : "";
  const relationships = `${folder ? `${folder}/` : ""}_rels/${mainDocument.slice(folder ? folder.length + 1 : 0)}.rels`;
  const stylesPart = relatedPart(parts, relationships, STYLES_RELATIONSHIP, folder) ?? "word/styles.xml";
  const themePart = relatedPart(parts, relationships, THEME_RELATIONSHIP, folder) ?? "word/theme/theme1.xml";
  const settingsPart = relatedPart(parts, relationships, SETTINGS_RELATIONSHIP, folder) ?? "word/settings.xml";
  const settings = parts.get(settingsPart)?.toString("utf8");
  const theme = readTheme(parts.get(themePart)?.toString("utf8"), settings);
  // A picture behind the text in a header or a footer lies on every page, wherever the text falls.
  const onEveryPage = Array.from(parts.keys()).some(name => {
    if (!/(^|\/)(header|footer)\d*\.xml$/i.test(name)) return false;
    const margin = drawingReach(parts.get(name)!.toString("utf8"));
    return margin.fromPage || margin.reaches.length > 0;
  });
  const budget = { units: limits.docxLayoutWorkUnits };
  const visible = cutInvisibleRuns(xml, readStyles(parts.get(stylesPart)?.toString("utf8"), theme), theme, onEveryPage, showsPageColour(settings), defaultTabStop(settings), budget);
  if (!visible.cut) return { buffer, invisibleText: [], unverifiableText: [] };
  parts.set(mainDocument, Buffer.from(visible.xml, "utf8"));
  return { buffer: storedZip(parts), invisibleText: visible.invisibleText, unverifiableText: visible.unverifiableText };
}
