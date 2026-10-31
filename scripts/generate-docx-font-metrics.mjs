#!/usr/bin/env node
/**
 * Writes server/docxFontMetrics.ts: the advance widths of the characters of
 * Latin text, and the height of a line, of the fonts a CV names most often,
 * measured on the fonts themselves or on fonts of the same metrics: Carlito
 * for Calibri, Caladea for Cambria, Liberation Sans, Serif and Mono for Arial,
 * Times New Roman and Courier New, Gelasio for Georgia, EB Garamond for
 * Garamond, TeX Gyre Adventor for Century Gothic; DejaVu; and the free fonts
 * of Canva, Google Docs and recent Word (Montserrat, Open Sans, Lato…). The
 * fonts of Office and Windows of no free font of their metrics (Aptos,
 * Calibri Light, Segoe UI, Tahoma, Trebuchet MS, Verdana, Arial Black) are
 * given the advances of a font measured narrower than each
 * (AT_LEAST_AS_WIDE); any other font not measured, of each character, the
 * narrowest advance of the fonts measured (NARROWEST), the most room its
 * text may have. The DOCX visibility check lays text out with them (IA-01).
 * Written compactly: a character as wide as its base letter (É as E), or a
 * slanted style as wide as its upright one, in a sign rather than two digits.
 *
 * Run again after changing the fonts or the characters:
 *   node scripts/generate-docx-font-metrics.mjs [fonts folder]
 * The fonts are taken from the folder when it holds their family (fc-scan,
 * its subfolders too), else from those installed here (fc-match). The free
 * ones are not installed here: put in the folder, from npm (npm pack, then
 * tar xzf; not dependencies of the app), the WOFF files of each @fontsource
 * package (package/files/*-latin-{400,700}-{normal,italic}.woff and their
 * latin-ext ones; WOFF2 is not read), and TeX Gyre Adventor's OTF files
 * (package/assets). The file was written from these versions, whose widths
 * another version may change:
 *   @fontsource/{eb-garamond,gelasio,inter,lato,lora,merriweather,montserrat,
 *     noto-sans,nunito,open-sans,playfair-display,poppins,raleway,roboto,
 *     source-sans-3}@5.3.0
 *   @docx-editor.dev/fonts@2.27.0 (TeX Gyre Adventor)
 *   installed (Debian): fonts-crosextra-carlito 20230309, fonts-crosextra-caladea
 *     20200211, fonts-liberation2 2.1.5, fonts-dejavu-core 2.37.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

/**
 * Each font measured, the font names it stands for (lower case), and its
 * family for fontconfig; `floor: false` for a typewriter font, which an
 * unknown font is not taken to be as narrow as (NARROWEST); `ownLine: false`
 * for a font of the advances only of the one it stands for, whose lines
 * Word sets otherwise: their height is left unknown (0).
 */
