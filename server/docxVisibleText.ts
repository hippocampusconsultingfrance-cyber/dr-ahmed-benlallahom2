import { crc32 } from "node:zlib";
import { DOCUMENT_DECOMPRESSION_LIMITS, inspectDocxArchive } from "./documentDecompressionLimits";
import { DOCX_FONT_ALIASES, DOCX_FONT_CHARACTERS, DOCX_FONT_METRICS, DOCX_FONT_WIDTH_DIGITS } from "./docxFontMetrics";

/**
 * DOCX text Word does not show (IA-01): runs marked hidden (w:vanish,
 * w:specVanish, w:webHidden), smaller than 4 pt (w:sz, or w:szCs for complex
 * script text: Arabic, Hebrew…), squeezed to less than 1 pt a character
 * (w:w, w:spacing), raised or lowered out of their line (w:position
 * beyond twice their size), in a text box placed off the page or that Word
 * does not draw (wp:docPr hidden, VML visibility:hidden, which LibreOffice
 * draws), of letters Word does not fill nor outline (w14:textFill noFill), or
 * without contrast with what lies under them: as the PDF check, less than
 * 32/255 apart on each channel from the first colour under it, the colour of
 * the text being w:color, or its theme colour, tinted or shaded, as Word draws
 * it; when Word 2010's fill (w14:textFill) or outline (w14:textOutline) sets
 * them, each of their colours (every stop of a gradient), its lightness
 * changed (lumMod, lumOff), as transparent as it says (w14:alpha), the
 * letters seen where the fill or the outline is (a colour Word changes
 * otherwise, tint or saturation, is unknown: unverifiable); and the
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
 * page; a frame of exact height, w:framePr; an exact line spacing, or a
 * multiple of single spacing under 89/240; a right indent past the page's
 * right edge), the text is laid out twice (LAYOUTS):
 * taking the most room it may take (in its font when measured), and the
 * least. Its lines wrap at the
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
 * A table its indent (w:tblInd) places off the page hides its text, a cell
 * its grid's columns start beyond the page's right edge too (in a table that
 * fits its columns to its text, sets it aside), and a frame of the body its
 * place across (w:framePr w:x) puts beyond an edge of the page. A text box of
 * a VML group is of its size in the group's coordinates (coordsize).
 * Past a count of layout work (docxLayoutWorkUnits), what is left to lay out
 * is set aside, and the line a line of an exact spacing left so may run
 * into. Text the indents of its paragraph (w:ind, its style's or the
 * document's) place, where it starts, beyond an edge of the page of its
 * section (w:pgSz, w:pgMar, w:cols; A4 with margins of 2.5 cm when not given)
 * is hidden, and the body's text a column break (w:br column) moves to a
 * column its section's columns place off the page (a hidden break moves
 * nothing; after one deleted, or a page break before a hidden paragraph, which
 * Word may not apply, it is set aside). Hidden text (w:vanish,
 * w:specVanish), its line breaks and
 * paragraph marks take no room; deleted text (w:del) only when it takes the
 * most, as LibreOffice shows it. Rows of height at least, text boxes that grow
 * with their text (a:spAutoFit, mso-fit-shape-to-text) and cells merged with
 * a row that grows do not cut their text; a cell merged with rows of exact
 * height shows as much as all of them; text run top to bottom (w:textDirection,
 * wps:bodyPr vert, layout-flow:vertical) goes down the height of its box or of
 * its row of exact height, its lines one after the other across its width.
 * A shape in front of the text that does not wrap it (wp:wrapNone, VML
 * position:absolute), of a fill that hides what lies under it (VML fills a
 * shape that says nothing of it in white, but a picture), as wide as the text
 * of its page and placed from its paragraph, may cover the paragraphs and
 * tables of the body it reaches, at their least heights: all their text is
 * set aside.
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
  "http://schemas.microsoft.com/office/word/2010/wordml": "w14",
};
const OFFICE_DOCUMENT_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
/** The type of a part's relationship (styles, theme…) is this followed by its name. */
const RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
/** Headers and footers: what lies behind their text lies on every page. */
const HEADER_OR_FOOTER = /(^|\/)(header|footer)\d*\.xml$/i;
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
/** ...and highest, but of fonts drawn far above or below their letters. */
const MAX_LINE_HEIGHT_IN_SIZES = 1.35;
/** Widest advance of a character, in sizes of its text (W, a dash, a Chinese character). */
const MAX_ADVANCE_IN_SIZES = 1;
/**
 * The two layouts of text whose place may hide it: taking the most room it
 * may take (characters as wide as in their font, bold or italic, when it is
 * one of the fonts measured, DOCX_FONT_METRICS, and lines as tall as it sets
 * them; otherwise lines of 1.15 times their size and characters, in sizes of
 * their text, about as wide as in the widest common fonts: capitals 0.68,
 * figures 0.56, other letters 0.5, punctuation 0.4, other signs 0.8, spaces
 * 0.3, Chinese, Japanese or Korean ones 1, all 0.6 in a typewriter font;
 * words kept whole on their line, over passages and runs, with those no-break
 * spaces join (U+00A0, U+202F…), but after a hyphen or a dash; the insets of
 * text boxes and the side margins of cells; deleted text shown, as
 * LibreOffice shows it), and the least (lines of 0.9 times
 * their size, characters a fifth as wide, wide ones 0.9, lines broken
 * anywhere, no inset nor margin, deleted text not shown).
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
  /** The font of its characters of Basic Latin (w:rFonts w:ascii) and of other Latin ones (w:hAnsi), or of its theme. */
  font: string;
  otherFont: string;
  /**
   * Bold, italic, in capitals (w:b, w:i, w:caps or w:smallCaps) by one of the layers: Word may switch them off again, the wider
   * letters are taken (bold, capitals; upright or italic, whichever is wider, measuredAdvance).
   */
  bold: true;
  italic: true;
  capitals: true;
  /**
   * Word 2010's fill of the letters (w14:textFill), which Word draws instead
   * of w:color and LibreOffice ignores, and their outline (w14:textOutline).
   */
  fill: TextPaint;
  outline: TextPaint;
}>;

/**
 * A colour of Word 2010's text effects (w14:srgbClr, w14:schemeClr): undefined
 * when unknown (another scheme colour, a change Word makes to it that is not
 * followed: tint, saturation…); its lightness changes (w14:lumMod, w14:lumOff),
 * its transparency (w14:alpha), from 0 to 1.
 */
type TextColour = { hex: string | undefined; scale: number; offset: number; transparency: number };
/** What Word 2010 paints letters or their outline with: nothing (w14:noFill), or the colour of a solid fill, or each stop of a gradient. */
type TextPaint = "none" | TextColour[];

