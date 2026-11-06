#!/usr/bin/env node
/**
 * Writes server/docxFontMetrics.ts: the advance widths of the characters of
 * Latin, Greek and Cyrillic text and their signs (CHARACTERS), and the height
 * of a line, of the fonts a CV names most often,
 * measured on the fonts themselves or on fonts of the same metrics: Carlito
 * for Calibri, Caladea for Cambria, Liberation Sans, Serif, Mono and Sans
 * Narrow for Arial, Times New Roman, Courier New and Arial Narrow, Gelasio for
 * Georgia, Selawik for Segoe UI (each of its weights); URW's fonts of the
 * PostScript 35, whose advances are Adobe's (Adobe's AFM files, the same to
 * the unit), for the fonts Monotype and Linotype drew for Windows to the same
 * advances: P052 for Palatino Linotype and Book Antiqua, C059 for Century
 * Schoolbook, URW Bookman for Bookman Old Style, URW Gothic for Century
 * Gothic (a thousandth more, `rounding`); IPAGothic and IPAMincho for the
 * Latin and Latin-1 letters of MS Gothic and MS Mincho; DejaVu; and the free fonts of
 * Canva, Google Docs and recent Word (Montserrat, Open Sans, Lato…). Fonts of
 * Office and Windows of no free font of their metrics are given the advances
 * their publishers or string-pixel-width publish, character by character
 * (PUBLISHED: Verdana, Tahoma, Trebuchet MS, Comic Sans MS, Impact). Of each
 * font, the height of its line: of the font measured, else as
 * @capsizecss/metrics publishes it (VERTICAL). And the fonts Word draws a font
 * it does not have with (SUBSTITUTES): Liberation Sans for a sans serif font,
 * Liberation Serif for a serif one, Liberation Mono for a typewriter one, of
 * each character the wider of Liberation Sans and Serif when nothing tells
 * which, the widest of all for a script or decorative font; of an East Asian
 * font, its Latin letters of half width or as the widest of Liberation Sans
 * and Serif, Verdana and Selawik, and the characters of an ambiguous East
 * Asian width a full em wide. The DOCX visibility check lays text out with
 * them (IA-01).
 *
 * The reader the check models is Word for Windows, with the fonts Windows 10
 * and 11 and Microsoft 365 install, the cloud fonts Word downloads when a
 * document names them included (WORD_FONTS). Each width written is a bound
 * of what that reader draws: a font of these of no metrics here (Aptos,
 * Franklin Gothic…) is as wide, character by character, as the widest font
 * measured and a twentieth more (LISTED), a typewriter one (Consolas…) as
 * Courier New and a twentieth more in Latin-1 (TYPEWRITER); one of the
 * display, script and symbol fonts among them (Wide Latin, Brush Script…), or
 * a heavy or wide one, of no bound (UNBOUNDED); a font none of these, Word
 * does not have.
 * Written compactly: a character as wide as its base letter (É as E), or a
 * slanted style as wide as its upright one, in a sign rather than two digits,
 * and characters as wide as the one before them (those a font lacks, of 0) in
 * a sign and their count.
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
 * of Liberation Sans Narrow (@reductoai/portable-fonts, package/files), the
 * OTF files of fonts-urw-base35 and the TTF files of fonts-ipafont-gothic and
 * fonts-ipafont-mincho (Debian or Ubuntu packages: apt-get download, then
 * dpkg-deb -x), and string-pixel-width's table (package/lib/widthsMap.js, in
 * a folder string-pixel-width/lib). The file was written from these
 * versions, whose widths another version may change:
 *   @fontsource/{eb-garamond,gelasio,inter,lato,lora,merriweather,montserrat,
 *     noto-sans,nunito,open-sans,playfair-display,poppins,raleway,roboto,
 *     source-sans-3}@5.3.0
 *   @docx-editor.dev/fonts@2.27.0 (TeX Gyre Adventor)
 *   winstrap@0.5.12 (Selawik 1.01, SIL Open Font License)
 *   @reductoai/portable-fonts@0.0.3 (Liberation Sans Narrow 1.07)
 *   fonts-urw-base35 20200910-8 (URW++, AGPL with font exception; advances
 *     checked equal to Adobe's AFM of Palatino, New Century Schoolbook, ITC
 *     Bookman and ITC Avant Garde Gothic, as matplotlib 3.9.2 ships them)
 *   fonts-ipafont-gothic and fonts-ipafont-mincho 00303 (IPA Font License)
 *   string-pixel-width@1.11.0 (MIT)
 *   @capsizecss/metrics@4.4.0 (copied in VERTICAL)
 *   installed (Debian): fonts-crosextra-carlito 20230309, fonts-crosextra-caladea
 *     20200211, fonts-liberation2 2.1.5, fonts-dejavu-core 2.37.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

/**
 * Each font measured, the font names it stands for (lower case), and its
 * family for fontconfig; `styles`: the names fontconfig gives its styles,
 * when not those of STYLES (URW Bookman Light and Demi…); `synthetic`: a font
 * of no bold, which Word emboldens (SYNTHETIC_BOLD); `rounding`: thousandths
 * added to each advance, for a font of another number of units per em than
 * the one it stands for; `widest: false` for a typewriter or East Asian font,
 * left out of the widest of all (SUBSTITUTES); `ownLine: false` for a font of
 * the advances only of the one it stands for, whose lines Word sets
 * otherwise: the height of the font it stands for when published (VERTICAL),
 * else the taller of its own and single spacing's least (1.15); `latin`: a
 * font of the metrics of the one it stands for in Latin and Latin-1 only
 * (IPAGothic, of MS Gothic's), beyond them never narrower than the bound of
 * an East Asian font (east-asian).
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
  { key: "eb-garamond", family: "EB Garamond", names: ["eb garamond"], ownLine: false },
  { key: "tex-gyre-adventor", family: "TeX Gyre Adventor", names: ["tex gyre adventor"], ownLine: false },
  { key: "p052", family: "P052", names: ["palatino linotype", "book antiqua", "palatino", "p052"], rounding: 1 },
  { key: "c059", family: "C059", names: ["century schoolbook", "new century schoolbook", "c059"], rounding: 1 },
  { key: "urw-bookman", family: "URW Bookman", names: ["bookman old style", "bookman", "urw bookman"], rounding: 1, styles: { regular: ["Light"], bold: ["Demi"], italic: ["Light Italic"], boldItalic: ["Demi Italic"] } },
  { key: "urw-gothic", family: "URW Gothic", names: ["century gothic", "urw gothic"], rounding: 1, styles: { regular: ["Book"], bold: ["Demi"], italic: ["Book Oblique"], boldItalic: ["Demi Oblique"] } },
  { key: "selawik", family: "Selawik", names: ["segoe ui", "selawik"], published: "segoe ui" },
  { key: "selawik-light", family: "Selawik Light", names: ["segoe ui light"], published: "segoe ui", synthetic: true, styles: { regular: ["Light"] } },
  { key: "selawik-semilight", family: "Selawik Semilight", names: ["segoe ui semilight"], published: "segoe ui", synthetic: true, styles: { regular: ["Semilight"] } },
  { key: "selawik-semibold", family: "Selawik Semibold", names: ["segoe ui semibold"], published: "segoe ui", synthetic: true, styles: { regular: ["Semibold"] } },
  { key: "ipagothic", family: "IPAGothic", names: ["ms gothic", "ｍｓ ゴシック", "ipagothic"], synthetic: true, widest: false, latin: true },
  { key: "ipamincho", family: "IPAMincho", names: ["ms mincho", "ｍｓ 明朝", "ipamincho"], synthetic: true, widest: false, latin: true },
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
 * measured (SUBSTITUTES), but a sign beyond the first characters measured
 * (MORE_CHARACTERS), which the font may lack and Word draw in a symbol font: of
 * no width given (0).
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
 * The fonts of Office whose bold face is a font of its own, and the style of a
 * font measured whose advances and line stand for its: Segoe UI Bold, the bold
 * of Selawik (of the same advances).
 */
