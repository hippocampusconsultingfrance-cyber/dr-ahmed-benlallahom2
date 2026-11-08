import { randomBytes } from "node:crypto";
import { crc32 } from "node:zlib";
import { DOCUMENT_DECOMPRESSION_LIMITS, inspectDocxArchive } from "./documentDecompressionLimits";
import { DOCX_FONT_ALIASES, DOCX_FONT_AS_BASE, DOCX_FONT_AS_BEFORE, DOCX_FONT_AS_UPRIGHT, DOCX_FONT_CHARACTERS, DOCX_FONT_METRICS, DOCX_FONT_WIDTH_DIGITS, DOCX_SUBSTITUTE_FONTS } from "./docxFontMetrics";

/**
 * IA-04: the DOCX mammoth reads, with its lines where the PDF of the same
 * document has them, a line of the text being one place of evidence. mammoth
 * gives a paragraph on one line, a tab as a tab, a line break (w:br, w:cr) as
 * nothing at all, and each table cell on lines of its own; the PDF draws a line
 * break as a new line, a tab as a gap that textCellsAsLines reads as a line
 * break only when it is wide (from one em, the size of its line's text, when
 * twice as wide as any other gap of its line or from two and a half em), and
 * cells side by side with no wide gap between their texts on one line. So,
 * in the document's XML, before mammoth reads it:
 * - a tab, a line break or an absolute tab Word does not show (w:vanish,
 *   w:specVanish, w:webHidden, of the run's formats: the document's defaults,
 *   its paragraph style, its character style, its own; or in a field's
 *   instruction, between its begin and its separate) is written as nothing,
 *   and a paragraph whose mark is hidden is read with the next one of its
 *   container, as Word shows them;
 * - a line's end written in a run's text (a line feed, U+0085, U+2028,
 *   U+2029, \v, \f), which mammoth reads as one, is a space;
 * - each tab is laid out as Word lays it (the paragraph's tab stops, of its
 *   style and its own, the document's default ones, its indents, the width of
 *   the text before it, a right, centred or decimal stop by the text after it,
 *   the lines it wraps onto; from the right in a right-to-left paragraph) in
 *   two measures of the text, a narrow one and a wide one: its font's metrics
 *   (DOCX_FONT_METRICS) in both, or, for a font not measured, Liberation Sans
 *   Narrow and the bound of the fonts it may be, the narrow one at
 *   NARROW_SHARE of its widths (kerning); an ideograph one em, kana and hangul
 *   at most one, a letter of Arabic or Hebrew from a fifth of an em up to the
 *   widest its form is drawn in the usual faces (ARABIC_FORM_EM; an em at least
 *   in a font not known), the tab then decided by one stop in both; a picture
 *   in the line its extent; it is a line break when wide in both, a space otherwise, and
 *   always a space when what comes before it on its line, or the text it
 *   aligns, cannot be measured (a font of no bound, w:fitText, a floating
 *   picture, an object, a field's result, w:ptab, w:sym, a character no metric
 *   or bound gives, a list, a text box, a frame);
 * - each line break shown is a line break;
 * - table cells side by side whose texts lie on one line with no wide gap
 *   between them in one of the two measures at least are read as one line:
 *   each cell's one paragraph of text on one line, or the paragraphs of the
 *   same rank of cells of as many such paragraphs alike (style, spacing, size,
 *   vertical alignment); a gap that cannot be measured (a table that gives no
 *   widths) is never wide; other rows are left as they are. A table whose
 *   style may hide some cells' text (w:tblStylePr) has each row on one line.
 *   Cells and paragraphs laid out right to left (w:bidiVisual, w:bidi) are
 *   placed so;
 * - frames (w:framePr) side by side at one height, placed by w:x or by their
 *   alignment, are read as cells are, a drop cap with the paragraph it opens;
 *   text boxes drawn in a paragraph's line, of one line each, with its text,
 *   and floating ones side by side at one height as cells are; the columns of
 *   a section, each of one line at the top of the page, as cells are;
 * - of a mc:AlternateContent, the line breaks, tabs and paragraph ends of its
 *   mc:Fallback (what mammoth reads) that the mc:Choice Word draws has not,
 *   of the same letters, are a space.
 * WordprocessingML is read under whatever prefix the file binds to it, as
 * mammoth reads it. The markers that join lines are drawn anew at each reading
 * (the document cannot write them) and read back by joinMarkedLines. Past a
 * count of layout work, each tab is a space and each table row one line. A
 * .doc, or any tab this reading does not reach, is a space: one line, never
 * two. Only whitespace and the order of the cells' lines change.
 */

const TWIPS_PER_POINT = 20;
/** Word's default tab stops when the settings give none (720 twips). */
const DEFAULT_TAB_STOP_PT = 36;
/** A cell's side margins when its table gives none: Word's « Table Normal », 108 twips each. */
const CELL_MARGIN_PT = 5.4;
/** textCellsAsLines: a gap is wide from one em, when twice as wide as the others of its line, or from two and a half em. */
const CELL_GAP_EM = 1;
const LONE_CELL_GAP_EM = 2.5;
const OTHER_GAPS_FACTOR = 2;
/** pdf.js writes a gap narrower than this, in em, as a space in the text rather than as an item of its own. */
const SPACE_IN_FLOW_EM = 0.6;
/** Word's size when no style gives one (w:sz 20). */
const DEFAULT_SIZE_PT = 10;
/** The narrow measure of a font not measured, and the share of its widths the narrow measure takes (kerning, a renderer's). */
const NARROW_FONT = "liberation-sans-narrow";
const NARROW_SHARE = 0.95;
const MAIN_NAMESPACES = new Set(["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"]);
const NAMESPACES: Record<string, string> = {
  "http://schemas.openxmlformats.org/markup-compatibility/2006": "mc",
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing": "wp",
  "urn:schemas-microsoft-com:vml": "v",
};
/** Characters a CJK font draws one em wide (ideographs, full width forms), and those of a script it may draw narrower (kana, hangul). */
const FULL_WIDTH = new RegExp("[\\u1100-\\u115f\\u2e80-\\u303f\\u3400-\\u4dbf\\u4e00-\\u9fff\\ua960-\\ua97f\\uf900-\\ufaff\\ufe30-\\ufe4f\\uff01-\\uff60\\uffe0-\\uffe6\\u{20000}-\\u{3ffff}]", "u");
const KANA_OR_HANGUL = /[\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af]/;
/**
 * Letters of Arabic and Hebrew: no metric, at least a fifth of an em wide whatever their font; their marks, none. At most, by the
 * form the letter takes (joined to the next letter, its initial or medial form; else its final or isolated form, as the letters
 * that never join the next one take), the widest of DejaVu Sans, DejaVu Sans Bold and FreeSerif draw, a twentieth of an em more
 * (ARABIC_FORM_EM: seen 1.05 em joined and 1.45 em at the end of a word, beh 0.45 and 1.1…): LibreOffice draws a font it lacks
 * (Arial, Calibri…) in DejaVu Sans, and the usual faces Word draws Arabic in (Arial, Times New Roman, Tahoma, Segoe UI) are no
 * wider. A letter not listed, the widest; a Hebrew letter or a digit, HEBREW_LETTER_EM; and in a font this reading neither measures nor
 * bounds (a display or calligraphic face), never less than an em.
 */
