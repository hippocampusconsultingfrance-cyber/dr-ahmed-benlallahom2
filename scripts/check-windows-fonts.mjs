#!/usr/bin/env node
// For the owner (IA-01): checks, on a Windows machine with Office, that the bounds server/docxVisibleText.ts gives the fonts of
// Windows that no source publishes metrics for hold for Windows' own files. It reads them from server/docxFontMetrics.ts:
// - Hebrew, Arabic and Persian (DOCX_COMPLEX_METRICS): each character's widest form (its glyph, its Arabic Presentation Forms, what
//   GSUB's single and alternate substitutions make of it, as scripts/generate-docx-font-metrics.mjs measures the free fonts), and
//   each font's line (its Windows ascent and descent);
// - signs (DOCX_FONT_METRICS.signs) and emoji (DOCX_EMOJI_METRICS), which the check gives the signs and emoji of a run that names
//   Segoe UI Symbol or Segoe UI Emoji, character by character, and their line;
// - kerning: each font's largest positive pair (GPOS pair adjustments, the kern table) against what the check lets kerning add
//   (DOCX_FONT_KERNING of the font standing in for it, by style; DOCX_KERNING_MOST for a font of no files here, such as Aptos;
//   DOCX_KERNING_FALLBACK for the fonts of signs, scripts and emoji).
// Copy into one folder, from C:\Windows\Fonts, the .ttf files (a .ttc is not read) of:
// - arial, times, tahoma, segoeui and their bold files; simpo (Simplified Arabic), trado (Traditional Arabic), arabtype (Arabic
//   Typesetting), majalla (Sakkal Majalla); david and davidbd (David), mriam (Miriam; not mriamc, Miriam Fixed, of no bound),
//   dubai-* (Dubai);
// - seguisym (Segoe UI Symbol) and seguiemj (Segoe UI Emoji);
// - calibri*, cambria* (.ttf), aptos*, georgia*, cour* (Courier New), arialn* (Arial Narrow), gara* (Garamond), frabk* (Franklin
//   Gothic Book) and segoeui*'s styles.
// Then, at the root of a checkout:
//   node scripts/check-windows-fonts.mjs <folder of the fonts> server/docxFontMetrics.ts
// It prints each character a font draws wider than its bound, each kerning pair wider, and each line taller than the check's, and
// exits with 1 if there is any. Only the result goes back into the repository, never the fonts.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [folder, metricsPath] = process.argv.slice(2);
const source = readFileSync(metricsPath, "utf8");
const constant = name => JSON.parse(new RegExp(`export const ${name}(?:: [^=]+)? = (.+?);\\n`, "s").exec(source)[1].replace(/(\w+):/g, '"$1":').replace(/,\s*([}\]])/g, "$1"));
const DIGITS = constant("DOCX_FONT_WIDTH_DIGITS");
const AS_BEFORE = constant("DOCX_FONT_AS_BEFORE");
const complexCharacters = Array.from(constant("DOCX_COMPLEX_CHARACTERS"));
const complex = constant("DOCX_COMPLEX_METRICS");
const emoji = constant("DOCX_EMOJI_METRICS");
const decode = digits => {
  const widths = [];
  for (let at = 0; at < digits.length; at += 2) {
    const value = index => DIGITS.indexOf(digits[index]);
    if (digits[at] === AS_BEFORE) for (let count = value(at + 1); count >= 0; count -= 1) widths.push(widths.at(-1));
    else widths.push(value(at) * DIGITS.length + value(at + 1));
  }
  return widths;
};
const bounds = { regular: decode(complex.regular), bold: decode(complex.bold) };
// The bound of signs, by character measured (DOCX_FONT_CHARACTERS), decoded as the check decodes DOCX_FONT_METRICS (styleWidths):
// a digit pair a width, DOCX_FONT_AS_BEFORE repeats, DOCX_FONT_AS_BASE the width of the character's base letter.
const fontCharacters = Array.from(JSON.parse(/export const DOCX_FONT_CHARACTERS = (".*?");\n/s.exec(source)[1]));
const AS_BASE = constant("DOCX_FONT_AS_BASE");
const measuredIndex = new Map(fontCharacters.map((character, at) => [character, at]));
const bases = fontCharacters.map(character => measuredIndex.get(character.normalize("NFD")[0]) ?? 0);
// eslint-disable-next-line no-control-regex, no-regex-spaces -- the table's lines as the generator writes them, newlines and indentation
const signsMetrics = new RegExp('\n  "signs": \\{\n    line: (\\d+),\n    regular: "([^"]*)",(?:\n    italic: "[^"]*",)?\n    bold: "([^"]*)"', "s").exec(source);
const decodeWidths = digits => {
  const widths = [];
  for (let at = 0; at < digits.length; at += digits[at] === AS_BASE ? 1 : 2) {
    const value = index => DIGITS.indexOf(digits[index]);
    if (digits[at] === AS_BEFORE) for (let count = value(at + 1); count >= 0; count -= 1) widths.push(widths.at(-1));
    else widths.push(digits[at] === AS_BASE ? widths[bases[widths.length]] : value(at) * DIGITS.length + value(at + 1));
  }
  return widths;
};
const signs = { line: Number(signsMetrics[1]), regular: decodeWidths(signsMetrics[2]), bold: decodeWidths(signsMetrics[3]) };
const kerningOf = constant("DOCX_FONT_KERNING");
const kerningMost = constant("DOCX_KERNING_MOST");
const kerningFallback = constant("DOCX_KERNING_FALLBACK");
/** The font of DOCX_FONT_KERNING each file of Windows' stands for, by its name, and its style by its name; else of no files here. */
const STANDS_FOR = [[/^calibri/i, "carlito"], [/^cambria/i, "caladea"], [/^arialn/i, "liberation-sans-narrow"], [/^arial/i, "liberation-sans"], [/^times/i, "liberation-serif"], [/^cour/i, "liberation-mono"], [/^georgia/i, "gelasio"], [/^segoeui/i, "selawik"], [/^seguisym|^seguiemj|^simpo|^trado|^arabtype|^majalla|^david|^mriam|^dubai/i, "signs"]];
const styleOf = file => (/(z|bi)\.tt|bolditalic/i.test(file) ? "boldItalic" : /(b|bd)\.tt|bold/i.test(file) ? "bold" : /(i)\.tt|italic/i.test(file) ? "italic" : "regular");
function positiveKerning(t) {
  const valueSize = format => [0, 1, 2, 3, 4, 5, 6, 7].reduce((size, bit) => size + ((format >> bit) & 1) * 2, 0);
  const xAdvance = (table, at, format) => (format & 4 ? table.readInt16BE(at + (format & 1 ? 2 : 0) + (format & 2 ? 2 : 0)) : 0);
  let most = 0;
  const gpos = t.get("GPOS");
  if (gpos) {
    const subtable = (type, at) => {
      if (type === 9) return subtable(gpos.readUInt16BE(at + 2), at + gpos.readUInt32BE(at + 4));
      if (type !== 2) return;
      const [first, second] = [gpos.readUInt16BE(at + 4), gpos.readUInt16BE(at + 6)];
      const size = valueSize(first) + valueSize(second);
      const pair = record => xAdvance(gpos, record, first) + xAdvance(gpos, record + valueSize(first), second);
      if (gpos.readUInt16BE(at) === 1) {
        for (let set = 0, sets = gpos.readUInt16BE(at + 8); set < sets; set += 1) {
          const pairs = at + gpos.readUInt16BE(at + 10 + set * 2);
          for (let item = 0, count = gpos.readUInt16BE(pairs); item < count; item += 1) most = Math.max(most, pair(pairs + 4 + item * (2 + size)));
        }
      } else if (gpos.readUInt16BE(at) === 2) {
        const [classes1, classes2] = [gpos.readUInt16BE(at + 12), gpos.readUInt16BE(at + 14)];
        for (let record = 0; record < classes1 * classes2; record += 1) most = Math.max(most, pair(at + 16 + record * size));
      }
    };
    const list = gpos.readUInt16BE(8);
    for (let index = 0, count = gpos.readUInt16BE(list); index < count; index += 1) {
      const lookup = list + gpos.readUInt16BE(list + 2 + index * 2);
      for (let item = 0, subtables = gpos.readUInt16BE(lookup + 4); item < subtables; item += 1) subtable(gpos.readUInt16BE(lookup), lookup + gpos.readUInt16BE(lookup + 6 + item * 2));
    }
  }
  const kern = t.get("kern");
  if (kern && kern.readUInt16BE(0) === 0) {
    for (let index = 0, at = 4, count = kern.readUInt16BE(2); index < count; index += 1, at += kern.readUInt16BE(at + 2)) {
      if (kern.readUInt16BE(at + 4) >> 8 === 0) for (let item = 0, pairs = kern.readUInt16BE(at + 6); item < pairs; item += 1) most = Math.max(most, kern.readInt16BE(at + 18 + item * 6));
    }
  }
  return Math.ceil(most * 1000 / t.get("head").readUInt16BE(18));
}