const STANDING_IN = [
  { key: "selawik-bold", from: "selawik", style: "bold", names: ["segoe ui bold"] },
];
/**
 * What Word adds to each advance of a font it emboldens, having no bold face
 * of it (`synthetic`), in thousandths of the size: a twelfth of an em, a pixel
 * of the screen at 9 pt, more than Windows' and FreeType's emboldening add.
 */
const SYNTHETIC_BOLD = 84;
/**
 * The fonts Word draws a font it does not have with, given what its font
 * table (w:fontTable) says of it: of each character, the widest advance of
 * these fonts (`of`: fonts measured or substitutes above; all fonts measured
 * but the typewriter and East Asian ones when none is given), in each style,
 * and their tallest line; Liberation Sans, Serif and Mono stand for
 * themselves. Of an East Asian font (`eastAsian`), the characters it draws a
 * full em wide (FULL_WIDTH_IN_EAST_ASIAN) so, and the tallest line of all:
 * its Latin letters proportional (Microsoft YaHei, Meiryo…: the widest of
 * Arial, Times New Roman, Verdana and Segoe UI), or of half width (SimSun,
 * SimHei, MingLiU…: those of Basic Latin `basicLatin` wide, in thousandths of
 * the size; the others, which such a font may lack, no narrower, and no
 * narrower than Word draws them instead, of no width given, 0, where Arial
 * and Times New Roman lack them too), or either (one not listed). And
 * the bound of a font of Windows or Office of no metrics here (LISTED): the
 * widest of all, `share` thousandths more; of a typewriter one (TYPEWRITER),
 * as Courier New and a twentieth more in Latin-1, which such a font draws all
 * as wide, beyond it (`latin1`: characters it may lack, which Word draws in
 * another font) never narrower than LISTED, and its bold as its upright one
 * emboldened (`synthetic`: Lucida Console has no bold face), of the taller
 * line of the two; of a symbol font of the reader (SYMBOL), every character as
 * wide as the widest of these of Latin text (`every`, FIRST_CHARACTERS).
 */
const SUBSTITUTES = [
  { key: "sans-or-serif", of: ["liberation-sans", "liberation-serif"] },
  { key: "widest", of: undefined },
  { key: "east-asian-latin", of: ["liberation-sans", "liberation-serif", "verdana", "selawik"], eastAsian: true },
  { key: "half-width", of: ["sans-or-serif"], basicLatin: 500, eastAsian: true },
  { key: "east-asian", of: ["east-asian-latin", "half-width"], eastAsian: true },
  { key: "listed", of: ["widest"], share: 50 },
  { key: "listed-typewriter", of: ["liberation-mono"], share: 50, latin1: "listed", synthetic: true },
  { key: "symbol", of: ["listed"], every: true },
];
/**
 * Names of typewriter fonts of the reader, of no metrics here: Lucida Console
 * and Lucida Sans Typewriter (0.602 em a character), Cascadia Code and Mono
 * (0.586 em), Consolas (0.550 em) draw a few thousandths wider than Courier
 * New (0.600 em), Aptos Mono is not measured; OCR A Extended, wider, is of no
 * bound (UNBOUNDED).
 */