const hexColour = (value: string | undefined) => (value !== undefined && /^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : undefined);
const channels = (hex: string) => [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16));
const toHex = (values: number[]) => values.map(value => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0")).join("").toUpperCase();

/**
 * Two colours told apart: 32/255 or more apart on a channel, as the PDF
 * contrast check (bright yellow on white is, E0E0E0 is not); the first drawn
 * over the second this opaque, as Word draws letters partly transparent.
 */
const distinct = (left: string, right: string, opacity = 1) => {
  const under = channels(right);
  return channels(left).some((value, index) => Math.abs(value - under[index]!) * opacity >= MIN_CHANNEL_GAP);
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

/** The colour of a theme colour name (w:themeColor…), as the settings map it to the theme's colour scheme; the theme's fonts for Latin text, of headings and body. */
type Theme = ((name: string) => string | undefined) & { fonts?: { major?: string; minor?: string } };

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
  const fonts: NonNullable<Theme["fonts"]> = {};
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
    if (tag.name === "a:latin" && path.at(-2) === "a:fontScheme" && (path.at(-1) === "a:majorFont" || path.at(-1) === "a:minorFont")) {
      fonts[path.at(-1) === "a:majorFont" ? "major" : "minor"] ??= tag.attributes.get("typeface");
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
  return Object.assign((name: string) => scheme.get(THEME_SLOTS[mapping.get(name) ?? THEME_MAPPING[name]?.[1] ?? name] ?? ""), { fonts });
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

/**
 * The insets of a box whose text runs top to bottom, whichever sides they
 * then fall on: on each side, half the most two opposite sides take.
 */
function turnedInsets(insets: Insets): Insets {
  const half = Math.max(insets.left + insets.right, insets.top + insets.bottom) / 2;
  return { left: half, top: half, right: half, bottom: half };
}

/**
 * The room a box of this height and width (a text box, a cell of exact
 * height) gives text that runs top to bottom, in both layouts (less its
 * insets in the first, turnedInsets): its lines go down its height
 * (`width`), one after the other across its width (`extent`).
 */
function turnedRoom(height: number | undefined, width: number | undefined, insets: Insets): { extent?: Pair; width?: Pair } {
  const { top, bottom } = turnedInsets(insets);
  return {
    extent: width === undefined || !Number.isFinite(width) ? undefined : [Math.max(0, width - top - bottom), width],
    width: height === undefined || !Number.isFinite(height) ? undefined : [Math.max(0, height - top - bottom), height],
  };
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
 * one); how far beyond the margin the column a column break (w:br column)
 * moves text to starts, by how many come before it in the section, the
 * columns of the next page after its last. Margins may swap from page to page
 * (w:mirrorMargins): either may be on either side.
 */
type PageAcross = { width: number; widestMargin: number; narrowestMargin: number; columnShift: number; narrowestColumn: number; widestColumn: number; columnStart: (breaks: number) => number };
const FIRST_COLUMN = () => 0;

/** The page of each section, by where its w:sectPr starts: a paragraph lies in the first section that ends after it. */
function sectionPages(): Survey<Array<{ end: number; page: PageAcross }>> {
  const sections: Array<{ end: number; page: PageAcross }> = [];
  /** `widths`, `spaces`: of each column given (w:col), and the space after it. */
  type Section = { start: number; width?: number; left?: number; right?: number; gutter?: number; columns: number; space?: number; widths: number[]; spaces: number[] };
  let section: Section | null = null;
  // A w:sectPrChange holds the section's former properties in a w:sectPr of its own.
  let depth = 0;
  const close = (current: Section) => {
    const width = current.width ?? DEFAULT_PAGE.width;
    const left = current.left ?? DEFAULT_PAGE.margin;
    const right = current.right ?? DEFAULT_PAGE.margin;
    const gutter = Math.max(0, current.gutter ?? 0);
    const text = width - left - right - gutter;
    const given = current.widths.length > 1;
    const columns = given ? current.widths.length : current.columns;
    const space = current.space ?? 36;
    const evenColumn = columns > 1 ? (text - (columns - 1) * space) / columns : text;
    const narrowestColumn = given ? current.widths.reduce((least, column) => Math.min(least, column)) : evenColumn;
    const widestColumn = given ? current.widths.reduce((most, column) => Math.max(most, column)) : evenColumn;
    // Columns given start after the ones before them and their spaces; others are even.
    const starts: number[] = [];
    if (given) current.widths.reduce((at, column, index) => (starts.push(at), at + column + (current.spaces[index] ?? 0)), 0);
    const columnStart = columns < 2 ? FIRST_COLUMN : given ? (breaks: number) => starts[breaks % columns]! : (breaks: number) => (breaks % columns) * (evenColumn + space);
    sections.push({ end: current.start, page: { width, widestMargin: Math.max(left, right) + gutter, narrowestMargin: Math.min(left, right), columnShift: columns > 1 ? Math.max(0, text - narrowestColumn) : 0, narrowestColumn, widestColumn, columnStart } });
  };
  const twips = (tag: XmlTag, name: string) => measurePt(tag.attributes.get(`w:${name}`), 20);
  const visit = (tag: XmlTag) => {
    if (tag.name === "w:sectPr") {
      if (tag.closing) {
        if (depth === 1 && section) close(section);
        if (depth === 1) section = null;
        depth -= 1;
      } else if (depth === 0) {
        section = { start: tag.start, columns: 1, widths: [], spaces: [] };
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
      if (width !== undefined) {
        section.widths.push(width);
        section.spaces.push(Math.max(0, twips(tag, "space") ?? 0));
      }
    }
  };
  return { visit, done: () => sections };
}

/**
 * A DrawingML text box (wps:wsp): whether its size does not cut its text (it
 * grows with it, a:spAutoFit, or stacks its letters, vert wordArtVert),
 * whether its text runs top to bottom (vert, its lines down its height,
 * turnedRoom), whether its lines do not wrap (wrap none), its insets.
 */
type DrawingBox = { free: boolean; vertical: boolean; unwrapped: boolean; insets: Insets };
/** DrawingML text running top to bottom (wps:bodyPr vert), its lines one after the other across. */
const VERTICAL_DRAWING_TEXT = /^(vert|vert270|eaVert|mongolianVert)$/;

/** A VML text box style that grows the box with its text. */
const FREE_VML_TEXT = /mso-fit-shape-to-text\s*:\s*t/i;
/** A VML text box style that runs its text top to bottom (turnedRoom). */
const VERTICAL_VML_TEXT = /layout-flow\s*:\s*vertical/i;

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
      const box: DrawingBox = { free: false, vertical: false, unwrapped: false, insets: { ...DEFAULT_INSETS } };
      shapes.set(tag.start, box);
      if (!tag.selfClosing) drawing.push(box);
    } else if (tag.name === "a:spAutoFit" && shape) {
      shape.free = true;
    } else if (tag.name === "wps:bodyPr" && shape) {
      const inset = (name: string, fallback: number) => Math.max(0, emuPt(tag.attributes.get(name)) ?? fallback);
      const vert = tag.attributes.get("vert") ?? "";
      if (VERTICAL_DRAWING_TEXT.test(vert)) shape.vertical = true;
      else if (!/^(horz)?$/.test(vert)) shape.free = true;
      shape.unwrapped = tag.attributes.get("wrap") === "none";
      shape.insets = { left: inset("lIns", DEFAULT_INSETS.left), top: inset("tIns", DEFAULT_INSETS.top), right: inset("rIns", DEFAULT_INSETS.right), bottom: inset("bIns", DEFAULT_INSETS.bottom) };
    } else if ((tag.name === "wps:txbx" || tag.name === "wps:linkedTxbx") && tag.attributes.has("id")) {
      // Only boxes of one id are linked: Word writes none on a box that is not.
      const id = tag.attributes.get("id")!;
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
      box.next = /(?:^|;)\s*mso-next-textbox\s*:\s*#?([^;]+)/i.exec(style)?.[1]?.trim();
      box.textbox = tag.start;
      box.insets = vmlInsets(tag.attributes.get("inset"));
      // Text run top to bottom fills the box across its width.
      if (FREE_VML_TEXT.test(style)) box.height = undefined;
      else if (VERTICAL_VML_TEXT.test(style) && box.height !== undefined) [box.height, box.insets] = [vmlMeasure(box.style, "width"), turnedInsets(box.insets)];
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
        // Text run top to bottom fills the box across its width.
        const vertical = box.shape?.vertical === true;
        const across = box.holder?.height === undefined ? undefined : box.holder.box.width;
        const room = boxRoom(vertical ? across : box.holder?.height, vertical ? turnedInsets(box.shape!.insets) : box.shape?.insets ?? DEFAULT_INSETS, box.shape?.free ?? false);
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

/** Where Word may break a line within a word: after a hyphen, a dash, a soft hyphen or a zero-width space. */
const BREAK_AFTER = new Set(["-", "\u00ad", "\u200b", "\u2010", "\u2012", "\u2013", "\u2014", "\u2015"]);
/** Spaces Word breaks no line at (no-break, narrow no-break, figure, zero-width no-break): as wide as spaces, they join the words around them. */
const NO_BREAK_SPACES = new Set([0xa0, 0x202f, 0x2007, 0xfeff]);
/** Whether a line may break at a character (its first UTF-16 unit): a space but those. */
const breaksLine = (code: number) => SPACES[code] === 1 && !NO_BREAK_SPACES.has(code);
/**
 * Text up to this share wider than its line, its advances added, still fits on
 * it in the most room: the kerning LibreOffice applies, and Word when the
 * document asks for it (w:kern, in its recent default style), tightens a line
 * of capitals by 1 to 2 %; and the rounding of their layouts.
 */
const FIT_MARGIN = 0.02;
/** Where each character measured (DOCX_FONT_CHARACTERS) is in the widths of a font. */
const MEASURED_CHARACTERS = new Map(Array.from(DOCX_FONT_CHARACTERS, (character, index) => [character, index] as const));
/** The widths of each style of each font measured, in sizes of their text, read once from their digits. */
const fontWidths = new Map<string, number[]>();

/**
 * The font measured (DOCX_FONT_METRICS) that a run sets its characters of Basic Latin in (`ascii`), or its other Latin ones, as Word
 * names it; none for a run of complex script (w:cs, w:rtl), which Word sets in another font (w:rFonts w:cs).
 */
function measuredFont(effective: RunLayer, ascii: boolean) {
  if (effective["w:cs"] || effective["w:rtl"]) return undefined;
  const name = ascii ? effective.font ?? effective.otherFont : effective.otherFont ?? effective.font;
  return name === undefined ? undefined : DOCX_FONT_ALIASES[name.trim().toLowerCase()];
}

/** The widths of a style of a font measured, in sizes of their text; of an italic style, the wider of its letters and of the upright style's, Word possibly drawing them upright. */
function styleWidths(font: string, style: "regular" | "italic" | "bold" | "boldItalic"): number[] {
  const key = `${font}:${style}`;
  let widths = fontWidths.get(key);
  if (!widths) {
    const digits = DOCX_FONT_METRICS[font]![style];
    const value = (at: number) => DOCX_FONT_WIDTH_DIGITS.indexOf(digits[at]!);
    const own = Array.from({ length: digits.length / 2 }, (_, at) => (value(2 * at) * DOCX_FONT_WIDTH_DIGITS.length + value(2 * at + 1)) / 1000);
    const upright = style === "italic" ? styleWidths(font, "regular") : style === "boldItalic" ? styleWidths(font, "bold") : undefined;
    widths = upright ? own.map((width, at) => (width > 0 && upright[at]! > 0 ? Math.max(width, upright[at]!) : width)) : own;
    fontWidths.set(key, widths);
  }
  return widths;
}

/** The advance of a character in its run's font, in its style, when measured, in sizes of its text (in capitals when the run is). */
function measuredAdvance(effective: RunLayer, character: string) {
  const shown = effective.capitals && character.toUpperCase().length === character.length ? character.toUpperCase() : character;
  const index = MEASURED_CHARACTERS.get(shown);
  const font = index === undefined ? undefined : measuredFont(effective, shown.charCodeAt(0) < 128);
  if (font === undefined) return undefined;
  const widths = styleWidths(font, effective.bold ? (effective.italic ? "boldItalic" : "bold") : effective.italic ? "italic" : "regular");
  return widths[index!]! > 0 ? widths[index!] : undefined;
}

/** The height of a line of single spacing of a run's font when measured, in sizes of its text; 0 otherwise. */
const fontLine = (effective: RunLayer) => {
  const font = measuredFont(effective, true) ?? measuredFont(effective, false);
  return font === undefined ? 0 : DOCX_FONT_METRICS[font]!.line / 1000;
};

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
    // A theme font (w:asciiTheme…) wins over the font named.
    const named = (kind: string) => {
      const themed = tag.attributes.get(`w:${kind}Theme`);
      return themed ? theme.fonts?.[/^major/i.test(themed) ? "major" : "minor"] : tag.attributes.get(`w:${kind}`);
    };
    const ascii = named("ascii");
    const other = named("hAnsi");
    if (ascii !== undefined) layer.font = ascii;
    if (other !== undefined) layer.otherFont = other;
    const font = ascii ?? other;
    if (font !== undefined) layer.typewriter = /courier|mono|consolas|lucida console|typewriter/i.test(font);
  } else if ((tag.name === "w:b" || tag.name === "w:i" || tag.name === "w:caps" || tag.name === "w:smallCaps") && !/^(false|0|off)$/i.test(value ?? "")) {
    layer[tag.name === "w:b" ? "bold" : tag.name === "w:i" ? "italic" : "capitals"] = true;
  }
}

/**
 * Reads what a run's Word 2010 text effects say (RunLayer fill, outline):
 * `path`, the elements from the effect (w14:textFill, w14:textOutline) down
 * to the tag's parent.
 */
function applyTextEffect(layer: RunLayer, path: string[], tag: XmlTag, theme: Theme) {
  const [effect, fill, ...below] = path;
  const key = effect === "w14:textFill" ? "fill" : effect === "w14:textOutline" ? "outline" : undefined;
  if (!key) return;
  if (fill === undefined) {
    // No fill, one colour, or a gradient, whose colours follow.
    if (tag.name === "w14:noFill") layer[key] = "none";
    else if (tag.name === "w14:solidFill" || tag.name === "w14:gradFill") layer[key] = [];
    return;
  }
  const paint = layer[key];
  // The colour of a solid fill, or of a stop of a gradient (w14:gsLst, w14:gs), and its changes.
  const depth = fill === "w14:solidFill" ? 0 : fill === "w14:gradFill" && below[0] === "w14:gsLst" && below[1] === "w14:gs" ? 2 : -1;
  if (!Array.isArray(paint) || depth === -1) return;
  if (below.length === depth && (tag.name === "w14:srgbClr" || tag.name === "w14:schemeClr")) {
    const value = tag.attributes.get("w14:val") ?? "";
    paint.push({ hex: tag.name === "w14:srgbClr" ? hexColour(value) : DRAWING_SCHEME[value] ? theme(DRAWING_SCHEME[value]) : undefined, scale: 1, offset: 0, transparency: 0 });
  } else if (below.length === depth + 1 && paint.length) {
    // Lighter and darker theme colours change the lightness, transparency (in thousandths of a percent) the opacity; another change makes the colour unknown.
    const colour = paint.at(-1)!;
    const amount = Number(tag.attributes.get("w14:val")) / 100_000;
    if (tag.name === "w14:lumMod" && Number.isFinite(amount)) colour.scale = amount;
    else if (tag.name === "w14:lumOff" && Number.isFinite(amount)) colour.offset = amount;
    else if (tag.name === "w14:alpha" && Number.isFinite(amount)) colour.transparency = Math.min(1, Math.max(0, amount));
    else colour.hex = undefined;
  }
}

/**
 * How far back (1: the tag's parent) lies the w:rPr holding a Word 2010 text
 * effect's tag, with its effect, fill, a gradient's stops and colour in
 * between, of the names of the elements open; or -1.
 */
function effectHolder(nameBack: (back: number) => string | undefined) {
  for (let back = 1; back <= 6; back += 1) {
    const name = nameBack(back);
    if (name === "w:rPr") return back;
    if (!name?.startsWith("w14:")) return -1;
  }
  return -1;
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

/**
 * Whether a paragraph's lines may run into one another: in an exact spacing,
 * or in a multiple of single spacing so small (w:line under 89 / 240) that
 * even the tallest single spacing does not keep them apart; their height
 * then, at most (tightPitch).
 */
const tightSpacing = ({ line }: ParagraphFormat) => line.rule === "exact" || (line.rule === "auto" && line.value * MAX_LINE_HEIGHT_IN_SIZES < MIN_EXACT_LINE_SHARE);
const tightPitch = ({ line }: ParagraphFormat, size: number) => (line.rule === "exact" ? line.value : line.value * MAX_LINE_HEIGHT_IN_SIZES * size);

/** The lowest a line of text of this size can be in a paragraph: its exact spacing, else what its spacing gives single spacing at its lowest. */
const lineFloor = ({ line }: ParagraphFormat, size: number) =>
  line.rule === "exact" ? line.value : line.rule === "atLeast" ? Math.max(line.value, MIN_LINE_HEIGHT_IN_SIZES * size) : MIN_LINE_HEIGHT_IN_SIZES * size * line.value;

/**
 * The height of a line of text of this size in one of LAYOUTS, a picture on it
 * (`objects`) at least as tall, but in an exact spacing; in the most room, of
 * single spacing that of its fonts when measured (`factor`, fontLine).
 */
const lineHeight = ({ line }: ParagraphFormat, size: number, layout: number, objects = 0, factor = 0) => {
  const single = (layout === MOST && factor > 0 ? factor : LAYOUTS[layout]!.lineHeight) * size;
  return line.rule === "exact" ? line.value : Math.max(objects, line.rule === "atLeast" ? Math.max(line.value, single) : single * line.value);
};

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
/** The lowest and highest value of each channel (red, green, blue) of a set of colours. */
type ColourRange = { low: number[]; high: number[] };
/**
 * A style and the ones it is based on, merged as Word applies them, the base
 * first (resolveStyle): what each sets, its conditional formats (each merged
 * across the chain), every colour its formats paint under a cell's text (for
 * a table that does not say which of them it shows), its own definition and
 * its base's merge, from which its tab stops are merged when a paragraph
 * needs them (styleTabs).
 */
type ResolvedStyle = Omit<StyleDefinition, "basedOn"> & { colours: ColourRange | null; definition?: StyleDefinition; base?: ResolvedStyle; tabs?: Array<[number, string]> };
/** `defaults`, `paragraphShading`, `paragraph`: the document's defaults (w:docDefaults). `resolved`: each style once merged with its bases. */
type Styles = { byId: Map<string, StyleDefinition>; defaultIds: Map<string, string>; defaults: RunLayer; paragraphShading?: Paint; paragraph: ParagraphLayer; resolved: Map<string, ResolvedStyle> };

const BAND_SIZES: Record<string, keyof BandSizes> = { "w:tblStyleRowBandSize": "rowBandSize", "w:tblStyleColBandSize": "columnBandSize" };
const bandSize = (tag: XmlTag) => Math.max(1, Number.parseInt(tag.attributes.get("w:val") ?? "", 10) || 1);
/** A cell margin (w:top of w:tcMar or w:tblCellMar), in points: in twips, or none (nil). */
const cellMargin = (tag: XmlTag) => (/^(dxa)?$/i.test(tag.attributes.get("w:type") ?? "") ? Math.max(0, measurePt(tag.attributes.get("w:w"), 20) ?? 0) : 0);

function readStyles(xml: string | undefined, theme: Theme): Styles {
  const styles: Styles = { byId: new Map(), defaultIds: new Map(), defaults: {}, paragraph: {}, resolved: new Map() };
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
    const effectAt = tag.name.startsWith("w14:") ? effectHolder(back => path.at(-back)) : -1;
    if (effectAt > 0) {
      // A Word 2010 text effect of the document's defaults, of a style or of a table style's condition.
      const owner = path.at(-effectAt - 1);
      const layer = owner === "w:rPrDefault" ? styles.defaults : owner === "w:style" ? current?.run : owner === "w:tblStylePr" ? condition?.run : undefined;
      if (layer) applyTextEffect(layer, path.slice(path.length - effectAt + 1), tag, theme);
    } else if (tag.name === "w:style") {
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

/**
 * The height of the rows a cell merged with the rows below (w:vMerge restart)
 * spans, by where its w:tc starts, when each is of exact height (null: one
 * is not, and grows with the text); the cells of a column below it merged
 * with it (w:vMerge continue) up to one that is not.
 */
function mergedCellRooms(): Survey<Map<number, number | null>> {
  const rooms = new Map<number, number | null>();
  /** Each table open: the exact height of its row (null: it grows), the grid column of its next cell, its cell, and the first cell of each merge, by grid column. */
  type Table = { height: number | null; column: number; cell?: { start: number; column: number; span: number; merge?: "restart" | "continue" }; merges: Map<number, number> };
  const tables: Table[] = [];
  const path: string[] = [];
  const visit = (tag: XmlTag) => {
    if (tag.closing) {
      const name = path.pop();
      const table = tables.at(-1);
      if (name === "w:tbl") tables.pop();
      else if (name === "w:tc" && table?.cell) {
        const { start, column, span, merge } = table.cell;
        const first = table.merges.get(column);
        if (merge === "continue" && first !== undefined) {
          const room = rooms.get(first);
          rooms.set(first, room === null || room === undefined || table.height === null ? null : room + table.height);
        } else if (merge === "restart") {
          table.merges.set(column, start);
          rooms.set(start, table.height);
        } else table.merges.delete(column);
        table.column = column + span;
        table.cell = undefined;
      }
      return;
    }
    const parent = path.at(-1);
    const table = tables.at(-1);
    if (tag.name === "w:tbl") {
      if (!tag.selfClosing) tables.push({ height: null, column: 0, merges: new Map() });
    } else if (tag.name === "w:tr" && table) {
      Object.assign(table, { height: null, column: 0 });
    } else if (table && parent === "w:trPr" && path.at(-2) === "w:tr") {
      if (tag.name === "w:trHeight") table.height = /^exact$/i.test(tag.attributes.get("w:hRule") ?? "") ? Math.max(0, measurePt(tag.attributes.get("w:val"), 20) ?? 0) : null;
      if (tag.name === "w:gridBefore") table.column = Math.max(0, Number.parseInt(tag.attributes.get("w:val") ?? "0", 10) || 0);
    } else if (tag.name === "w:tc" && table && !tag.selfClosing) {
      table.cell = { start: tag.start, column: table.column, span: 1 };
    } else if (table?.cell && parent === "w:tcPr" && path.at(-2) === "w:tc") {
      if (tag.name === "w:gridSpan") table.cell.span = Math.max(1, Number.parseInt(tag.attributes.get("w:val") ?? "1", 10) || 1);
      if (tag.name === "w:vMerge") table.cell.merge = /^restart$/i.test(tag.attributes.get("w:val") ?? "") ? "restart" : "continue";
    }
    if (!tag.selfClosing) path.push(tag.name);
  };
  return { visit, done: () => rooms };
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

/** A VML shape type (v:shapetype): its attributes and those of its v:fill, which its shapes take unless they set their own. */
type VmlType = { attributes: Map<string, string>; fill?: Map<string, string> };

/**
 * The attributes of the v:fill of each VML shape, by where the shape's tag
 * starts: it may follow the text box; the shapes that draw a picture
 * (v:imagedata); each shape type, by its id.
 */
function vmlFills(): Survey<{ fills: Map<number, Map<string, string>>; pictures: Set<number>; types: Map<string, VmlType> }> {
  const fills = new Map<number, Map<string, string>>();
  const pictures = new Set<number>();
  const types = new Map<string, VmlType>();
  const names: string[] = [];
  const starts: number[] = [];
  let type: VmlType | undefined;
  const visit = (tag: XmlTag) => {
    if (tag.closing) {
      if (names.pop() === "v:shapetype") type = undefined;
      starts.pop();
      return;
    }
    const parent = names.at(-1) ?? "";
    if (tag.name === "v:fill" && VML_SHAPES.has(parent)) fills.set(starts.at(-1)!, tag.attributes);
    if (tag.name === "v:imagedata" && VML_SHAPES.has(parent)) pictures.add(starts.at(-1)!);
    if (tag.name === "v:fill" && parent === "v:shapetype" && type) type.fill = tag.attributes;
    if (tag.name === "v:shapetype") {
      const id = tag.attributes.get("id");
      const known: VmlType = { attributes: tag.attributes };
      if (id && !types.has(id)) types.set(id, known);
      if (!tag.selfClosing) type = known;
    }
    if (!tag.selfClosing) {
      names.push(tag.name);
      starts.push(tag.start);
    }
  };
  return { visit, done: () => ({ fills, pictures, types }) };
}

/** A range of colours widened to those a paint holds. */
function widened(range: ColourRange | null, paint: Paint | undefined): ColourRange | null {
  let widest = range;
  for (const colour of paint ?? []) {
    const values = channels(colour);
    widest = widest
      ? { low: widest.low.map((value, index) => Math.min(value, values[index]!)), high: widest.high.map((value, index) => Math.max(value, values[index]!)) }
      : { low: values, high: values };
  }
  return widest;
}

/** Whether a colour of the range shows a text of this colour, drawn this opaque: one is 32/255 or more from it on a channel (distinct). */
const rangeShows = (range: ColourRange | null, colour: string, opacity = 1) =>
  range !== null && channels(colour).some((value, index) => (range.high[index]! - value) * opacity >= MIN_CHANNEL_GAP || (value - range.low[index]!) * opacity >= MIN_CHANNEL_GAP);

const NO_STYLE: ResolvedStyle = { run: {}, paragraph: {}, conditions: new Map(), colours: null };

/** What a style sets over its base's merge: each value it sets wins over the base's, as Word applies a style over the one it is based on. */
function mergeStyle(base: ResolvedStyle, style: StyleDefinition): ResolvedStyle {
  const over = <T>(own: T | undefined, below: T | undefined) => (own !== undefined ? own : below);
  const conditions = new Map(base.conditions);
  for (const [type, formats] of Array.from(style.conditions)) {
    const below = base.conditions.get(type);
    conditions.set(type, below
      ? { run: { ...below.run, ...formats.run }, paragraphShading: over(formats.paragraphShading, below.paragraphShading), cellShading: over(formats.cellShading, below.cellShading) }
      : formats);
  }
  const colours = [style, ...Array.from(style.conditions.values())].reduce((range, formats) => widened(widened(range, formats.paragraphShading), formats.cellShading), base.colours);
  return {
    run: Object.keys(style.run).length ? { ...base.run, ...style.run } : base.run,
    paragraph: Object.keys(style.paragraph).length ? { ...base.paragraph, ...style.paragraph } : base.paragraph,
    paragraphShading: over(style.paragraphShading, base.paragraphShading),
    cellShading: over(style.cellShading, base.cellShading),
    tableShading: over(style.tableShading, base.tableShading),
    cellTop: over(style.cellTop, base.cellTop),
    rowBandSize: over(style.rowBandSize, base.rowBandSize),
    columnBandSize: over(style.columnBandSize, base.columnBandSize),
    conditions, colours, definition: style, base,
  };
}

/**
 * A style merged with the ones it is based on (the type's default style when
 * none is named), each style of the document merged once, from its base's
 * merge: read for each run, paragraph and cell, a chain of thousands of styles
 * costs its length once, not once for each of them. A base missing, or met
 * again (a loop), ends the chain.
 */
function resolveStyle(styles: Styles, id: string | undefined, type: string): ResolvedStyle {
  const start = id ?? styles.defaultIds.get(type);
  if (start === undefined) return NO_STYLE;
  const known = styles.resolved.get(start);
  if (known) return known;
  // The styles not merged yet, from this one down to its first merged base.
  const path: StyleDefinition[] = [];
  const onPath = new Set<string>();
  let base = NO_STYLE;
  for (let current: string | undefined = start; current !== undefined && !onPath.has(current); ) {
    const merged = styles.resolved.get(current);
    if (merged) {
      base = merged;
      break;
    }
    const style = styles.byId.get(current);
    if (!style) break;
    onPath.add(current);
    path.push(style);
    current = style.basedOn;
  }
  const ids = Array.from(onPath);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    base = mergeStyle(base, path[index]!);
    styles.resolved.set(ids[index]!, base);
  }
  return styles.resolved.get(start) ?? NO_STYLE;
}

/**
 * What a table style sets for a cell's text and under it, by the cell's place;
 * in a table without w:tblLook, whose look is assumed, every colour its
 * formats may paint in a cell.
 */
type CellFormats = { runs: RunLayer[]; paragraphShading?: Paint; cellShading?: Paint; colours: ColourRange | null };

type Visibility = "visible" | "invisible" | "unverifiable";
const SEVERITY: Record<Visibility, number> = { visible: 0, unverifiable: 1, invisible: 2 };

/**
 * Why DOCX text was set aside as unverifiable: white or pale text that may lie
 * on a picture or a shape (`drawing`), text its row, text box, frame, line
 * spacing, a shape in front or the page's edge may cut or hide (`layout`),
 * text of such places left unlaid once the layout work allowed is spent
 * (`layout_unfinished`), all the text of a document that it, or a part read
 * with it, nests too deep to be read (`nested`, DOCX_MAX_NESTING_DEPTH).
 */
export type DocxUnverifiableReason = "drawing" | "layout" | "layout_unfinished" | "nested";
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

/**
 * A line of a paragraph in one of LAYOUTS: its index, the top of it, how far
 * along it the text has gone, the largest size of its text, the tallest
 * picture on it (in points), the tallest single spacing of the fonts measured
 * on it (fontLine, in sizes; 0 when none).
 */
type Line = { index: number; top: number; x: number; size: number; objects: number; factor: number };

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
 * segments of its last two lines, which a cramped line below may still cover;
 * the word its last passage ended in, which the next one may go on (`word`:
 * where it starts on its line of the first layout, how wide it is so far, the
 * largest size and spacing of its letters, its visible segments), to go whole
 * to the next line.
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
  word?: { x: number; width: number; size: number; factor: number; segments: Segment[] };
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
  /**
   * Paragraphs: their lines when their place may hide them (layoutOf; null: it cannot); else their visible segments, which a cramped
   * line below may still cover. Paragraphs and tables of the body: all their visible segments, which a shape in front may cover.
   */
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
  /** Tables placed on the page across: where their grid starts from the page's left edge, in both layouts, and where each of its columns starts in it; whether they lay their columns from the right (w:bidiVisual). */
  across?: Pair;
  gridStarts?: number[];
  rightToLeft?: boolean;
  /**
   * Cells: their grid column and span (w:gridSpan), their preferred width (w:tcW), whether merged with the cells above or below
   * (w:vMerge); merged with those below, the height of all their rows when each is exact (null: one grows, mergedCellRooms).
   */
  span?: number;
  preferredWidth?: number;
  merged?: boolean;
  mergedRoom?: number | null;
  /** DrawingML anchors and inline drawings, VML shapes (sized in their group's coordinates in one): the height their text box shows in both layouts, unless it grows with its text or runs top to bottom. */
  extent?: Pair;
  topShape?: boolean;
  /** VML groups of a known size: the points each unit of their coordinates (coordsize) spans, across and down, for their shapes. */
  groupScale?: { across: number; down: number };
  /** The shading set on a paragraph, cell or table itself (null: none), or the fill of a text box (null: none known). */
  paint?: Paint;
  /** Placed off the page (hidden), or off it with some margins only (unplaced: unverifiable); a shape Word does not draw (hidden). */
  offPage?: boolean;
  unplaced?: boolean;
  hidden?: boolean;
  /**
   * Paragraphs of the body: in a column of their section placed off the page (hidden), or off it with some margins only, or only
   * once the breaks before them that Word may not apply are applied or not (unverifiable): kept apart from where their frame places them.
   */
  columnOff?: boolean;
  columnUnplaced?: boolean;
  /** Paragraphs: a page break before them (w:pageBreakBefore), applied once their mark's formatting is read. */
  breakBefore?: boolean;
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
  /** Paragraphs: the table cell they are in, outside of a text box; whether they lie in the body itself (in its columns). */
  cell?: Frame;
  body?: boolean;
  /**
   * DrawingML anchors and VML shapes: whether Word draws them in front of the text without wrapping it (not behindDoc, wp:wrapNone),
   * from what they place it across and down (relativeFrom), whether their fill hides what lies under it (DrawingML shapes: `opaque`).
   * Paragraphs and tables of the body: where they start down the body, at the least (bodyTop), whether such a shape may cover them.
   */
  front?: { behind: boolean; wrapNone: boolean; opaque: boolean; across?: string; down?: string };
  opaque?: boolean;
  bodyTop?: number;
  covered?: boolean;
};
/** Fills at least this opaque hide what lies under them. */
const OPAQUE_FILL = 0.9;
/** How many paragraphs and tables of the body above it a shape in front may be found to cover, placed above its anchor (coverFrom). */
const MAX_RECENT_BLOCKS = 64;
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
const NO_CELL_FORMATS: CellFormats = { runs: [], paragraphShading: undefined, cellShading: undefined, colours: null };

function cellFormats(styles: Styles, table: Frame, row: number, column: number): CellFormats {
  const style = resolveStyle(styles, table.style, "table");
  if (style === NO_STYLE) return NO_CELL_FORMATS;
  const bands = { rowBandSize: table.rowBandSize ?? style.rowBandSize ?? 1, columnBandSize: table.columnBandSize ?? style.columnBandSize ?? 1 };
  const conditions = cellConditions(table.look ?? tableLook(null), table.rows ?? [], row, column, bands);
  // The style's own formats, then each conditional format, each merged across the styles of its chain.
  const formats: Formats[] = [style, ...conditions.flatMap(condition => style.conditions.get(condition) ?? [])];
  return {
    runs: formats.map(format => format.run),
    paragraphShading: lastSet(formats.map(format => format.paragraphShading)),
    cellShading: lastSet(formats.map(format => format.cellShading)),
    colours: table.look ? null : style.colours,
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
function cutInvisibleRuns(xml: string, styles: Styles, theme: Theme, fromPage: boolean, pageShown: boolean, tabStop: number, budget: { units: number }, tags = readXmlTags(xml)) {
  // One reading of the part for all that the main one needs to know ahead.
  const largest = largestPage();
  const rowCells = tableRows();
  const merges = mergedCellRooms();
  const shapeFills = vmlFills();
  const boxes = textBoxes(xml);
  const sectionPage = sectionPages();
  const reach = drawingReachSurvey(xml);
  visitXmlTags(tags, largest.visit, rowCells.visit, merges.visit, shapeFills.visit, boxes.visit, sectionPage.visit, reach.visit);
  const page = largest.done();
  const tables = rowCells.done();
  const mergedRooms = merges.done();
  const { fills, pictures: vmlPictures, types: vmlTypes } = shapeFills.done();
  const { shapes: drawingBoxes, chains: linkedHeights } = boxes.done(page);
  const sections = sectionPage.done();
  const pictures = reach.done();
  let section = 0;
  const column = DEFAULT_PAGE.width - 2 * DEFAULT_PAGE.margin;
  const defaultPage: PageAcross = { width: DEFAULT_PAGE.width, widestMargin: DEFAULT_PAGE.margin, narrowestMargin: DEFAULT_PAGE.margin, columnShift: 0, narrowestColumn: column, widestColumn: column, columnStart: FIRST_COLUMN };
  /** The page of the section a paragraph or table starting there is in (they come in order). */
  const pageAt = (position: number): PageAcross => {
    while (section < sections.length - 1 && sections[section]!.end < position) section += 1;
    return sections[section]?.page ?? defaultPage;
  };
  /**
   * The column breaks (w:br column) read so far in the body, since the start of its section or the last page break, on that page:
   * those Word applies (`count`), and those it may apply too (`shown`: deleted, as LibreOffice shows them; before a hidden paragraph).
   */
  let columnBreaks = { page: defaultPage, count: 0, shown: 0 };
  /** Where the text after so many column breaks lies across its page: in a column off it with all margins (hidden), or with some (unverifiable). */
  const columnPlace = (across: PageAcross, breaks: number) => {
    const start = across.columnStart(breaks);
    const offPage = across.narrowestMargin + start >= across.width;
    return { offPage, unplaced: !offPage && across.widestMargin + start >= across.width };
  };
  /** Where the body's text lies after the column breaks read: hidden in a column off the page whichever breaks apply, unverifiable when only some place it there. */
  const columnFlags = (): Pick<Frame, "columnOff" | "columnUnplaced"> => {
    const applied = columnPlace(columnBreaks.page, columnBreaks.count);
    const shown = columnBreaks.shown === columnBreaks.count ? applied : columnPlace(columnBreaks.page, columnBreaks.shown);
    const columnOff = applied.offPage && shown.offPage;
    return { columnOff, columnUnplaced: !columnOff && (applied.offPage || applied.unplaced || shown.offPage || shown.unplaced) };
  };
  /**
   * Moves the body's text that follows to the next column (`breaks` 1), or back to the first (0, a page break); only as it may be
   * shown (`uncertain`: a break deleted, before a hidden paragraph), Word possibly not applying it.
   */
  const breakColumn = (paragraph: Frame | undefined, breaks: number, uncertain: boolean) => {
    if (!paragraph?.body || !paragraph.page) return;
    if (columnBreaks.page !== paragraph.page) columnBreaks = { page: paragraph.page, count: 0, shown: 0 };
    const after = (count: number) => (breaks === 0 ? 0 : count + breaks);
    if (!uncertain) columnBreaks.count = after(columnBreaks.count);
    columnBreaks.shown = after(columnBreaks.shown);
    placeOff(paragraph, columnFlags());
  };
  const stack: Frame[] = [];
  /**
   * The frames of the stack placed off the page, off it with some margins only, that a shape in front may cover, cells or text boxes,
   * text boxes, deleted or moved away: counted as they come and go, not looked for at each run.
   */
  const held = { offPage: 0, unplaced: 0, covered: 0, nested: 0, textBoxes: 0, deleted: 0 };
  const hold = (frame: Frame, change: number) => {
    if (frame.offPage || frame.hidden || frame.columnOff) held.offPage += change;
    if (frame.unplaced || frame.columnUnplaced) held.unplaced += change;
    if (frame.covered) held.covered += change;
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
  /** Places a frame of the stack off the page, or off it with some margins only, or in such a column, or under a shape in front. */
  const placeOff = (frame: Frame, placing: Pick<Frame, "offPage" | "unplaced" | "hidden" | "covered" | "columnOff" | "columnUnplaced">) => {
    hold(frame, -1);
    Object.assign(frame, placing);
    hold(frame, 1);
  };
  /**
   * How far down the body its paragraphs and tables reach, at the least (their
   * lowest lines, one per paragraph, and spacing; their rows at their
   * lowest): where the next starts, its page breaks aside. Down to where a
   * shape in front of the text may cover the body (coverUntil); the last
   * paragraphs and tables read (MAX_RECENT_BLOCKS), and where they end, for a
   * shape placed above its anchor; the table of the body being read, whose
   * cells' visible segments it gathers (but those of its text boxes, which
   * may be drawn over such a shape).
   */
  let bodyDown = 0;
  let coverUntil = Number.NEGATIVE_INFINITY;
  const recentBlocks: Array<{ block: Frame; end: number }> = [];
  let bodyTable: Frame | undefined;
  /** Keeps a paragraph or a table of the body once read, and where it ends, among the last ones (recentBlocks). */
  const remember = (block: Frame) => {
    recentBlocks.push({ block, end: bodyDown });
    if (recentBlocks.length > MAX_RECENT_BLOCKS) recentBlocks.shift();
  };
  /** Sets aside what a paragraph or a table of the body read so far shows: it may lie under a shape in front of it. */
  const coverBlock = (block: Frame) => {
    setAside(block.shown, OUT_OF_PLACE);
    for (const entry of block.layout?.pending ?? []) setAside(entry.segments, OUT_OF_PLACE);
  };
  /**
   * A shape in front of the text without wrapping it, of a fill that hides
   * what lies under it, as wide as the text of its page from its start
   * (`left`, `width`, from what `across` names), placed down from its
   * paragraph of the body (`top`, `height`): it may cover the paragraphs it
   * reaches (Word and LibreOffice draw it over them), at the least heights of
   * those before and after (bodyDown), its anchor's from its top.
   */
  const coverFrom = (paragraph: Frame | undefined, place: { across?: string; down?: string; left: number; top: number; width: number; height: number }) => {
    const page = paragraph?.page;
    if (!paragraph?.body || !page || paragraph.bodyTop === undefined || held.textBoxes > 0 || place.height < MIN_PARAGRAPH_PT) return;
    if (!/^(paragraph|line|text)$/i.test(place.down ?? "paragraph")) return;
    const fromPage = /^page$/i.test(place.across ?? "");
    if (!fromPage && !/^(column|margin|text)$/i.test(place.across ?? "column")) return;
    // It starts before the text of the page, wherever its margins put it, and ends after its narrowest column.
    if (place.left > (fromPage ? page.narrowestMargin : 0) || place.left + place.width < (fromPage ? page.widestMargin : 0) + page.narrowestColumn) return;
    const from = paragraph.bodyTop + place.top;
    const to = from + place.height;
    // Its anchor and what follows, down to its bottom.
    if (to > paragraph.bodyTop) {
      coverUntil = Math.max(coverUntil, to);
      coverBlock(paragraph);
      if (!paragraph.covered) placeOff(paragraph, { covered: true });
    }
    // Above its anchor, the paragraphs and tables it may reach up to.
    for (let index = recentBlocks.length - 1; index >= 0 && recentBlocks[index]!.end > from; index -= 1) coverBlock(recentBlocks[index]!.block);
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
    frame.paint !== undefined ? frame.paint : lastSet([styles.paragraphShading, fromTable ? frame.cell?.formats?.paragraphShading : undefined, resolveStyle(styles, frame.style, "paragraph").paragraphShading]);
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
        : frame.name === "w:tbl" ? (frame.paint !== undefined ? frame.paint : resolveStyle(styles, frame.style, "table").tableShading)
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
        resolveStyle(styles, paragraph?.style, "paragraph").run,
        resolveStyle(styles, run.style, "character").run) as RunLayer;
      if (key !== undefined) styleFormats.set(key, base);
    }
    run.effective = Object.assign({}, base, run.layer);
    return run.effective;
  };
  /** A paragraph's indents, alignment, direction, spacing and tab stops: the document's defaults, its style's, its own (read once its w:pPr is). */
  const formatOf = (paragraph: Frame) => {
    paragraph.format ??= paragraphFormat([styles.paragraph, resolveStyle(styles, paragraph.style, "paragraph").paragraph, paragraph.paragraph ?? {}]);
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
    const layer = layerUnder(effective);
    /** Whether letters of this colour, drawn this opaque, are seen where they lie. */
    const judge = (colour: string, opacity: number): Visibility => {
      if (opacity * 255 < MIN_CHANNEL_GAP) return "invisible";
      if ((layer ?? [pageColour]).some(under => distinct(colour, under, opacity))) return "visible";
      // In a cell the table style alone colours, by an assumed look, a format for another place in the table might show it.
      const styledCell = paragraph?.cell !== undefined && paragraph.cell.paint === undefined && !effective.highlight && !effective.shading && !paragraphPaint(paragraph, false);
      if (styledCell && rangeShows(tableFormats?.colours ?? null, colour, opacity)) return "unverifiable";
      // On a colour of its own (shading, highlight, filled text box), it is not seen; on the page, it may lie on a picture:
      // in a text box without fill, in a paragraph a drawing holds, neighbours or covers, or on a picture as page colour.
      if (layer?.some(under => !isNearWhite(under))) return "invisible";
      const onDrawing = fromPage || pagePicture || pictures.fromPage || held.textBoxes > 0 || nearDrawing(paragraph);
      return onDrawing ? "unverifiable" : "invisible";
    };
    /** Letters a Word 2010 fill or outline paints: hidden by nothing, seen as each of its colours is when they all agree, unverifiable otherwise or when one is unknown. */
    const painted = (paint: TextPaint): Visibility => {
      if (paint === "none") return "invisible";
      const verdicts = paint.map(({ hex, scale, offset, transparency }) =>
        hex === undefined ? "unverifiable" : judge(scale === 1 && offset === 0 ? hex : withLightness(hex, lightness => lightness * scale + offset), 1 - transparency));
      return verdicts.length && verdicts.every(verdict => verdict === verdicts[0]) ? verdicts[0]! : "unverifiable";
    };
    // Word draws text in the automatic colour black or white, whichever shows on its background; in its text fill when set, which
    // w:color then no longer colours; with its outline. The letters are seen where either is.
    const colour = effective.colour ?? "auto";
    const filled = effective.fill !== undefined ? painted(effective.fill) : colour === "auto" ? "visible" : judge(colour, 1);
    const outlined = effective.outline !== undefined ? painted(effective.outline) : "invisible";
    return SEVERITY[outlined] < SEVERITY[filled] ? outlined : filled;
  };
  /** Where the innermost mc:AlternateContent open is in the stack; -1 when none. */
  const openAlternate = () => (alternates ? stack.findLastIndex(item => item.name === "mc:AlternateContent") : -1);
  /** What mammoth reads of a mc:AlternateContent, its fallback, is seen only where the choice Word draws shows the same text. */
  const asDrawn = (text: string, seen: Judgement): { judgement: Judgement; drawn?: { verdicts: Judgement[]; from: number; to: number } } => {
    if (!alternates) return { judgement: seen };
    const alternate = openAlternate();
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
    const tight = tightSpacing(format) && !paragraph.dropCap;
    const placed = slack[MOST] !== Number.POSITIVE_INFINITY || slack[LEAST] !== Number.POSITIVE_INFINITY;
    // The width of its lines, but of a paragraph of a cell or a text box that nothing constrains.
    const width = edge || placed || tight ? paragraph.width ?? widthOf(home, across) : UNBOUNDED;
    const pastEdge = edge !== undefined && (edge[MOST] + width[MOST] - format.end > across.width || edge[LEAST] + width[LEAST] - format.end > across.width);
    if (!placed && !tight && !pastEdge) return (paragraph.layout = null);
    const last = container?.content?.last;
    const line = (): Line => ({ index: 0, top: 0, x: 0, size: 0, objects: 0, factor: 0 });
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
  /** Starts the next line of a paragraph in a layout; `size`, `factor`: the size and spacing (fontLine) of the text that ends the line, for an empty one. No word goes on from one line to the next. */
  const newLine = (layout: ParagraphLayout, model: number, size = 0, factor = 0) => {
    const line = layout.lines[model];
    line.top += lineHeight(layout.format, Math.max(line.size, size), model, line.objects, Math.max(line.factor, factor));
    Object.assign(line, { index: line.index + 1, x: 0, size: 0, objects: 0, factor: 0 });
    if (model === MOST) layout.word = undefined;
  };
  /** Moves the visible segments of a word to the line of the first layout it now lies on, for the lines below that may run into it. */
  const moveSegments = (layout: ParagraphLayout, segments: Segment[], from: number, to: number) => {
    const moved = new Set(segments);
    const before = layout.pending.find(entry => entry.line === from);
    budget.units -= (before?.segments.length ?? 0) + segments.length;
    if (before) before.segments = before.segments.filter(segment => !moved.has(segment));
    if (!segments.length) return;
    let entry = layout.pending.find(item => item.line === to);
    if (!entry) layout.pending.push((entry = { line: to, segments: [] }));
    entry.segments.push(...segments);
  };
  /**
   * How far a line of the first layout may run before the next character goes
   * to the line below (`added`: the width it adds): its width, or the end of
   * the text a right or centred tab stop aligns, which Word and LibreOffice
   * keep on its line even past its edge.
   */
  const lineReach = (layout: ParagraphLayout, line: Line, model: number, added: number) => {
    const width = lineWidth(layout, line, model) * (model === MOST ? 1 + FIT_MARGIN : 1);
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
  /** The document's default tab stops (tabStops), merged once. */
  let defaultStops: Array<[number, string]> | undefined;
  /**
   * The tab stops of a paragraph style and its bases, with the document's
   * defaults: merged once for each style, from its base's, and counted as
   * layout work; none once the work allowed is spent (its text is then no
   * longer laid out).
   */
  const styleTabs = (resolved: ResolvedStyle) => {
    if (!defaultStops) {
      budget.units -= styles.paragraph.tabs?.length ?? 0;
      defaultStops = tabStops([styles.paragraph]);
    }
    const pending: ResolvedStyle[] = [];
    let below = defaultStops;
    for (let style: ResolvedStyle | undefined = resolved; style?.definition; style = style.base) {
      if (style.tabs) {
        below = style.tabs;
        break;
      }
      pending.push(style);
    }
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (budget.units <= 0) return [];
      const own = pending[index]!.definition!.paragraph.tabs;
      budget.units -= 1 + (own?.length ? below.length + own.length : 0);
      below = own?.length ? tabStops([{ tabs: below }, { tabs: own }]) : below;
      pending[index]!.tabs = below;
    }
    return below;
  };
  /** A paragraph's tab stops (tabStops): its style's, and its own; counted as layout work. */
  const stopsOf = (paragraph: Frame) => {
    const inherited = styleTabs(resolveStyle(styles, paragraph.style, "paragraph"));
    const own = paragraph.paragraph?.tabs;
    if (!own?.length) return inherited;
    budget.units -= inherited.length + own.length;
    return tabStops([{ tabs: inherited }, { tabs: own }]);
  };
  /** Moves a paragraph's lines on to its next tab stop (a stop of its own, the start of a hanging indent, else the next default one); a right or centred stop aligns the text after it at the stop, in the first layout. */
  const tabOn = (layout: ParagraphLayout, paragraph: Frame) => {
    budget.units -= 1;
    layout.word = undefined;
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
    layout.word = undefined;
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
      layout.word = undefined;
      return { judgements: judgements.fill(UNLAID), lines, wordFrom: text.length };
    }
    budget.units -= text.length;
    const { format } = layout;
    const size = fontSize(effective, text);
    const scale = (effective.scale ?? 100) / 100;
    const lowered = Math.max(0, -(effective.position ?? 0));
    const factor = fontLine(effective);
    const models = deleted ? [MOST] : [MOST, LEAST];
    // In the most room, a character measured in its run's font is as wide as it is there; others as in the widest common fonts.
    const advance = (model: number, character: string) => {
      const measured = model === MOST ? measuredAdvance(effective, character) : undefined;
      const kind = measured === undefined ? characterKind(character) : "letter";
      const share = measured ?? (effective.typewriter && kind !== "wide" ? LAYOUTS[model]!.typewriter : LAYOUTS[model]!.widths[kind]);
      return Math.max(0, share * size * scale + (effective.spacing ?? 0));
    };
    /** Whether text at `from` on a line of a layout leaves its place, and how far it runs into the line above (1: into its bottom, 2: into its letters). */
    const placing = (model: number, line: Line, from: number) => {
      const across = layout.edge && layout.edge[model]! + lineStart(layout, line);
      const out = outOfPlace(layout.slack, model, line.top, lowered, line.size)
        || (across !== undefined && (model === MOST ? across + lineEnd(layout, line) > layout.pageWidth : across + from >= layout.pageWidth));
      let overlap = 0;
      if (layout.tight) {
        // A line of an exact spacing smaller than its letters, or of a multiple of single spacing far below it, runs into the line above
        // it, unless there is room enough between them.
        const pitch = tightPitch(format, size);
        const room = pitch + (line.index === 0 ? layout.gapAbove : 0);
        overlap = room < MIN_EXACT_LINE_SHARE * size ? 2 : room < LEGIBLE_EXACT_LINE_SHARE * size ? 1 : 0;
        // Its first line drawn over a line of ordinary spacing, in a spacing not far smaller than its letters: LibreOffice shows it
        // over that line, Word cuts its top; not manifestly unseen.
        if (line.index === 0 && !layout.tightAbove && pitch >= MIN_ALONE_EXACT_LINE_SHARE * size) overlap = Math.min(overlap, 1);
      }
      return { out, overlap };
    };
    const characters = Array.from(text);
    /** Lines of the paragraph in the first layout (-1: the last one of the container above it) that a line below runs into. */
    const covered = new Set<number>();
    /** The last word of the passage: where it starts (unit, place on its line of the first layout), whether it goes on with the word before it, whether a line may break after it. */
    let last: { unit: number; x: number; line: number; continued: boolean; ends: boolean } | undefined;
    let unit = 0;
    for (let index = 0; index < characters.length; ) {
      const space = breaksLine(characters[index]!.charCodeAt(0));
      let end = index;
      let width = 0;
      // Spaces, or a word up to where Word may break its line: after a hyphen or a dash, around an ideograph; joined by no-break spaces.
      for (; end < characters.length; ) {
        const character = characters[end]!;
        if (breaksLine(character.charCodeAt(0)) !== space || (!space && end > index && WIDE_CHARACTER.test(character))) break;
        width += advance(MOST, character);
        end += 1;
        if (!space && (BREAK_AFTER.has(character) || WIDE_CHARACTER.test(character))) break;
      }
      // In the most room, a word goes whole to the next line when it does not fit on this one, with its part in the passages before.
      const first = layout.lines[MOST];
      const word = !space && index === 0 ? layout.word : undefined;
      if (word && word.x > 0 && first.x + width > lineReach(layout, first, MOST, width)) {
        const before = first.index;
        newLine(layout, MOST, size, factor);
        Object.assign(first, { x: word.width, size: word.size, factor: word.factor });
        const placed = placing(MOST, first, 0);
        if (placed.out || placed.overlap > 0) setAside(word.segments, OUT_OF_PLACE);
        else moveSegments(layout, word.segments, before, first.index);
        layout.word = { ...word, x: 0 };
      } else if (!space && first.x > 0 && first.x + width > lineReach(layout, first, MOST, width)) newLine(layout, MOST, size, factor);
      last = { unit, x: first.x, line: first.index, continued: word !== undefined, ends: space || BREAK_AFTER.has(characters[end - 1]!) || WIDE_CHARACTER.test(characters[end - 1]!) };
      for (; index < end; index += 1) {
        const character = characters[index]!;
        const out = [false, false];
        const overlap = [0, 0];
        for (const model of models) {
          const line = layout.lines[model]!;
          const step = advance(model, character);
          if (!space && line.x > 0 && line.x + step > lineReach(layout, line, model, step)) newLine(layout, model, size, factor);
          const from = line.x;
          line.x += step;
          line.size = Math.max(line.size, size);
          line.factor = Math.max(line.factor, factor);
          if (model === MOST && layout.tab?.line === line.index) layout.tab.width += step;
          if (deleted) continue;
          ({ out: out[model], overlap: overlap[model] } = placing(model, line, from));
        }
        let judgement = VISIBLE;
        if (!deleted) {
          // A line alone in an exact spacing far smaller than its letters: Word cuts most of them, LibreOffice draws them over the space above.
          const alone = layout.tight && format.line.rule === "exact" && format.line.value < MIN_ALONE_EXACT_LINE_SHARE * size;
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
    // A word the passage ends in may go on in the next one: kept, to go with it to the next line. Broken over two lines here, it starts the last one.
    let wordFrom = text.length;
    if (last && !last.ends) {
      const first = layout.lines[MOST];
      const word = last.continued ? layout.word : undefined;
      const broken = first.index !== last.line;
      const x = broken ? 0 : word?.x ?? last.x;
      layout.word = { x, width: first.x - x, size: Math.max(word?.size ?? 0, size), factor: Math.max(word?.factor ?? 0, factor), segments: broken ? [] : word?.segments ?? [] };
      if (!broken) wordFrom = word ? 0 : last.unit;
    } else if (last) layout.word = undefined;
    return { judgements, lines, wordFrom };
  };
  /**
   * A passage cut where its judgement or its line changes, and where the word
   * it ends in, which the next passage may go on, starts (`wordFrom`); its
   * visible parts kept for the lines below (of its last lines when laid out),
   * and with that word. Whole when its XML cannot be cut apart.
   */
  const segmentsOf = (raw: string, start: number, text: string, paragraph: Frame | undefined, layout: ParagraphLayout | null, judged?: { judgements: Judgement[]; lines: number[]; wordFrom: number }): Segment[] => {
    const groups: Array<{ from: number; to: number; judgement: Judgement; line: number }> = [];
    for (let index = 0; index < text.length && judged; index += 1) {
      const group = groups.at(-1);
      if (group && group.judgement === judged.judgements[index] && group.line === judged.lines[index] && index !== judged.wordFrom) group.to = index + 1;
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
        if (layout.word && judged && part.to > judged.wordFrom) layout.word.segments.push(segment);
        // In the body, a shape in front may cover any of them.
        if (paragraph?.body) (paragraph.shown ??= []).push(segment);
      } else if (paragraph) {
        // Its lines are not laid out: any of them may be its last.
        (paragraph.shown ??= []).push(segment);
      }
      if (bodyTable && held.textBoxes === 0) (bodyTable.shown ??= []).push(segment);
      return segment;
    });
  };
  const paintShape = ({ hex, scale, offset, alpha, shape }: NonNullable<Frame["colour"]>) => {
    const colour = hex && (scale === 1 && offset === 0 ? hex : withLightness(hex, lightness => lightness * scale + offset));
    // Partly transparent, it shows the page through it, as a VML fill.
    shape.paint = colour ? [alpha < 1 ? blend(pageColour, colour, alpha) : colour] : null;
    shape.opaque = colour !== undefined && alpha >= OPAQUE_FILL;
  };
  /** Records text set aside in its paragraph, or apart once the paragraph is read. */
  const record = (judgement: Judgement, text: string, paragraph: Frame | undefined) => {
    const passages = paragraph && !paragraph.closed ? paragraph.passages! : found;
    if (judgement.verdict === "invisible") passages.invisible.push(text);
    else passages.unverifiable.push({ text, reason: judgement.reason ?? "drawing" });
  };
  /** A shape once read (DrawingML anchor, VML shape): in front of the text without wrapping it, whose fill hides it, Word drawing it, it may cover the paragraphs of the body it reaches. */
  const coverByShape = (shape: Frame) => {
    const { front, box } = shape;
    if (front && !front.behind && front.wrapNone && front.opaque && box && !box.simple && !shape.offPage && !shape.hidden && drawnHere()) coverFrom(nearest("w:p"), { across: front.across, down: front.down, ...box });
  };
  /** Whether Word draws what is read here: not in a mc:Fallback whose mc:Choice it draws, nor in a mc:Choice it does not draw. */
  const drawnHere = () => {
    const alternate = openAlternate();
    const branch = stack[alternate + 1];
    return alternate === -1 || !branch || (branch.name === "mc:Choice" ? branch.chosen === true : stack[alternate]!.drawn === undefined);
  };
  /**
   * Where the run being read lies: in the copy mammoth reads of what Word draws from mc:Choice, which takes its place from the
   * choice (its own, its VML box's insets, does not count); whether its text is counted (mammoth reads text boxes from
   * mc:Fallback and VML only: what mc:Choice repeats, or a DrawingML text box holds, is not); its paragraph.
   */
  const runPlace = () => {
    const alternate = openAlternate();
    return {
      copy: alternate !== -1 && stack[alternate]!.drawn !== undefined && stack[alternate + 1]?.name === "mc:Fallback",
      recorded: unread === 0,
      paragraph: nearest("w:p"),
    };
  };
  /** Settles a segment once its run is read: cut out and recorded unless visible. */
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
    else if (table.grid?.length && !table.rightToLeft) {
      // Where each column of its grid starts, for its cells (placeCell).
      table.across = [most, least];
      table.gridStarts = [];
      table.grid.reduce((at, column) => (table.gridStarts!.push(at), at + column), 0);
    }
  };
  /**
   * Whether a cell of a table placed on the page starts beyond its right edge,
   * by the columns of its grid before it: with all margins (hidden in a fixed
   * table, unverifiable in one that fits its columns to its text), or with some
   * (unverifiable).
   */
  const placeCell = (cell: Frame, table: Frame): Pick<Frame, "offPage" | "unplaced"> => {
    const before = table.gridStarts?.[cell.gridColumn ?? 0];
    const across = table.page;
    if (!table.across || before === undefined || !across) return {};
    if (table.across[LEAST] + before >= across.width) return table.fixedLayout ? { offPage: true } : { unplaced: true };
    return table.across[MOST] + before >= across.width ? { unplaced: true } : {};
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
        // Off the page with some margins, or under a shape in front of the body (not in a text box, which may be drawn over it): unverifiable.
        const judgement = graver({ verdict: seen, reason: seen === "unverifiable" ? "drawing" : undefined }, held.unplaced > 0 || (held.covered > 0 && held.textBoxes === 0) ? OUT_OF_PLACE : VISIBLE);
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
          const styleMark = markFormats.get(frame.style ?? "") ?? markFormats.set(frame.style ?? "", Object.assign({}, styles.defaults, resolveStyle(styles, frame.style, "paragraph").run)).get(frame.style ?? "")!;
          const mark: RunLayer = frame.mark && Object.keys(frame.mark).length ? Object.assign({}, styleMark, frame.mark) : styleMark;
          const markSize = fontSize(mark, "");
          const layout = frame.layout;
          const above = spaceAbove(frame, content.above);
          // A hidden paragraph mark ends no line: what the paragraph shows goes on with the next one.
          if (hides(mark)) {
            if (layout) content.filled = [content.filled[MOST] + layout.lines[MOST].top, content.filled[LEAST] + layout.lines[LEAST].top];
            if (frame.body) bodyDown += layout ? layout.lines[LEAST].top : 0;
          } else {
            const height = (model: number) => {
              const line = layout!.lines[model]!;
              return above + line.top + lineHeight(format, line.size || markSize, model, line.objects, line.size ? line.factor : fontLine(mark));
            };
            if (layout) content.filled = [content.filled[MOST] + height(MOST), content.filled[LEAST] + height(LEAST)];
            // In the body, at the least its lines laid out, else one line of its mark.
            if (frame.body) bodyDown += layout ? height(LEAST) : above + lineFloor(format, markSize);
            const lastLine = layout?.lines[MOST].index;
            const segments = layout ? layout.pending.find(entry => entry.line === lastLine)?.segments : frame.shown;
            if (frame.inked) content.last = { tight: layout?.tight ?? false, segments: segments ?? [], gap: 0 };
            else if (content.last) content.last.gap += above + lineFloor(format, markSize);
            content.above = { style: styleOf(frame), after: format.after, contextual: format.contextual };
          }
        }
        if (frame.body) remember(frame);
      } else if (frame?.name === "w:pPr" && stack.at(-1)?.breakBefore) {
        // A page break before a paragraph whose mark is hidden: Word may not show the paragraph, nor its break.
        const paragraphFrame = stack.at(-1)!;
        const mark = Object.assign({}, styles.defaults, resolveStyle(styles, paragraphFrame.style, "paragraph").run, paragraphFrame.mark);
        breakColumn(paragraphFrame, 0, hides(mark));
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
          if (frame.bodyTop !== undefined) bodyDown += after + height[LEAST];
        }
        if (frame === bodyTable) {
          bodyTable = undefined;
          remember(frame);
        }
      } else if (frame?.name === "wps:wsp" && frame.opaque && stack.at(-1)?.name === "a:graphicData") {
        // A shape of its own (not in a group) whose fill hides what lies under it.
        const anchor = stack.findLast(item => item.name === "wp:anchor");
        if (anchor?.front) anchor.front.opaque = true;
      } else if (frame?.front && (frame.name === "wp:anchor" || frame.topShape)) {
        coverByShape(frame);
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
    if (tag.name === "w:p" && innermost()?.name === "w:body") {
      // In the body, after a column break, in the column it moved the text to: a new section, a new page starts again from the first.
      frame.body = true;
      if (columnBreaks.page !== frame.page) columnBreaks = { page: frame.page!, count: 0, shown: 0 };
      else if (columnBreaks.count > 0 || columnBreaks.shown > 0) Object.assign(frame, columnFlags());
    }
    if ((tag.name === "w:p" || tag.name === "w:tbl") && innermost()?.name === "w:body") {
      // Where it starts down the body, at the least: a shape in front of the text may cover it (coverFrom). Not on the stack yet: counted when it is.
      frame.bodyTop = bodyDown;
      if (bodyDown < coverUntil) frame.covered = true;
    }
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
      frame.cellTop = table?.cellTop ?? resolveStyle(styles, table?.style, "table").cellTop ?? 0;
      // The line above the row is above its first line, beyond its top margin.
      const above = table?.lineAbove ?? null;
      frame.inherited = above?.segments;
      frame.content = { filled: [frame.cellTop, frame.cellTop], last: above && { ...above, gap: above.gap + frame.cellTop } };
      if (row?.height?.rule === "exact") frame.room = [row.height.value, row.height.value];
      frame.fixed = Boolean(frame.room) || Boolean(innermost()?.fixed);
      frame.mergedRoom = mergedRooms.get(tag.start);
      // Not on the stack yet: counted as placed when it is (hold).
      if (table && row) Object.assign(frame, placeCell(frame, table));
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
      const turned = tag.name === "w:textDirection" && !ACROSS.test(tag.attributes.get("w:val") ?? "lrTb");
      if (tag.name === "w:vMerge") {
        // A cell merged with the rows below takes their height too: all of it when each is of exact height, else what its text needs.
        const merged = /^restart$/i.test(tag.attributes.get("w:val") ?? "") ? grandParent.mergedRoom : undefined;
        grandParent.room = typeof merged === "number" ? [merged, merged] : undefined;
        grandParent.merged = true;
      } else if (turned) {
        // Text run top to bottom goes down the height its rows give the cell, its lines one after the other across its width; without one, the cell grows with it.
        const height = grandParent.room?.[LEAST];
        grandParent.room = undefined;
        if (height !== undefined && grandParent.content) {
          budget.units -= 1;
          const across = widthOf(stack.length - 2, nearest("w:tbl")?.page ?? pageAt(0));
          grandParent.width = [Math.max(0, height - (grandParent.cellTop ?? 0)), height];
          grandParent.room = across;
          grandParent.content.filled = [0, 0];
          grandParent.content.last = null;
        }
      }
      if (tag.name === "w:vMerge" || turned) grandParent.fixed = Boolean(grandParent.room) || Boolean(innermost(innermost() === grandParent ? 1 : 0)?.fixed);
    }
    // A VML shape, not in a group (in one, below), of a set height and width (its text box's), unless its text grows it or does not wrap.
    if ((VML_SHAPES.has(tag.name) || tag.name === "v:group") && (parent?.name === "w:pict" || parent?.name === "w:object")) {
      const style = tag.attributes.get("style") ?? "";
      const height = FREE_VML_TEXT.test(style) ? undefined : vmlMeasure(style, "height");
      const width = vmlMeasure(style, "width");
      frame.topShape = true;
      frame.extent = height === undefined ? undefined : [height, height];
      frame.width = /mso-wrap-style\s*:\s*none/i.test(style) ? UNBOUNDED : width === undefined ? undefined : [width, width];
      // Placed on the page: in front of the text but at a negative z-index, without wrapping it unless its w10:wrap says so, where its style says.
      if (/(?:^|;)\s*position\s*:\s*absolute/i.test(style)) {
        const zIndex = Number(/(?:^|;)\s*z-index\s*:\s*(-?\d+)/i.exec(style)?.[1] ?? 0);
        const relative = (axis: string) => new RegExp(`(?:^|;)\\s*mso-position-${axis}-relative\\s*:\\s*([\\w-]+)`, "i").exec(style)?.[1];
        frame.front = { behind: zIndex < 0, wrapNone: true, opaque: false, across: relative("horizontal"), down: relative("vertical") };
        frame.box = { left: vmlLength(style, "margin-left") + vmlLength(style, "left"), top: vmlLength(style, "margin-top") + vmlLength(style, "top"), width: width ?? 0, height: vmlLength(style, "height") };
      }
    }
    // A shape of a VML group, of a size in the group's coordinates (its coordsize over the group's size), its text box's too, in points.
    const scale = parent?.name === "v:group" ? parent.groupScale : undefined;
    if ((VML_SHAPES.has(tag.name) || tag.name === "v:group") && scale) {
      const style = tag.attributes.get("style") ?? "";
      const units = (property: string) => {
        const value = Number(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*(-?[\\d.]+)\\s*(?:;|$)`, "i").exec(style)?.[1]);
        return Number.isFinite(value) ? Math.max(0, value) : undefined;
      };
      const height = units("height");
      const width = units("width");
      frame.topShape = true;
      frame.extent = height === undefined || FREE_VML_TEXT.test(style) ? undefined : [height * scale.down, height * scale.down];
      frame.width = /mso-wrap-style\s*:\s*none/i.test(style) ? UNBOUNDED : width === undefined ? undefined : [width * scale.across, width * scale.across];
    }
    if (tag.name === "v:group" && frame.topShape && frame.extent && frame.width && frame.width !== UNBOUNDED) {
      const [across, down] = (tag.attributes.get("coordsize") ?? "1000,1000").split(",").map(Number);
      if (across && down && across > 0 && down > 0) frame.groupScale = { across: frame.width[LEAST] / across, down: frame.extent[LEAST] / down };
    }
    // Its text box shows its text within its insets; text run top to bottom goes down its height, its lines one after the other across its width.
    if (tag.name === "v:textbox") {
      const shape = stack.findLast(item => item.topShape);
      const style = tag.attributes.get("style") ?? "";
      const insets = vmlInsets(tag.attributes.get("inset"));
      const vertical = VERTICAL_VML_TEXT.test(style);
      const turned = shape && vertical && shape.width !== UNBOUNDED ? turnedRoom(shape.extent?.[LEAST], shape.width?.[LEAST], insets) : undefined;
      if (shape && (FREE_VML_TEXT.test(style) || (vertical && !turned))) shape.extent = undefined;
      else if (shape && turned) shape.extent = turned.extent;
      else if (shape?.extent) shape.extent = [Math.max(0, shape.extent[LEAST] - insets.top - insets.bottom), shape.extent[LEAST]];
      if (shape && turned) shape.width = turned.width;
      else if (shape?.width && Number.isFinite(shape.width[LEAST])) shape.width = [Math.max(0, shape.width[LEAST] - insets.left - insets.right), shape.width[LEAST]];
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
    // A DrawingML text box shows its text within its insets, unless it grows with it or does not wrap; text run top to bottom goes down its height, its lines one after the other across its width.
    if (tag.name === "wps:wsp") {
      const box = drawingBoxes.get(tag.start);
      const holder = stack.findLast(item => item.name === "wp:anchor" || item.name === "wp:inline");
      if (holder && box) {
        const turned = box.vertical ? turnedRoom(holder.extent?.[LEAST], holder.width?.[LEAST], box.insets) : undefined;
        if (box.free) holder.extent = undefined;
        else if (turned) holder.extent = turned.extent;
        else if (holder.extent) holder.extent = [Math.max(0, holder.extent[LEAST] - box.insets.top - box.insets.bottom), holder.extent[LEAST]];
        if (box.unwrapped) holder.width = UNBOUNDED;
        else if (turned) holder.width = turned.width;
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
    // A shape Word does not draw (VML visibility:hidden, wp:docPr hidden) hides its text box, though LibreOffice draws it.
    if ((VML_SHAPES.has(tag.name) || tag.name === "v:group") && /(^|;)\s*visibility\s*:\s*hidden/i.test(tag.attributes.get("style") ?? "")) frame.hidden = true;
    if (tag.name === "wp:docPr" && (parent?.name === "wp:anchor" || parent?.name === "wp:inline") && /^(1|true|on)$/i.test(tag.attributes.get("hidden") ?? "")) placeOff(parent, { hidden: true });
    if (VML_SHAPES.has(tag.name)) {
      // What the shape does not set, its type (v:shapetype) does; one named but missing leaves its fill unknown.
      const typeName = tag.attributes.get("type")?.trim().replace(/^#/, "");
      const type = typeName ? vmlTypes.get(typeName) : undefined;
      const fill = fills.get(tag.start) ?? type?.fill;
      const attribute = (name: string) => tag.attributes.get(name) ?? type?.attributes.get(name);
      // As in VML, the colour of v:fill wins over the shape's fillcolor.
      const colour = (fill?.get("color") ?? attribute("fillcolor"))?.trim();
      const filled = !/^(f|false)$/i.test(attribute("filled") ?? "") && !/^(f|false)$/i.test(fill?.get("on") ?? "");
      // A fill that is not one colour (gradient, pattern, picture): what lies under may show, as under a DrawingML gradient.
      const solid = /^(solid)?$/i.test(fill?.get("type")?.trim() ?? "");
      // VML fills a shape in white unless it says otherwise; a picture (v:imagedata) is drawn instead, what lies under may show.
      const unset = colour === undefined && !vmlPictures.has(tag.start) && (!typeName || type !== undefined) ? "FFFFFF" : undefined;
      const known = !filled || !solid ? undefined : colour === undefined ? unset : vmlColour(colour);
      // A fill partly transparent (v:fill opacity) shows the page through it; a transparent one, the page.
      const opacity = vmlOpacity(fill?.get("opacity"));
      frame.paint = known ? [opacity < 1 ? blend(pageColour, known, opacity) : known] : null;
      if (frame.front) frame.front.opaque = known !== undefined && opacity >= OPAQUE_FILL;
      frame.offPage = vmlShapeIsOffPage(tag.attributes.get("style"), page);
      // Without content (nor w10:wrap), it is read whole here.
      if (frame.front && tag.selfClosing) coverByShape(frame);
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
    if (tag.name === "wp:anchor") {
      frame.box = { left: 0, top: 0, width: 0, height: 0, simple: /^(1|true|on)$/i.test(tag.attributes.get("simplePos") ?? "") };
      frame.front = { behind: /^(1|true|on)$/i.test(tag.attributes.get("behindDoc") ?? ""), wrapNone: false, opaque: false };
    }
    // Whether the shape wraps the text, from what it is placed across and down.
    if (parent?.front && parent.name === "wp:anchor") {
      if (tag.name === "wp:wrapNone") parent.front.wrapNone = true;
      if (tag.name === "wp:positionH") parent.front.across = tag.attributes.get("relativeFrom");
      if (tag.name === "wp:positionV") parent.front.down = tag.attributes.get("relativeFrom");
    }
    if (parent?.front && parent.topShape && tag.name.endsWith(":wrap")) parent.front.wrapNone = /^none$/i.test(tag.attributes.get("type") ?? "none");
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
      // A frame of the body its place across (w:x, from the page or its margin, without w:xAlign) puts beyond an edge of the page hides its paragraph.
      const x = tag.name === "w:framePr" && grandParent.body && !tag.attributes.has("w:xAlign") ? measurePt(tag.attributes.get("w:x"), 20) : undefined;
      const across = grandParent.page;
      if (x !== undefined && across) {
        const fromPage = /^page$/i.test(tag.attributes.get("w:hAnchor") ?? "");
        const least = (fromPage ? 0 : across.narrowestMargin) + x;
        const most = (fromPage ? 0 : across.widestMargin) + x;
        if (least >= across.width || (width !== undefined && width > 0 && most + width <= 0)) placeOff(grandParent, { offPage: true });
      }
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
      // Its columns laid from the right (w:bidiVisual): where each starts is not followed.
      if (tag.name === "w:bidiVisual" && !/^(0|false|off)$/i.test(tag.attributes.get("w:val") ?? "")) grandParent.rightToLeft = true;
    }
    if (tag.name === "w:gridCol" && parent?.name === "w:tblGrid" && grandParent?.name === "w:tbl") (grandParent.grid ??= []).push(Math.max(0, measurePt(tag.attributes.get("w:w"), 20) ?? 0));
    if (parent?.name === "w:rPr" && grandParent?.name === "w:r") {
      grandParent.effective = undefined;
      if (tag.name === "w:rStyle") grandParent.style = tag.attributes.get("w:val");
      else applyRunProperty(grandParent.layer!, tag, theme);
    }
    // In the body, a column break moves the text after it to the next column, a page break back to the first, on the next page.
    // Hidden, it moves nothing; deleted, Word may not apply it (as it shows the document's changes, or not), LibreOffice shows it.
    if (tag.name === "w:br" && parent?.name === "w:r" && /^(column|page)$/.test(tag.attributes.get("w:type") ?? "") && !hides(runFormat(parent))) {
      breakColumn(nearest("w:p"), tag.attributes.get("w:type") === "page" ? 0 : 1, held.deleted > 0);
    }
    if (tag.name === "w:pageBreakBefore" && parent?.name === "w:pPr" && grandParent?.name === "w:p") grandParent.breakBefore = !/^(0|false|off)$/i.test(tag.attributes.get("w:val") ?? "");
    // A Word 2010 text effect, its fill and its colour, in the formatting of a run or of a paragraph's mark.
    const effectAt = tag.name.startsWith("w14:") ? effectHolder(back => stack.at(-back)?.name) : -1;
    if (effectAt > 0) {
      const effectPath = stack.slice(stack.length - effectAt + 1).map(item => item.name);
      const owner = stack.at(-effectAt - 1);
      if (owner?.name === "w:r") {
        owner.effective = undefined;
        applyTextEffect(owner.layer!, effectPath, tag, theme);
      } else if (owner?.name === "w:pPr" && stack.at(-effectAt - 2)?.name === "w:p") {
        applyTextEffect(stack.at(-effectAt - 2)!.mark!, effectPath, tag, theme);
      }
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
      if (frame.name === "w:tbl" && frame.bodyTop !== undefined) bodyTable ??= frame;
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
 * Elements nested deeper than this in a part mammoth reads (the document, its
 * styles, numbering, notes, comments, relationships and content types), or in
 * a header or a footer, are not read. An honest CV nests a few tables, or a
 * text box in a table, some twenty levels at most; mammoth reads each level
 * within a call for the one holding it, so that some thousands of them
 * exhaust its stack, and some lookups of the layout check cost the nesting
 * depth for every run.
 */
export const DOCX_MAX_NESTING_DEPTH = 64;

/** The deepest nesting of elements in an XML part. */
function nestingDepth(tags: XmlTags) {
  let depth = 0;
  let deepest = 0;
  for (let index = 0; index < tags.count; index += 1) {
    if (tags.kind[index] === OPENING) deepest = Math.max(deepest, (depth += 1));
    else if (tags.kind[index] === CLOSING) depth = Math.max(0, depth - 1);
  }
  return deepest;
}

/** What mammoth reads of a document set aside whole: nothing. */
const EMPTY_DOCUMENT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>';

/**
 * The passages (w:t) of a document set aside whole, unverifiable, without
 * accusing anyone of hiding them: it, or a part read with it, is nested too
 * deep to be read (DOCX_MAX_NESTING_DEPTH).
 */
function deepPassages(xml: string, tags: XmlTags) {
  const unverifiableText: Array<{ text: string; reason: DocxUnverifiableReason }> = [];
  for (let index = 0; index < tags.count; index += 1) {
    if (tags.names[tags.name[index]!] === "w:t" && tags.kind[index] === OPENING && index + 1 < tags.count) {
      const text = decodeXml(xml.slice(tags.end[index], tags.start[index + 1]));
      if (text.trim()) unverifiableText.push({ text, reason: "nested" });
    }
  }
  return unverifiableText;
}

/** The relationships part of a part (word/document.xml: word/_rels/document.xml.rels). */
function relationshipsOf(part: string) {
  const folder = part.includes("/") ? part.slice(0, part.lastIndexOf("/")) : "";
  return `${folder ? `${folder}/` : ""}_rels/${part.slice(folder ? folder.length + 1 : 0)}.rels`;
}

/**
 * The DOCX to hand to mammoth, without its invisible text nor the text whose
 * visibility cannot be established (its background, its place); the text of
 * each, and why the latter was set aside. Also bounds the decompression
 * (inspectDocxArchive), the nesting of the parts read (DOCX_MAX_NESTING_DEPTH)
 * and the layout work (docxLayoutWorkUnits). An unchanged file is returned as
 * is.
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
  const tags = readXmlTags(xml);
  const folder = mainDocument.includes("/") ? mainDocument.slice(0, mainDocument.lastIndexOf("/")) : "";
  const relationships = relationshipsOf(mainDocument);
  // Each part as mammoth finds it: by the document's relationship, else at its usual place.
  const related = (type: string) => relatedPart(parts, relationships, `${RELATIONSHIPS}${type}`, folder) ?? `word/${type}.xml`;
  const stylesPart = related("styles");
  const numberingPart = related("numbering");
  const notes = [related("footnotes"), related("endnotes"), related("comments")];
  const read = ["[Content_Types].xml", "_rels/.rels", relationships, stylesPart, numberingPart, ...notes, ...notes.map(relationshipsOf), ...Array.from(parts.keys()).filter(name => HEADER_OR_FOOTER.test(name))];
  const tooDeep = read.filter(name => parts.has(name) && nestingDepth(readXmlTags(parts.get(name)!.toString("utf8"))) > DOCX_MAX_NESTING_DEPTH);
  if (tooDeep.length || nestingDepth(tags) > DOCX_MAX_NESTING_DEPTH) {
    // mammoth reads a part it is not given as empty, and the document at its usual place.
    for (const name of tooDeep) parts.delete(name);
    parts.delete(mainDocument);
    parts.set("word/document.xml", Buffer.from(EMPTY_DOCUMENT, "utf8"));
    return { buffer: storedZip(parts), invisibleText: [], unverifiableText: deepPassages(xml, tags) };
  }
  const themePart = relatedPart(parts, relationships, `${RELATIONSHIPS}theme`, folder) ?? "word/theme/theme1.xml";
  const settings = parts.get(related("settings"))?.toString("utf8");
  const theme = readTheme(parts.get(themePart)?.toString("utf8"), settings);
  // A picture behind the text in a header or a footer lies on every page, wherever the text falls.
  const onEveryPage = Array.from(parts.keys()).some(name => {
    if (!HEADER_OR_FOOTER.test(name)) return false;
    const margin = drawingReach(parts.get(name)!.toString("utf8"));
    return margin.fromPage || margin.reaches.length > 0;
  });
  // mammoth follows a list's numbering style (w:numStyleLink) for each of its paragraphs, link after link, and fails on one
  // that names no style: the text it reads does not depend on numbering, so it is given none then.
  const linkedNumbering = parts.get(numberingPart)?.includes("numStyleLink") ?? false;
  if (linkedNumbering) parts.delete(numberingPart);
  const budget = { units: limits.docxLayoutWorkUnits };
  const visible = cutInvisibleRuns(xml, readStyles(parts.get(stylesPart)?.toString("utf8"), theme), theme, onEveryPage, showsPageColour(settings), defaultTabStop(settings), budget, tags);
  if (!visible.cut && !linkedNumbering) return { buffer, invisibleText: [], unverifiableText: [] };
  parts.set(mainDocument, Buffer.from(visible.xml, "utf8"));
  return { buffer: storedZip(parts), invisibleText: visible.invisibleText, unverifiableText: visible.unverifiableText };
}
