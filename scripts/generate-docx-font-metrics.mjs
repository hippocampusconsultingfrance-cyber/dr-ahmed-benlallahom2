#!/usr/bin/env node
/**
 * Writes server/docxFontMetrics.ts: the advance widths of the characters of
 * Latin text, and the height of a line, of the fonts a CV names most often,
 * measured on the fonts themselves or on fonts of the same metrics: Carlito
 * for Calibri, Caladea for Cambria, Liberation Sans, Serif, Mono and Sans
 * Narrow for Arial, Times New Roman, Courier New and Arial Narrow, Gelasio for
 * Georgia, EB Garamond for Garamond, TeX Gyre Adventor for Century Gothic,
 * Selawik for Segoe UI; DejaVu; and the free fonts of Canva, Google Docs and
 * recent Word (Montserrat, Open Sans, Lato…). Fonts of Office and Windows of
 * no free font of their metrics are given the advances their publishers or
 * string-pixel-width publish, character by character (PUBLISHED: Verdana,
 * Tahoma, Trebuchet MS, Comic Sans MS, Impact); Aptos and Calibri Light,
 * of no width published, Carlito's (STANDING_IN). Of each font, the height
 * of its line: of the font measured, else as @capsizecss/metrics publishes it
 * (VERTICAL). And the fonts Word draws a font it does not have with
 * (SUBSTITUTES): Liberation Sans for a sans serif font, Liberation Serif for
 * a serif one, Liberation Mono for a typewriter one, of each character the
 * wider of Liberation Sans and Serif when nothing tells which, the widest of
 * all for a script or decorative font, of Liberation Sans and Serif, Verdana
 * and Selawik for the Latin letters of an East Asian font. The DOCX
 * visibility check lays text out with them (IA-01).
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
 * latin-ext ones; WOFF2 is not read), TeX Gyre Adventor's OTF files
 * (package/assets), Selawik's TTF files (winstrap, package/dist/fonts), those
 * of Liberation Sans Narrow (@reductoai/portable-fonts, package/files), and
 * string-pixel-width's table (package/lib/widthsMap.js, in a folder
 * string-pixel-width/lib). The file was written from these versions, whose
 * widths another version may change:
 *   @fontsource/{eb-garamond,gelasio,inter,lato,lora,merriweather,montserrat,
 *     noto-sans,nunito,open-sans,playfair-display,poppins,raleway,roboto,
 *     source-sans-3}@5.3.0
 *   @docx-editor.dev/fonts@2.27.0 (TeX Gyre Adventor)
 *   winstrap@0.5.12 (Selawik 1.01, SIL Open Font License)
 *   @reductoai/portable-fonts@0.0.3 (Liberation Sans Narrow 1.07)
 *   string-pixel-width@1.11.0 (MIT)
 *   @capsizecss/metrics@4.4.0 (copied in VERTICAL)
 *   installed (Debian): fonts-crosextra-carlito 20230309, fonts-crosextra-caladea
 *     20200211, fonts-liberation2 2.1.5, fonts-dejavu-core 2.37.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

/**
 * Each font measured, the font names it stands for (lower case), and its
 * family for fontconfig; `widest: false` for a typewriter font, left out of
 * the widest of all (SUBSTITUTES); `ownLine: false` for a font of the advances
 * only of the one it stands for, whose lines Word sets otherwise: the height
 * of the font it stands for when published (VERTICAL), else the taller of its
 * own and single spacing's least (1.15).
 */