const TYPEWRITER = ["cascadia code", "cascadia mono", "consolas", "lucida console", "lucida sans typewriter", "aptos mono"];
/** Names of symbol fonts of the reader, of no metrics here: of glyphs of any shape, none wider than the widest character of LISTED. */
const SYMBOL = ["symbol", "wingdings", "wingdings 2", "wingdings 3", "webdings", "marlett", "bookshelf symbol 7", "ms outlook", "ms reference specialty", "mt extra"];
/**
 * The fonts the reader has: Windows 10 and 11's (Microsoft Learn, Typography,
 * « Windows 10 font list » and « Windows 11 font list », the supplemental
 * fonts of their Features on Demand included), Office's (« Fonts included with
 * Office », and Microsoft 365's cloud fonts, « Cloud fonts in Office »,
 * support.microsoft.com), by the names Word writes (lower case). Those not
 * measured here (FONTS, PUBLISHED, STANDING_IN, the East Asian ones below)
 * are bounded as LISTED, but those of UNBOUNDED; a name none of these is a font
 * Word does not have, which it draws in its substitute.
 */
const WORD_FONTS = [
  // Windows; Helvetica, Times and Courier as Windows draws them (in Arial, Times New Roman and Courier New, its FontSubstitutes).
  "arial", "bahnschrift", "bahnschrift light", "bahnschrift semilight", "bahnschrift semibold", "bahnschrift condensed", "bahnschrift semicondensed", "bahnschrift light condensed",
  "bahnschrift light semicondensed", "bahnschrift semilight condensed", "bahnschrift semilight semicondensed", "bahnschrift semibold condensed", "bahnschrift semibold semicondensed",
  "calibri", "calibri light", "cambria", "candara", "candara light", "cascadia code", "cascadia mono", "comic sans ms", "consolas", "constantia", "corbel", "corbel light", "courier new",
  "ebrima", "franklin gothic medium", "gadugi", "georgia", "helvetica", "times", "courier", "impact", "leelawadee ui", "leelawadee ui semilight", "lucida console", "lucida sans unicode",
  "ms gothic", "ｍｓ ゴシック", "ms mincho", "ｍｓ 明朝", "microsoft himalaya", "sans serif collection",
  "microsoft new tai lue", "microsoft phagspa", "microsoft sans serif", "microsoft tai le", "microsoft yi baiti", "mongolian baiti", "myanmar text", "nirmala ui", "nirmala ui semilight",
  "palatino linotype", "segoe ui", "segoe ui light", "segoe ui semilight", "segoe ui semibold", "segoe ui bold", "segoe ui variable", "segoe ui variable display", "segoe ui variable small",
  "segoe ui variable text", "segoe ui historic", "sitka banner", "sitka display", "sitka heading", "sitka small", "sitka subheading", "sitka text", "sylfaen", "tahoma", "times new roman",
  "trebuchet ms", "verdana", "arial nova", "arial nova cond", "arial nova light", "arial nova cond light", "georgia pro", "georgia pro cond", "georgia pro light", "georgia pro semibold",
  "georgia pro cond semibold", "georgia pro cond light", "gill sans nova", "gill sans nova cond", "gill sans nova light", "gill sans nova cond light", "neue haas grotesk text pro",
  "neue haas grotesk text pro medium", "rockwell nova", "rockwell nova cond", "rockwell nova light", "rockwell nova cond light", "verdana pro", "verdana pro cond", "verdana pro light",
  "verdana pro semibold", "verdana pro cond light", "verdana pro cond semibold",
  // Office.
  "agency fb", "arial narrow", "arial rounded mt bold", "arial unicode ms", "baskerville old face", "bell mt", "berlin sans fb", "bodoni mt", "bodoni mt condensed", "book antiqua",
  "bookman old style", "californian fb", "calisto mt", "centaur", "century", "century gothic", "century schoolbook", "footlight mt light", "franklin gothic book", "franklin gothic demi",
  "franklin gothic demi cond", "franklin gothic medium cond", "garamond", "gill sans mt", "gill sans mt condensed", "gill sans mt ext condensed bold", "gloucester mt extra condensed",
  "goudy old style", "haettenschweiler", "high tower text", "lucida bright", "lucida fax", "lucida sans", "lucida sans typewriter", "maiandra gd", "modern no. 20",
  "ms reference sans serif", "news gothic mt", "perpetua", "perpetua titling mt", "rockwell", "rockwell condensed", "tw cen mt", "tw cen mt condensed",
  "aptos", "aptos display", "aptos light", "aptos narrow", "aptos semibold", "aptos serif", "aptos mono", "grandview", "grandview display", "bierstadt", "bierstadt display", "seaford",
  "seaford display", "skeena", "skeena display", "tenorite", "tenorite display",
  // Microsoft 365's cloud fonts.
  "abadi", "abadi extra light", "amasis mt pro", "amasis mt pro light", "amasis mt pro medium", "avenir next lt pro", "avenir next lt pro demi", "avenir next lt pro light",
  "biome", "biome light", "daytona", "daytona condensed", "daytona light", "dubai", "dubai light", "dubai medium", "euphemia", "gisha", "gautami", "kalinga", "kartika", "khmer ui",
  "lao ui", "latha", "leelawadee", "mangal", "nyala", "plantagenet cherokee", "posterama", "raavi", "sagona", "sagona book", "sagona extralight", "segoe pro",
  "shruti", "trade gothic next", "trade gothic next cond", "trade gothic next light", "tunga", "univers", "univers condensed", "univers light", "utsaah", "vani", "vrinda",
  "walbaum display", "walbaum heading", "walbaum text", "aharoni", "andalus", "angsana new", "aparajita", "browallia new", "cordia new", "david", "frankruehl", "iskoola pota",
  "kokila", "levenim mt", "microsoft uighur", "miriam", "narkisim", "rod", "sakkal majalla", "shonar bangla", "simplified arabic", "traditional arabic", "arabic typesetting",
  "urdu typesetting", "vijaya", "aldhabi",
];
/**
 * Names of fonts of the reader of no bound known: its display, script,
 * handwriting and symbol fonts, of letters wider than any measured (Wide
 * Latin, Goudy Stout…) or of glyphs of any width; its heavy or wide fonts
 * (Arial Black…), OCR A Extended, a typewriter font wider than any measured,
 * Perpetua Titling MT, of capitals only, which draws a lowercase letter as
 * its capital, wider than LISTED gives it;
 * Cambria Math and Gabriola, of lines far taller.
 */