const RIGHT_TO_LEFT_LETTER = /[\u0590-\u05ff\u0600-\u06ff\u0700-\u074f\u0750-\u077f\u08a0-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
const ARABIC_FORM_EM: ReadonlyArray<readonly [letters: RegExp, joined: number, final: number]> = [
  // Never joined to the next letter: alef, dal, thal, reh, zain, waw, teh marbuta, hamza, yeh barree, and their variants.
  [/[\u0621-\u0625\u0627\u0629\u062f-\u0632\u0648\u0671-\u0677\u0688-\u0699\u06c0\u06c3-\u06cb\u06cd\u06cf\u06d2\u06d3\u06d5]/, 0.75, 0.75],
  [/[\u0626\u0628\u062a\u062b\u0644\u0646\u0649\u064a\u066e\u0678-\u0680\u06b5-\u06bd\u06cc\u06ce\u06d0\u06d1]/, 0.45, 1.1],
  [/[\u062c-\u062e\u0681-\u0687]/, 0.75, 0.75],
  [/[\u0633-\u0636\u069a-\u069e\u06fa\u06fb]/, 1.05, 1.45],
  [/[\u0637\u0638\u069f]/, 1.0, 1.1],
  [/[\u0639\u063a\u06a0\u06fc]/, 0.75, 0.75],
  [/[\u0641\u06a1-\u06a6]/, 0.75, 1.25],
  [/[\u0642\u066f\u06a7\u06a8]/, 0.75, 0.95],
  [/[\u0643\u06a9-\u06b4]/, 0.65, 1.1],
  [/[\u0645]/, 0.7, 0.85],
  [/[\u0647\u06be\u06c1\u06c2]/, 0.75, 1.0],
];
const WIDEST_ARABIC_EM = 1.45;
/** Hebrew letters (of one form; DejaVu Sans Bold's widest, 0.76 em) and Arabic digits. */
const HEBREW_LETTER_EM = 0.8;
const HEBREW_OR_DIGIT = /[\u0590-\u05ff\ufb1d-\ufb4f\u0660-\u0669\u06f0-\u06f9]/;
/** The Arabic letters joined to the letter after them, in an initial or medial form, unless at the end of their word. */
const JOINING_LETTER = /[\u0626\u0628\u062a-\u062e\u0633-\u063a\u0640-\u0647\u0649\u064a\u066e\u066f\u0678-\u0687\u069a-\u06bf\u06c1\u06c2\u06cc\u06ce\u06d0\u06d1\u06fa-\u06fc\u0750-\u077f]/;
/** The letters an Arabic letter joins to when they follow it: a word goes on. */
const ARABIC_LETTER = /[\u0620-\u064a\u066e-\u06d3\u06fa-\u06fc\u0750-\u077f\u08a0-\u08ff]/;
/** The widest a letter of Arabic or Hebrew may be, in em, in this form; the widest Arabic for any other (a presentation form, a sign). */
function rightToLeftBound(character: string, joined: boolean) {
  if (HEBREW_OR_DIGIT.test(character)) return HEBREW_LETTER_EM;
  const form = ARABIC_LETTER.test(character) ? ARABIC_FORM_EM.find(([letters]) => letters.test(character)) : undefined;
  if (!form) return WIDEST_ARABIC_EM;
  return joined && JOINING_LETTER.test(character) ? form[1] : form[2];
}
const MARK = new RegExp("\\p{M}", "u");
/** A box's width in points, from a VML style (« width:9.9pt »); null when not given in a length. */
const UNITS: Record<string, number> = { pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, px: 0.75, pc: 12 };
function styleWidth(style: string | undefined) {
  const match = /(?:^|;)\s*width\s*:\s*([\d.]+)\s*(pt|in|cm|mm|px|pc)?\s*(?:;|$)/i.exec(style ?? "");
  return match ? Number(match[1]) * UNITS[(match[2] ?? "px").toLowerCase()]! : null;
}
/** A VML length in points (« 12pt », « 1.5cm », « 20 » in pixels); null when it is not one. */
function vmlLength(value: string | undefined) {
  const match = /^\s*(-?[\d.]+)\s*(pt|in|cm|mm|px|pc)?\s*$/i.exec(value ?? "");
  return match ? Number(match[1]) * UNITS[(match[2] ?? "px").toLowerCase()]! : null;
}
/**
 * A floating VML text box's place from its style (margin-left or left, margin-top or top, width) and its insets (v:textbox inset,
 * Word's 7.2 pt and 3.6 pt when none): its left edge, its top, its width, the frames they are measured from; none when one is not
 * a length, or the box is placed by an alignment (mso-position-horizontal) or turned.
 */
function floatingPlace(style: string | undefined, inset: string | undefined) {
  const properties = new Map<string, string>();
  for (const part of (style ?? "").split(";")) {
    const colon = part.indexOf(":");
    if (colon > 0) properties.set(part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim());
  }
  const left = vmlLength(properties.get("margin-left") ?? properties.get("left") ?? "0");
  const top = vmlLength(properties.get("margin-top") ?? properties.get("top") ?? "0");
  const width = vmlLength(properties.get("width"));
  if (left === null || top === null || width === null || !(width > 0)) return undefined;
  if (!["", "absolute"].includes((properties.get("mso-position-horizontal") ?? "").toLowerCase()) || Number(properties.get("rotation") ?? 0) !== 0) return undefined;
  const [insetLeft, insetTop, insetRight] = (inset ?? "7.2pt,3.6pt,7.2pt,3.6pt").split(",").map(value => vmlLength(value.trim() || "0"));
  if (insetLeft === null || insetTop === null || insetRight === null || insetLeft === undefined || insetTop === undefined || insetRight === undefined) return undefined;
  const frame = `${properties.get("mso-position-horizontal-relative") ?? "text"}|${properties.get("mso-position-vertical-relative") ?? "text"}`;
  return { left, top, width, frame, inset: [insetLeft, insetTop, insetRight] as [number, number, number] };
}
const SUBSTITUTES = new Set<string>([...Object.values(DOCX_SUBSTITUTE_FONTS), "listed-typewriter"].filter(key => key !== DOCX_SUBSTITUTE_FONTS.sans && key !== DOCX_SUBSTITUTE_FONTS.serif && key !== DOCX_SUBSTITUTE_FONTS.typewriter));
/** A line's end written in a run's text, literal or as a character reference: never a line of its own (\r, as LibreOffice shows it, aside). */
const LINE_END_IN_TEXT = /[\n\v\f\u0085\u2028\u2029]|&#(?:x0*(?:a|b|c|85|2028|2029)|0*(?:10|11|12|133|8232|8233));/gi;
/** Characters Word shows nothing of in a font's name. */
const UNSEEN_IN_NAMES = /[­​-‏⁠-⁤﻿]/g;
/** As docxVisibleText reads them: names of heavy or wide fonts not listed, of no bound; of typewriter and East Asian fonts. */
const HEAVY_NAME = /\b(black|heavy|ultra|extra ?bold|ultra ?bold|fat|wide|extended|expanded)\b/;
const TYPEWRITER_NAME = /\b(mono|monospaced?|code|courier|consolas|inconsolata|cascadia|typewriter|fixedsys|menlo|monaco)\b|lucida console|\bocr[- ]?[ab]\b/;
const EAST_ASIAN_NAME = /[぀-ヿ㐀-䶿一-鿿가-힯]|\bcjk\b|\bhan (sans|serif)\b|\bwenquanyi\b/;

const MEASURED_INDEX = new Map(Array.from(DOCX_FONT_CHARACTERS, (character, index) => [character, index] as const));
const MEASURED_BASES = Array.from(DOCX_FONT_CHARACTERS, character => MEASURED_INDEX.get(character.normalize("NFD")[0]!) ?? 0);
type FontStyle = "regular" | "bold" | "italic" | "boldItalic";
const decoded = new Map<string, number[]>();

/** The widths of a style of a font of DOCX_FONT_METRICS, in sizes of their text (as docxVisibleText reads them); 0 where it has none. */
function styleWidths(font: string, style: FontStyle): number[] {
  const key = `${font}:${style}`;
  const known = decoded.get(key);
  if (known) return known;
  const metrics = DOCX_FONT_METRICS[font]!;
  const digits = metrics[style];
  const upright = style === "italic" ? styleWidths(font, "regular") : style === "boldItalic" ? styleWidths(font, "bold") : undefined;
  if (digits === undefined) return upright!;
  const value = (at: number) => DOCX_FONT_WIDTH_DIGITS.indexOf(digits[at]!);
  const widths: number[] = [];
  for (let at = 0; at < digits.length; at += digits[at] === DOCX_FONT_AS_BASE ? 1 : 2) {
    if (digits[at] === DOCX_FONT_AS_UPRIGHT) for (let count = value(at + 1); count >= 0; count -= 1) widths.push(upright![widths.length] ?? 0);
    else if (digits[at] === DOCX_FONT_AS_BEFORE) for (let count = value(at + 1); count >= 0; count -= 1) widths.push(widths[widths.length - 1] ?? 0);
    else widths.push(digits[at] === DOCX_FONT_AS_BASE ? widths[MEASURED_BASES[widths.length]!] ?? 0 : (value(at) * DOCX_FONT_WIDTH_DIGITS.length + value(at + 1)) / 1000);
  }
  decoded.set(key, widths);
  return widths;
}

/** The fonts of DOCX_FONT_METRICS of the narrow and the wide measure of a font name; null for a font of no bound. */
type Measures = { narrow: string; wide: string } | null;
const measuresByName = new Map<string, Measures>();
function measuresOf(name: string | undefined): Measures {
  const key = (name ?? "").replace(UNSEEN_IN_NAMES, "").replace(/\s+/g, " ").trim().toLowerCase();
  const known = measuresByName.get(key);
  if (known !== undefined) return known;
  let measures: Measures;
  const alias = Object.hasOwn(DOCX_FONT_ALIASES, key) ? DOCX_FONT_ALIASES[key]! : Object.hasOwn(DOCX_FONT_METRICS, key) ? key : undefined;
  if (alias === DOCX_SUBSTITUTE_FONTS.unbounded || alias === DOCX_SUBSTITUTE_FONTS.symbol) measures = null;
  else if (alias !== undefined && Object.hasOwn(DOCX_FONT_METRICS, alias) && !SUBSTITUTES.has(alias)) measures = { narrow: alias, wide: alias };
  else if (alias !== undefined && Object.hasOwn(DOCX_FONT_METRICS, alias)) measures = { narrow: NARROW_FONT, wide: alias };
  else if (HEAVY_NAME.test(key)) measures = null;
  else measures = { narrow: NARROW_FONT, wide: TYPEWRITER_NAME.test(key) ? "listed-typewriter" : EAST_ASIAN_NAME.test(key) ? DOCX_SUBSTITUTE_FONTS.eastAsian : DOCX_SUBSTITUTE_FONTS.decorative };
  measuresByName.set(key, measures);
  return measures;
}

type RunFormat = {
  size?: number; ascii?: string; hAnsi?: string; asciiTheme?: string; hAnsiTheme?: string; hint?: string; bold?: boolean; italic?: boolean; caps?: boolean; smallCaps?: boolean;
  spacing?: number; scale?: number; vanish?: boolean; specVanish?: boolean; webHidden?: boolean; fitText?: boolean; cs?: boolean; rtl?: boolean; deleted?: boolean; rStyle?: string;
  csFont?: string; sizeCs?: number;
};
/** A frame's place (w:framePr): its left edge and width in points, what they are measured from, and its height as written. */
type Frame = { x?: number; width?: number; hAnchor: string; xAlign?: string; height: string; dropCap?: string };
type ParagraphFormat = {
  left?: number; right?: number; firstLine?: number; align?: string; tabs?: Array<[number, string]>; before?: string; after?: string; line?: string; lineRule?: string;
  numbered?: boolean; unmeasured?: boolean; bidi?: boolean; frame?: Frame;
};
type TableFormat = { left?: number; right?: number };
/** `conditionallyHidden`: a table style one of whose conditional formats (w:tblStylePr) hides text. */
type Style = { basedOn?: string; run: RunFormat; paragraph: ParagraphFormat; table: TableFormat; type?: string; conditionallyHidden?: boolean };

const hidden = (format: RunFormat) => Boolean(format.vanish || format.specVanish || format.webHidden);

/** An XML tag: its name with WordprocessingML's prefix read as w:, whatever prefix the file binds to it, and the prefix it is written with. */
type Tag = { name: string; prefix: string; closing: boolean; selfClosing: boolean; start: number; end: number; text: string; scope: Map<string, string>; attributes?: Map<string, string> };
const TAG = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTRIBUTE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const decodeXml = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
  const lower = entity.toLowerCase();
  if (lower.startsWith("#")) {
    const code = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : "";
  }
  return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[lower]!;
});
/** The text between two tags as an XML reader gives it: its character data as it is, without its comments, its entities read. */
const textOf = (raw: string) => raw.split(/(<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->)/).map(part => (part.startsWith("<![CDATA[") ? part.slice(9, -3) : part.startsWith("<!--") ? "" : decodeXml(part))).join("");

function canonical(qualified: string, scope: Map<string, string>, element: boolean) {
  const colon = qualified.indexOf(":");
  const prefix = colon === -1 ? "" : qualified.slice(0, colon);
  if (prefix === "" && !element) return qualified;
  const namespace = scope.get(prefix) ?? "";
  if (MAIN_NAMESPACES.has(namespace)) return `w:${qualified.slice(colon + 1)}`;
  const known = NAMESPACES[namespace];
  return known ? `${known}:${qualified.slice(colon + 1)}` : qualified;
}

/** Reads an XML part's tags one after the other, each once (none kept: a part may hold millions); null past the last. */
function tagReader(xml: string): () => Tag | null {
  const scopes: Array<Map<string, string>> = [new Map([["xml", "http://www.w3.org/XML/1998/namespace"]])];
  const pattern = new RegExp(TAG.source, "g");
  return () => {
    for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
      if (!match[2]) continue;
      const closing = match[1] === "/";
      const selfClosing = match[4] === "/";
      const text = match[3] ?? "";
      let scope = scopes[scopes.length - 1]!;
      if (!closing && text.includes("xmlns")) {
        ATTRIBUTE.lastIndex = 0;
        for (let attribute = ATTRIBUTE.exec(text); attribute; attribute = ATTRIBUTE.exec(text)) {
          const name = attribute[1]!;
          if (name !== "xmlns" && !name.startsWith("xmlns:")) continue;
          if (scope === scopes[scopes.length - 1]) scope = new Map(scope);
          scope.set(name === "xmlns" ? "" : name.slice(6), decodeXml(attribute[2] ?? attribute[3] ?? ""));
        }
      }
      const qualified = match[2];
      const colon = qualified.indexOf(":");
      if (closing) {
        if (scopes.length > 1) scopes.pop();
      } else if (!selfClosing) scopes.push(scope);
      return { name: canonical(qualified, scope, true), prefix: colon === -1 ? "" : qualified.slice(0, colon), closing, selfClosing, start: match.index, end: match.index + match[0].length, text, scope };
    }
    return null;
  };
}

/** A tag's attributes, by their names with WordprocessingML's prefix read as w:. */
function attributesOf(tag: Tag) {
  if (tag.attributes) return tag.attributes;
  const attributes = new Map<string, string>();
  ATTRIBUTE.lastIndex = 0;
  for (let attribute = ATTRIBUTE.exec(tag.text); attribute; attribute = ATTRIBUTE.exec(tag.text)) attributes.set(canonical(attribute[1]!, tag.scope, false), decodeXml(attribute[2] ?? attribute[3] ?? ""));
  tag.attributes = attributes;
  return attributes;
}
const attribute = (tag: Tag, name: string) => attributesOf(tag).get(name);

const twips = (value: string | undefined) => (value === undefined || !/^-?\d+(\.\d+)?$/.test(value.trim()) ? undefined : Number(value) / TWIPS_PER_POINT);
const onOff = (tag: Tag) => !["0", "false", "off", "none"].includes((attribute(tag, "w:val") ?? "true").toLowerCase());
/** Properties whose subtree only holds what a tracked change replaced: never read. */
const FORMER = /^w:(rPrChange|pPrChange|tblPrChange|tcPrChange|trPrChange|sectPrChange|tblGridChange|numberingChange)$/;