const FONTS = [
  { key: "carlito", family: "Carlito", names: ["calibri", "carlito"] },
  { key: "caladea", family: "Caladea", names: ["cambria", "caladea"] },
  { key: "liberation-sans", family: "Liberation Sans", names: ["arial", "helvetica", "arimo", "liberation sans"] },
  { key: "liberation-serif", family: "Liberation Serif", names: ["times new roman", "times", "tinos", "liberation serif"] },
  { key: "liberation-mono", family: "Liberation Mono", names: ["courier new", "courier", "cousine", "liberation mono"], floor: false },
  { key: "dejavu-sans", family: "DejaVu Sans", names: ["dejavu sans"] },
  { key: "dejavu-serif", family: "DejaVu Serif", names: ["dejavu serif"] },
  { key: "gelasio", family: "Gelasio", names: ["georgia", "gelasio"], ownLine: false },
  { key: "eb-garamond", family: "EB Garamond", names: ["garamond", "eb garamond"], ownLine: false },
  { key: "tex-gyre-adventor", family: "TeX Gyre Adventor", names: ["century gothic", "tex gyre adventor"], ownLine: false },
  { key: "montserrat", family: "Montserrat", names: ["montserrat"] },
  { key: "open-sans", family: "Open Sans", names: ["open sans"] },
  { key: "lato", family: "Lato", names: ["lato"] },
  { key: "poppins", family: "Poppins", names: ["poppins"] },
  { key: "roboto", family: "Roboto", names: ["roboto"] },
  { key: "raleway", family: "Raleway", names: ["raleway"] },
  { key: "inter", family: "Inter", names: ["inter"] },
  { key: "nunito", family: "Nunito", names: ["nunito"] },
  { key: "source-sans-3", family: "Source Sans 3", names: ["source sans 3", "source sans pro"] },
  { key: "noto-sans", family: "Noto Sans", names: ["noto sans"] },
  { key: "playfair-display", family: "Playfair Display", names: ["playfair display"] },
  { key: "merriweather", family: "Merriweather", names: ["merriweather"] },
  { key: "lora", family: "Lora", names: ["lora"] },
];
/**
 * Fonts of Office and Windows not measured, of no free font of their metrics
 * on npm, and the font measured whose advances stand for theirs (`as`): on
 * each line of CV text of the test corpus, narrower than theirs by their
 * published widths (@capsizecss/metrics 4.4.0, the average width of each;
 * string-pixel-width 1.11.0, of each character, for Verdana, Tahoma and
 * Trebuchet MS), by 7.5 to 8 % in the middle, 2.5 % at least (but on a line
 * of capitals M), where NARROWEST is 20 to 30 % narrower; in bold, 13 to
 * 19 %. Aptos, of no published widths, drawn wider than Calibri: Carlito, as
 * for Calibri Light, which may be a little narrower (the check allows 2 %);
 * Arial Black, Arial's. Their lines are left unknown (0): 1.15, below theirs
 * (1.16 to 1.33 published).
 */
const AT_LEAST_AS_WIDE = [
  {
    key: "carlito-or-wider",
    as: "carlito",
    names: ["aptos", "aptos display", "aptos semibold", "aptos extrabold", "aptos black", "calibri light", "segoe ui", "segoe ui semibold", "segoe ui bold", "tahoma", "trebuchet ms"],
  },
  { key: "noto-sans-or-wider", as: "noto-sans", names: ["verdana"] },
  { key: "liberation-sans-or-wider", as: "liberation-sans", names: ["arial black"] },
];
/** Basic Latin, Latin-1 and Latin Extended-A, and the punctuation and signs a CV writes beyond them. */
const CHARACTERS = [
  ...range(0x20, 0x7e), ...range(0xa0, 0x17f),
  ...range(0x2010, 0x2027), 0x2030, 0x2032, 0x2033, 0x2039, 0x203a, 0x20ac, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2264, 0x2265, 0x25cf, 0x2713,
].map(code => String.fromCodePoint(code)).join("");
/** The key of the widths given a font not measured. */
const NARROWEST = "narrowest";

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** The tables of a TrueType or OpenType font, or of its WOFF wrapping (each table compressed apart). */
function fontTables(path) {
  const file = readFileSync(path);
  const woff = file.toString("latin1", 0, 4) === "wOFF";
  if (file.toString("latin1", 0, 4) === "wOF2") throw new Error(`${path}: WOFF2 is not read, give the .woff file`);
  const tables = new Map();
  for (let index = 0, count = file.readUInt16BE(woff ? 12 : 4); index < count; index += 1) {
    const record = woff ? 44 + index * 20 : 12 + index * 16;
    const offset = file.readUInt32BE(record + (woff ? 4 : 8));
    const length = file.readUInt32BE(record + (woff ? 8 : 12));
    const data = file.subarray(offset, offset + length);
    tables.set(file.toString("latin1", record, record + 4), woff && length < file.readUInt32BE(record + 12) ? inflateSync(data) : data);
  }
  return tables;
}