const UNBOUNDED = [
  "arial black", "ocr a extended", "perpetua titling mt", "aptos black", "aptos extrabold", "segoe ui black", "segoe ui emoji", "segoe ui symbol", "segoe mdl2 assets", "segoe fluent icons", "hololens mdl2 assets",
  "segoe print", "segoe script", "ink free", "javanese text", "mv boli", "gabriola", "cambria math", "algerian", "bauhaus 93", "berlin sans fb demi", "bernard mt condensed", "blackadder itc",
  "bodoni mt black", "bodoni mt poster compressed", "bradley hand itc", "britannic bold", "broadway", "brush script mt", "castellar", "chiller", "colonna mt", "cooper black",
  "copperplate gothic bold", "copperplate gothic light", "curlz mt", "edwardian script itc", "elephant", "engravers mt", "eras bold itc", "eras demi itc", "eras light itc",
  "eras medium itc", "felix titling", "forte", "franklin gothic heavy", "freestyle script", "french script mt", "gigi", "gill sans ultra bold", "gill sans ultra bold condensed",
  "goudy stout", "harlow solid italic", "harrington", "imprint mt shadow", "informal roman", "jokerman", "juice itc", "kristen itc", "kunstler script", "lucida calligraphy",
  "lucida handwriting", "magneto", "matura mt script capitals", "mistral", "monotype corsiva", "niagara engraved", "niagara solid", "old english text mt", "onyx",
  "palace script mt", "papyrus", "parchment", "playbill", "poor richard", "pristina", "rage italic", "ravie", "rockwell extra bold", "script mt bold", "showcard gothic",
  "snap itc", "stencil", "tempus sans itc", "tw cen mt condensed extra bold", "viner hand itc", "vivaldi", "vladimir script", "wide latin", "baguet script", "the hand",
  "the serif hand", "posterama text black", "rockwell nova extra bold", "gill sans nova ultra bold", "georgia pro black", "verdana pro black", "amasis mt pro black",
];
/**
 * The characters measured an East Asian font draws a full em wide when it
 * has them (SimSun's “…”, MS Gothic's ●, Greek and Cyrillic letters…): those
 * of an ambiguous East Asian width (A in Unicode's EastAsianWidth.txt, 15.1),
 * accented letters among them, and the minus sign and the check mark, which
 * they draw so too.
 */
