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
/** What draws a picture or a shape in a paragraph. */
const DRAWINGS = new Set(["w:drawing", "w:pict", "w:object"]);
/** Elements whose paragraphs follow one another, for « next to a drawing ». */
const PARAGRAPH_CONTAINERS = new Set(["w:body", "w:tc", "w:txbxContent", "w:hdr", "w:ftr", "w:footnote", "w:endnote", "w:comment"]);
/** Elements of the body laid one under the other: a table counts as one, however tall. */
const BODY_BLOCKS = new Set(["w:p", "w:tbl", "w:sdt", "w:customXml"]);
/** Lowest height of a paragraph (a line of 7 pt type): a picture covers at most its height's worth of them. */
const MIN_PARAGRAPH_PT = 8;
const EMU_PER_PT = 12_700;
/** Vertical positions Word takes from the page or its margins rather than from the anchor paragraph (DrawingML, VML). */
const FROM_PAGE = /^(page|margin|topMargin|bottomMargin|insideMargin|outsideMargin|top-margin-area|bottom-margin-area|inner-margin-area|outer-margin-area)$/i;
/** Namespaces of Office and of the standard: Word draws the mc:Choice that requires them (wps, w14, w15, wpg…). */
const OFFICE_NAMESPACE = /^(http:\/\/schemas\.microsoft\.com\/office\/|http:\/\/schemas\.openxmlformats\.org\/|http:\/\/purl\.oclc\.org\/ooxml\/|urn:schemas-microsoft-com:)/;
/** What fills a DrawingML shape: none, a colour, or what may not be one (gradient, picture, pattern, the group's). */
const DRAWING_FILLS = new Set(["a:noFill", "a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill", "a:grpFill"]);
const DRAWING_COLOURS = new Set(["a:srgbClr", "a:schemeClr", "a:sysClr", "a:prstClr", "a:scrgbClr", "a:hslClr"]);

/** `namespaces`: the namespace each prefix is bound to there (mc:Choice Requires names prefixes). */
type XmlTag = { name: string; attributes: Map<string, string>; namespaces: Map<string, string>; closing: boolean; selfClosing: boolean; start: number; end: number };

function decodeXml(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->/g, (_, data: string | undefined) => data ?? "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
      if (entity[0] !== "#") return named[entity.toLowerCase()]!;
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

/** Calls `visit` with each tag of an XML part, in order, with namespace-resolved names and attributes. */
function visitXmlTags(xml: string, visit: (tag: XmlTag) => void) {
  const scopes: Array<Map<string, string>> = [new Map()];
  const canonical = (qualifiedName: string, scope: Map<string, string>) => {
    const colon = qualifiedName.indexOf(":");
    const prefix = colon === -1 ? "" : qualifiedName.slice(0, colon);
    const known = NAMESPACES[scope.get(prefix) ?? ""];
    return known ? `${known}:${qualifiedName.slice(colon + 1)}` : qualifiedName;
  };
  const tags = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (let match = tags.exec(xml); match; match = tags.exec(xml)) {
    const [, closing, qualifiedName, attributeText = "", selfClosing] = match;
    if (!qualifiedName) continue;
    const position = { start: match.index, end: match.index + match[0].length };
    if (closing) {
      const scope = scopes.length > 1 ? scopes.pop()! : scopes[0]!;
      visit({ name: canonical(qualifiedName, scope), attributes: new Map(), namespaces: scope, closing: true, selfClosing: false, ...position });
      continue;
    }
    const raw: Array<[string, string]> = Array.from(attributeText.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g), attribute => [attribute[1]!, decodeXml(attribute[2] ?? attribute[3] ?? "")]);
    let scope = scopes.at(-1)!;
    for (const [name, value] of raw) {
      if (name === "xmlns" || name.startsWith("xmlns:")) {
        if (scope === scopes.at(-1)) scope = new Map(scope);
        scope.set(name === "xmlns" ? "" : name.slice(6), value);
      }
    }
    // Unprefixed attributes have no namespace (VML fillcolor, relationship Type and Target).
    const attributes = new Map(raw.map(([name, value]) => [name.includes(":") ? canonical(name, scope) : name, value]));
    if (!selfClosing) scopes.push(scope);
    visit({ name: canonical(qualifiedName, scope), attributes, namespaces: scope, closing: false, selfClosing: Boolean(selfClosing), ...position });
  }
}

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