/** The tables of a font that give its advances and line heights. */
function readFont(path) {
  const tables = fontTables(path);
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const os2 = tables.get("OS/2");
  const hmtx = tables.get("hmtx");
  const unitsPerEm = head.readUInt16BE(18);
  const metrics = hhea.readUInt16BE(34);
  const advance = glyph => hmtx.readUInt16BE(Math.min(glyph, metrics - 1) * 4);
  // Word sets a line in the Windows ascent and descent, LibreOffice in the ascender, descender and gap of hhea or OS/2: the tallest.
  const lines = [
    os2.readUInt16BE(74) + os2.readUInt16BE(76),
    hhea.readInt16BE(4) - hhea.readInt16BE(6) + hhea.readInt16BE(8),
    os2.readInt16BE(68) - os2.readInt16BE(70) + os2.readInt16BE(72),
  ];
  return { glyphOf: characterMap(tables.get("cmap")), advance, unitsPerEm, line: Math.max(...lines) };
}

/** The glyph of each character, from the Unicode subtable of a font's cmap (format 12, else 4). */
function characterMap(cmap) {
  const subtables = [];
  for (let index = 0, count = cmap.readUInt16BE(2); index < count; index += 1) {
    const record = 4 + index * 8;
    subtables.push({ platform: cmap.readUInt16BE(record), encoding: cmap.readUInt16BE(record + 2), offset: cmap.readUInt32BE(record + 4) });
  }
  const full = subtables.find(table => cmap.readUInt16BE(table.offset) === 12 && (table.platform === 0 || (table.platform === 3 && table.encoding === 10)));
  if (full) {
    const groups = Array.from({ length: cmap.readUInt32BE(full.offset + 12) }, (_, index) => {
      const group = full.offset + 16 + index * 12;
      return [cmap.readUInt32BE(group), cmap.readUInt32BE(group + 4), cmap.readUInt32BE(group + 8)];
    });
    return code => {
      const group = groups.find(([start, end]) => code >= start && code <= end);
      return group ? group[2] + code - group[0] : 0;
    };
  }
  const basic = subtables.find(table => cmap.readUInt16BE(table.offset) === 4 && (table.platform === 0 || (table.platform === 3 && table.encoding === 1)));
  const segments = cmap.readUInt16BE(basic.offset + 6) / 2;
  const ends = basic.offset + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  return code => {
    for (let segment = 0; segment < segments; segment += 1) {
      if (code > cmap.readUInt16BE(ends + segment * 2)) continue;
      const start = cmap.readUInt16BE(starts + segment * 2);
      if (code < start) return 0;
      const delta = cmap.readInt16BE(deltas + segment * 2);
      const rangeOffset = cmap.readUInt16BE(rangeOffsets + segment * 2);
      if (!rangeOffset) return (code + delta) & 0xffff;
      const glyph = cmap.readUInt16BE(rangeOffsets + segment * 2 + rangeOffset + (code - start) * 2);
      return glyph ? (glyph + delta) & 0xffff : 0;
    }
    return 0;
  };
}

/** Two digits of this alphabet write a width from 0 to 4095. */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/**
 * The advance of each character in a style of a font, in thousandths of its
 * size, rounded up (0 when it lacks it): from the first of its files that has
 * the character (a web font comes in one file for each range of characters).
 */
function advancesOf(files) {
  return Array.from(CHARACTERS, character => {
    for (const style of files) {
      const glyph = style.glyphOf(character.codePointAt(0));
      if (glyph) return Math.ceil(style.advance(glyph) * 1000 / style.unitsPerEm);
    }
    return 0;
  });
}

/** Written in place of the two digits of a character as wide as its base letter (the first character of its canonical decomposition, measured before it). */
const AS_BASE = ".";
/** Written, then a digit (how many, less one), in place of the digits of characters of a slanted style as wide as in its upright one. */
const AS_UPRIGHT = ",";
/** Of each character, where its base letter is among those measured before it; -1 when it has none. */
const BASES = Array.from(CHARACTERS, (character, at) => {
  const base = CHARACTERS.indexOf(character.normalize("NFD")[0]);
  return base < at ? base : -1;
});