function tables(path) {
  const file = readFileSync(path);
  const out = new Map();
  for (let i = 0, n = file.readUInt16BE(4); i < n; i += 1) {
    const r = 12 + i * 16;
    out.set(file.toString("latin1", r, r + 4), file.subarray(file.readUInt32BE(r + 8), file.readUInt32BE(r + 8) + file.readUInt32BE(r + 12)));
  }
  return out;
}
function cmapOf(cmap) {
  const map = new Map();
  for (let index = 0, count = cmap.readUInt16BE(2); index < count; index += 1) {
    const record = 4 + index * 8;
    const [platform, encoding, offset] = [cmap.readUInt16BE(record), cmap.readUInt16BE(record + 2), cmap.readUInt32BE(record + 4)];
    const format = cmap.readUInt16BE(offset);
    if (format === 4 && platform === 3 && encoding === 1) {
      const segments = cmap.readUInt16BE(offset + 6) / 2;
      for (let segment = 0; segment < segments; segment += 1) {
        const end = cmap.readUInt16BE(offset + 14 + segment * 2);
        const start = cmap.readUInt16BE(offset + 16 + segments * 2 + segment * 2);
        const delta = cmap.readInt16BE(offset + 16 + segments * 4 + segment * 2);
        const rangeAt = offset + 16 + segments * 6 + segment * 2;
        const rangeOffset = cmap.readUInt16BE(rangeAt);
        for (let code = start; code <= end && code !== 0xffff; code += 1) {
          const glyph = rangeOffset ? cmap.readUInt16BE(rangeAt + rangeOffset + (code - start) * 2) : code;
          if (glyph) map.set(code, (glyph + delta) & 0xffff);
        }
      }
    } else if (format === 12 && platform === 3 && encoding === 10) {
      for (let group = 0, groups = cmap.readUInt32BE(offset + 12); group < groups; group += 1) {
        const at = offset + 16 + group * 12;
        for (let code = cmap.readUInt32BE(at); code <= cmap.readUInt32BE(at + 4); code += 1) map.set(code, cmap.readUInt32BE(at + 8) + code - cmap.readUInt32BE(at));
      }
    }
  }
  return map;
}
function singleSubstitutions(gsub) {
  const single = new Map();
  if (!gsub) return single;
  const add = (from, to) => (single.get(from) ?? single.set(from, []).get(from)).push(to);
  const coverage = at => {
    const glyphs = [];
    if (gsub.readUInt16BE(at) === 1) for (let i = 0, n = gsub.readUInt16BE(at + 2); i < n; i += 1) glyphs.push(gsub.readUInt16BE(at + 4 + i * 2));
    else for (let i = 0, n = gsub.readUInt16BE(at + 2); i < n; i += 1) for (let g = gsub.readUInt16BE(at + 4 + i * 6); g <= gsub.readUInt16BE(at + 6 + i * 6); g += 1) glyphs.push(g);
    return glyphs;
  };
  const subtable = (type, at) => {
    if (type === 7) return subtable(gsub.readUInt16BE(at + 2), at + gsub.readUInt32BE(at + 4));
    if (type === 1) coverage(at + gsub.readUInt16BE(at + 2)).forEach((glyph, index) => add(glyph, gsub.readUInt16BE(at) === 1 ? (glyph + gsub.readInt16BE(at + 4)) & 0xffff : gsub.readUInt16BE(at + 6 + index * 2)));
    if (type === 3) coverage(at + gsub.readUInt16BE(at + 2)).forEach((glyph, index) => {
      const set = at + gsub.readUInt16BE(at + 6 + index * 2);
      for (let i = 0, n = gsub.readUInt16BE(set); i < n; i += 1) add(glyph, gsub.readUInt16BE(set + 2 + i * 2));
    });
  };
  const list = gsub.readUInt16BE(8);
  for (let i = 0, n = gsub.readUInt16BE(list); i < n; i += 1) {
    const lookup = list + gsub.readUInt16BE(list + 2 + i * 2);
    for (let j = 0, m = gsub.readUInt16BE(lookup + 4); j < m; j += 1) subtable(gsub.readUInt16BE(lookup), lookup + gsub.readUInt16BE(lookup + 6 + j * 2));
  }
  return single;
}
const forms = new Map();
for (let code = 0xfb50; code <= 0xfeff; code += 1) {
  const base = String.fromCodePoint(code).normalize("NFKC");
  if (Array.from(base).length === 1 && base.codePointAt(0) !== code) (forms.get(base.codePointAt(0)) ?? forms.set(base.codePointAt(0), []).get(base.codePointAt(0))).push(code);
}
let problems = 0;
for (const file of readdirSync(folder).filter(name => /\.(ttf|otf)$/i.test(name))) {
  const t = tables(join(folder, file));
  const unitsPerEm = t.get("head").readUInt16BE(18);
  const metrics = t.get("hhea").readUInt16BE(34);
  const hmtx = t.get("hmtx");
  const os2 = t.get("OS/2");
  const advance = glyph => hmtx.readUInt16BE(Math.min(glyph, metrics - 1) * 4);
  const single = singleSubstitutions(t.get("GSUB"));
  const widest = glyph => {
    let most = advance(glyph);
    const seen = new Set([glyph]);
    const queue = [glyph];
    while (queue.length) for (const to of single.get(queue.pop()) ?? []) if (!seen.has(to)) {
      seen.add(to);
      queue.push(to);
      most = Math.max(most, advance(to));
    }
    return Math.ceil(most * 1000 / unitsPerEm);
  };
  const cmap = cmapOf(t.get("cmap"));
  const bold = os2.readUInt16BE(4) >= 600;
  const line = (os2.readUInt16BE(74) + os2.readUInt16BE(76)) / unitsPerEm;
  if (line * 1000 > complex.line && /^simpo|^trado|^arabtype|^majalla|^david|^mriam|^dubai/i.test(file)) {
    problems += 1;
    console.log(`${file}: line ${line.toFixed(3)} taller than the check's ${complex.line / 1000} for the Arabic and Hebrew fonts of Office`);
  }
  complexCharacters.forEach((character, at) => {
    const glyphs = [character.codePointAt(0), ...(forms.get(character.codePointAt(0)) ?? [])].map(code => cmap.get(code)).filter(Boolean);
    const width = Math.max(0, ...glyphs.map(widest));
    const bound = bounds[bold ? "bold" : "regular"][at];
    if (width > bound && bound > 0) {
      problems += 1;
      console.log(`${file}: ${character} U+${character.codePointAt(0).toString(16)} ${width} > ${bound}`);
    }
  });
  const standsFor = STANDS_FOR.find(([pattern]) => pattern.test(file))?.[1];
  const kerningBound = standsFor === "signs" ? kerningFallback : standsFor ? kerningOf[standsFor]?.[styleOf(file)] ?? kerningMost : kerningMost;
  const kerned = positiveKerning(t);
  if (kerned > kerningBound) {
    problems += 1;
    console.log(`${file}: a kerning pair of ${kerned} thousandths wider than the check's ${kerningBound} (${standsFor ?? "a font of no files here"})`);
  }
  if (/^seguisym|^seguiemj/i.test(file)) {
    // A sign of these fonts (not a letter, a figure, punctuation nor a space, of no bound in the check) wider than the bound of signs.
    if (line * 1000 > Math.max(signs.line, emoji.line)) {
      problems += 1;
      console.log(`${file}: line ${line.toFixed(3)} taller than the check's ${Math.max(signs.line, emoji.line) / 1000} for signs and emoji`);
    }
    fontCharacters.forEach((character, at) => {
      const glyph = cmap.get(character.codePointAt(0));
      if (!glyph || /[\p{L}\p{N}\p{P}\p{Z}\p{Cc}]/u.test(character)) return;
      const width = Math.ceil(advance(glyph) * 1000 / unitsPerEm);
      const bound = signs[bold ? "bold" : "regular"][at];
      if (bound > 0 && width > bound) {
        problems += 1;
        console.log(`${file}: sign ${character} U+${character.codePointAt(0).toString(16)} ${width} > ${bound}`);
      }
    });
  }
  if (/emj|emoji/i.test(file)) {
    const most = Math.max(...Array.from({ length: metrics }, (_, glyph) => advance(glyph)));
    if (most * 1000 / unitsPerEm > emoji.regular) {
      problems += 1;
      console.log(`${file}: an emoji ${Math.ceil(most * 1000 / unitsPerEm)} wider than the bound ${emoji.regular}`);
    }
  }
}
console.log(problems ? `${problems} characters, kerning pairs or lines beyond their bound` : "every Hebrew and Arabic character, every sign of Segoe UI Symbol and Emoji, every kerning pair and every line within its bound");
process.exitCode = problems ? 1 : 0;