const FONTS = [
  { key: "carlito", family: "Carlito", names: ["calibri", "carlito"] },
  { key: "caladea", family: "Caladea", names: ["cambria", "caladea"] },
  { key: "liberation-sans", family: "Liberation Sans", names: ["arial", "helvetica", "arimo", "liberation sans"] },
  { key: "liberation-serif", family: "Liberation Serif", names: ["times new roman", "times", "tinos", "liberation serif"] },
  { key: "liberation-mono", family: "Liberation Mono", names: ["courier new", "courier", "cousine", "liberation mono"], widest: false },
  { key: "liberation-sans-narrow", family: "Liberation Sans Narrow", names: ["arial narrow", "liberation sans narrow"] },
  { key: "dejavu-sans", family: "DejaVu Sans", names: ["dejavu sans"] },
  { key: "dejavu-serif", family: "DejaVu Serif", names: ["dejavu serif"] },
  { key: "gelasio", family: "Gelasio", names: ["georgia", "gelasio"], ownLine: false, published: "georgia" },
  { key: "eb-garamond", family: "EB Garamond", names: ["garamond", "eb garamond"], ownLine: false },
  { key: "tex-gyre-adventor", family: "TeX Gyre Adventor", names: ["century gothic", "tex gyre adventor"], ownLine: false },
  { key: "selawik", family: "Selawik", names: ["segoe ui", "segoe ui light", "segoe ui semilight", "selawik"], published: "segoe ui" },
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
 * Fonts of Office, Windows and macOS of no free font of their metrics, and
 * the name string-pixel-width gives each: of each character of Basic Latin,
 * its advance in each style in hundredths of the font's size, rounded; taken
 * as wide as half a hundredth more, the most it may be. A letter beyond Basic
 * Latin as its base letter; another character as the widest of the fonts
 * measured (SUBSTITUTES).
 */
const PUBLISHED = [
  { key: "verdana", source: "verdana", names: ["verdana"] },
  { key: "tahoma", source: "tahoma", names: ["tahoma"] },
  { key: "trebuchet-ms", source: "trebuchet ms", names: ["trebuchet ms"] },
  { key: "comic-sans-ms", source: "comic sans ms", names: ["comic sans ms"] },
  { key: "impact", source: "impact", names: ["impact"] },
];
/**
 * The height of a line of single spacing of fonts measured on others, or
 * published (PUBLISHED), in their units: ascent, descent, line gap, units per
 * em, as @capsizecss/metrics publishes them (Word sets a line in the Windows
 * ascent and descent, of these fonts the same); Comic Sans MS and Impact, of
 * which it publishes none, their Windows ascent and descent.
 */
const VERTICAL = {
  "georgia": [1878, -449, 0, 2048],
  "segoe ui": [2210, -514, 0, 2048],
  "verdana": [2059, -430, 0, 2048],
  "tahoma": [2049, -423, 0, 2048],
  "trebuchet ms": [1923, -455, 0, 2048],
  "comic sans ms": [2257, -597, 0, 2048],
  "impact": [2066, -432, 0, 2048],
};
/**
 * Fonts of Office of no width published, and the font measured whose
 * advances and line stand for theirs, in one style or all (`style`): Aptos and
 * Calibri Light, drawn about as wide as Calibri (Aptos a little wider,
 * Calibri Light a little narrower), Carlito's; Aptos SemiBold and Segoe UI
 * Semibold, the bold of Carlito and Selawik, wider than theirs.
 */
const STANDING_IN = [
  { key: "carlito", names: ["aptos", "aptos display", "aptos narrow", "calibri light"] },
  { key: "carlito-bold", from: "carlito", style: "bold", names: ["aptos semibold"] },
  { key: "selawik-bold", from: "selawik", style: "bold", names: ["segoe ui semibold", "segoe ui bold"] },
];
/**
 * The fonts Word draws a font it does not have with, given what its font
 * table (w:fontTable) says of it: of each character, the widest advance of
 * these fonts (`of`, all of them but the typewriter ones when none is given),
 * in each style, and their tallest line; Liberation Sans, Serif and Mono stand
 * for themselves. As wide, in each style, every character of `every` (in
 * thousandths of the size): the Latin letters of an East Asian font of half
 * width (MS Gothic, SimSun…); fonts of no width known, heavy or wide (Arial
 * Black, Wide Latin…) or embedded in the document, as wide as the widest
 * character the check allows (1 em), their line the tallest.
 */
const SUBSTITUTES = [
  { key: "sans-or-serif", of: ["liberation-sans", "liberation-serif"] },
  { key: "widest", of: undefined },
  { key: "east-asian-latin", of: ["liberation-sans", "liberation-serif", "verdana", "selawik"], tallest: true },
  { key: "half-width", every: 500, tallest: true },
  { key: "unmeasured", every: 1000, tallest: true },
];
/** Names of fonts of no width known: heavy or wide ones, drawn wider than any measured. */
const UNMEASURED = ["arial black", "aptos black", "aptos extrabold", "segoe ui black", "wide latin"];
/** Names of East Asian fonts whose Latin letters are all of half their width (half-width), or proportional (east-asian-latin), as NFKC writes them. */
const HALF_WIDTH = ["ms gothic", "ms mincho", "simsun", "nsimsun", "ms ゴシック", "ms 明朝", "宋体", "新宋体"];
const EAST_ASIAN = [
  "ms pgothic", "ms pmincho", "ms ui gothic", "ms pゴシック", "ms p明朝", "yu gothic", "yu gothic ui", "yu mincho", "游ゴシック", "游明朝", "meiryo", "meiryo ui", "メイリオ",
  "microsoft yahei", "微软雅黑", "microsoft jhenghei", "微軟正黑體", "simhei", "黑体", "kaiti", "楷体", "fangsong", "仿宋", "dengxian", "等线",
  "mingliu", "細明體", "pmingliu", "新細明體", "malgun gothic", "맑은 고딕", "gulim", "굴림", "dotum", "돋움", "batang", "바탕",
];
/** Basic Latin, Latin-1 and Latin Extended-A, and the punctuation and signs a CV writes beyond them. */
const CHARACTERS = [
  ...range(0x20, 0x7e), ...range(0xa0, 0x17f),
  ...range(0x2010, 0x2027), 0x2030, 0x2032, 0x2033, 0x2039, 0x203a, 0x20ac, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2264, 0x2265, 0x25cf, 0x2713,
].map(code => String.fromCodePoint(code)).join("");
/** Single spacing at its least: of a font whose own line is not known. */
const LEAST_LINE = 1150;

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

/** Each style measured, the names fontconfig gives it first, and the style of the same weight whose widths stand for it when the family lacks it. */
const STYLES = {
  regular: { style: "Regular", names: ["Regular", "Book", "Roman", "Normal"] },
  italic: { style: "Italic", names: ["Italic", "Oblique"], fallback: "regular" },
  bold: { style: "Bold", names: ["Bold"] },
  boldItalic: { style: "Bold Italic", names: ["Bold Italic", "Bold Oblique"], fallback: "bold" },
};
const among = (list, wanted) => list.split(",").some(name => wanted.includes(name.trim()));
const firstAmong = (list, wanted) => wanted.includes(list.split(",")[0].trim());

/** The font files of the folder given (fc-scan, its subfolders too): each one's path, families and styles. */
const folder = process.argv[2];
const folderFiles = folder
  ? execFileSync("fc-scan", ["--format", "%{file}\\t%{family}\\t%{style}\\n", folder], { encoding: "utf8" }).split("\n").filter(line => /\.(ttf|otf|woff)\t/i.test(line)).map(line => line.split("\t"))
  : [];

/**
 * The files of a style of a family: those of the folder given when it holds
 * the family, of that style first (Selawik Light is also Selawik Regular);
 * else the one fontconfig has installed; none when it only has another style,
 * the nearest it gives instead (DejaVu Sans Book for Bold Oblique).
 */
function fontFiles(family, { style, names }) {
  const inFolder = folderFiles.filter(([, families]) => among(families, [family]));
  if (inFolder.length) return inFolder.filter(([, , styles]) => firstAmong(styles, names)).map(([path]) => path).sort();
  const [path, families, styles] = execFileSync("fc-match", ["-f", "%{file}\\n%{family}\\n%{style}", `${family}:style=${style}`], { encoding: "utf8" }).split("\n");
  if (!among(families, [family])) throw new Error(`${family} ${style}: fc-match gives ${path} (${families}); give a folder that holds its files`);
  return among(styles, names) ? [path] : [];
}

/** The height of a line of a font published (VERTICAL), in thousandths of its size, rounded up. */
const publishedLine = name => {
  const [ascent, descent, gap, unitsPerEm] = VERTICAL[name];
  return Math.ceil((ascent - descent + gap) * 1000 / unitsPerEm);
};

/** Of each font, its advances in each style (STYLES), in thousandths of its size, and its line; the names it stands for. */
const fonts = {};
const aliases = {};
for (const { key, family, names, ownLine, published } of FONTS) {
  const found = Object.fromEntries(Object.entries(STYLES).flatMap(([name, style]) => {
    const files = fontFiles(family, style);
    return files.length ? [[name, files.map(readFont)]] : [];
  }));
  if (!found.regular || !found.bold) throw new Error(`${family}: no Regular or Bold`);
  const own = Math.ceil(Math.max(...Object.values(found).map(files => files[0].line / files[0].unitsPerEm)) * 1000);
  const line = ownLine === false ? (published ? publishedLine(published) : Math.max(own, LEAST_LINE)) : Math.max(own, published ? publishedLine(published) : 0);
  const advances = Object.fromEntries(Object.entries(found).map(([name, files]) => [name, advancesOf(files)]));
  // A style the family lacks is drawn by slanting the upright one of its weight, of the same advances.
  for (const [name, { fallback }] of Object.entries(STYLES)) advances[name] ??= advances[fallback];
  fonts[key] = { line, advances, widest: FONTS.find(font => font.key === key).widest !== false };
  for (const name of names) aliases[name] = key;
}
/** Of each character, in each style, the widest advance of these fonts (0 when none has it). */
const widestOf = keys => Object.fromEntries(Object.keys(STYLES).map(style => [style, Array.from(CHARACTERS, (_, at) => Math.max(0, ...keys.map(key => fonts[key].advances[style][at])))]));
const measured = Object.keys(fonts).filter(key => fonts[key].widest);
const widths = createRequire(import.meta.url)(join(folder ?? ".", "string-pixel-width/lib/widthsMap.js"));
const table = widths.default ?? widths;
for (const { key, source, names } of PUBLISHED) {
  const published = table[source];
  if (!published) throw new Error(`${source}: not in string-pixel-width`);
  const widest = widestOf(measured);
  const advances = Object.fromEntries(Object.keys(STYLES).map((style, index) => [style, Array.from(CHARACTERS, (character, at) => {
    const own = published[character] ?? published[character.normalize("NFD")[0]];
    // Its four styles, in string-pixel-width's order: regular, bold, italic, bold italic.
    return own ? own[[0, 2, 1, 3][index]] * 10 + 5 : widest[style][at];
  })]));
  fonts[key] = { line: publishedLine(source), advances, widest: true };
  for (const name of names) aliases[name] = key;
}
const tallest = Math.max(...Object.values(fonts).map(({ line }) => line));
const metrics = {};
for (const [key, { line, advances }] of Object.entries(fonts)) metrics[key] = { line, advances };
for (const { key, from, style, names } of STANDING_IN) {
  if (from) metrics[key] = { line: fonts[from].line, advances: Object.fromEntries(Object.keys(STYLES).map(name => [name, fonts[from].advances[/italic/i.test(name) ? `${style}Italic` : style]])) };
  for (const name of names) aliases[name] = key;
}
for (const { key, of, every, tallest: tall } of SUBSTITUTES) {
  const keys = of ?? Object.keys(fonts).filter(font => fonts[font].widest);
  metrics[key] = every ? { line: tallest, every } : { line: tall ? tallest : Math.max(...keys.map(font => fonts[font].line)), advances: widestOf(keys) };
}
for (const name of UNMEASURED) aliases[name] = "unmeasured";
for (const name of HALF_WIDTH) aliases[name.normalize("NFKC")] = "half-width";
for (const name of EAST_ASIAN) aliases[name.normalize("NFKC")] = "east-asian-latin";

/** A font's styles written (digitsOf): its slanted ones only where not as wide as their upright one, as Word draws a slanted style it has. */
function written({ line, advances, every }) {
  if (every) return `    line: ${line},\n    every: ${every},`;
  const styles = Object.entries(STYLES).flatMap(([name, { fallback }]) => {
    const upright = fallback && advances[fallback];
    return !upright || advances[name].join() !== upright.join() ? [[name, digitsOf(advances[name], upright)]] : [];
  });
  return [`    line: ${line},`, ...styles.map(([name, digits]) => `    ${name}: ${JSON.stringify(digits)},`)].join("\n");
}

const output = `// Written by scripts/generate-docx-font-metrics.mjs from the fonts installed (fc-match), a folder of free fonts (fc-scan) and the widths published of others: run it again rather than edit this file.

/** The characters measured, in order: Latin text, its punctuation and common signs. */
export const DOCX_FONT_CHARACTERS = ${JSON.stringify(CHARACTERS)};

/** The digits of the widths of DOCX_FONT_METRICS, two for each character. */
export const DOCX_FONT_WIDTH_DIGITS = ${JSON.stringify(DIGITS)};

/** In the widths of DOCX_FONT_METRICS, in place of two digits: as wide as the character's base letter (the first of its canonical decomposition, NFD). */
export const DOCX_FONT_AS_BASE = ${JSON.stringify(AS_BASE)};

/** In the widths of a slanted style, then a digit (how many, less one): characters as wide as in its upright style. */
export const DOCX_FONT_AS_UPRIGHT = ${JSON.stringify(AS_UPRIGHT)};

/**
 * Of each font measured, or published, and of the fonts Word draws one it
 * does not have with: the height of a line of single spacing (the tallest Word
 * or LibreOffice sets, or as published), and the advance of each character of
 * DOCX_FONT_CHARACTERS in each of its styles; in thousandths of the font size,
 * rounded up; 0 for a character the font lacks. A slanted style is left out
 * where as wide as its upright one (Word draws the slanted style a font has,
 * else slants the upright one). Of fonts of every character as wide,
 * \`every\`: that width.
 */
export const DOCX_FONT_METRICS: Record<string, { line: number; regular: string; bold: string; italic?: string; boldItalic?: string } | { line: number; every: number }> = {
${Object.entries(metrics).map(([key, font]) => `  "${key}": {\n${written(font)}\n  },`).join("\n")}
};

/**
 * The keys of DOCX_FONT_METRICS of the fonts Word draws a font it does not
 * have with: a sans serif one (Arial), a serif one (Times New Roman), a
 * typewriter one (Courier New); of each character the wider of the first two,
 * when nothing tells which (\`unknown\`); the widest of all fonts measured but
 * the typewriter ones, for a script or decorative one; the Latin letters of an
 * East Asian font, proportional or of half width; a font of no width known,
 * every character 1 em wide.
 */
export const DOCX_SUBSTITUTE_FONTS = { sans: "liberation-sans", serif: "liberation-serif", typewriter: "liberation-mono", unknown: "sans-or-serif", decorative: "widest", eastAsian: "east-asian-latin", halfWidth: "half-width", unmeasured: "unmeasured" } as const;

/** The font names a document may give (w:rFonts, theme fonts), in lower case and NFKC, and the font of DOCX_FONT_METRICS of their metrics, or that stands for them. */
export const DOCX_FONT_ALIASES: Record<string, string> = ${JSON.stringify(aliases, null, 2).replace(/\n}$/, ",\n}")};
`;
writeFileSync(fileURLToPath(new URL("../server/docxFontMetrics.ts", import.meta.url)), output);
console.log(`server/docxFontMetrics.ts: ${FONTS.length} fonts measured, ${PUBLISHED.length} published, ${Array.from(CHARACTERS).length} characters, ${output.length} bytes`);