/** Advances written two digits each, but AS_BASE for a character as wide as its base letter, and AS_UPRIGHT for those as wide as in `upright`. */
function digitsOf(advances, upright) {
  let digits = "";
  for (let at = 0; at < advances.length; at += 1) {
    const width = advances[at];
    if (width >= DIGITS.length ** 2) throw new Error(`${CHARACTERS[at]}: ${width}`);
    if (upright?.[at] === width) {
      let count = 1;
      while (count < DIGITS.length && upright[at + count] !== undefined && upright[at + count] === advances[at + count]) count += 1;
      digits += AS_UPRIGHT + DIGITS[count - 1];
      at += count - 1;
    } else if (BASES[at] >= 0 && advances[BASES[at]] === width) digits += AS_BASE;
    else digits += DIGITS[Math.floor(width / DIGITS.length)] + DIGITS[width % DIGITS.length];
  }
  return digits;
}

/** Each style measured, the names fontconfig may give it, and the style of the same weight whose widths stand for it when the family lacks it. */
const STYLES = {
  regular: { style: "Regular", names: ["Regular", "Book", "Roman", "Normal"] },
  italic: { style: "Italic", names: ["Italic", "Oblique"], fallback: "regular" },
  bold: { style: "Bold", names: ["Bold"] },
  boldItalic: { style: "Bold Italic", names: ["Bold Italic", "Bold Oblique"], fallback: "bold" },
};
const among = (list, wanted) => list.split(",").some(name => wanted.includes(name.trim()));

/** The font files of the folder given (fc-scan, its subfolders too): each one's path, families and styles. */
const folder = process.argv[2];
const folderFiles = folder
  ? execFileSync("fc-scan", ["--format", "%{file}\\t%{family}\\t%{style}\\n", folder], { encoding: "utf8" }).split("\n").filter(line => /\.(ttf|otf|woff)\t/i.test(line)).map(line => line.split("\t"))
  : [];

/**
 * The files of a style of a family: those of the folder given when it holds
 * the family, else the one fontconfig has installed; none when it only has
 * another style, the nearest it gives instead (DejaVu Sans Book for Bold Oblique).
 */
function fontFiles(family, { style, names }) {
  const inFolder = folderFiles.filter(([, families]) => among(families, [family]));
  if (inFolder.length) return inFolder.filter(([, , styles]) => among(styles, names)).map(([path]) => path).sort();
  const [path, families, styles] = execFileSync("fc-match", ["-f", "%{file}\\n%{family}\\n%{style}", `${family}:style=${style}`], { encoding: "utf8" }).split("\n");
  if (!among(families, [family])) throw new Error(`${family} ${style}: fc-match gives ${path} (${families}); give a folder that holds its files`);
  return among(styles, names) ? [path] : [];
}

const metrics = {};
const aliases = {};
/** Of the fonts an unknown one may be as narrow as, the advances of each style, and the line. */
const floors = [];
for (const { key, family, names, floor, ownLine } of FONTS) {
  const found = Object.fromEntries(Object.entries(STYLES).flatMap(([name, style]) => {
    const files = fontFiles(family, style);
    return files.length ? [[name, files.map(readFont)]] : [];
  }));
  if (!found.regular || !found.bold) throw new Error(`${family}: no Regular or Bold`);
  const line = ownLine === false ? 0 : Math.ceil(Math.max(...Object.values(found).map(files => files[0].line / files[0].unitsPerEm)) * 1000);
  const advances = Object.fromEntries(Object.entries(found).map(([name, files]) => [name, advancesOf(files)]));
  // A style the family lacks is drawn by slanting the upright one of its weight, of the same advances.
  for (const [name, { fallback }] of Object.entries(STYLES)) advances[name] ??= advances[fallback];
  if (floor !== false) floors.push({ line, advances });
  // A slanted style is given the wider of its advances and of its upright one's, Word possibly drawing it upright (from the upright
  // style alone installed); written only when wider somewhere, else its upright one stands for it.
  metrics[key] = { line };
  for (const [name, { fallback }] of Object.entries(STYLES)) {
    const upright = fallback && advances[fallback];
    const widths = upright ? advances[name].map((width, at) => (width > 0 && upright[at] > 0 ? Math.max(width, upright[at]) : width)) : advances[name];
    if (!upright || widths.join() !== upright.join()) metrics[key][name] = digitsOf(widths, upright);
  }
  for (const name of names) aliases[name] = key;
}
// Of each character, in each style, the narrowest advance of those fonts (0 when none has it); in a slanted style, of its upright one
// too, a font not measured possibly drawn upright; the lowest line.
const narrowest = (name, fallback) => Array.from(CHARACTERS, (_, at) => {
  const widths = floors.flatMap(({ advances }) => [advances[name][at], ...(fallback ? [advances[fallback][at]] : [])]).filter(width => width > 0);
  return widths.length ? Math.min(...widths) : 0;
});
for (const { key, as, names } of AT_LEAST_AS_WIDE) {
  metrics[key] = { line: 0, as };
  for (const name of names) aliases[name] = key;
}
metrics[NARROWEST] = {
  line: Math.min(...floors.map(({ line }) => line).filter(line => line > 0)),
  ...Object.fromEntries(Object.entries(STYLES).map(([name, { fallback }]) => [name, digitsOf(narrowest(name, fallback), fallback && narrowest(fallback))])),
};