/** Reads a formatting element of a w:rPr into `run`, of a w:pPr into `paragraph`, of a w:tblPr's w:tblCellMar into `table`. */
function readFormat(tag: Tag, parent: string, grandParent: string, run: RunFormat, paragraph: ParagraphFormat, table: TableFormat) {
  const value = attribute(tag, "w:val");
  if (parent === "w:rPr") {
    if (tag.name === "w:sz") { const size = Number(value); if (size > 0) run.size = size / 2; }
    else if (tag.name === "w:szCs") { const size = Number(value); if (size > 0) run.sizeCs = size / 2; }
    else if (tag.name === "w:rFonts") {
      for (const key of ["ascii", "hAnsi", "asciiTheme", "hAnsiTheme", "hint"] as const) {
        const given = attribute(tag, `w:${key}`);
        if (given !== undefined) run[key] = given;
      }
      const complex = attribute(tag, "w:cs");
      if (complex !== undefined) run.csFont = complex;
      // A font named overrides the theme's of the same slot, and the other way round.
      if (attribute(tag, "w:ascii") !== undefined && attribute(tag, "w:asciiTheme") === undefined) run.asciiTheme = undefined;
      if (attribute(tag, "w:hAnsi") !== undefined && attribute(tag, "w:hAnsiTheme") === undefined) run.hAnsiTheme = undefined;
    } else if (tag.name === "w:b") run.bold = onOff(tag);
    else if (tag.name === "w:i") run.italic = onOff(tag);
    else if (tag.name === "w:caps") run.caps = onOff(tag);
    else if (tag.name === "w:smallCaps") run.smallCaps = onOff(tag);
    else if (tag.name === "w:vanish") run.vanish = onOff(tag);
    else if (tag.name === "w:specVanish") run.specVanish = onOff(tag);
    else if (tag.name === "w:webHidden") run.webHidden = onOff(tag);
    else if (tag.name === "w:cs") run.cs = onOff(tag);
    else if (tag.name === "w:rtl") run.rtl = onOff(tag);
    else if (tag.name === "w:fitText") run.fitText = true;
    else if (tag.name === "w:del" || tag.name === "w:moveFrom") run.deleted = true;
    else if (tag.name === "w:rStyle") run.rStyle = value;
    else if (tag.name === "w:spacing") { const spacing = twips(value); if (spacing !== undefined) run.spacing = spacing; }
    else if (tag.name === "w:w") { const scale = Number(value); if (scale > 0) run.scale = scale / 100; }
  } else if (parent === "w:pPr") {
    if (tag.name === "w:jc") paragraph.align = value;
    else if (tag.name === "w:ind") {
      const left = twips(attribute(tag, "w:left") ?? attribute(tag, "w:start"));
      const right = twips(attribute(tag, "w:right") ?? attribute(tag, "w:end"));
      if (left !== undefined) paragraph.left = left;
      if (right !== undefined) paragraph.right = right;
      const hanging = twips(attribute(tag, "w:hanging"));
      const firstLine = twips(attribute(tag, "w:firstLine"));
      if (hanging !== undefined) paragraph.firstLine = -hanging;
      else if (firstLine !== undefined) paragraph.firstLine = firstLine;
      // Indents in characters: of a width this reading does not know.
      if (["w:leftChars", "w:rightChars", "w:startChars", "w:endChars", "w:hangingChars", "w:firstLineChars"].some(name => Number(attribute(tag, name) ?? 0) !== 0)) paragraph.unmeasured = true;
    } else if (tag.name === "w:spacing") {
      paragraph.before = attribute(tag, "w:before") ?? paragraph.before;
      paragraph.after = attribute(tag, "w:after") ?? paragraph.after;
      paragraph.line = attribute(tag, "w:line") ?? paragraph.line;
      paragraph.lineRule = attribute(tag, "w:lineRule") ?? paragraph.lineRule;
    } else if (tag.name === "w:numPr") paragraph.numbered = true;
    else if (tag.name === "w:bidi") paragraph.bidi = onOff(tag);
    else if (tag.name === "w:framePr") {
      // Laid out in its frame: its tabs are spaces; read beside the frames at its height.
      paragraph.unmeasured = true;
      const width = twips(attribute(tag, "w:w"));
      paragraph.frame = {
        x: attribute(tag, "w:xAlign") === undefined ? twips(attribute(tag, "w:x")) : undefined, width: width && width > 0 ? width : undefined,
        hAnchor: attribute(tag, "w:hAnchor") ?? "column", xAlign: attribute(tag, "w:xAlign"),
        height: `${attribute(tag, "w:vAnchor") ?? "margin"}|${attribute(tag, "w:y") ?? ""}|${attribute(tag, "w:yAlign") ?? ""}`,
        dropCap: attribute(tag, "w:dropCap"),
      };
    } else if (tag.name === "w:textDirection") paragraph.unmeasured = true;
  } else if (parent === "w:numPr" && grandParent === "w:pPr" && tag.name === "w:numId") paragraph.numbered = value !== "0";
  else if (parent === "w:tabs" && tag.name === "w:tab") {
    const position = twips(attribute(tag, "w:pos"));
    if (position !== undefined) (paragraph.tabs ??= []).push([position, value ?? "left"]);
  } else if (parent === "w:tblCellMar" && (tag.name === "w:left" || tag.name === "w:start" || tag.name === "w:right" || tag.name === "w:end")) {
    const type = attribute(tag, "w:type");
    const margin = type === undefined || type === "dxa" ? twips(attribute(tag, "w:w")) : undefined;
    if (margin !== undefined) table[tag.name === "w:left" || tag.name === "w:start" ? "left" : "right"] = margin;
  }
}

/** The document's defaults and styles (word/styles.xml), and the default paragraph and table styles. */
function readStyles(xml: string | undefined) {
  const styles = new Map<string, Style>();
  const defaults: Style = { run: {}, paragraph: {}, table: {} };
  let defaultParagraph: string | undefined;
  let defaultTable: string | undefined;
  if (!xml) return { styles, defaults, defaultParagraph, defaultTable };
  const path: string[] = [];
  let current: Style | null = null;
  let former = 0;
  const next = tagReader(xml);
  for (let tag = next(); tag; tag = next()) {
    if (tag.closing) {
      path.pop();
      if (former > 0) {
        if (FORMER.test(tag.name)) former -= 1;
        continue;
      }
      if (tag.name === "w:style") current = null;
      continue;
    }
    if (!tag.selfClosing) path.push(tag.name);
    if (former > 0 || FORMER.test(tag.name)) {
      if (FORMER.test(tag.name) && !tag.selfClosing) former += 1;
      continue;
    }
    const parent = path[path.length - (tag.selfClosing ? 1 : 2)] ?? "";
    const grandParent = path[path.length - (tag.selfClosing ? 2 : 3)] ?? "";
    if (tag.name === "w:style") {
      const id = attribute(tag, "w:styleId");
      const type = attribute(tag, "w:type");
      current = { run: {}, paragraph: {}, table: {}, type };
      if (id) styles.set(id, current);
      const isDefault = ["1", "true", "on"].includes((attribute(tag, "w:default") ?? "0").toLowerCase());
      if (isDefault && type === "paragraph") defaultParagraph = id;
      if (isDefault && type === "table") defaultTable = id;
    } else if (tag.name === "w:basedOn" && current && parent === "w:style") current.basedOn = attribute(tag, "w:val");
    // A table style's conditional formats (w:tblStylePr), of some of its rows or cells, are not laid out: one that hides text
    // makes its tables' rows one line each, of tabs and line breaks as spaces (laidOutLineBreaks).
    if (path.includes("w:tblStylePr")) {
      if (current && parent === "w:rPr" && /^w:(vanish|specVanish|webHidden)$/.test(tag.name) && onOff(tag)) current.conditionallyHidden = true;
      continue;
    }
    const target = current ?? (path.includes("w:docDefaults") ? defaults : null);
    if (target) readFormat(tag, parent, grandParent, target.run, target.paragraph, target.table);
  }
  return { styles, defaults, defaultParagraph, defaultTable };
}

/** A style and the styles it is based on, the base first. */
function styleChain(styles: Map<string, Style>, id: string | undefined) {
  const chain: Style[] = [];
  const seen = new Set<string>();
  for (let at = id; at && !seen.has(at) && styles.has(at); at = styles.get(at)!.basedOn) {
    seen.add(at);
    chain.unshift(styles.get(at)!);
  }
  return chain;
}

/** The tab stops of these formats, each one's adding to, or clearing, those below; in order, without bar tabs, which stop no text. */
function tabStops(formats: ParagraphFormat[]) {
  const tabs = new Map<number, string>();
  for (const format of formats) for (const [position, kind] of format.tabs ?? []) if (kind === "clear") tabs.delete(position); else tabs.set(position, kind);
  return Array.from(tabs).filter(([, kind]) => kind !== "bar").sort((left, right) => left[0] - right[0]);
}


/** What a run's text, a tab or a line break of a paragraph is to its layout; `opaque`: what cannot be measured (a picture, a field's result…). */
type Piece =
  | { kind: "text"; text: string; format: RunFormat; opaque: boolean }
  | { kind: "tab"; start: number; end: number; prefix: string }
  /** A line break shown; `column`: a column break (w:br w:type="column"), the write of its line break. */
  | { kind: "break"; column?: Write }
  | { kind: "opaque" }
  /** A picture or a shape in the line, as wide as its extent (null when not known, or floating). */
  | { kind: "box"; width: number | null };
/** A paragraph of the XML: where its content starts (after its properties) and its end tag, the prefix it is written with. */
type Paragraph = {
  prefix: string; contentStart: number; end: number; pStyle?: string; own: ParagraphFormat; mark: RunFormat; pieces: Piece[]; runs: RunFormat[];
  text: boolean; container: Container; table: Table | null; row: number | null; inTextBox: boolean; section: number;
};
/** A section's properties (w:sectPr): its columns (w:cols and their w:col), how it starts (w:type), its page and margins. */
type Section = { cols?: Tag; columns: Tag[]; type?: string; pageSize?: Tag; pageMargins?: Tag; bidi: boolean };
/** A logical paragraph laid out in a measure: its lines, the width of its first, its size, and whether all of it was measured. */
type Laid = { lines: number; width: number; size: number; measured: boolean; known: boolean };
/** Paragraphs Word shows as one, the marks of all but the last hidden: what is laid out, and what lies on a cell's lines. */
type Logical = { parts: Paragraph[]; text: boolean; laid?: Record<Measure, Laid> };
type Measure = "narrow" | "wide";
type Container = { kind: "body" | "cell" | "box"; pending: Logical | null; cell: Cell | null; box?: Box };
/** A text box's content, the paragraph it is drawn in, and whether it lies in that paragraph's line (inline) or floats. */
/** `place`: a floating VML box's place, in points, from its style: its left edge, its top, its width, what they are measured from, its insets. */
type Box = { host: Paragraph | undefined; inline: boolean; logicals: Logical[]; place?: { left: number; top: number; width: number; frame: string; inset: [number, number, number] } };
type Cell = { width: number | null; span: number; margins: TableFormat; paragraphs: Logical[]; nested: boolean; vAlign: string; unmeasured: boolean };
type Row = { cells: Cell[]; gridBefore: number; table: Table };
type Table = { grid: number[]; margins: TableFormat; style?: string; row: Row | null; conditionallyHidden: boolean; rightToLeft: boolean };
/** A replacement of the XML between two offsets. */
type Write = { start: number; end: number; text: string };

/** Namespaces of Office and of the standard: Word draws a mc:Choice that requires only those (docxVisibleText's list holds them). */
const OFFICE_NAMESPACE = /^(http:\/\/schemas\.microsoft\.com\/office\/|http:\/\/schemas\.openxmlformats\.org\/|http:\/\/purl\.oclc\.org\/ooxml\/|urn:schemas-microsoft-com:)/;

/**
 * The line breaks (w:br, w:cr), tabs and paragraph ends of the mc:Fallback of each mc:AlternateContent (what mammoth reads) that
 * the mc:Choice Word draws has not where it has the same letters (its text without whitespace, as docxVisibleText compares them):
 * Word draws its choice, a line where the fallback has several. Each is given by where its tag starts in the XML: the breaks and
 * tabs to write as a space, the ends of paragraph to read with the next paragraph. The choice drawn is the first whose namespaces
 * are all Office's or the standard's, or that requires none (one Word may draw); none (Word draws the fallback), one of other
 * letters, or an alternate content within another one leaves the fallback as it is.
 */
function alternateBreaks(xml: string) {
  type Branch = { choice: boolean; drawn: boolean; letters: number; breaks: Array<{ letters: number; start: number; end: boolean }>; nested: boolean };
  const spaced = new Set<number>();
  const joined = new Set<number>();
  if (!/AlternateContent/.test(xml)) return { spaced, joined };
  const open: Array<{ branches: Branch[]; depth: number }> = [];
  const path: string[] = [];
  let textStart = -1;
  let skipping = 0;
  const next = tagReader(xml);
  for (let tag = next(); tag; tag = next()) {
    const branch = open.length ? open[open.length - 1]!.branches.at(-1) : undefined;
    const inBranch = branch && path.length > open[open.length - 1]!.depth + 1;
    if (tag.closing) {
      const depth = path.length;
      path.pop();
      if (skipping > 0) {
        if (tag.name === "w:del" || tag.name === "w:moveFrom" || FORMER.test(tag.name)) skipping -= 1;
        continue;
      }
      if (tag.name === "w:t" && textStart >= 0 && branch) branch.letters += textOf(xml.slice(textStart, tag.start)).replace(/\s+/g, "").length;
      if (tag.name === "w:t") textStart = -1;
      else if (tag.name === "w:p" && inBranch && branch) branch.breaks.push({ letters: branch.letters, start: tag.start, end: true });
      else if (tag.name === "mc:AlternateContent" && open.length && depth === open[open.length - 1]!.depth) {
        const { branches } = open.pop()!;
        const fallback = branches.find(item => !item.choice);
        const drawn = branches.find(item => item.choice && item.drawn);
        if (!fallback || !drawn || fallback.nested || drawn.nested || fallback.letters !== drawn.letters) continue;
        const kept = new Set(drawn.breaks.map(item => item.letters));
        for (const item of fallback.breaks) {
          if (item.letters <= 0 || item.letters >= fallback.letters || kept.has(item.letters)) continue;
          (item.end ? joined : spaced).add(item.start);
        }
      }
      continue;
    }
    if (!tag.selfClosing) path.push(tag.name);
    if (skipping > 0 || tag.name === "w:del" || tag.name === "w:moveFrom" || FORMER.test(tag.name)) {
      if (!tag.selfClosing) skipping += 1;
      continue;
    }
    if (tag.name === "mc:AlternateContent") {
      if (branch) branch.nested = true;
      if (!tag.selfClosing) open.push({ branches: [], depth: path.length });
    } else if ((tag.name === "mc:Choice" || tag.name === "mc:Fallback") && open.length && path.length === open[open.length - 1]!.depth + 1) {
      const required = (attribute(tag, "Requires") ?? "").split(/\s+/).filter(Boolean).map(prefix => tag.scope.get(prefix) ?? "");
      const branches = open[open.length - 1]!.branches;
      const choice = tag.name === "mc:Choice";
      // Word draws the first choice it understands: the next ones are never drawn.
      const earlier = branches.some(item => item.choice && item.drawn);
      branches.push({ choice, drawn: choice && !earlier && required.every(namespace => OFFICE_NAMESPACE.test(namespace)), letters: 0, breaks: [], nested: false });
    } else if (tag.name === "w:t" && branch) textStart = tag.selfClosing ? -1 : tag.end;
    else if ((tag.name === "w:br" || tag.name === "w:cr" || tag.name === "w:tab") && path[path.length - (tag.selfClosing ? 1 : 2)] === "w:r" && branch) {
      branch.breaks.push({ letters: branch.letters, start: tag.start, end: false });
    }
  }
  return { spaced, joined };
}