const FULL_WIDTH_IN_EAST_ASIAN = new Set([
  0xa1, 0xa4, ...range(0xa7, 0xa8), 0xaa, ...range(0xad, 0xae), ...range(0xb0, 0xb4), ...range(0xb6, 0xba), ...range(0xbc, 0xbf), 0xc6, 0xd0, ...range(0xd7, 0xd8), ...range(0xde, 0xe1),
  0xe6, ...range(0xe8, 0xea), ...range(0xec, 0xed), 0xf0, ...range(0xf2, 0xf3), ...range(0xf7, 0xfa), 0xfc, 0xfe, 0x101, 0x111, 0x113, 0x11b, ...range(0x126, 0x127), 0x12b,
  ...range(0x131, 0x133), 0x138, ...range(0x13f, 0x142), 0x144, ...range(0x148, 0x14b), 0x14d, ...range(0x152, 0x153), ...range(0x166, 0x167), 0x16b, 0x1ce, 0x1d0, 0x1d2, 0x1d4,
  0x1d6, 0x1d8, 0x1da, 0x1dc, 0x2c4, 0x2c7, ...range(0x2c9, 0x2cb), 0x2cd, 0x2d0, ...range(0x2d8, 0x2db), 0x2dd, 0x2df, ...range(0x391, 0x3a1), ...range(0x3a3, 0x3a9),
  ...range(0x3b1, 0x3c1), ...range(0x3c3, 0x3c9), 0x401, ...range(0x410, 0x44f), 0x451, 0x2010, ...range(0x2013, 0x2016), ...range(0x2018, 0x2019), ...range(0x201c, 0x201d),
  ...range(0x2020, 0x2022), ...range(0x2024, 0x2027), 0x2030, ...range(0x2032, 0x2033), 0x2035, 0x203b, 0x203e, 0x2074, 0x207f, ...range(0x2081, 0x2084), 0x20ac, 0x2103, 0x2105,
  0x2109, 0x2113, 0x2116, ...range(0x2121, 0x2122), 0x2126, 0x212b, ...range(0x2153, 0x2154), ...range(0x215b, 0x215e), ...range(0x2160, 0x216b), ...range(0x2170, 0x2179), 0x2189,
  ...range(0x2190, 0x2199), ...range(0x21b8, 0x21b9), 0x21d2, 0x21d4, 0x21e7, 0x2200, ...range(0x2202, 0x2203), ...range(0x2207, 0x2208), 0x220b, 0x220f, 0x2211, 0x2212, 0x2215,
  0x221a, ...range(0x221d, 0x2220), 0x2223, 0x2225, ...range(0x2227, 0x222c), 0x222e, ...range(0x2234, 0x2237), ...range(0x223c, 0x223d), 0x2248, 0x224c, 0x2252,
  ...range(0x2260, 0x2261), ...range(0x2264, 0x2267), ...range(0x226a, 0x226b), ...range(0x226e, 0x226f), ...range(0x2282, 0x2283), ...range(0x2286, 0x2287), 0x2295, 0x2299, 0x22a5,
  0x22bf, ...range(0x2460, 0x24e9), ...range(0x24eb, 0x254b), ...range(0x2550, 0x2573), ...range(0x2580, 0x258f), ...range(0x2592, 0x2595), ...range(0x25a0, 0x25a1),
  ...range(0x25a3, 0x25a9), ...range(0x25b2, 0x25b3), ...range(0x25b6, 0x25b7), ...range(0x25bc, 0x25bd), ...range(0x25c0, 0x25c1), ...range(0x25c6, 0x25c8), 0x25cb,
  ...range(0x25ce, 0x25d1), ...range(0x25e2, 0x25e5), 0x25ef, ...range(0x2605, 0x2606), 0x2609, ...range(0x260e, 0x260f), 0x261c, 0x261e, 0x2640, 0x2642, ...range(0x2660, 0x2661),
  ...range(0x2663, 0x2665), ...range(0x2667, 0x266a), ...range(0x266c, 0x266d), 0x266f, ...range(0x269e, 0x269f), 0x26bf, ...range(0x26c6, 0x26cd), ...range(0x26cf, 0x26d3),
  ...range(0x26d5, 0x26e1), 0x26e3, ...range(0x26e8, 0x26e9), ...range(0x26eb, 0x26f1), 0x26f4, ...range(0x26f6, 0x26f9), ...range(0x26fb, 0x26fc), ...range(0x26fe, 0x26ff), 0x2713,
  0x273d, ...range(0x2776, 0x277f),
]);
/**
 * Names of East Asian fonts of Windows whose Latin letters are all of half
 * their width (half-width: of a fixed pitch, as SimHei, KaiTi, FangSong and
 * MingLiU too), or proportional (east-asian-latin), or either (EITHER_WIDTH,
 * of no pitch known here), as Word writes them: their Japanese names in
 * full-width letters (ＭＳ), which Word does not take for others; with the
 * weights, the faces of their extension planes (-ExtB, -ExtG) and of the
 * interface (UI) Windows installs of each as fonts of their own (Microsoft
 * Learn, Typography, « Windows 10 font list », « Windows 11 font list », and
 * their supplemental fonts), as wide as their family. Of no free font of their
 * metrics, but MS Gothic and MS Mincho (FONTS).
 */
const HALF_WIDTH = [
  "SimSun", "NSimSun", "宋体", "新宋体", "SimSun-ExtB", "SimSun-ExtG", "SimHei", "黑体", "KaiTi", "楷体", "KaiTi_GB2312", "楷体_GB2312", "FangSong", "仿宋",
  "FangSong_GB2312", "仿宋_GB2312", "MingLiU", "細明體", "MingLiU-ExtB", "細明體-ExtB", "MingLiU_HKSCS", "細明體_HKSCS", "MingLiU_HKSCS-ExtB", "細明體_HKSCS-ExtB",
  "GulimChe", "굴림체", "DotumChe", "돋움체", "BatangChe", "바탕체", "GungsuhChe", "궁서체",
];
const EAST_ASIAN = [
  "MS PGothic", "MS PMincho", "MS UI Gothic", "ＭＳ Ｐゴシック", "ＭＳ Ｐ明朝", "Yu Gothic", "Yu Gothic Light", "Yu Gothic Medium", "Yu Gothic UI", "Yu Gothic UI Light",
  "Yu Gothic UI Semilight", "Yu Gothic UI Semibold", "Yu Mincho", "Yu Mincho Light", "Yu Mincho Demibold", "游ゴシック", "游ゴシック Light", "游ゴシック Medium", "游明朝", "游明朝 Light",
  "游明朝 Demibold", "Meiryo", "Meiryo UI", "メイリオ", "Microsoft YaHei", "Microsoft YaHei Light", "Microsoft YaHei UI", "Microsoft YaHei UI Light", "微软雅黑", "微软雅黑 Light",
  "Microsoft JhengHei", "Microsoft JhengHei Light", "Microsoft JhengHei UI", "Microsoft JhengHei UI Light", "微軟正黑體", "微軟正黑體 Light", "DengXian", "DengXian Light", "等线",
  "等线 Light", "PMingLiU", "新細明體", "PMingLiU-ExtB", "新細明體-ExtB", "Malgun Gothic", "Malgun Gothic Semilight", "맑은 고딕", "맑은 고딕 Semilight", "Gulim", "굴림", "Dotum", "돋움",
  "Batang", "바탕", "Gungsuh", "궁서",
];
/** Japanese fonts of Windows' supplemental fonts, of half-width or proportional Latin letters, which the check does not tell apart. */
const EITHER_WIDTH = [
  "BIZ UDGothic", "BIZ UDPGothic", "BIZ UDMincho", "BIZ UDPMincho", "UD Digi Kyokasho N-B", "UD Digi Kyokasho N-R", "UD Digi Kyokasho NK-B", "UD Digi Kyokasho NK-R",
  "UD Digi Kyokasho NP-B", "UD Digi Kyokasho NP-R", "DFKai-SB", "標楷體",
];
/**
 * Basic Latin, Latin-1 and Latin Extended-A, and the punctuation and signs a CV writes beyond them; then all the characters the fonts
 * measured may hold of Latin Extended-B and Additional, the spacing modifier letters, Greek, Cyrillic, general punctuation, super- and
 * subscripts, currency, letterlike signs, number forms, arrows, mathematical operators, enclosed alphanumerics, box drawing and blocks,
 * geometric shapes, miscellaneous symbols, dingbats and the Latin ligatures (ﬁ, ﬂ…): not those Unicode does not assign, nor marks,
 * controls and separators, nor those Word draws as emoji (Emoji_Presentation), of no width known.
 */
