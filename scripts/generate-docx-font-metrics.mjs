#!/usr/bin/env node
/**
 * Writes server/docxFontMetrics.ts: the advance widths of the characters of
 * Latin text, and the height of a line, of the fonts a CV names most often,
 * measured on fonts of the same metrics installed here (fc-match): Carlito for
 * Calibri, Caladea for Cambria, Liberation Sans, Serif and Mono for Arial,
 * Times New Roman and Courier New, and DejaVu. The DOCX visibility check lays
 * text out with them (IA-01). Run again after changing the fonts or the
 * characters: node scripts/generate-docx-font-metrics.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Each font measured, the font names it stands for (lower case), and its family for fc-match. */
const FONTS = [
  { key: "carlito", family: "Carlito", names: ["calibri", "carlito"] },
  { key: "caladea", family: "Caladea", names: ["cambria", "caladea"] },
  { key: "liberation-sans", family: "Liberation Sans", names: ["arial", "helvetica", "arimo", "liberation sans"] },
  { key: "liberation-serif", family: "Liberation Serif", names: ["times new roman", "times", "tinos", "liberation serif"] },
  { key: "liberation-mono", family: "Liberation Mono", names: ["courier new", "courier", "cousine", "liberation mono"] },
  { key: "dejavu-sans", family: "DejaVu Sans", names: ["dejavu sans"] },
  { key: "dejavu-serif", family: "DejaVu Serif", names: ["dejavu serif"] },
];
/** Basic Latin, Latin-1 and Latin Extended-A, and the punctuation and signs a CV writes beyond them. */
const CHARACTERS = [
  ...range(0x20, 0x7e), ...range(0xa0, 0x17f),
  ...range(0x2010, 0x2027), 0x2030, 0x2032, 0x2033, 0x2039, 0x203a, 0x20ac, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2264, 0x2265, 0x25cf, 0x2713,
].map(code => String.fromCodePoint(code)).join("");

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** The tables of a TrueType or OpenType font that give its advances and line heights. */
function readFont(path) {
  const font = readFileSync(path);
  const tables = new Map();
  for (let index = 0, count = font.readUInt16BE(4); index < count; index += 1) {
    const record = 12 + index * 16;
    tables.set(font.toString("latin1", record, record + 4), font.readUInt32BE(record + 8));
  }
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const os2 = tables.get("OS/2");
  const unitsPerEm = font.readUInt16BE(head + 18);
  const metrics = font.readUInt16BE(hhea + 34);
  const hmtx = tables.get("hmtx");
  const advance = glyph => font.readUInt16BE(hmtx + Math.min(glyph, metrics - 1) * 4);
  // Word sets a line in the Windows ascent and descent, LibreOffice in the ascender, descender and gap of hhea or OS/2: the tallest.
  const lines = [
    font.readUInt16BE(os2 + 74) + font.readUInt16BE(os2 + 76),
    font.readInt16BE(hhea + 4) - font.readInt16BE(hhea + 6) + font.readInt16BE(hhea + 8),
    font.readInt16BE(os2 + 68) - font.readInt16BE(os2 + 70) + font.readInt16BE(os2 + 72),
  ];
  return { glyphOf: characterMap(font, tables.get("cmap")), advance, unitsPerEm, line: Math.max(...lines) };
}

/** The glyph of each character, from the Unicode subtable of the font's cmap (format 12, else 4). */
function characterMap(font, cmap) {
  const subtables = [];
  for (let index = 0, count = font.readUInt16BE(cmap + 2); index < count; index += 1) {
    const record = cmap + 4 + index * 8;
    subtables.push({ platform: font.readUInt16BE(record), encoding: font.readUInt16BE(record + 2), offset: cmap + font.readUInt32BE(record + 4) });
  }
  const full = subtables.find(table => font.readUInt16BE(table.offset) === 12 && (table.platform === 0 || (table.platform === 3 && table.encoding === 10)));
  if (full) {
    const groups = Array.from({ length: font.readUInt32BE(full.offset + 12) }, (_, index) => {
      const group = full.offset + 16 + index * 12;
      return [font.readUInt32BE(group), font.readUInt32BE(group + 4), font.readUInt32BE(group + 8)];
    });
    return code => {
      const group = groups.find(([start, end]) => code >= start && code <= end);
      return group ? group[2] + code - group[0] : 0;
    };
  }
  const basic = subtables.find(table => font.readUInt16BE(table.offset) === 4 && (table.platform === 0 || (table.platform === 3 && table.encoding === 1)));
  const segments = font.readUInt16BE(basic.offset + 6) / 2;
  const ends = basic.offset + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  return code => {
    for (let segment = 0; segment < segments; segment += 1) {
      if (code > font.readUInt16BE(ends + segment * 2)) continue;
      const start = font.readUInt16BE(starts + segment * 2);
      if (code < start) return 0;
      const delta = font.readInt16BE(deltas + segment * 2);
      const rangeOffset = font.readUInt16BE(rangeOffsets + segment * 2);
      if (!rangeOffset) return (code + delta) & 0xffff;
      const glyph = font.readUInt16BE(rangeOffsets + segment * 2 + rangeOffset + (code - start) * 2);
      return glyph ? (glyph + delta) & 0xffff : 0;
    }
    return 0;
  };
}