/** A length of a VML style, in points (0 when absent). */
function vmlLength(style: string, property: string) {
  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*(-?[\\d.]+)\\s*(pt|px|in|cm|mm|pc)?\\s*(?:;|$)`, "i").exec(style);
  const value = match ? Number(match[1]) * VML_UNITS_PT[(match[2] ?? "px").toLowerCase()]! : 0;
  return Number.isFinite(value) ? value : 0;
}

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

/** The largest page of the document's sections, in points (w:pgSz is in twips); A4 or Letter when none is given. */
function largestPage(xml: string) {
  const page = { width: 0, height: 0 };
  visitXmlTags(xml, tag => {
    if (tag.closing || tag.name !== "w:pgSz") return;
    page.width = Math.max(page.width, Number(tag.attributes.get("w:w")) / 20 || 0);
    page.height = Math.max(page.height, Number(tag.attributes.get("w:h")) / 20 || 0);
  });
  return { width: page.width || 612, height: page.height || 842 };
}

/**
 * visitXmlTags, also giving the paragraph (w:p) each tag is in, by a key
 * naming its place among the paragraphs of its container (body, table cell,
 * text box, header…): `${container}:${index ± 1}` names its neighbours.
 */
function visitParagraphs(xml: string, visit: (tag: XmlTag, paragraph: string | null) => void) {
  const top = { id: -1, next: 0 };
  const containers: Array<{ id: number; next: number }> = [];
  const paragraphs: string[] = [];
  let ids = 0;
  visitXmlTags(xml, tag => {
    if (tag.closing) {
      visit(tag, paragraphs.at(-1) ?? null);
      if (PARAGRAPH_CONTAINERS.has(tag.name)) containers.pop();
      if (tag.name === "w:p") paragraphs.pop();
      return;
    }
    if (tag.name === "w:p") {
      const container = containers.at(-1) ?? top;
      const key = `${container.id}:${container.next++}`;
      if (!tag.selfClosing) paragraphs.push(key);
      visit(tag, key);
      return;
    }
    if (PARAGRAPH_CONTAINERS.has(tag.name) && !tag.selfClosing) containers.push({ id: ids++, next: 0 });
    visit(tag, paragraphs.at(-1) ?? null);
  });
}

/**
 * What white text the pictures and shapes of a part may lie under: the
 * paragraphs holding one (`drawings`), and for each picture behind the text
 * (wp:anchor behindDoc, VML z-index below 0) placed from its paragraph, the
 * blocks of the body its height may reach (`reaches`, by `blocks` index); one
 * placed from the page may lie under any text (`fromPage`).
 */
function drawingReach(xml: string) {
  const drawings = new Set<string>();
  const blocks = new Map<string, number>();
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
  visitParagraphs(xml, (tag, paragraph) => {
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
    if (paragraph && !blocks.has(paragraph)) blocks.set(paragraph, block);
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
  return { drawings, blocks, reaches, fromPage };
}

/** Scripts Word sets in the complex script size (w:szCs), like a run marked w:cs or w:rtl. */
const COMPLEX_SCRIPTS = "\\p{Script=Arabic}\\p{Script=Hebrew}\\p{Script=Syriac}\\p{Script=Thaana}\\p{Script=Thai}";
const COMPLEX_SCRIPT = new RegExp(`[${COMPLEX_SCRIPTS}]`, "u");
const OTHER_LETTER = new RegExp(`(?![${COMPLEX_SCRIPTS}])[\\p{L}\\p{N}]`, "u");
/** Characters about as wide as they are tall; others average half of that. */
const WIDE_CHARACTER = new RegExp("[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\uff01-\\uff60]", "u");

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
  }
}

/** What a style, or one of a table style's conditional formats (w:tblStylePr), sets for the text and under it. */
type Formats = { run: RunLayer; paragraphShading?: Paint; cellShading?: Paint };
/** Table styles: how many rows or columns each of their bands spans (w:tblStyleRowBandSize, w:tblStyleColBandSize). */
type BandSizes = { rowBandSize?: number; columnBandSize?: number };
type StyleDefinition = Formats & BandSizes & { basedOn?: string; tableShading?: Paint; conditions: Map<string, Formats> };
/** `defaults`, `paragraphShading`: the document's defaults (w:docDefaults). */
type Styles = { byId: Map<string, StyleDefinition>; defaultIds: Map<string, string>; defaults: RunLayer; paragraphShading?: Paint };

const BAND_SIZES: Record<string, keyof BandSizes> = { "w:tblStyleRowBandSize": "rowBandSize", "w:tblStyleColBandSize": "columnBandSize" };
const bandSize = (tag: XmlTag) => Math.max(1, Number.parseInt(tag.attributes.get("w:val") ?? "", 10) || 1);

function readStyles(xml: string | undefined, theme: Theme): Styles {
  const styles: Styles = { byId: new Map(), defaultIds: new Map(), defaults: {} };
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
      current = { run: {}, conditions: new Map() };
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
    } else if (current && parent === "w:tblPr" && grandParent === "w:style" && BAND_SIZES[tag.name]) {
      current[BAND_SIZES[tag.name]!] = bandSize(tag);
    } else if (formats && parent === "w:rPr") {
      applyRunProperty(formats.run, tag, theme);
    } else if (formats && tag.name === "w:shd") {
      if (parent === "w:pPr") formats.paragraphShading = shadingPaint(tag, theme);
      else if (parent === "w:tcPr") formats.cellShading = shadingPaint(tag, theme);
      else if (parent === "w:tblPr" && current && formats === current) current.tableShading = shadingPaint(tag, theme);
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
function tableRows(xml: string) {
  const tables = new Map<number, number[]>();
  const open: Array<{ start: number; rows: number[] }> = [];
  visitXmlTags(xml, tag => {
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
  });
  return tables;
}

/** The v:fill of each VML shape, by where the shape's tag starts: it may follow the text box. */
function vmlFills(xml: string) {
  const fills = new Map<number, XmlTag>();
  const open: Array<{ name: string; start: number }> = [];
  visitXmlTags(xml, tag => {
    if (tag.closing) {
      open.pop();
      return;
    }
    const parent = open.at(-1);
    if (tag.name === "v:fill" && parent && VML_SHAPES.has(parent.name)) fills.set(parent.start, tag);
    if (!tag.selfClosing) open.push({ name: tag.name, start: tag.start });
  });
  return fills;
}

/** A style and the ones it is based on, the base first; the type's default style when none is named. */
function styleChain(styles: Styles, id: string | undefined, type: string) {
  const chain: StyleDefinition[] = [];
  const seen = new Set<string>();
  for (let current = id ?? styles.defaultIds.get(type); current && !seen.has(current); ) {
    seen.add(current);
    const style = styles.byId.get(current);
    if (!style) break;
    chain.unshift(style);
    current = style.basedOn;
  }
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
const worst = (verdicts: Visibility[]) => verdicts.reduce<Visibility>((found, verdict) => (SEVERITY[verdict] > SEVERITY[found] ? verdict : found), "visible");

type Frame = BandSizes & {
  name: string;
  style?: string;
  key?: string;
  layer?: RunLayer;
  texts?: Array<[number, number]>;
  passages?: Passages;
  /** The shading set on a paragraph, cell or table itself (null: none), or the fill of a text box (null: none known). */
  paint?: Paint;
  offPage?: boolean;
  /** DrawingML anchors: where they place their shape, in points. */
  box?: Box;
  /** DrawingML fills, and their colours being read: the shape they fill; the colour's lightness changes (lumMod, lumOff), its opacity. */
  fillOf?: Frame;
  colour?: { hex: string | undefined; scale: number; offset: number; alpha: number; shape: Frame };
  /** mc:AlternateContent: the text of the mc:Choice Word draws, without spaces, the visibility of each of its characters, and how far the fallback's text matched it. */
  drawn?: { text: string; verdicts: Visibility[]; cursor: number };
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
type Passages = { invisible: string[]; unverifiable: string[] };

function cellFormats(styles: Styles, table: Frame, row: number, column: number): CellFormats {
  const chain = styleChain(styles, table.style, "table");
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

/**
 * The main document part without the text of its invisible runs, nor of
 * those that may show on a drawing; the text of each, paragraph by paragraph.
 * `fromPage`: a picture behind the text may lie under any text. `pageShown`:
 * Word shows the page colour.
 */
function cutInvisibleRuns(xml: string, styles: Styles, theme: Theme, fromPage: boolean, pageShown: boolean) {
  const page = largestPage(xml);
  const tables = tableRows(xml);
  const fills = vmlFills(xml);
  const stack: Frame[] = [];
  const cuts: Array<[number, number]> = [];
  const found: Passages = { invisible: [], unverifiable: [] };
  let textStart: number | null = null;
  let offsetStart: number | null = null;
  let pageColour = "FFFFFF";
  let pagePicture = false;
  // How much of the drawn text failed searches may scan: a fallback that matches nothing is then compared in place only.
  let searchBudget = xml.length;
  const pictures = drawingReach(xml);
  const nearDrawing = (key: string | undefined) => {
    if (!key) return false;
    const [container, index] = key.split(":");
    if ([-1, 0, 1].some(offset => pictures.drawings.has(`${container}:${Number(index) + offset}`))) return true;
    const block = pictures.blocks.get(key);
    return block !== undefined && pictures.reaches.some(([from, to]) => block >= from && block <= to);
  };
  const nearest = (name: string) => stack.findLast(frame => frame.name === name);
  /** The table cell a paragraph is in, unless in a text box: the text box's text is not the table's. */
  const enclosingCell = () => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index]!.name === "w:txbxContent") return undefined;
      if (stack[index]!.name === "w:tc") return stack[index];
    }
    return undefined;
  };
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
  // Decided once the whole run is read, inside its paragraph, cell, table and text box.
  const visibility = (run: Frame, text: string): Visibility => {
    const paragraph = nearest("w:p");
    const tableFormats = paragraph?.cell?.formats;
    const effective: RunLayer = Object.assign({}, styles.defaults,
      ...(tableFormats?.runs ?? []),
      ...styleChain(styles, paragraph?.style, "paragraph").map(style => style.run),
      ...styleChain(styles, run.style, "character").map(style => style.run),
      run.layer);
    const tiny = (size: number | undefined) => size !== undefined && size < MIN_FONT_SIZE_PT;
    // Word sets the whole run in the complex script size when it is marked so, else only those scripts.
    const marked = effective["w:cs"] || effective["w:rtl"];
    const complexScript = COMPLEX_SCRIPT.test(text);
    const otherLetter = OTHER_LETTER.test(text);
    const tinyText = marked ? tiny(effective.complexScriptSize) : (complexScript && tiny(effective.complexScriptSize)) || ((!complexScript || otherLetter) && tiny(effective.size));
    // How far the letters are squeezed or moved, at the size of most of them.
    const size = (marked || (complexScript && !otherLetter) ? effective.complexScriptSize : effective.size) ?? DEFAULT_FONT_SIZE_PT;
    const characters = Array.from(text);
    const width = characters.reduce((sum, character) => sum + (WIDE_CHARACTER.test(character) ? 1 : 0.5), 0) * size * (effective.scale ?? 100) / 100;
    const squeezed = characters.length > 0 && width / characters.length + (effective.spacing ?? 0) < MIN_ADVANCE_PT;
    const shifted = Math.abs(effective.position ?? 0) > MAX_SHIFT_IN_SIZES * size;
    if (effective["w:vanish"] || effective["w:specVanish"] || effective["w:webHidden"] || tinyText || squeezed || shifted || stack.some(frame => frame.offPage)) return "invisible";
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
    const onDrawing = fromPage || pagePicture || pictures.fromPage || stack.some(frame => frame.name === "w:txbxContent") || nearDrawing(paragraph?.key);
    return onDrawing ? "unverifiable" : "invisible";
  };
  /** What mammoth reads of a mc:AlternateContent, its fallback, is seen only where the choice Word draws shows the same text. */
  const asDrawn = (text: string, seen: Visibility): Visibility => {
    const alternate = stack.findLastIndex(item => item.name === "mc:AlternateContent");
    const drawn = stack[alternate]?.drawn;
    const branch = stack[alternate + 1];
    const letters = text.replace(/\s+/g, "");
    if (!drawn || !branch || !letters) return seen;
    if (branch.chosen) {
      drawn.text += letters;
      for (let index = 0; index < letters.length; index += 1) drawn.verdicts.push(seen);
      return seen;
    }
    if (branch.name !== "mc:Fallback") return seen;
    const at = searchBudget > 0 ? drawn.text.indexOf(letters, drawn.cursor) : drawn.text.startsWith(letters, drawn.cursor) ? drawn.cursor : -1;
    if (at === -1) {
      searchBudget -= drawn.text.length - drawn.cursor;
      return "invisible";
    }
    drawn.cursor = at + letters.length;
    return worst(drawn.verdicts.slice(at, drawn.cursor).concat(seen));
  };
  const paintShape = ({ hex, scale, offset, alpha, shape }: NonNullable<Frame["colour"]>) => {
    const colour = hex && (scale === 1 && offset === 0 ? hex : withLightness(hex, lightness => lightness * scale + offset));
    // Partly transparent, it shows the page through it, as a VML fill.
    shape.paint = colour ? [alpha < 1 ? blend(pageColour, colour, alpha) : colour] : null;
  };
  const record = (kind: keyof Passages, texts: string[]) => {
    // mammoth reads text boxes from mc:Fallback and VML only: what mc:Choice repeats, or a DrawingML text box holds, is not counted.
    if (stack.some(item => item.name === "mc:Choice" || item.name === "w:drawing")) return;
    const paragraph = nearest("w:p")?.passages;
    if (paragraph) paragraph[kind].push(...texts);
    else found[kind].push(texts.join(""));
  };
  visitParagraphs(xml, (tag, paragraph) => {
    if (tag.closing) {
      const frame = stack.pop();
      if (frame?.name === "w:t" && textStart !== null) {
        stack.at(-1)?.texts?.push([textStart, tag.start]);
        textStart = null;
      } else if (frame?.name === "w:r" && frame.texts?.length) {
        const texts = frame.texts.map(([start, end]) => decodeXml(xml.slice(start, end)));
        const seen = asDrawn(texts.join(""), visibility(frame, texts.join("")));
        if (seen !== "visible") {
          cuts.push(...frame.texts);
          record(seen, texts);
        }
      } else if (frame?.name === "w:p" && frame.passages) {
        for (const kind of ["invisible", "unverifiable"] as const) if (frame.passages[kind].length) found[kind].push(frame.passages[kind].join(""));
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
    const frame: Frame = { name: tag.name };
    if (tag.name === "w:p") Object.assign(frame, { passages: { invisible: [], unverifiable: [] }, key: paragraph ?? undefined, cell: enclosingCell() });
    if (tag.name === "w:r") Object.assign(frame, { layer: {}, texts: [] });
    if (tag.name === "w:tbl") frame.rows = tables.get(tag.start) ?? [];
    if (tag.name === "w:tr") frame.row = next(nearest("w:tbl"));
    if (tag.name === "w:tc") {
      const row = nearest("w:tr");
      const table = nearest("w:tbl");
      Object.assign(frame, { row: row?.row ?? 0, column: next(row) });
      if (table) frame.formats = cellFormats(styles, table, frame.row!, frame.column!);
    }
    if (VML_SHAPES.has(tag.name)) {
      const fill = fills.get(tag.start);
      const colour = tag.attributes.get("fillcolor")?.trim();
      const filled = !/^(f|false)$/i.test(tag.attributes.get("filled") ?? "") && !/^(f|false)$/i.test(fill?.attributes.get("on") ?? "");
      const known = colour === undefined || !filled ? undefined : vmlColour(colour);
      // A fill partly transparent (v:fill opacity) shows the page through it; a transparent one, the page.
      const opacity = vmlOpacity(fill?.attributes.get("opacity"));
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
    if (tag.name === "a:graphic" && parent?.box) parent.offPage = isOffPage(parent.box, page);
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
    }
    if (tag.name === "w:shd" && ((parent?.name === "w:tcPr" && grandParent?.name === "w:tc") || (parent?.name === "w:tblPr" && grandParent?.name === "w:tbl"))) grandParent.paint = shadingPaint(tag, theme);
    if (parent?.name === "w:tblPr" && grandParent?.name === "w:tbl") {
      if (tag.name === "w:tblStyle") grandParent.style = tag.attributes.get("w:val");
      if (tag.name === "w:tblLook") grandParent.look = tableLook(tag);
      if (BAND_SIZES[tag.name]) grandParent[BAND_SIZES[tag.name]!] = bandSize(tag);
    }
    if (parent?.name === "w:rPr" && grandParent?.name === "w:r") {
      if (tag.name === "w:rStyle") grandParent.style = tag.attributes.get("w:val");
      else applyRunProperty(grandParent.layer!, tag, theme);
    }
    if (tag.name === "w:t" && !tag.selfClosing && parent?.name === "w:r") textStart = tag.end;
    if (!tag.selfClosing) stack.push(frame);
  });
  let visible = "";
  let from = 0;
  for (const [start, end] of cuts.sort((left, right) => left[0] - right[0])) {
    visible += xml.slice(from, start);
    from = end;
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
 * background cannot be established; the text of each. Also bounds the
 * decompression (inspectDocxArchive). An unchanged file is returned as is.
 */
export function withoutInvisibleDocxText(buffer: Buffer, limits = DOCUMENT_DECOMPRESSION_LIMITS): { buffer: Buffer; invisibleText: string[]; unverifiableText: string[] } {
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
  const visible = cutInvisibleRuns(xml, readStyles(parts.get(stylesPart)?.toString("utf8"), theme), theme, onEveryPage, showsPageColour(settings));
  if (!visible.cut) return { buffer, invisibleText: [], unverifiableText: [] };
  parts.set(mainDocument, Buffer.from(visible.xml, "utf8"));
  return { buffer: storedZip(parts), invisibleText: visible.invisibleText, unverifiableText: visible.unverifiableText };
}