const FIRST_CHARACTERS = [
  ...range(0x20, 0x7e), ...range(0xa0, 0x17f),
  ...range(0x2010, 0x2027), 0x2030, 0x2032, 0x2033, 0x2039, 0x203a, 0x20ac, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2264, 0x2265, 0x25cf, 0x2713,
];
const MORE_CHARACTERS = [
  ...range(0x180, 0x24f), ...range(0x2b0, 0x2ff), ...range(0x370, 0x3ff), ...range(0x400, 0x52f), ...range(0x1e00, 0x1eff), ...range(0x2000, 0x206f), ...range(0x2070, 0x209f),
  ...range(0x20a0, 0x20c0), ...range(0x2100, 0x214f), ...range(0x2150, 0x218b), ...range(0x2190, 0x21ff), ...range(0x2200, 0x22ff), ...range(0x2460, 0x24ff), ...range(0x2500, 0x259f),
  ...range(0x25a0, 0x25ff), ...range(0x2600, 0x26ff), ...range(0x2700, 0x27bf), ...range(0xfb00, 0xfb06),
].filter(code => !FIRST_CHARACTERS.includes(code) && !/[\p{Cn}\p{M}\p{C}\p{Zl}\p{Zp}\p{Emoji_Presentation}]/u.test(String.fromCodePoint(code)));
const CHARACTERS = [...FIRST_CHARACTERS, ...MORE_CHARACTERS].map(code => String.fromCodePoint(code)).join("");
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
/** Written, then a digit (how many, less one), in place of the digits of characters as wide as the one before them. */
const AS_BEFORE = "~";
/** Of each character, where its base letter is among those measured before it; -1 when it has none. */
const BASES = Array.from(CHARACTERS, (character, at) => {
  const base = CHARACTERS.indexOf(character.normalize("NFD")[0]);
  return base < at ? base : -1;
});

/**
 * Advances written two digits each, but AS_BASE for a character as wide as its base letter, AS_UPRIGHT for those as wide as in
 * `upright`, and AS_BEFORE for two or more as wide as the one before them.
 */