/** Two digits of this alphabet write a width from 0 to 4095. */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/** The advance of each character in a style of a font, in thousandths of its size, rounded up (0 when it lacks it), two digits each. */
function widths(style) {
  return Array.from(CHARACTERS, character => {
    const glyph = style.glyphOf(character.codePointAt(0));
    const width = glyph ? Math.ceil(style.advance(glyph) * 1000 / style.unitsPerEm) : 0;
    if (width >= DIGITS.length ** 2) throw new Error(`${character}: ${width}`);
    return DIGITS[Math.floor(width / DIGITS.length)] + DIGITS[width % DIGITS.length];
  }).join("");
}

const fontFile = (family, style) => execFileSync("fc-match", ["-f", "%{file}", `${family}:style=${style}`], { encoding: "utf8" });
const STYLES = { regular: "Regular", italic: "Italic", bold: "Bold", boldItalic: "Bold Italic" };
const metrics = {};
const aliases = {};
for (const { key, family, names } of FONTS) {
  const styles = Object.fromEntries(Object.entries(STYLES).map(([name, style]) => {
    const path = fontFile(family, style);
    if (!path.includes(family.replace(/ /g, ""))) throw new Error(`${family} ${style}: fc-match gives ${path}`);
    return [name, readFont(path)];
  }));
  const line = Math.ceil(Math.max(...Object.values(styles).map(style => style.line / style.unitsPerEm)) * 1000);
  metrics[key] = { line, ...Object.fromEntries(Object.entries(styles).map(([name, style]) => [name, widths(style)])) };
  for (const name of names) aliases[name] = key;
}

const output = `// Written by scripts/generate-docx-font-metrics.mjs from the fonts installed (fc-match): run it again rather than edit this file.

/** The characters measured, in order: Latin text, its punctuation and common signs. */
export const DOCX_FONT_CHARACTERS = ${JSON.stringify(CHARACTERS)};

/** The digits of the widths of DOCX_FONT_METRICS, two for each character. */
export const DOCX_FONT_WIDTH_DIGITS = ${JSON.stringify(DIGITS)};

/**
 * Of each font measured: the height of a line of single spacing (the tallest
 * Word or LibreOffice sets), and the advance of each character of
 * DOCX_FONT_CHARACTERS in each of its styles; in thousandths of the font size,
 * rounded up; 0 for a character the font lacks.
 */
export const DOCX_FONT_METRICS: Record<string, { line: number } & Record<"regular" | "italic" | "bold" | "boldItalic", string>> = {
${Object.entries(metrics).map(([key, { line, ...styles }]) => `  "${key}": {\n    line: ${line},\n${Object.entries(styles).map(([name, digits]) => `    ${name}: ${JSON.stringify(digits)},`).join("\n")}\n  },`).join("\n")}
};

/** The font names a document may give (w:rFonts, theme fonts), in lower case, and the font of the same metrics measured. */
export const DOCX_FONT_ALIASES: Record<string, string> = ${JSON.stringify(aliases, null, 2).replace(/\n}$/, ",\n}")};
`;
writeFileSync(fileURLToPath(new URL("../server/docxFontMetrics.ts", import.meta.url)), output);
console.log(`server/docxFontMetrics.ts: ${Object.keys(metrics).length} fonts, ${Array.from(CHARACTERS).length} characters`);