/** The markers of one reading: random, so that no text of the document is one. */
function markersOf(xml: string) {
  for (;;) {
    const token = Array.from(randomBytes(16), byte => (byte % 36).toString(36)).join("");
    if (!xml.includes(token)) return `\uE000${token}`;
  }
}

/**
 * The main document's XML with each tab, line break and hidden paragraph mark
 * of its paragraphs written as Word shows them, and the cells of a row whose
 * texts lie on one line marked to be joined, `marker` starting each marker.
 */
function laidOutLineBreaks(xml: string, parts: { styles?: string; settings?: string; theme?: string }, marker: string, units: number) {
  const { styles, defaults, defaultParagraph, defaultTable } = readStyles(parts.styles);
  const alternate = alternateBreaks(xml);
  const defaultTab = twips(/<(?:\w+:)?defaultTabStop\b[^>]*\b(?:\w+:)?val\s*=\s*"(\d+)"/.exec(parts.settings ?? "")?.[1]) || DEFAULT_TAB_STOP_PT;
  const themeFonts = new Map<string, string | undefined>();
  const themeFont = (name: string | undefined) => {
    if (!name) return undefined;
    const major = /^major/i.test(name) ? "major" : "minor";
    if (!themeFonts.has(major)) themeFonts.set(major, new RegExp(`<(?:\\w+:)?${major}Font>[\\s\\S]*?<(?:\\w+:)?latin\\b[^>]*\\btypeface\\s*=\\s*"([^"]*)"`).exec(parts.theme ?? "")?.[1]);
    return themeFonts.get(major);
  };
  // The page of the last section, as Word gives it to the body's text (read with the rest, below); columns, or characters snapped
  // to a grid, are not measured.
  let pageSize: Tag | undefined;
  let pageMargins: Tag | undefined;
  let columns: Tag | undefined;
  let grid: Tag | undefined;
  let textWidth = 0;
  let pageUnmeasured = false;

  /** What C0 and C2 write: hidden tabs and line breaks as nothing, shown line breaks as line breaks, hidden marks joined. */
  const kept: Write[] = [];
  /** How each tab is written, and the markers that join cells: dropped past the layout budget. */
  const laidOut: Write[] = [];
  const tabs: Array<Piece & { kind: "tab" }> = [];
  const written = (prefix: string, text: string) => {
    const name = prefix ? `${prefix}:` : "";
    return `<${name}t xml:space="preserve">${text}</${name}t>`;
  };
  const markerRun = (paragraph: Paragraph, kind: string) => {
    const name = paragraph.prefix ? `${paragraph.prefix}:` : "";
    return `<${name}r><${name}t xml:space="preserve">${marker}${kind}\uE001</${name}t></${name}r>`;
  };
  let budget = units;
  const spend = (count: number) => {
    budget -= count;
    return budget >= 0;
  };

  const baseFormats = new Map<string, RunFormat>();
  /** A run's formats: the document's defaults, its table's style, its paragraph's style, its character style, its own. */
  const runFormatOf = (paragraph: { pStyle?: string; table: Table | null }, own: RunFormat): RunFormat => {
    const key = `${paragraph.table?.style ?? ""}\u0000${paragraph.pStyle ?? ""}\u0000${own.rStyle ?? ""}`;
    let base = baseFormats.get(key);
    if (!base) {
      base = Object.assign(
        {},
        defaults.run,
        ...(paragraph.table ? styleChain(styles, paragraph.table.style ?? defaultTable) : []).map(style => style.run),
        ...styleChain(styles, paragraph.pStyle ?? defaultParagraph).map(style => style.run),
        ...styleChain(styles, own.rStyle).map(style => style.run),
      ) as RunFormat;
      baseFormats.set(key, base);
    }
    return Object.assign({}, base, own);
  };
  const paragraphFormat = (paragraph: Paragraph) => {
    const formats = [defaults.paragraph, ...styleChain(styles, paragraph.pStyle ?? defaultParagraph).map(style => style.paragraph), paragraph.own];
    return { merged: Object.assign({}, ...formats.map(format => ({ ...format, tabs: undefined }))) as ParagraphFormat, stops: tabStops(formats) };
  };

  /** The advance of a character, in sizes of its text, in a measure; null when no metric gives it. */
  const fontsOf = (format: RunFormat) => {
    const ascii = format.ascii ?? themeFont(format.asciiTheme);
    const hAnsi = format.hAnsi ?? themeFont(format.hAnsiTheme);
    return ascii === hAnsi ? [ascii] : [ascii, hAnsi];
  };
  /** A run of a complex script (w:cs, w:rtl): its text in its complex script font and size. */
  const complex = (format: RunFormat) => Boolean(format.cs || format.rtl);
  /** Whether the fonts that may draw a run's Arabic or Hebrew are all fonts this reading measures (not a bound nor a substitute). */
  const usualRightToLeftFonts = (format: RunFormat) => {
    const names = [format.csFont, ...fontsOf(format)].filter((name): name is string => Boolean(name));
    return names.length > 0 && names.every(name => {
      const measures = measuresOf(name);
      return measures !== null && measures.narrow === measures.wide;
    });
  };
  /** `atWordEnd`: no letter it joins to follows it (its final or isolated form). */
  const advance = (character: string, format: RunFormat, measure: Measure, atWordEnd = true): number | null => {
    const index = MEASURED_INDEX.get(character);
    if (index === undefined) {
      // No metric: an ideograph is one em in a CJK font, kana and hangul at most; a letter of Arabic or Hebrew lies between a fifth
      // of an em and its bound, its marks over it (bounds that only tell a gap wide in both measures).
      if (MARK.test(character)) return 0;
      if (FULL_WIDTH.test(character)) return 1;
      if (KANA_OR_HANGUL.test(character)) return measure === "wide" ? 1 : 0.8;
      if (RIGHT_TO_LEFT_LETTER.test(character)) {
        if (measure === "narrow") return 0.2;
        const bound = rightToLeftBound(character, !atWordEnd);
        return usualRightToLeftFonts(format) ? bound : Math.max(1, bound);
      }
      return null;
    }
    const style: FontStyle = format.bold ? (format.italic ? "boldItalic" : "bold") : format.italic ? "italic" : "regular";
    let result: number | null = null;
    for (const name of complex(format) ? [format.csFont] : fontsOf(format)) {
      const measures = measuresOf(name);
      if (!measures) return null;
      const width = styleWidths(measure === "wide" ? measures.wide : measures.narrow, style)[index] ?? 0;
      if (!(width > 0) && character !== "\u00ad") return null;
      result = result === null ? width : measure === "wide" ? Math.max(result, width) : Math.min(result, width);
    }
    if (result === null) return null;
    // A character beyond ASCII of a run hinted East Asian may be drawn in its East Asian font, one em at most.
    if (measure === "wide" && format.hint === "eastAsia" && character > "\u007f") result = Math.max(result, 1);
    return result * (measure === "wide" ? 1 : NARROW_SHARE);
  };
  /** A text's width in a run, in points, in a measure; null when it cannot be measured. */
  const widthOf = (text: string, format: RunFormat, measure: Measure): number | null => {
    if (hidden(format)) return 0;
    if (!spend(text.length)) return null;
    const size = format.size ?? DEFAULT_SIZE_PT;
    const sizeCs = format.sizeCs ?? size;
    const shown = format.caps || (measure === "wide" && format.smallCaps) ? text.toUpperCase() : text;
    let width = 0;
    const characters = Array.from(shown);
    for (let at = 0; at < characters.length; at += 1) {
      const character = characters[at]!;
      let next = at + 1;
      while (next < characters.length && MARK.test(characters[next]!)) next += 1;
      // At the end of a run, a letter is taken at its end of word: its widest form.
      const value = advance(character, format, measure, !(next < characters.length && ARABIC_LETTER.test(characters[next]!)));
      if (value === null) return null;
      width += value * (complex(format) || RIGHT_TO_LEFT_LETTER.test(character) ? sizeCs : size) * (format.scale ?? 1) + (format.spacing ?? 0);
    }
    return width;
  };
  /** Text whose letters are bounded rather than measured (Arabic, Hebrew, kana, hangul): a tab after it decided by one tab stop. */
  const bounded = (text: string) => RIGHT_TO_LEFT_LETTER.test(text) || KANA_OR_HANGUL.test(text);
  /** Letters fitted to a width (w:fitText): not measured. */
  const measurable = (format: RunFormat) => !format.fitText;

  /** Lays a logical paragraph out in both measures, decides each of its tabs, and says how it lies on its lines in each. */
  const layOut = (logical: Logical): Record<Measure, Laid> => {
    const first = logical.parts[0]!;
    const { merged, stops } = paragraphFormat(first);
    const pieces = logical.parts.flatMap(part => part.pieces);
    const cell = first.container.cell;
    const inner = cell && cell.width !== null ? cell.width - (cell.margins.left ?? CELL_MARGIN_PT) - (cell.margins.right ?? CELL_MARGIN_PT) : null;
    // A paragraph Word lays out in a way this reading does not follow: each of its tabs a space, never a line break.
    const notLaid = pageUnmeasured || Boolean(merged.unmeasured) || Boolean(merged.numbered) || first.inTextBox || logical.parts.length > 1
      || (first.table?.conditionallyHidden ?? false) || (cell !== null && (cell.unmeasured || inner === null));
    const left = merged.left ?? 0;
    const firstLine = merged.firstLine ?? 0;
    const column = Math.max(0, (merged.frame?.width ?? inner ?? textWidth) - (merged.right ?? 0));
    const fallbackSize = runFormatOf(first, first.mark).size ?? DEFAULT_SIZE_PT;
    const wideIn: Record<Measure, Set<Piece>> = { narrow: new Set(), wide: new Set() };
    // The stop each tab reaches in each measure: with letters bounded rather than measured, the same one in both.
    const stopIn: Record<Measure, Map<Piece, number>> = { narrow: new Map(), wide: new Map() };
    const boundedText = pieces.some(piece => piece.kind === "text" && bounded(piece.text));
    const sizeOf = (format: RunFormat) => (complex(format) ? format.sizeCs ?? format.size : format.size) ?? DEFAULT_SIZE_PT;
    const laid = {} as Record<Measure, Laid>;
    for (const measure of ["narrow", "wide"] as const) {
      // The width of the text after each piece up to the next tab or line break, and before its first decimal sign: for right,
      // centred and decimal stops, measured once from the end; null where it cannot be measured.
      const after: Array<{ width: number | null; beforeDecimal: number | null }> = new Array(pieces.length + 1);
      after[pieces.length] = { width: 0, beforeDecimal: null };
      for (let at = pieces.length - 1; at >= 0; at -= 1) {
        const piece = pieces[at]!;
        const next = after[at + 1]!;
        if (piece.kind === "tab" || piece.kind === "break") after[at] = { width: 0, beforeDecimal: null };
        else if (piece.kind === "box") {
          const own = piece.width;
          after[at] = { width: own === null || next.width === null ? null : own + next.width, beforeDecimal: own === null || next.beforeDecimal === null ? null : own + next.beforeDecimal };
        } else if (piece.kind === "opaque" || piece.opaque || !measurable(piece.format)) after[at] = { width: null, beforeDecimal: null };
        else {
          const own = widthOf(piece.text, piece.format, measure);
          const decimal = piece.text.search(/[.,]/);
          const width = own === null || next.width === null ? null : own + next.width;
          const beforeDecimal = decimal >= 0 ? widthOf(piece.text.slice(0, decimal), piece.format, measure) : next.beforeDecimal === null || own === null ? null : own + next.beforeDecimal;
          after[at] = { width, beforeDecimal };
        }
      }
      let line = 0;
      let position = left + firstLine;
      let placedOnLine = false;
      let lineMeasured = true;
      let measured = !notLaid;
      let known = true;
      let firstWidth = 0;
      const sizes: number[] = [];
      const laidTabs: Array<{ piece: Piece; line: number; width: number; measured: boolean }> = [];
      const newLine = () => {
        line += 1;
        position = left;
        placedOnLine = false;
        lineMeasured = true;
      };
      const unmeasured = () => {
        lineMeasured = false;
        measured = false;
        known = false;
      };
      pieces.forEach((piece, index) => {
        if (piece.kind === "break") return newLine();
        if (piece.kind === "opaque") return unmeasured();
        if (piece.kind === "box") {
          if (piece.width === null) return unmeasured();
          if (placedOnLine && position + piece.width > column + 0.01) newLine();
          if (line === 0) firstWidth = position + piece.width - (left + firstLine);
          placedOnLine = true;
          position += piece.width;
          return;
        }
        if (piece.kind === "tab") {
          const custom = stops.find(([stop]) => stop > position + 0.01);
          const hangingStop = firstLine < 0 && line === 0 && position < left - 0.01 ? left : Infinity;
          const [stop, kind] = custom && custom[0] <= hangingStop ? custom : hangingStop < Infinity ? [hangingStop, "left"] : [(Math.floor(position / defaultTab + 1e-6) + 1) * defaultTab, "left"];
          const aligned = kind === "right" || kind === "end" || kind === "center" || kind === "decimal";
          const next = after[index + 1]!;
          const target = Math.min(stop, Math.max(column, position));
          const text = kind === "decimal" ? (next.beforeDecimal ?? next.width) : kind === "center" ? (next.width === null ? null : next.width / 2) : next.width;
          const width = Math.max(0, aligned ? (text === null ? 0 : target - position - text) : target - position);
          laidTabs.push({ piece, line, width, measured: lineMeasured && !(aligned && text === null) });
          stopIn[measure].set(piece, stop);
          position += width;
          return;
        }
        if (piece.opaque || !measurable(piece.format)) unmeasured();
        for (const token of piece.text.match(/\s+|[^\s]+/g) ?? []) {
          const blank = /^\s/.test(token);
          const width = widthOf(token, piece.format, measure);
          if (width === null) {
            unmeasured();
            continue;
          }
          if (!blank && placedOnLine && position + width > column + 0.01) newLine();
          if (line === 0 && !blank) firstWidth = position + width - (left + firstLine);
          if (!blank && !hidden(piece.format)) {
            placedOnLine = true;
            sizes[line] = Math.max(sizes[line] ?? 0, sizeOf(piece.format));
          }
          position += width;
        }
      });
      // Each tab is wide in this measure as textCellsAsLines reads a gap; the other tabs of each line wider than a space, its widest
      // and the next, are found once for the line.
      const widestOf = new Map<number, { widest: number; count: number; next: number }>();
      for (const tab of laidTabs) {
        if (tab.width <= SPACE_IN_FLOW_EM * (sizes[tab.line] || fallbackSize)) continue;
        const seen = widestOf.get(tab.line) ?? { widest: 0, count: 0, next: 0 };
        if (tab.width > seen.widest) [seen.next, seen.widest, seen.count] = [seen.widest, tab.width, 1];
        else if (tab.width === seen.widest) seen.count += 1;
        else seen.next = Math.max(seen.next, tab.width);
        widestOf.set(tab.line, seen);
      }
      for (const tab of laidTabs) {
        const em = sizes[tab.line] || fallbackSize;
        const seen = widestOf.get(tab.line) ?? { widest: 0, count: 0, next: 0 };
        const others = tab.width > SPACE_IN_FLOW_EM * em && tab.width === seen.widest && seen.count === 1 ? seen.next : seen.widest;
        if (!notLaid && tab.measured && tab.width >= CELL_GAP_EM * em && (tab.width >= OTHER_GAPS_FACTOR * others || tab.width >= LONE_CELL_GAP_EM * em)) wideIn[measure].add(tab.piece);
      }
      let size = 0;
      for (const value of sizes) if (value) size = Math.max(size, value);
      laid[measure] = { lines: line + 1, width: firstWidth, size: size || fallbackSize, measured, known };
    }
    for (const piece of pieces) {
      if (piece.kind !== "tab") continue;
      const wide = wideIn.narrow.has(piece) && wideIn.wide.has(piece) && (!boundedText || stopIn.narrow.get(piece) === stopIn.wide.get(piece));
      laidOut.push({ start: piece.start, end: piece.end, text: written(piece.prefix, wide ? "&#10;" : " ") });
    }
    return laid;
  };

  /**
   * A row's cells side by side whose texts lie on one line with no wide gap between them in one measure at least (as
   * textCellsAsLines reads one), marked to be read as one line: each cell's one paragraph of text on one line, joined by a space;
   * or, of cells of as many such paragraphs alike (style, spacing, size, vertical alignment), the paragraphs of each rank
   * together. A gap not measured is never wide. Other cells stay lines of their own.
   */
  let groups = 0;
  const joinCells = (row: Row) => {
    type Placed = { cell: Cell; left: number; logical: Logical[]; kind: string; measured: boolean };
    const placed: Placed[] = [];
    let column = row.gridBefore;
    let at = row.table.grid.slice(0, row.gridBefore).reduce((total, value) => total + value, 0);
    let known = row.table.grid.length >= row.gridBefore;
    for (const cell of row.cells) {
      const start = at;
      // Where a cell starts along the row: after the columns before it, its own width if it gives one (Word's).
      const columns = row.table.grid.slice(column, column + cell.span);
      column += cell.span;
      const width = cell.width ?? (columns.length === cell.span && columns.every(value => value > 0) ? columns.reduce((total, value) => total + value, 0) : null);
      if (width === null) known = false;
      else at += width;
      const logical = cell.paragraphs.filter(paragraph => paragraph.text);
      if (cell.nested) {
        placed.push({ cell, left: start, logical, kind: "nested", measured: false });
        continue;
      }
      if (logical.length === 0 || logical.some(paragraph => !paragraph.laid)) continue;
      const oneLine = logical.every(paragraph => paragraph.laid!.narrow.lines === 1);
      const signature = logical.map(paragraph => {
        const { merged } = paragraphFormat(paragraph.parts[0]!);
        return [paragraph.parts[0]!.pStyle ?? "", merged.before ?? "", merged.after ?? "", merged.line ?? "", merged.lineRule ?? "", paragraph.laid!.narrow.size].join("|");
      }).join("/");
      const kind = !oneLine ? "other" : logical.length === 1 ? "one" : `${cell.vAlign}#${signature}`;
      const measured = known && !cell.unmeasured && logical.every(paragraph => paragraph.laid!.narrow.measured && paragraph.laid!.wide.measured);
      placed.push({ cell, left: start, logical, kind, measured });
    }
    /**
     * Where the text of a cell's paragraph starts and ends on the page, in a measure: from its cell's left edge (from the table's
     * right edge in a table laid out right to left, w:bidiVisual), on the side its alignment and direction give it (the start of a
     * right-to-left paragraph, w:bidi, is on its right).
     */
    const tableWidth = at;
    const edges = (item: Placed, line: number, measure: Measure) => {
      const paragraph = item.logical[line]!;
      const laid = paragraph.laid![measure];
      const { merged } = paragraphFormat(paragraph.parts[0]!);
      const cellLeft = row.table.rightToLeft ? tableWidth - item.left - item.cell.width! : item.left;
      const innerLeft = cellLeft + (item.cell.margins.left ?? CELL_MARGIN_PT);
      const innerRight = cellLeft + item.cell.width! - (item.cell.margins.right ?? CELL_MARGIN_PT);
      const startIndent = (merged.left ?? 0) + (merged.firstLine ?? 0);
      const endIndent = merged.right ?? 0;
      const align = merged.align ?? "start";
      const side = align === "center" ? "center" : align === "left" || align === "right" ? align : (align === "end") !== Boolean(merged.bidi) ? "right" : "left";
      const left = merged.bidi ? innerLeft + endIndent : innerLeft + startIndent;
      const right = merged.bidi ? innerRight - startIndent : innerRight - endIndent;
      const start = side === "left" ? left : side === "right" ? right - laid.width : (left + right - laid.width) / 2;
      return { start, end: start + laid.width };
    };
    /** The gap between two cells' texts, whichever lies on the left. */
    const between = (before: Placed, after: Placed, line: number, measure: Measure) => {
      const [one, other] = [edges(before, line, measure), edges(after, line, measure)];
      return one.start <= other.start ? other.start - one.end : one.start - other.end;
    };
    type Gap = { pair: number; widths: Record<Measure, number>; em: number };
    const gaps: Gap[] = [];
    for (let index = 1; index < placed.length; index += 1) {
      const [before, after] = [placed[index - 1]!, placed[index]!];
      if (before.kind !== after.kind || before.kind === "nested" || before.kind === "other") continue;
      for (let line = 0; line < before.logical.length; line += 1) {
        const widths = { narrow: NaN, wide: NaN };
        if (before.measured && after.measured) for (const measure of ["narrow", "wide"] as const) widths[measure] = between(before, after, line, measure);
        gaps.push({ pair: index, widths, em: Math.max(before.logical[line]!.laid!.narrow.size, after.logical[line]!.laid!.narrow.size) });
      }
    }
    if (!spend(gaps.length + row.cells.length)) return;
    // Wide in a measure as textCellsAsLines reads a gap; the other gaps of the row wider than a space, its widest and the next.
    const joined = new Set<number>();
    for (const measure of ["narrow", "wide"] as const) {
      let widest = 0;
      let count = 0;
      let next = 0;
      for (const gap of gaps) {
        const width = gap.widths[measure];
        if (!(width > SPACE_IN_FLOW_EM * gap.em)) continue;
        if (width > widest) [next, widest, count] = [widest, width, 1];
        else if (width === widest) count += 1;
        else next = Math.max(next, width);
      }
      for (const gap of gaps) {
        const width = gap.widths[measure];
        const others = width > SPACE_IN_FLOW_EM * gap.em && width === widest && count === 1 ? next : widest;
        const wide = width >= CELL_GAP_EM * gap.em && (width >= OTHER_GAPS_FACTOR * others || width >= LONE_CELL_GAP_EM * gap.em);
        if (!wide) joined.add(gap.pair);
      }
    }
    let run: Placed[] = [];
    const flushRun = () => {
      if (run.length >= 2) {
        if (run[0]!.kind === "one") {
          for (const item of run.slice(0, -1)) {
            const parts = item.logical[0]!.parts;
            const end = parts[parts.length - 1]!;
            laidOut.push({ start: end.end, end: end.end, text: markerRun(end, "S") });
          }
        } else {
          const group = groups;
          groups += 1;
          run.forEach((item, cell) => item.logical.forEach((paragraph, line) => {
            const part = paragraph.parts[0]!;
            laidOut.push({ start: part.contentStart, end: part.contentStart, text: markerRun(part, `R${group}.${line}.${cell}`) });
          }));
          const lastCell = run[run.length - 1]!.logical;
          const lastParts = lastCell[lastCell.length - 1]!.parts;
          const end = lastParts[lastParts.length - 1]!;
          laidOut.push({ start: end.end, end: end.end, text: markerRun(end, `E${group}`) });
        }
      }
      run = [];
    };
    placed.forEach((item, index) => {
      if (index > 0 && !joined.has(index)) flushRun();
      if (item.kind === "nested" || item.kind === "other") flushRun();
      else run.push(item);
    });
    flushRun();
  };

  /**
   * Paragraphs in frames (w:framePr) at one height side by side, one after the other in the document, with no wide gap between their
   * texts in one measure at least, as cells are: one line. A frame is placed by its w:x, or by its alignment (w:xAlign: left,
   * right, centre, inside or outside) in the page, its margins or its column, of its width (w:w, else its text's); its text in it
   * by its indent and its alignment. A gap not measured (a text not measured, a place not known) is never wide; the paragraphs of
   * one frame (the same place) are lines of their own. A drop cap (w:dropCap) is read with the paragraph it opens. Joined whatever
   * the budget.
   */
  const joinFrames = (all: Logical[]) => {
    type Framed = { logical: Logical; frame: Frame; merged: ParagraphFormat };
    const runs: Framed[][] = [];
    let previous: Framed | null = null;
    let dropCap: Logical | null = null;
    for (const logical of all) {
      const first = logical.parts[0]!;
      const { merged } = paragraphFormat(first);
      const inBody = !first.inTextBox && first.container.kind === "body";
      // A drop cap opens the next paragraph of text of the body; a table or a text box in between, none.
      if (dropCap && logical.text) {
        const parts = dropCap.parts;
        const end = parts[parts.length - 1]!;
        if (inBody) kept.push({ start: end.end, end: end.end, text: markerRun(end, "S") });
        dropCap = null;
      }
      const frame = logical.text && inBody ? merged.frame : undefined;
      if (frame && (frame.dropCap === "drop" || frame.dropCap === "margin")) {
        dropCap = logical;
        previous = null;
        continue;
      }
      if (!frame) {
        if (logical.text) previous = null;
        continue;
      }
      const framed = { logical, frame, merged };
      if (previous && previous.frame.height === frame.height) runs[runs.length - 1]!.push(framed);
      else runs.push([framed]);
      previous = framed;
    }
    const marginLeft = marginOf("left", 72) + marginOf("gutter", 0);
    const marginRight = marginOf("right", 72);
    /** Where a frame's text starts and ends on the page in a measure; NaN where not known. */
    const placedText = (framed: Framed, measure: Measure) => {
      const laid = framed.logical.laid?.[measure];
      if (!laid?.known) return { start: Number.NaN, end: Number.NaN };
      const { frame, merged } = framed;
      const [areaLeft, areaRight] = frame.hAnchor === "page" ? [0, pageWidth] : frame.hAnchor === "margin" ? [marginLeft, pageWidth - marginRight] : [marginLeft, marginLeft + textWidth];
      const indent = (merged.left ?? 0) + (merged.firstLine ?? 0);
      const width = frame.width ?? indent + laid.width + (merged.right ?? 0);
      const align = frame.xAlign;
      const x = frame.x !== undefined ? areaLeft + frame.x
        : align === "left" || align === "inside" ? areaLeft
        : align === "right" || align === "outside" ? areaRight - width
        : align === "center" ? (areaLeft + areaRight - width) / 2 : Number.NaN;
      const jc = merged.align ?? "left";
      const start = merged.bidi ? Number.NaN : jc === "right" || jc === "end" ? x + width - (merged.right ?? 0) - laid.width : jc === "center" ? x + (width - laid.width) / 2 : x + indent;
      return { start, end: start + laid.width };
    };
    for (const run of runs) {
      if (run.length < 2) continue;
      const gaps: Array<{ widths: Record<Measure, number>; stacked: boolean }> = [];
      const ems: number[] = [];
      for (let index = 1; index < run.length; index += 1) {
        const [one, other] = [run[index - 1]!, run[index]!];
        const stacked = one.frame.x === other.frame.x && one.frame.xAlign === other.frame.xAlign && one.frame.hAnchor === other.frame.hAnchor;
        const widths = { narrow: NaN, wide: NaN };
        for (const measure of ["narrow", "wide"] as const) {
          const [first, second] = [placedText(one, measure), placedText(other, measure)];
          widths[measure] = first.start <= second.start ? second.start - first.end : first.start - second.end;
        }
        gaps.push({ widths, stacked });
        ems.push(Math.max(one.logical.laid?.narrow.size ?? DEFAULT_SIZE_PT, other.logical.laid?.narrow.size ?? DEFAULT_SIZE_PT));
      }
      // Wide in a measure as textCellsAsLines reads a gap: the other gaps of the run, its widest and the next.
      const wide = { narrow: wideAmong(gaps.map(gap => gap.widths.narrow), ems), wide: wideAmong(gaps.map(gap => gap.widths.wide), ems) };
      gaps.forEach((gap, index) => {
        if (gap.stacked || (wide.narrow[index] && wide.wide[index])) return;
        const parts = run[index]!.logical.parts;
        const end = parts[parts.length - 1]!;
        kept.push({ start: end.end, end: end.end, text: markerRun(end, "S") });
      });
    }
  };
  /** Whether a gap is wide among these gaps as textCellsAsLines reads one, in a measure: the run's widest gap and the next. */
  const wideAmong = (widths: number[], ems: number[]) => {
    let widest = 0;
    let count = 0;
    let next = 0;
    for (const width of widths) {
      if (!(width > 0)) continue;
      if (width > widest) [next, widest, count] = [widest, width, 1];
      else if (width === widest) count += 1;
      else next = Math.max(next, width);
    }
    return widths.map((width, at) => {
      const others = width === widest && count === 1 ? next : widest;
      return width >= CELL_GAP_EM * ems[at]! && (width >= OTHER_GAPS_FACTOR * others || width >= LONE_CELL_GAP_EM * ems[at]!);
    });
  };
  /**
   * The columns of a section (w:cols of two or more) side by side at the top of their page: the text of each column (up to a column
   * break, w:br w:type="column"; or each paragraph of a section whose columns Word balances, the next section starting on its page),
   * when one line of one paragraph, read on one line with the next column's when no wide gap lies between their texts in one
   * measure at least (where each column starts, from w:cols; the text placed in it by its indents and alignment), at the same height
   * (no empty line above either, their spacing before within half an em), as cells and frames are; a gap not measured is never
   * wide. A section with a table, a frame or a text box, or laid out right to left, is left as it is. Joined whatever the budget.
   */
  const joinColumns = () => {
    sections.forEach((definition, number) => {
      const cols = definition.cols;
      const listed = definition.columns.map(column => ({ width: twips(attribute(column, "w:w")) ?? Number.NaN, space: twips(attribute(column, "w:space")) ?? 0 }));
      const equal = listed.length === 0 || !cols || !["0", "false", "off"].includes((attribute(cols, "w:equalWidth") ?? "1").toLowerCase());
      const count = equal ? Math.floor(Number((cols && attribute(cols, "w:num")) ?? 1)) || 1 : listed.length;
      if (count < 2 || count > 45 || definition.bidi) return;
      const inSection = paragraphs.filter(paragraph => paragraph.section === number);
      if (inSection.some(paragraph => paragraph.container.kind !== "body" || paragraph.inTextBox || paragraphFormat(paragraph).merged.frame)) return;
      const size = definition.pageSize ?? pageSize;
      const margins = definition.pageMargins ?? pageMargins;
      const margin = (side: string, fallback: number) => (margins && twips(attribute(margins, `w:${side}`))) ?? fallback;
      const left = margin("left", 72) + margin("gutter", 0);
      const width = ((size && twips(attribute(size, "w:w"))) ?? 612) - margin("left", 72) - margin("right", 72) - margin("gutter", 0);
      const lefts: number[] = [];
      const widths: number[] = [];
      if (equal) {
        const space = (cols && twips(attribute(cols, "w:space"))) ?? 36;
        const each = (width - (count - 1) * space) / count;
        for (let at = 0; at < count; at += 1) {
          lefts.push(left + at * (each + space));
          widths.push(each);
        }
      } else {
        let at = left;
        for (const column of listed) {
          lefts.push(at);
          widths.push(column.width);
          at += column.width + column.space;
        }
      }
      type Segment = { paragraph: Paragraph; pieces: Piece[]; start: boolean };
      type Column = { segments: Segment[]; before?: Write };
      let chunks: Column[] = [{ segments: [] }];
      for (const paragraph of inSection) {
        let from = 0;
        paragraph.pieces.forEach((piece, at) => {
          if (piece.kind !== "break" || !piece.column) return;
          chunks[chunks.length - 1]!.segments.push({ paragraph, pieces: paragraph.pieces.slice(from, at), start: from === 0 });
          chunks.push({ segments: [], before: piece.column });
          from = at + 1;
        });
        chunks[chunks.length - 1]!.segments.push({ paragraph, pieces: paragraph.pieces.slice(from), start: from === 0 });
      }
      const shown = (segment: Segment) => segment.pieces.some(piece => piece.kind === "text" && !hidden(piece.format) && piece.text.trim() !== "");
      if (chunks.length === 1) {
        if (sections[number + 1]?.type !== "continuous") return;
        chunks = inSection.filter(paragraph => paragraph.text).map(paragraph => ({ segments: [{ paragraph, pieces: paragraph.pieces, start: true }] }));
        if (chunks.length > count) return;
      }
      // Each column's one line: where its text starts and ends in its column in each measure, its size and its spacing before.
      const placed = chunks.map((chunk, index) => {
        const texts = chunk.segments.filter(shown);
        if (texts.length !== 1 || chunk.segments.indexOf(texts[0]!) !== chunk.segments.findIndex(segment => segment.paragraph === texts[0]!.paragraph)) return null;
        const segment = texts[0]!;
        if (chunk.segments.slice(0, chunk.segments.indexOf(segment)).some(other => other.paragraph !== segment.paragraph)) return null;
        if (segment.pieces.some(piece => piece.kind === "break")) return null;
        const { merged } = paragraphFormat(segment.paragraph);
        const column = widths[index % count]!;
        const indent = (merged.left ?? 0) + (segment.start ? merged.firstLine ?? 0 : 0);
        const end = merged.right ?? 0;
        let em = 0;
        const span: Record<Measure, { start: number; end: number }> = { narrow: { start: Number.NaN, end: Number.NaN }, wide: { start: Number.NaN, end: Number.NaN } };
        for (const measure of ["narrow", "wide"] as const) {
          let text = 0;
          for (const piece of segment.pieces) {
            if (piece.kind === "text") {
              const own = piece.opaque || !measurable(piece.format) ? null : widthOf(piece.text, piece.format, measure);
              text = own === null ? Number.NaN : text + own;
              if (!hidden(piece.format) && piece.text.trim()) em = Math.max(em, (complex(piece.format) ? piece.format.sizeCs ?? piece.format.size : piece.format.size) ?? DEFAULT_SIZE_PT);
            } else if (piece.kind === "box") text = piece.width === null ? Number.NaN : text + piece.width;
            else text = Number.NaN;
          }
          if (measure === "narrow" && text > column - indent - end + 0.01) return null;
          const align = merged.align ?? "left";
          const start = merged.bidi ? Number.NaN : align === "center" ? indent + (column - indent - end - text) / 2 : align === "right" || align === "end" ? column - end - text : indent;
          span[measure] = { start: lefts[index % count]! + start, end: lefts[index % count]! + start + text };
        }
        return { span, em: em || DEFAULT_SIZE_PT, before: twips(merged.before) ?? 0, segment };
      });
      // Side by side: two columns of the same page row.
      const pairs: number[] = [];
      for (let index = 0; index + 1 < chunks.length; index += 1) if ((index + 1) % count !== 0 && placed[index] && placed[index + 1]) pairs.push(index);
      if (pairs.length === 0) return;
      const gaps = { narrow: [] as number[], wide: [] as number[] };
      const ems: number[] = [];
      for (const index of pairs) {
        const [one, other] = [placed[index]!, placed[index + 1]!];
        const em = Math.max(one.em, other.em);
        ems.push(em);
        // Not at one height: apart.
        const level = Math.abs(one.before - other.before) <= 0.5 * em;
        for (const measure of ["narrow", "wide"] as const) gaps[measure].push(level ? other.span[measure].start - one.span[measure].end : Number.POSITIVE_INFINITY);
      }
      const wide = { narrow: wideAmong(gaps.narrow, ems), wide: wideAmong(gaps.wide, ems) };
      pairs.forEach((index, at) => {
        if (wide.narrow[at] && wide.wide[at]) return;
        const [one, other] = [placed[index]!.segment, placed[index + 1]!.segment];
        const columnBreak = chunks[index + 1]!.before;
        if (columnBreak) columnBreak.text = one.paragraph === other.paragraph ? written(one.paragraph.prefix, " ") : "";
        if (one.paragraph !== other.paragraph) kept.push({ start: one.paragraph.end, end: one.paragraph.end, text: markerRun(one.paragraph, "S") });
      });
    });
  };
  /**
   * Text boxes drawn in the line of a paragraph (inline: wp:inline, or a VML shape not placed), each of one paragraph of text on one
   * line: read on one line with the paragraph's text, as they are shown (mammoth writes them after it, a line each). Floating VML
   * boxes of one paragraph (its host holding no text of its own), each of one paragraph of text on one line in its width, placed in
   * the same frames at one height (their tops within half an em): read on one line, as cells and frames are, where no wide gap lies
   * between their texts in one measure at least (from each box's left edge, insets and alignment); when they lie apart, only those
   * side by side in the order they are written. Joined whatever the budget; a paragraph with a box of more lines is left as it is.
   */
  const joinBoxes = (all: Box[], every: Logical[]) => {
    const byHost = new Map<Paragraph, Box[]>();
    for (const box of all) {
      if (!box.host) continue;
      const found = byHost.get(box.host);
      if (found) found.push(box);
      else byHost.set(box.host, [box]);
    }
    const alone = new Set<Paragraph>();
    for (const logical of every) if (logical.parts.length === 1) alone.add(logical.parts[0]!);
    byHost.forEach((hosted, host) => {
      if (host.inTextBox || !alone.has(host)) return;
      const lines = hosted.map(box => box.logicals.filter(logical => logical.text));
      const oneLine = (at: number) => lines[at]!.length === 1 && (lines[at]![0]!.laid?.narrow.lines ?? 1) === 1 && lines[at]![0]!.parts.length === 1;
      if (!host.text && hosted.length > 1 && hosted.every((box, at) => !box.inline && box.place && box.place.frame === hosted[0]!.place!.frame && oneLine(at))) {
        // Floating boxes: each one's text where it lies in its box, the boxes left to right.
        const placed = hosted.map((box, at) => {
          const logical = lines[at]![0]!;
          const { merged } = paragraphFormat(logical.parts[0]!);
          const place = box.place!;
          const inner = place.width - place.inset[0] - place.inset[2];
          const span = (measure: Measure) => {
            const width = logical.laid?.[measure].known ? logical.laid[measure].width : Number.NaN;
            const indent = (merged.left ?? 0) + (merged.firstLine ?? 0);
            const jc = merged.align ?? "left";
            const start = place.left + place.inset[0] + (merged.bidi ? Number.NaN : jc === "right" || jc === "end" ? inner - (merged.right ?? 0) - width : jc === "center" ? (inner - width) / 2 : indent);
            return { start, end: start + width };
          };
          const fits = !(logical.laid?.narrow.known && logical.laid.narrow.width > inner + 0.01);
          return { at, logical, top: place.top + place.inset[1], spans: { narrow: span("narrow"), wide: span("wide") }, em: logical.laid?.narrow.size ?? DEFAULT_SIZE_PT, fits };
        });
        if (!placed.every(item => item.fits)) return;
        const ordered = [...placed].sort((left, right) => left.spans.narrow.start - right.spans.narrow.start || left.at - right.at);
        const gaps = { narrow: [] as number[], wide: [] as number[] };
        const ems: number[] = [];
        for (let index = 1; index < ordered.length; index += 1) {
          const [one, other] = [ordered[index - 1]!, ordered[index]!];
          const em = Math.max(one.em, other.em);
          ems.push(em);
          const level = Math.abs(one.top - other.top) <= 0.5 * em;
          for (const measure of ["narrow", "wide"] as const) gaps[measure].push(level ? other.spans[measure].start - one.spans[measure].end : Number.POSITIVE_INFINITY);
        }
        const wide = { narrow: wideAmong(gaps.narrow, ems), wide: wideAmong(gaps.wide, ems) };
        const together = ems.map((_, index) => !(wide.narrow[index] && wide.wide[index]));
        // Boxes side by side read together where written one after the other, or all of them when all lie on one line.
        const all = together.every(Boolean);
        ordered.slice(0, -1).forEach((item, index) => {
          const next = ordered[index + 1]!;
          if (!together[index] || (!all && next.at !== item.at + 1)) return;
          const end = (all ? placed[index]! : item).logical.parts[0]!;
          kept.push({ start: end.end, end: end.end, text: markerRun(end, "S") });
        });
        return;
      }
      if (!hosted.every((box, at) => box.inline && oneLine(at))) return;
      kept.push({ start: host.end, end: host.end, text: markerRun(host, "S") });
      lines.slice(0, -1).forEach(([logical]) => {
        const end = logical!.parts[0]!;
        kept.push({ start: end.end, end: end.end, text: markerRun(end, "S") });
      });
    });
  };

  // Walk the document: paragraphs (those of text boxes in their own), their runs, the cells they lie in.
  const path: string[] = [];
  const open: Paragraph[] = [];
  const containers: Container[] = [{ kind: "body", pending: null, cell: null }];
  const tables: Table[] = [];
  const paragraphs: Paragraph[] = [];
  const logicals: Logical[] = [];
  const rows: Row[] = [];
  const outerRows = new Map<number, Paragraph[]>();
  let rowCount = 0;
  /** The sections read, by number: a paragraph's is the one whose w:sectPr ends it or comes after it. */
  const sections: Section[] = [];
  let section: { definition: Section; inParagraph: boolean } | null = null;
  let sectionNumber = 0;
  let outerRow: number | null = null;
  let skipping = 0;
  let textStart = -1;
  let fieldResult = 0;
  const fields: string[] = [];
  /** The picture or shape of the run being read, sized by its extent or its style; whether the shape read last lies in the line. */
  let drawing: { piece: Piece & { kind: "box" }; decided: boolean } | null = null;
  let shapeInline: boolean | null = null;
  /** The style and the insets of the VML shape read last, for the place of its text box. */
  let shapeStyle: string | undefined;
  let shapeInset: string | undefined;
  const boxes: Box[] = [];
  /** Elements whose replacement ends at their end tag. */
  const closing: Array<{ name: string; write: { end: number } }> = [];
  const settle = (logical: Logical) => {
    logicals.push(logical);
    logical.parts[0]!.container.cell?.paragraphs.push(logical);
    logical.parts[0]!.container.box?.logicals.push(logical);
  };
  const flush = (container: Container) => {
    if (container.pending) settle(container.pending);
    container.pending = null;
  };
  const skipped = (name: string) => name === "w:del" || name === "w:moveFrom" || name === "mc:Choice" || FORMER.test(name);
  const next = tagReader(xml);
  for (let tag = next(); tag; tag = next()) {
    if (!tag.closing) {
      if (tag.name === "w:pgSz") pageSize = tag;
      else if (tag.name === "w:pgMar") pageMargins = tag;
      else if (tag.name === "w:cols") columns = tag;
      else if (tag.name === "w:docGrid") grid = tag;
    }
    if (tag.closing) {
      if (skipping > 0) {
        path.pop();
        if (skipped(tag.name)) skipping -= 1;
        continue;
      }
      const paragraph = open[open.length - 1];
      const pending = closing[closing.length - 1];
      if (pending && pending.name === tag.name) {
        pending.write.end = tag.end;
        closing.pop();
      }
      if (tag.name === "w:pPr" && path[path.length - 2] === "w:p" && paragraph) paragraph.contentStart = tag.end;
      path.pop();
      if (tag.name === "w:t" && textStart >= 0) {
        const run = paragraph?.runs[paragraph.runs.length - 1];
        if (paragraph && run && !fields.includes("instruction")) {
          const format = runFormatOf(paragraph, run);
          const raw = xml.slice(textStart, tag.start);
          // The characters of a line's end written in a run's text (a line feed, U+0085, U+2028, U+2029, \v, \f): one line, as Word
          // and LibreOffice show them, a space where mammoth would read a line.
          const spaced = raw.replace(LINE_END_IN_TEXT, " ");
          if (spaced !== raw) kept.push({ start: textStart, end: tag.start, text: spaced });
          const text = textOf(spaced);
          paragraph.pieces.push({ kind: "text", text, format, opaque: fieldResult > 0 });
          if (!hidden(format) && text.trim() !== "") paragraph.text = true;
        }
        textStart = -1;
      } else if (tag.name === "w:p" && paragraph) {
        open.pop();
        paragraph.end = tag.start;
        paragraphs.push(paragraph);
        const container = paragraph.container;
        const before = container.pending;
        // Joined to the paragraphs before it in place: a chain of hidden marks stays linear.
        const logical: Logical = before ?? { parts: [], text: false };
        logical.parts.push(paragraph);
        logical.text = logical.text || paragraph.text;
        // Read with the paragraph before it, whose mark Word hides: nothing between them.
        if (before) {
          const previous = before.parts[before.parts.length - 2]!;
          kept.push({ start: previous.end, end: previous.end, text: markerRun(previous, "N") });
        }
        container.pending = null;
        const mark = runFormatOf(paragraph, paragraph.mark);
        if (hidden(mark) || mark.deleted) container.pending = logical;
        else settle(logical);
        // Of a mc:Fallback, a paragraph's end where the mc:Choice Word draws goes on along its line: read with the next paragraph.
        if (alternate.joined.has(tag.start)) kept.push({ start: paragraph.end, end: paragraph.end, text: markerRun(paragraph, "S") });
      } else if (tag.name === "w:tc" || tag.name === "w:txbxContent") {
        const container = containers.pop();
        if (container) flush(container);
      } else if (tag.name === "w:tr") {
        const table = tables[tables.length - 1];
        if (table?.row) {
          // Each cell's width: its own (w:tcW in twips), else its columns' (w:gridCol, from w:gridBefore, by w:gridSpan).
          let column = table.row.gridBefore;
          for (const cell of table.row.cells) {
            const columns = table.grid.slice(column, column + cell.span);
            if (cell.width === null && columns.length === cell.span && columns.every(value => value > 0)) cell.width = columns.reduce((total, value) => total + value, 0);
            column += cell.span;
          }
          rows.push(table.row);
        }
        if (table) table.row = null;
        if (tables.length === 1) outerRow = null;
      } else if (tag.name === "w:tbl") tables.pop();
      else if (tag.name === "w:sectPr" && section) {
        sections[sectionNumber] = section.definition;
        if (section.inParagraph) sectionNumber += 1;
        section = null;
      } else if (tag.name === "w:drawing" || tag.name === "w:pict") drawing = null;
      else if (tag.name === "w:r") paragraph?.runs.pop();
      else if (tag.name === "w:fldSimple") fieldResult = Math.max(0, fieldResult - 1);
      continue;
    }
    if (!tag.selfClosing) path.push(tag.name);
    if (skipping > 0) {
      if (!tag.selfClosing && skipped(tag.name)) skipping += 1;
      continue;
    }
    if (skipped(tag.name)) {
      if (!tag.selfClosing) skipping = 1;
      continue;
    }
    const parent = path[path.length - (tag.selfClosing ? 1 : 2)] ?? "";
    const grandParent = path[path.length - (tag.selfClosing ? 2 : 3)] ?? "";
    const paragraph = open[open.length - 1];
    const container = containers[containers.length - 1]!;
    const table = tables[tables.length - 1];
    if (tag.name === "w:sectPr") {
      section = { definition: { columns: [], bidi: false }, inParagraph: path.includes("w:pPr") && paragraph !== undefined };
      if (tag.selfClosing) {
        sections[sectionNumber] = section.definition;
        if (section.inParagraph) sectionNumber += 1;
        section = null;
      }
    } else if (section && parent === "w:sectPr") {
      if (tag.name === "w:cols") section.definition.cols = tag;
      else if (tag.name === "w:type") section.definition.type = attribute(tag, "w:val");
      else if (tag.name === "w:pgSz") section.definition.pageSize = tag;
      else if (tag.name === "w:pgMar") section.definition.pageMargins = tag;
      else if (tag.name === "w:bidi") section.definition.bidi = onOff(tag);
    } else if (section && parent === "w:cols" && tag.name === "w:col") section.definition.columns.push(tag);
    else if (tag.name === "w:tbl") {
      flush(container);
      if (container.cell) container.cell.nested = true;
      tables.push({ grid: [], margins: {}, row: null, conditionallyHidden: false, rightToLeft: false });
    } else if (tag.name === "w:tblStyle" && parent === "w:tblPr" && table) {
      table.style = attribute(tag, "w:val");
      table.conditionallyHidden = styleChain(styles, table.style).some(style => style.conditionallyHidden);
    } else if (tag.name === "w:bidiVisual" && parent === "w:tblPr" && table) table.rightToLeft = onOff(tag);
    else if (tag.name === "w:gridCol" && parent === "w:tblGrid" && table) table.grid.push(twips(attribute(tag, "w:w")) ?? 0);
    else if (parent === "w:tblCellMar" && grandParent === "w:tblPr" && table) readFormat(tag, parent, grandParent, {}, {}, table.margins);
    else if (tag.name === "w:tr" && table) {
      table.row = { cells: [], gridBefore: 0, table };
      rowCount += 1;
      if (tables.length === 1) outerRow = rowCount;
    } else if (tag.name === "w:gridBefore" && parent === "w:trPr" && table?.row) table.row.gridBefore = Math.max(0, Number(attribute(tag, "w:val")) || 0);
    else if (tag.name === "w:tc") {
      // The cell's margins: its own (w:tcMar), its table's, its table style's, the default table style's, else Word's.
      const margins = Object.assign({}, ...styleChain(styles, defaultTable).map(style => style.table), ...styleChain(styles, table?.style).map(style => style.table), table?.margins ?? {}) as TableFormat;
      const cell: Cell = { width: null, span: 1, margins, paragraphs: [], nested: false, vAlign: "top", unmeasured: false };
      table?.row?.cells.push(cell);
      containers.push({ kind: "cell", pending: null, cell });
    } else if (tag.name === "w:txbxContent") {
      flush(container);
      const box: Box = { host: paragraph, inline: shapeInline ?? false, logicals: [], place: shapeInline === false ? floatingPlace(shapeStyle, shapeInset) : undefined };
      boxes.push(box);
      containers.push({ kind: "box", pending: null, cell: null, box });
    } else if (parent === "w:tcMar" && grandParent === "w:tcPr" && container.cell) readFormat(tag, "w:tblCellMar", "w:tblPr", {}, {}, container.cell.margins);
    else if (tag.name === "w:gridSpan" && parent === "w:tcPr" && container.cell) container.cell.span = Math.max(1, Number(attribute(tag, "w:val")) || 1);
    else if (tag.name === "w:vAlign" && parent === "w:tcPr" && container.cell) container.cell.vAlign = attribute(tag, "w:val") ?? "top";
    else if (tag.name === "w:textDirection" && parent === "w:tcPr" && container.cell) container.cell.unmeasured = !["lrTb", "tb", "lrTbV"].includes(attribute(tag, "w:val") ?? "lrTb");
    else if (tag.name === "w:tcW" && parent === "w:tcPr" && container.cell) {
      const type = attribute(tag, "w:type");
      const width = type === "dxa" || type === undefined ? twips(attribute(tag, "w:w")) : undefined;
      if (width !== undefined && width > 0) container.cell.width = width;
    } else if (tag.name === "w:p") {
      const created: Paragraph = {
        prefix: tag.prefix, contentStart: tag.end, end: tag.end, own: {}, mark: {}, pieces: [], runs: [], text: false, container,
        table: container.kind === "cell" ? table ?? null : null, row: outerRow, inTextBox: containers.some(value => value.kind === "box"),
        section: sectionNumber,
      };
      if (outerRow !== null) {
        const inRow = outerRows.get(outerRow);
        if (inRow) inRow.push(created);
        else outerRows.set(outerRow, [created]);
      }
      if (tag.selfClosing) {
        created.end = tag.start;
        paragraphs.push(created);
        settle({ parts: [created], text: false });
      } else open.push(created);
    } else if (!paragraph) continue;
    else if (tag.name === "wp:inline" || tag.name === "wp:anchor") {
      // A picture or a shape in the line, as wide as its extent; floating, of no width there that this reading knows.
      shapeInline = tag.name === "wp:inline";
      if (drawing && !drawing.decided && !shapeInline) drawing.decided = true;
    } else if (tag.name === "wp:extent" && parent === "wp:inline") {
      const width = Number(attribute(tag, "cx")) / 12700;
      if (drawing && !drawing.decided && width > 0) [drawing.piece.width, drawing.decided] = [width, true];
    } else if (tag.name === "v:textbox" && path.includes("w:pict")) shapeInset = attribute(tag, "inset");
    else if (tag.name.startsWith("v:") && path.includes("w:pict") && attribute(tag, "style") !== undefined) {
      // A VML shape: in the line unless placed (position:absolute), as wide as its style says.
      const style = attribute(tag, "style");
      shapeInline = !/position\s*:\s*absolute/i.test(style ?? "");
      shapeStyle = style;
      shapeInset = undefined;
      if (drawing && !drawing.decided) [drawing.piece.width, drawing.decided] = [shapeInline ? styleWidth(style) : null, true];
    } else if (tag.name === "w:pPr" && parent === "w:p") {
      if (tag.selfClosing) paragraph.contentStart = tag.end;
    } else if (tag.name === "w:pStyle" && parent === "w:pPr") paragraph.pStyle = attribute(tag, "w:val");
    else if (parent === "w:rPr" && grandParent === "w:pPr") readFormat(tag, parent, grandParent, paragraph.mark, {}, {});
    else if (parent === "w:pPr" || (parent === "w:tabs" && grandParent === "w:pPr") || (parent === "w:numPr" && grandParent === "w:pPr")) readFormat(tag, parent, grandParent, {}, paragraph.own, {});
    else if (tag.name === "w:r") paragraph.runs.push({});
    else if (parent === "w:rPr" && grandParent === "w:r" && paragraph.runs.length) readFormat(tag, parent, grandParent, paragraph.runs[paragraph.runs.length - 1]!, {}, {});
    else if (tag.name === "w:fldSimple") {
      if (!tag.selfClosing) fieldResult += 1;
    } else if (parent === "w:r" && paragraph.runs.length) {
      const format = runFormatOf(paragraph, paragraph.runs[paragraph.runs.length - 1]!);
      const replace = (text: string, permanent: boolean) => {
        const write = { start: tag.start, end: tag.end, text };
        if (!tag.selfClosing) closing.push({ name: tag.name, write });
        (permanent ? kept : laidOut).push(write);
        return write;
      };
      if (tag.name === "w:t") textStart = tag.selfClosing ? -1 : tag.end;
      else if (tag.name === "w:tab" || tag.name === "w:br" || tag.name === "w:cr" || tag.name === "w:ptab") {
        // Hidden, or in a field's instruction (between its begin and its separate, what Word never shows): nothing, as Word shows it.
        // In a table whose style may hide some cells' text: a space, never a line break.
        const doubtful = paragraph.table?.conditionallyHidden ?? false;
        if (hidden(format) || fields.includes("instruction")) replace("", true);
        else if (alternate.spaced.has(tag.start)) {
          // Of a mc:Fallback, where the mc:Choice Word draws goes on along its line: a space.
          paragraph.pieces.push({ kind: "text", text: " ", format, opaque: false });
          replace(written(tag.prefix, " "), true);
        } else if (tag.name === "w:tab") {
          const piece = { kind: "tab" as const, start: tag.start, end: tag.end, prefix: tag.prefix };
          if (!tag.selfClosing) closing.push({ name: tag.name, write: piece });
          paragraph.pieces.push(piece);
          tabs.push(piece);
        } else if (tag.name === "w:ptab" || doubtful) {
          paragraph.pieces.push({ kind: "opaque" });
          replace(written(tag.prefix, " "), true);
        } else {
          const write = replace(written(tag.prefix, "&#10;"), true);
          paragraph.pieces.push(tag.name === "w:br" && attribute(tag, "w:type") === "column" ? { kind: "break", column: write } : { kind: "break" });
        }
      } else if (tag.name === "w:noBreakHyphen") paragraph.pieces.push({ kind: "text", text: "\u2011", format, opaque: fieldResult > 0 });
      else if (tag.name === "w:softHyphen") paragraph.pieces.push({ kind: "text", text: "\u00ad", format, opaque: fieldResult > 0 });
      else if (tag.name === "w:pict" || tag.name === "w:drawing") {
        shapeInline = null;
        if (!hidden(format)) {
          const piece = { kind: "box" as const, width: null };
          paragraph.pieces.push(piece);
          if (!tag.selfClosing) drawing = { piece, decided: false };
        }
      } else if (tag.name === "w:sym" || tag.name === "w:object" || tag.name === "w:footnoteReference" || tag.name === "w:endnoteReference") {
        if (!hidden(format)) paragraph.pieces.push({ kind: "opaque" });
      } else if (tag.name === "w:fldChar") {
        const type = attribute(tag, "w:fldCharType");
        if (type === "begin") fields.push("instruction");
        else if (type === "separate" && fields[fields.length - 1] === "instruction") {
          fields[fields.length - 1] = "result";
          fieldResult += 1;
        } else if (type === "end" && fields.length && fields.pop() === "result") fieldResult = Math.max(0, fieldResult - 1);
      }
    }
  }
  containers.forEach(flush);
  const pageWidth = (pageSize && twips(attribute(pageSize, "w:w"))) ?? 612;
  const marginOf = (side: string, fallback: number) => (pageMargins && twips(attribute(pageMargins, `w:${side}`))) ?? fallback;
  textWidth = pageWidth - marginOf("left", 72) - marginOf("right", 72) - marginOf("gutter", 0);
  pageUnmeasured = Number((columns && attribute(columns, "w:num")) ?? 1) > 1 || ["linesAndChars", "snapToChars"].includes((grid && attribute(grid, "w:type")) ?? "");
  // Lay out each logical paragraph, then join the cells of each row; past the budget, each tab is a space and each row one line.
  for (const logical of logicals) {
    if (budget < 0) break;
    if (logical.parts.some(part => part.pieces.length)) logical.laid = layOut(logical);
    else logical.laid = { narrow: { lines: 1, width: 0, size: DEFAULT_SIZE_PT, measured: true, known: true }, wide: { lines: 1, width: 0, size: DEFAULT_SIZE_PT, measured: true, known: true } };
  }
  for (const row of rows) {
    if (budget < 0) break;
    if (!row.table.conditionallyHidden) joinCells(row);
  }
  joinFrames(logicals);
  joinBoxes(boxes, logicals);
  joinColumns();
  const writes = [...kept];
  const oneLine = (inRow: Paragraph[]) => inRow.slice(0, -1).forEach(paragraph => writes.push({ start: paragraph.end, end: paragraph.end, text: markerRun(paragraph, "S") }));
  if (budget >= 0) {
    writes.push(...laidOut);
    // The rows of a table whose style may hide some of its cells' text or paragraph marks: one line each.
    rows.forEach(row => {
      if (!row.table.conditionallyHidden) return;
      oneLine(paragraphs.filter(paragraph => paragraph.container.cell !== null && row.cells.includes(paragraph.container.cell)));
    });
  } else {
    for (const tab of tabs) writes.push({ start: tab.start, end: tab.end, text: written(tab.prefix, " ") });
    outerRows.forEach(oneLine);
  }
  return writes;
}