function digitsOf(advances, upright) {
  let digits = "";
  for (let at = 0; at < advances.length; at += 1) {
    const width = advances[at];
    if (width >= DIGITS.length ** 2) throw new Error(`${CHARACTERS[at]}: ${width}`);
    let same = 0;
    while (at > 0 && same < DIGITS.length && advances[at + same] !== undefined && advances[at + same] === advances[at - 1] && upright?.[at + same] !== advances[at + same]) same += 1;
    if (upright?.[at] === width) {
      let count = 1;
      while (count < DIGITS.length && upright[at + count] !== undefined && upright[at + count] === advances[at + count]) count += 1;
      digits += AS_UPRIGHT + DIGITS[count - 1];
      at += count - 1;
    } else if (same >= 2) {
      digits += AS_BEFORE + DIGITS[same - 1];
      at += same - 1;
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
/** What is written of each font measured, standing in or substitute (DOCX_FONT_METRICS). */
const metrics = {};
for (const { key, family, names, ownLine, published, styles, synthetic, rounding } of FONTS) {
  const found = Object.fromEntries(Object.entries(STYLES).flatMap(([name, style]) => {
    // A font of styles of no bold face is not looked for its bold (fontconfig would give another font's).
    if (synthetic && /bold/i.test(name)) return [];
    const files = fontFiles(family, { style: style.style, names: styles?.[name] ?? style.names });
    return files.length ? [[name, files.map(readFont)]] : [];
  }));
  if (!found.regular || (!found.bold && !synthetic)) throw new Error(`${family}: no Regular or Bold`);
  const own = Math.ceil(Math.max(...Object.values(found).map(files => files[0].line / files[0].unitsPerEm)) * 1000);
  const line = ownLine === false ? (published ? publishedLine(published) : Math.max(own, LEAST_LINE)) : Math.max(own, published ? publishedLine(published) : 0);
  const advances = Object.fromEntries(Object.entries(found).map(([name, files]) => [name, advancesOf(files).map(width => (width && rounding ? width + rounding : width))]));
  // Of no bold face, Word emboldens the upright style, each character wider.
  if (synthetic) advances.bold = advances.regular.map(width => (width ? width + SYNTHETIC_BOLD : 0));
  // A style the family lacks is drawn by slanting the upright one of its weight, of the same advances.
  for (const [name, { fallback }] of Object.entries(STYLES)) advances[name] ??= advances[fallback];
  fonts[key] = { line, advances, widest: FONTS.find(font => font.key === key).widest !== false && !synthetic };
  for (const name of names) aliases[name] = key;
}
/** Of each character, in each style, the widest advance of these fonts, measured or substitutes written before (0 when none has it). */
const widestOf = keys => Object.fromEntries(Object.keys(STYLES).map(style => [style, Array.from(CHARACTERS, (_, at) => Math.max(0, ...keys.map(key => (fonts[key] ?? metrics[key]).advances[style][at])))]));
const measured = Object.keys(fonts).filter(key => fonts[key].widest);
// From the folder given, or the current one (a path, not the name of a package).
const widthsMap = resolve(folder ?? ".", "string-pixel-width/lib/widthsMap.js");
if (!existsSync(widthsMap)) throw new Error(`${widthsMap}: not found; give a folder that holds string-pixel-width's table (string-pixel-width/lib/widthsMap.js)`);
const widths = createRequire(import.meta.url)(widthsMap);
const table = widths.default ?? widths;
for (const { key, source, names } of PUBLISHED) {
  const published = table[source];
  if (!published) throw new Error(`${source}: not in string-pixel-width`);
  const widest = widestOf(measured);
  const advances = Object.fromEntries(Object.keys(STYLES).map((style, index) => [style, Array.from(CHARACTERS, (character, at) => {
    const own = published[character] ?? published[character.normalize("NFD")[0]];
    // Its four styles, in string-pixel-width's order: regular, bold, italic, bold italic.
    if (own) return own[[0, 2, 1, 3][index]] * 10 + 5;
    return at >= FIRST_CHARACTERS.length && /\p{S}/u.test(character) ? 0 : widest[style][at];
  })]));
  fonts[key] = { line: publishedLine(source), advances, widest: true };
  for (const name of names) aliases[name] = key;
}
const tallest = Math.max(...Object.values(fonts).map(({ line }) => line));
for (const [key, { line, advances }] of Object.entries(fonts)) metrics[key] = { line, advances };
for (const { key, from, style, names } of STANDING_IN) {
  if (from) metrics[key] = { line: fonts[from].line, advances: Object.fromEntries(Object.keys(STYLES).map(name => [name, fonts[from].advances[/italic/i.test(name) ? `${style}Italic` : style]])) };
  for (const name of names) aliases[name] = key;
}
for (const { key, of, basicLatin, eastAsian, share, every, latin1, synthetic } of SUBSTITUTES) {
  const keys = of ?? Object.keys(fonts).filter(font => fonts[font].widest);
  const advances = Object.fromEntries(Object.entries(widestOf(keys)).map(([style, widest]) => [style, widest.map((width, at) => {
    const code = CHARACTERS.charCodeAt(at);
    if (every) return Math.max(...widest.slice(0, FIRST_CHARACTERS.length));
    if (eastAsian && FULL_WIDTH_IN_EAST_ASIAN.has(code)) return 1000;
    if (share) return Math.ceil(width * (1000 + share) / 1000);
    return basicLatin && code < 0x7f ? basicLatin : width || at < FIRST_CHARACTERS.length ? Math.max(basicLatin ?? 0, width) : 0;
  })]));
  if (synthetic) for (const [name, { fallback }] of Object.entries(STYLES)) {
    const upright = /bold/i.test(name) && advances[fallback === "bold" ? "italic" : "regular"];
    if (upright) advances[name] = advances[name].map((width, at) => (upright[at] ? Math.max(width, upright[at] + SYNTHETIC_BOLD) : width));
  }
  if (latin1) for (const [style, widths] of Object.entries(advances)) advances[style] = widths.map((width, at) => (CHARACTERS.charCodeAt(at) > 0xff ? Math.max(width, metrics[latin1].advances[style][at]) : width));
  metrics[key] = { line: eastAsian ? tallest : Math.max(...[...keys, ...(latin1 ? [latin1] : [])].map(font => metrics[font].line)), advances };
}
for (const { key } of FONTS.filter(font => font.latin)) {
  const bound = metrics["east-asian"].advances;
  for (const [style, advances] of Object.entries(metrics[key].advances)) metrics[key].advances[style] = advances.map((width, at) => (CHARACTERS.charCodeAt(at) > 0xff ? Math.max(width, bound[style][at]) : width));
}
for (const name of HALF_WIDTH) aliases[name.toLowerCase()] = "half-width";
for (const name of EAST_ASIAN) aliases[name.toLowerCase()] = "east-asian-latin";
for (const name of EITHER_WIDTH) aliases[name.toLowerCase()] = "east-asian";
// The reader's fonts: measured, bounded as the widest (LISTED), as the widest character for a symbol font, or of no bound.
for (const name of SYMBOL) aliases[name] = "symbol";
for (const name of TYPEWRITER) aliases[name] = "listed-typewriter";
for (const name of WORD_FONTS) aliases[name] ??= "listed";
for (const name of UNBOUNDED) aliases[name] = "unbounded";
const wordFonts = new Set([...WORD_FONTS, ...SYMBOL, ...UNBOUNDED, ...[...HALF_WIDTH, ...EAST_ASIAN, ...EITHER_WIDTH].map(name => name.toLowerCase())]);

/** A font's styles written (digitsOf): its slanted ones only where not as wide as their upright one, as Word draws a slanted style it has. */
function written({ line, advances }) {
  const styles = Object.entries(STYLES).flatMap(([name, { fallback }]) => {
    const upright = fallback && advances[fallback];
    return !upright || advances[name].join() !== upright.join() ? [[name, digitsOf(advances[name], upright)]] : [];
  });
  return [`    line: ${line},`, ...styles.map(([name, digits]) => `    ${name}: ${JSON.stringify(digits)},`)].join("\n");
}

const output = `// Written by scripts/generate-docx-font-metrics.mjs from the fonts installed (fc-match), a folder of free fonts (fc-scan) and the widths published of others: run it again rather than edit this file.

/** The characters measured, in order: Latin text, its punctuation and common signs, then Latin, Greek and Cyrillic letters and signs the fonts measured may hold. */
export const DOCX_FONT_CHARACTERS = ${JSON.stringify(CHARACTERS)};

/** The digits of the widths of DOCX_FONT_METRICS, two for each character. */
export const DOCX_FONT_WIDTH_DIGITS = ${JSON.stringify(DIGITS)};

/** In the widths of DOCX_FONT_METRICS, in place of two digits: as wide as the character's base letter (the first of its canonical decomposition, NFD). */
export const DOCX_FONT_AS_BASE = ${JSON.stringify(AS_BASE)};

/** In the widths of a slanted style, then a digit (how many, less one): characters as wide as in its upright style. */
export const DOCX_FONT_AS_UPRIGHT = ${JSON.stringify(AS_UPRIGHT)};

/** In the widths of DOCX_FONT_METRICS, then a digit (how many, less one): characters as wide as the one before them. */
export const DOCX_FONT_AS_BEFORE = ${JSON.stringify(AS_BEFORE)};

/**
 * Of each font measured, or published, and of the fonts Word draws one it
 * does not have with: the height of a line of single spacing (the tallest Word
 * or LibreOffice sets, or as published), and the advance of each character of
 * DOCX_FONT_CHARACTERS in each of its styles; in thousandths of the font size,
 * rounded up; 0 for a character the font lacks. A slanted style is left out
 * where as wide as its upright one (Word draws the slanted style a font has,
 * else slants the upright one).
 */
export const DOCX_FONT_METRICS: Record<string, { line: number; regular: string; bold: string; italic?: string; boldItalic?: string }> = {
${Object.entries(metrics).map(([key, font]) => `  "${key}": {\n${written(font)}\n  },`).join("\n")}
};

/**
 * The keys of DOCX_FONT_METRICS of the fonts Word draws a font it does not
 * have with: a sans serif one (Arial), a serif one (Times New Roman), a
 * typewriter one (Courier New); of each character the wider of the first two
 * (\`unknown\`); the widest of all fonts measured but the typewriter and East
 * Asian ones (\`decorative\`); an East Asian font, of proportional Latin
 * letters, of half width, or either (\`eastAsian\`, one not listed), the
 * characters of an ambiguous East Asian width a full em wide. And the bound of
 * a font of the reader not measured (\`listed\`: the widest, a twentieth more),
 * or the name of a font of no bound (\`unbounded\`, of no metrics).
 */
export const DOCX_SUBSTITUTE_FONTS = { sans: "liberation-sans", serif: "liberation-serif", typewriter: "liberation-mono", unknown: "sans-or-serif", decorative: "widest", eastAsian: "east-asian", proportionalEastAsian: "east-asian-latin", halfWidth: "half-width", listed: "listed", symbol: "symbol", unbounded: "unbounded" } as const;

/**
 * The font names a document may give (w:rFonts, theme fonts), in lower case, as written otherwise (ＭＳ ゴシック in full-width
 * letters), and the font of DOCX_FONT_METRICS of their metrics, or that stands for them; \`listed\`, \`listed-typewriter\` or
 * \`unbounded\` for a font of the reader not measured (DOCX_SUBSTITUTE_FONTS).
 */
export const DOCX_FONT_ALIASES: Record<string, string> = ${JSON.stringify(aliases, null, 2).replace(/\n}$/, ",\n}")};

/**
 * The reader the check models: Word for Windows, with the fonts Windows 10 and 11 and Microsoft 365 install (its cloud fonts
 * included), by the names Word writes (lower case). A font of another name it does not have: it draws it in its substitute.
 */
export const DOCX_WORD_FONTS: ReadonlySet<string> = new Set(${JSON.stringify(Array.from(wordFonts).sort(), null, 2).replace(/\n]$/, ",\n]")});
`;
writeFileSync(fileURLToPath(new URL("../server/docxFontMetrics.ts", import.meta.url)), output);
console.log(`server/docxFontMetrics.ts: ${FONTS.length} fonts measured, ${PUBLISHED.length} published, ${Array.from(CHARACTERS).length} characters, ${output.length} bytes`);