const output = `// Written by scripts/generate-docx-font-metrics.mjs from the fonts installed (fc-match) and a folder of free fonts (fc-scan): run it again rather than edit this file.

/** The characters measured, in order: Latin text, its punctuation and common signs. */
export const DOCX_FONT_CHARACTERS = ${JSON.stringify(CHARACTERS)};

/** The digits of the widths of DOCX_FONT_METRICS, two for each character. */
export const DOCX_FONT_WIDTH_DIGITS = ${JSON.stringify(DIGITS)};

/** In the widths of DOCX_FONT_METRICS, in place of two digits: as wide as the character's base letter (the first of its canonical decomposition, NFD). */
export const DOCX_FONT_AS_BASE = ${JSON.stringify(AS_BASE)};

/** In the widths of a slanted style, then a digit (how many, less one): characters as wide as in its upright style. */
export const DOCX_FONT_AS_UPRIGHT = ${JSON.stringify(AS_UPRIGHT)};

/**
 * Of each font measured: the height of a line of single spacing (the tallest
 * Word or LibreOffice sets; 0 when the fonts it stands for set theirs
 * otherwise, unknown here), and the advance of each character of
 * DOCX_FONT_CHARACTERS in each of its styles; in thousandths of the font size,
 * rounded up; 0 for a character the font lacks. Of a slanted style, the
 * wider of its advance and of its upright style's, Word possibly drawing it
 * upright; left out when never wider. Of fonts not measured but at least as
 * wide as one that is, the advances of that one (\`as\`), and no line.
 * DOCX_NARROWEST_FONT: what any other font not measured is given.
 */
export const DOCX_FONT_METRICS: Record<string, { line: number; regular: string; bold: string; italic?: string; boldItalic?: string } | { line: number; as: string }> = {
${Object.entries(metrics).map(([key, { line, ...styles }]) => `  "${key}": {\n    line: ${line},\n${Object.entries(styles).map(([name, digits]) => `    ${name}: ${JSON.stringify(digits)},`).join("\n")}\n  },`).join("\n")}
};

/**
 * The key of DOCX_FONT_METRICS of a font not measured: of each character, the
 * narrowest advance of the fonts measured but the typewriter ones
 * (${FONTS.filter(({ floor }) => floor === false).map(({ family }) => family).join(", ")}), in a slanted style of their slanted and upright ones (the
 * narrower of both); their lowest line.
 */
export const DOCX_NARROWEST_FONT = ${JSON.stringify(NARROWEST)};

/** The font names a document may give (w:rFonts, theme fonts), in lower case, and the font measured of the same metrics, or narrower (\`as\`). */
export const DOCX_FONT_ALIASES: Record<string, string> = ${JSON.stringify(aliases, null, 2).replace(/\n}$/, ",\n}")};
`;
writeFileSync(fileURLToPath(new URL("../server/docxFontMetrics.ts", import.meta.url)), output);
console.log(`server/docxFontMetrics.ts: ${FONTS.length} fonts, ${Array.from(CHARACTERS).length} characters, ${output.length} bytes`);