/** The XML with these replacements made, each where it starts; an insertion before a replacement at the same place. */
function applied(xml: string, writes: Write[]) {
  if (writes.length === 0) return xml;
  const sorted = writes.map((write, order) => ({ ...write, order })).sort((left, right) => left.start - right.start || (left.end - left.start) - (right.end - right.start) || left.order - right.order);
  let result = "";
  let from = 0;
  for (const { start, end, text } of sorted) {
    if (start < from) continue;
    result += xml.slice(from, start) + text;
    from = end;
  }
  return result + xml.slice(from);
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

/** The target of the first relationship of that type in a relationships part, resolved from `folder`. */
function target(relationships: string | undefined, type: string, folder: string) {
  const pattern = /<(?:[\w.-]+:)?Relationship\b([^>]*)>/g;
  for (let match = pattern.exec(relationships ?? ""); match; match = pattern.exec(relationships ?? "")) {
    const attributes = match[1]!;
    if (!new RegExp(`\\bType\\s*=\\s*"[^"]*/${type}"`).test(attributes)) continue;
    const to = /\bTarget\s*=\s*"([^"]*)"/.exec(attributes)?.[1];
    if (to) return (to.startsWith("/") || !folder ? to : `${folder}/${to}`).replace(/^\//, "");
  }
  return undefined;
}

/**
 * The DOCX to hand to mammoth with its tabs, line breaks and hidden paragraph
 * marks written as laidOutLineBreaks writes them, and the markers it wrote
 * for joinMarkedLines; the same file when there is nothing to write.
 */
export function docxWithLaidOutLineBreaks(buffer: Buffer, limits = DOCUMENT_DECOMPRESSION_LIMITS): { buffer: Buffer; marker: string } {
  const parts = new Map<string, Buffer>();
  inspectDocxArchive(buffer, limits, (name, content) => parts.set(name, content));
  const main = target(parts.get("_rels/.rels")?.toString("utf8"), "officeDocument", "") ?? "word/document.xml";
  const xml = parts.get(main)?.toString("utf8");
  if (!xml) return { buffer, marker: "" };
  const folder = main.includes("/") ? main.slice(0, main.lastIndexOf("/")) : "";
  const relationships = parts.get(`${folder ? `${folder}/` : ""}_rels/${main.slice(folder ? folder.length + 1 : 0)}.rels`)?.toString("utf8");
  const part = (type: string, fallback: string) => parts.get(target(relationships, type, folder) ?? fallback)?.toString("utf8");
  // Nothing to write without a tab, a line break, a table, a frame, a text box, an alternate content, columns, a line's end written
  // in a run's text, or text Word may hide (a paragraph mark, of its style).
  const hides = /vanish|specVanish|webHidden/;
  const lineEnds = /&#(?:x0*(?:a|b|c|85|2028|2029)|0*(?:10|11|12|133|8232|8233));|[\u0085\u2028\u2029\v\f]|<(?:[\w.-]+:)?t\b[^>]*>[^<]*\n/i;
  if (!/[<:](?:tab|br|cr|ptab|tbl|del|moveFrom|framePr|txbxContent|AlternateContent|cols)\b/.test(xml) && !lineEnds.test(xml) && !hides.test(xml) && !hides.test(part("styles", "word/styles.xml") ?? "")) return { buffer, marker: "" };
  const marker = markersOf(xml);
  const writes = laidOutLineBreaks(xml, { styles: part("styles", "word/styles.xml"), settings: part("settings", "word/settings.xml"), theme: part("theme", "word/theme/theme1.xml") }, marker, limits.docxLayoutWorkUnits);
  const laidOut = applied(xml, writes);
  if (laidOut === xml) return { buffer, marker: "" };
  parts.set(main, Buffer.from(laidOut, "utf8"));
  return { buffer: storedZip(parts), marker };
}

/**
 * The text mammoth read of a DOCX docxWithLaidOutLineBreaks wrote, its lines
 * joined where its markers say: a paragraph whose mark Word hides with the
 * next one, cells side by side on one line, apart by a space, or the
 * paragraphs of the same rank of cells side by side, each rank a line; then
 * any marker left is dropped. Only this reading's markers are read: a
 * character of the document never joins anything.
 */
export function joinMarkedLines(text: string, marker: string): string {
  if (!marker || !text.includes(marker)) return text;
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const joined = text.replace(new RegExp(`${escaped}N\\uE001[\\r\\n]*`, "g"), "").replace(new RegExp(`${escaped}S\\uE001\\s*`, "g"), " ");
  // Cells of as many paragraphs: each rank's paragraphs on one line, in the cells' order, the group ended by its last marker.
  const rows = new RegExp(`${escaped}(?:R(\\d+)\\.(\\d+)\\.(\\d+)|E(\\d+))\\uE001`, "g");
  let result = "";
  let from = 0;
  let group: { id: string; lines: Map<number, Map<number, string>> } | null = null;
  let slot: Map<number, string> | null = null;
  let cell = 0;
  const take = (piece: string) => {
    if (group && slot) slot.set(cell, (slot.get(cell) ?? "") + piece);
    else result += piece;
  };
  const close = () => {
    if (!group) return;
    const lines = Array.from(group.lines.keys()).sort((left, right) => left - right).map(line => {
      const cells = group!.lines.get(line)!;
      return Array.from(cells.keys()).sort((left, right) => left - right).map(at => cells.get(at)!.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
    });
    result += `${lines.join("\n")}\n\n`;
    group = null;
    slot = null;
  };
  for (let match = rows.exec(joined); match; match = rows.exec(joined)) {
    take(joined.slice(from, match.index));
    from = match.index + match[0].length;
    if (match[4] !== undefined) {
      if (group && group.id === match[4]) close();
      continue;
    }
    if (group && group.id !== match[1]) close();
    if (!group) group = { id: match[1]!, lines: new Map() };
    const line = Number(match[2]);
    if (!group.lines.has(line)) group.lines.set(line, new Map());
    slot = group.lines.get(line)!;
    cell = Number(match[3]);
  }
  take(joined.slice(from));
  close();
  return result.replace(new RegExp(`${escaped}[^\\uE001]{0,40}\\uE001`, "g"), "");
}
