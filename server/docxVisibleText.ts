import { crc32 } from "node:zlib";
import { DOCUMENT_DECOMPRESSION_LIMITS, inspectDocxArchive } from "./documentDecompressionLimits";
import {
  DOCX_COMPLEX_CHARACTERS, DOCX_COMPLEX_FONTS, DOCX_COMPLEX_METRICS, DOCX_EMOJI_METRICS, DOCX_FONT_ALIASES, DOCX_FONT_AS_BASE, DOCX_FONT_AS_BEFORE, DOCX_FONT_AS_UPRIGHT, DOCX_FONT_CHARACTERS,
  DOCX_FONT_METRICS, DOCX_FONT_WIDTH_DIGITS, DOCX_KERNING_MOST, DOCX_SIGN_FALLBACK, DOCX_SUBSTITUTE_FONTS, DOCX_WORD_FONTS,
} from "./docxFontMetrics";

/**
 * Refusal by default. In a container that shows no more than its room (a
 * table row of exact height, a text box or a frame of fixed size, an exact
 * line spacing, a line its indents set against the page's edge), text is only
 * read if all that comes before it there is of a kind whose width and height
 * the check bounds, of this closed list:
 * - fonts measured (DOCX_FONT_METRICS: their own advances, those of a font of
 *   their metrics, or as published), or bounded by a rule of a source: a font
 *   of the reader not measured as the widest measured and more (`listed`), a
 *   name that goes on from a family's with words of weight or use as that
 *   family at least (familyOf; with a word that widens it, of no bound or
 *   `listed`), a font Word does not have as each font Word may draw it in,
 *   laid out alone (laidLayouts);
 * - characters measured (DOCX_FONT_CHARACTERS); those a font lacks as wide as
 *   in the widest of the reader's text fonts, a sign as in a font of signs
 *   (lacking, DOCX_SIGN_FALLBACK), on a line as tall as such a font's; Hebrew
 *   and Arabic in a complex script font of DOCX_COMPLEX_FONTS, each as its
 *   widest form in the fonts measured a quarter more (DOCX_COMPLEX_METRICS), at
 *   their size (w:szCs) and on their font's line; emoji as Noto Color Emoji's a
 *   quarter more (DOCX_EMOJI_METRICS), a sequence as its parts; Chinese,
 *   Japanese and Korean ones a full em; spaces and invisible controls (marks of
 *   direction, variation selectors);
 * - what moves letters along or above their line, bounded: a scale (w:w), a
 *   spacing (w:spacing), kerning (w:kern, by the widest positive pair of the
 *   fonts measured, DOCX_KERNING_MOST), text fitted to a width (w:fitText, as
 *   wide as the wider of it and its text), raised or lowered text and
 *   superscripts (w:position, w:vertAlign, their line as much taller), a
 *   document grid of lines (w:docGrid, each line up to a pitch taller);
 * - fields whose result is bounded: drawn as stored (STORED_FIELDS), recomputed
 *   as fieldWidth bounds them (RECOMPUTED_FIELDS), drawn from their code
 *   (CODE_DRAWN_FIELDS);
 * - objects of a size read: drawings and VML shapes in line with the text,
 *   their extent, effects and outline; symbols (w:sym), notes' and pages'
 *   numbers, dates Word writes;
 * - what Word surely draws: of a mc:AlternateContent, the first mc:Choice of
 *   namespaces it understands (WORD_NAMESPACES), else the mc:Fallback; when
 *   it may draw either, each choice it may draw and the fallback.
 * Anything else (a font the document embeds, a display or heavy font of no
 * metrics, a character of no font measured, Hebrew or Arabic in another
 * complex script font, Arabic in a line Word may justify with kashidas, an
 * equation, an imported document or a subdocument, a content control bound to
 * data, ruby, emphasis marks, combined or turned characters, a grid of
 * characters, a field of another type or whose code holds another, a length
 * not read) leaves the text after it in that container, or that depends on
 * it, unverifiable: set aside, never counted as hidden, given with the alert
 * and the excerpt the analysis gives of text set aside. What a content control
 * bound to data stores (w:dataBinding), which Word replaces as it opens the
 * document, is set aside wherever it lies.
 *
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
 * The reader the check proves text visible to is Word for Windows with the
 * fonts Windows 10 and 11 and Microsoft 365 install, the cloud fonts Word
 * downloads as it opens a document included (DOCX_WORD_FONTS); any other font
 * is drawn as Word replaces it. Every width and line height that shows text
 * to fit is an upper bound of what this reader draws; what nothing bounds
 * (a font of the reader not measured of no bound, a field's result of a format
 * not followed, a length not read) leaves the text that depends on it
 * unverifiable, set aside. What the document says of a font (its font table's
 * w:altName, w:family, w:pitch, w:panose1, its name) only widens it: each
 * font it may be is laid out. A font the document embeds (w:embedRegular…),
 * which Word draws by its own tables (the character map it reads, GSUB, GPOS
 * and kern), is never measured: of no bound, as a name of more entries in the
 * font table than are read (MAX_FONT_ENTRIES).
 * The fields Word computes as it lays the pages out or opens the document
 * (PAGE, NUMPAGES, SECTIONPAGES, SECTION, DATE, TIME…: RECOMPUTED_FIELDS) take
 * the most room their result may take, whatever result is stored, those drawn
 * from their code (MACROBUTTON, GOTOBUTTON) the width of its text; a drawing
 * in line with the text its extent, what its effects add (wp:effectExtent) and
 * its outline, its lengths read as Word reads them (a sign, +2540000, up to a
 * 32-bit integer).
 *
 * Text its place may hide is only read once shown to fit there. Where room is
 * scarce (a table row of exact height, w:trHeight exact, below the cell's top
 * margin; a text box, by its VML style or its DrawingML wp:extent, less its
 * insets, with the boxes its text flows on into up to one placed off the
 * page; a frame of exact height, w:framePr; an exact line spacing, or a
 * multiple of single spacing under 89/240; a right indent past the page's
 * right edge), the text is laid out twice (LAYOUTS):
 * taking the most room it may take (in the font Word draws it in: its own
 * when measured or its widths published; for a font Word does not have, each
 * one it may draw it with instead, as the document's font table describes it,
 * fontResolver, laidLayouts), and the least. Its lines wrap at the
 * width of their cell, text box, frame or column less their indents, tab
 * stops move them along (the text a right or centred stop aligns stays on its
 * line, even past its edge, as Word and LibreOffice keep it there), what else
 * a run draws on its line takes its width there (a hyphen, a symbol, a note's
 * number, a date or a page number Word writes, a picture in line), and the
 * lines before them fill the container: the
 * spacing before and after paragraphs (w:spacing, but between paragraphs of
 * one style that drop it, w:contextualSpacing), empty paragraphs at their
 * size, nested tables row by row, how far a run is lowered (w:position). A
 * line needs 60 % of its size to be read, on the page. Text that does not fit
 * even when it takes the least room is hidden; text that only fits then is
 * set aside as unverifiable (its visibility cannot be established), never
 * counted as hidden. A word is read or set aside whole, over runs and lines:
 * what is left of a word partly hidden or set aside is set aside with it, so
 * the text read stops where Word may break a line (a space, after a hyphen
 * or a dash, around an ideograph). In an exact line spacing, lines closer
 * than 0.7 times their size run into the line above (LibreOffice draws them
 * over it, Word cuts their top), in their paragraph, or the last line of text above them:
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
 * Past a count of layout work (docxLayoutWorkUnits, a unit for each character
 * laid out, however long its passage), what is left to lay out is set aside,
 * and the line a line of an exact spacing left so may run into. Text the indents of its paragraph (w:ind, its style's or the
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
 * fill, its place on the page); of a choice Word may draw or not, if seen in
 * both.
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
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships": "r",
  "http://purl.oclc.org/ooxml/officeDocument/relationships": "r",
  "http://schemas.microsoft.com/office/word/2010/wordml": "w14",
  "http://schemas.openxmlformats.org/officeDocument/2006/math": "m",
  "http://purl.oclc.org/ooxml/officeDocument/math": "m",
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
const IN_FLOW = new Set(["w:t", "w:br", "w:cr", "w:tab", "w:ptab", "w:sym", "w:noBreakHyphen", "w:softHyphen", "w:footnoteReference", "w:endnoteReference", "w:pgNum", "w:dayShort", "w:dayLong", "w:monthShort", "w:monthLong", "w:yearShort", "w:yearLong"]);
/** Elements of a run Word draws as a character, which mammoth reads as text: laid out and read, or set aside, as text (a soft hyphen as wide as a hyphen, as at the end of a line). */
const DRAWN_CHARACTERS: Record<string, string> = { "w:noBreakHyphen": "\u2011", "w:softHyphen": "\u00ad" };
/**
 * Dates Word writes in a run, and how many characters they take at most, each
 * as wide as the widest letter or figure of the run's font: the day, the
 * month and the year, of the longest names of days and months (Donnerstag,
 * septembre).
 */
const WRITTEN_FIELDS: Record<string, number> = { "w:dayShort": 2, "w:dayLong": 10, "w:monthShort": 5, "w:monthLong": 10, "w:yearShort": 2, "w:yearLong": 4 };
const FIGURES = "0123456789";
const CAPITAL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** The characters of a date Word writes (WRITTEN_FIELDS). */
const DATE_CHARACTERS = `${FIGURES}${CAPITAL_LETTERS}${CAPITAL_LETTERS.toLowerCase()}`;
/**
 * The formats Word numbers notes and pages in (w:numFmt, w:fmt) whose length
 * the check knows: the characters each draws, and how many a number takes
 * (Word writing roman numerals of thousands as so many M, letters past z
 * doubled, tripled…: aa, bbb, Chicago's signs past § too: **, ††…), and at
 * most for the numbers up to one (`most`, when not as many); another format
 * (cardinalText, ordinalText…) takes no width known.
 */
const NUMBER_FORMATS: Record<string, { characters: string; length: (value: number) => number; most?: (value: number) => number }> = {
  decimal: { characters: FIGURES, length: value => String(value).length },
  upperRoman: { characters: "IVXLCDM", length: value => Math.max(1, romanLength(value)), most: value => Math.floor(value / 1000) + 12 },
  lowerRoman: { characters: "ivxlcdm", length: value => Math.max(1, romanLength(value)), most: value => Math.floor(value / 1000) + 12 },
  upperLetter: { characters: CAPITAL_LETTERS, length: value => Math.max(1, Math.ceil(value / 26)) },
  lowerLetter: { characters: CAPITAL_LETTERS.toLowerCase(), length: value => Math.max(1, Math.ceil(value / 26)) },
  chicago: { characters: "*†‡§", length: value => Math.max(1, Math.ceil(value / 4)) },
};
/**
 * Fields Word computes as it lays the pages out (PAGE, NUMPAGES,
 * SECTIONPAGES, SECTION, AUTONUM…, LISTNUM, which it numbers anew) or each
 * time it opens or shows the document (DATE, TIME): the result the file stores
 * is not what it draws; of these, fieldWidth bounds some.
 */
const RECOMPUTED_FIELDS = new Set(["PAGE", "NUMPAGES", "SECTIONPAGES", "SECTION", "DATE", "TIME", "AUTONUM", "AUTONUMLGL", "AUTONUMOUT", "LISTNUM"]);
/**
 * Fields Word draws as the result the file stores until they are updated (by
 * the user, as it prints, or as the document asks: w:dirty, w:updateFields),
 * but those whose result it keeps then too (KEPT_FIELDS): references and
 * links, the document's and the user's information, mail merge, form text,
 * tables of contents (Microsoft, « List of field codes in Word »). The check
 * bounds no other field: of any other type, or of a code holding another
 * field, what it draws is of no width known, and what it stores is set aside.
 */
const STORED_FIELDS = new Set([
  "HYPERLINK", "REF", "PAGEREF", "NOTEREF", "SEQ", "TOC", "MERGEFIELD", "FORMTEXT", "DOCPROPERTY", "DOCVARIABLE", "AUTHOR", "TITLE", "SUBJECT",
  "KEYWORDS", "COMMENTS", "LASTSAVEDBY", "FILENAME", "TEMPLATE", "CREATEDATE", "SAVEDATE", "PRINTDATE", "USERNAME", "USERINITIALS", "USERADDRESS",
]);
/** Fields whose result Word keeps as stored when it updates them: a hyperlink's text, which its code does not give. */
const KEPT_FIELDS = new Set(["HYPERLINK"]);
/**
 * Fields of no result Word draws from their code: the text after the macro
 * or the place they go to (MACROBUTTON NomMacro Texte, GOTOBUTTON Signet
 * Texte), as wide as that text in the run's font (Microsoft, « Field codes:
 * MacroButton field », « GoToButton field »).
 */
const CODE_DRAWN_FIELDS = new Set(["MACROBUTTON", "GOTOBUTTON"]);
/** Of a field's switches \* (the format of its result), those that change no length: of letters' case, of formatting. */
const FIELD_CASES = /^(MERGEFORMAT|MERGEFORMATINET|CHARFORMAT|Upper|Lower|FirstCap|Caps)$/i;
/** Of the switches \* of a number, the formats of NUMBER_FORMATS it may be written in (roman in either case), and how many characters it adds (ArabicDash: « - 1 - », Ordinal: « 1st »). */
const FIELD_NUMBER_FORMATS: Record<string, { formats: string[]; added: number }> = {
  arabic: { formats: ["decimal"], added: 0 }, hex: { formats: ["decimal"], added: 0 }, arabicdash: { formats: ["decimal"], added: 4 }, ordinal: { formats: ["decimal"], added: 4 },
  roman: { formats: ["upperRoman", "lowerRoman"], added: 0 }, alphabetic: { formats: ["upperLetter", "lowerLetter"], added: 0 },
};
/**
 * How many characters a date or time picture (\@) writes at most: the name
 * of a day (dddd) or a month (MMMM) as long as the longest Word writes in any
 * language (Deireadh Fómhair, segunda-feira), 18; its abbreviation, 6; a
 * day, a month, an hour, minutes or seconds in figures, 2; a year, 4; AM/PM,
 * 4; quoted text as written; any other character, itself. And of a date or a
 * time of no picture, in the format the user chose (Word's default may be a
 * long date): as « dddd, d 'de' MMMM 'de' yyyy » and « HH:mm:ss AM/PM ».
 */
const DATE_NAME_LENGTH = 18;
function pictureLength(picture: string) {
  let length = 0;
  for (let at = 0; at < picture.length; ) {
    const rest = picture.slice(at);
    const quoted = /^'([^']*)'?/.exec(rest);
    const meridiem = /^(am\/pm|a\/p)/i.exec(rest);
    const run = /^([dMyYhHmsS])\1*/.exec(rest);
    if (quoted) length += quoted[1]!.length;
    else if (meridiem) length += meridiem[0].length > 3 ? 4 : 1;
    else if (run && (run[1] === "d" || run[1] === "M")) length += run[0].length >= 4 ? DATE_NAME_LENGTH : run[0].length === 3 ? 6 : 2;
    else if (run && /[yY]/.test(run[1]!)) length += run[0].length === 2 ? 2 : 4;
    else if (run) length += 2;
    else length += 1;
    at += (quoted ?? meridiem ?? run)?.[0].length ?? 1;
  }
  return length;
}
const DEFAULT_DATE_LENGTH = pictureLength("dddd, d 'de' MMMM 'de' yyyy");
const DEFAULT_TIME_LENGTH = pictureLength("HH:mm:ss AM/PM");
/** A field's code (w:instrText, w:fldSimple w:instr): its type, in capitals, and its switches (\@ "dddd", \* roman…), each with its argument. */
function fieldCode(code: string) {
  const type = /^\s*([^\s\\]+)/.exec(code);
  const switches = Array.from(code.slice(type?.[0].length ?? 0).matchAll(/\\([^\s"\\])\s*(?:"([^"]*)"?|([^\s"\\]*))/g), found => [found[1]!, found[2] ?? found[3] ?? ""] as const);
  return { type: (type?.[1] ?? "").toUpperCase(), switches };
}

/** The formats a note given none may be numbered in: a footnote in figures; an endnote in figures, or in roman numerals, as Word numbers them. */
const UNGIVEN_NOTE_FORMATS: Record<"w:footnoteReference" | "w:endnoteReference", string[]> = { "w:footnoteReference": ["decimal"], "w:endnoteReference": ["decimal", "lowerRoman"] };
/** The highest number Word numbers notes or pages from (a 32-bit integer). */
const MAX_NUMBER = 2 ** 31 - 1;
/** How many first numbers of notes are followed each; past them, only the highest, at most (NUMBER_FORMATS `most`). */
const MAX_NUMBER_STARTS = 8;
/** Characters of no width but where a line breaks: zero-width spaces and joiners, a soft hyphen in a line, the BOM. */
const ZERO_WIDTH = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
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
 * may take (characters as wide as in the font Word draws them in, bold or
 * italic, DOCX_FONT_METRICS, and lines as tall as it sets them, bounds of
 * what the reader draws: a font of the reader in its own advances, those of
 * a font metrically compatible with it or its widths published, else in the
 * bound of a font of the reader not measured; a font it does not have in its
 * own when measured and in each one Word may draw it with instead, alone, or
 * a word as wide as in the widest of them (fontResolver, laidLayouts); of no
 * font named, Times New Roman, Word's, never narrower than below; of a
 * character a font lacks, as lacking bounds it; of Hebrew and Arabic, as
 * DOCX_COMPLEX_METRICS bounds them in the run's complex script font; of the
 * characters not measured, Chinese, Japanese or Korean ones 1, spaces 0.3,
 * emoji as DOCX_EMOJI_METRICS, the others of no bound (unmeasuredShare);
 * lines of 1.15 times their size at least, as tall as the fonts of signs,
 * emoji and complex script that a line holds set them;
 * words kept whole on their line, over passages and runs, with those no-break
 * spaces join (U+00A0, U+202F…), but after a hyphen or a dash; the insets of
 * text boxes and the side margins of cells; deleted text shown, as
 * LibreOffice shows it), and the least (lines of 0.9 times
 * their size, characters a fifth as wide, wide ones 0.9, of no width those
 * that have none within a line (ZERO_WIDTH), marks of direction, variation
 * selectors and combining marks, fitted text (w:fitText), lines broken
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
/**
 * The namespaces Word for Microsoft 365 understands, of which it draws the
 * mc:Choice that requires them (ECMA-376 Part 3, 10.2.1), as it declares them
 * on the documents it saves and as [MS-DOCX] and [MS-ODRAWXML] lay down their
 * elements: the standard's (transitional and strict), VML and its Office and
 * Word extensions (v, o, w10), Word's of 2006 to 2024 (wne, w14, w15, w16se,
 * w16cid, w16, w16cex, w16sdtdh, w16sdtfl, w16du), its shapes, groups,
 * canvases, ink and drawings (wps, wpg, wpc, wpi, wp14), DrawingML's of 2010
 * (a14), charts (cx, cx1 to cx8), ink (aink), 3D models (am3d) and Office's
 * extension list (oel). Of a choice that requires any other, Word draws the
 * mc:Fallback.
 */
const WORD_NAMESPACES: ReadonlySet<string> = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://schemas.openxmlformats.org/drawingml/2006/main",
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "http://schemas.openxmlformats.org/drawingml/2006/picture",
  "http://schemas.openxmlformats.org/drawingml/2006/chart", "http://schemas.openxmlformats.org/drawingml/2006/diagram",
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "http://schemas.openxmlformats.org/officeDocument/2006/math",
  "http://schemas.openxmlformats.org/markup-compatibility/2006",
  "http://purl.oclc.org/ooxml/wordprocessingml/main", "http://purl.oclc.org/ooxml/drawingml/main", "http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing",
  "http://purl.oclc.org/ooxml/drawingml/picture", "http://purl.oclc.org/ooxml/drawingml/chart", "http://purl.oclc.org/ooxml/drawingml/diagram",
  "http://purl.oclc.org/ooxml/officeDocument/relationships", "http://purl.oclc.org/ooxml/officeDocument/math",
  "urn:schemas-microsoft-com:vml", "urn:schemas-microsoft-com:office:office", "urn:schemas-microsoft-com:office:word",
  "http://schemas.microsoft.com/office/word/2006/wordml", "http://schemas.microsoft.com/office/word/2010/wordml", "http://schemas.microsoft.com/office/word/2012/wordml",
  "http://schemas.microsoft.com/office/word/2015/wordml/symex", "http://schemas.microsoft.com/office/word/2016/wordml/cid", "http://schemas.microsoft.com/office/word/2018/wordml",
  "http://schemas.microsoft.com/office/word/2018/wordml/cex", "http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash",
  "http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock", "http://schemas.microsoft.com/office/word/2023/wordml/word16du",
  "http://schemas.microsoft.com/office/word/2010/wordprocessingShape", "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup",
  "http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas", "http://schemas.microsoft.com/office/word/2010/wordprocessingInk",
  "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing", "http://schemas.microsoft.com/office/drawing/2010/main",
  "http://schemas.microsoft.com/office/drawing/2014/chartex", "http://schemas.microsoft.com/office/drawing/2015/9/8/chartex", "http://schemas.microsoft.com/office/drawing/2015/10/21/chartex",
  "http://schemas.microsoft.com/office/drawing/2016/5/9/chartex", "http://schemas.microsoft.com/office/drawing/2016/5/10/chartex", "http://schemas.microsoft.com/office/drawing/2016/5/11/chartex",
  "http://schemas.microsoft.com/office/drawing/2016/5/12/chartex", "http://schemas.microsoft.com/office/drawing/2016/5/13/chartex", "http://schemas.microsoft.com/office/drawing/2016/5/14/chartex",
  "http://schemas.microsoft.com/office/drawing/2016/ink", "http://schemas.microsoft.com/office/drawing/2017/model3d", "http://schemas.microsoft.com/office/2019/extlst",
]);
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
const AMPERSAND = 0x26;
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
   * Its East Asian font (w:eastAsia), or its theme's, whether Word draws in it the characters that may be East Asian (w:hint
   * eastAsia), and the language of its East Asian text (w:lang w:eastAsia), which tells some of them.
   */
  eastAsianFont: string;
  eastAsianHint: boolean;
  eastAsianLanguage: string;
  /**
   * Bold, italic, in capitals (w:b, w:i, w:caps or w:smallCaps) by one of the layers: Word may switch them off again, the wider
   * letters are taken (bold, capitals; italic in its font's italic advances, Word drawing the italic a font has, else slanting its upright one, of the same advances).
   */
  bold: true;
  italic: true;
  capitals: true;
  /**
   * Its complex script font (w:rFonts w:cs, or its theme's, w:cstheme), which Word draws its Hebrew and Arabic in, and all its
   * text when the run is marked complex script (w:cs, w:rtl); their bold and italic (w:bCs, w:iCs), as `bold`.
   */
  complexFont: string;
  complexBold: true;
  complexItalic: true;
  /**
   * What sets its letters otherwise on their line (IA-01, round 12): raised or lowered as a superscript or a subscript
   * (w:vertAlign); emphasis marks above or below each (w:em); two lines combined in one or turned (w:eastAsianLayout combine,
   * vert); fitted to a width, in points (w:fitText).
   */
  vertical: boolean;
  emphasis: boolean;
  eastAsianLayout: boolean;
  fitText: number;
  /** Kerned (w:kern) from this size on, in points; 0: not kerned. */
  kern: number;
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

/**
 * The colour of a theme colour name (w:themeColor…), as the settings map it to the theme's colour scheme; the theme's fonts, of
 * headings and body, for Latin, East Asian and complex script text (a:latin, a:ea, a:cs).
 */
type Theme = ((name: string) => string | undefined) & {
  fonts?: Partial<Record<"major" | "minor", Partial<Record<"latin" | "ea" | "cs", string>> & { scripts?: Partial<Record<"ea" | "cs", string[]>> }>>;
};

/** Theme colour names, and the colour of the theme's scheme each one is. */
const THEME_SLOTS: Record<string, string> = {
  dark1: "dk1", light1: "lt1", dark2: "dk2", light2: "lt2", accent1: "accent1", accent2: "accent2", accent3: "accent3",
  accent4: "accent4", accent5: "accent5", accent6: "accent6", hyperlink: "hlink", followedHyperlink: "folHlink",
};
/** Names Word maps to a colour of the scheme: the w:clrSchemeMapping attribute that may change it, and Word's default. */
const THEME_MAPPING: Record<string, [string, string]> = { background1: ["bg1", "light1"], text1: ["t1", "dark1"], background2: ["bg2", "light2"], text2: ["t2", "dark2"] };
const SYSTEM_COLOURS: Record<string, string> = { window: "FFFFFF", windowText: "000000" };

/** The scripts of a theme's fonts (a:font) Word may draw a run's East Asian font in (Japanese, Korean, Chinese), or its complex script one (right to left). */
const THEME_SCRIPTS: Record<string, "ea" | "cs"> = { Jpan: "ea", Hang: "ea", Hans: "ea", Hant: "ea", Arab: "cs", Hebr: "cs", Syrc: "cs", Thaa: "cs" };

/** The colour scheme of the theme part, as the settings part maps it (w:clrSchemeMapping); its fonts, and those of its scripts. */
function readTheme(themeXml: string | undefined, settingsXml: string | undefined): Theme {
  const scheme = new Map<string, string>();
  const fonts: NonNullable<Theme["fonts"]> = {};
  const scriptsSeen = new Set<string>();
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
    if (/^a:(latin|ea|cs)$/.test(tag.name) && path.at(-2) === "a:fontScheme" && (path.at(-1) === "a:majorFont" || path.at(-1) === "a:minorFont")) {
      const slot = (fonts[path.at(-1) === "a:majorFont" ? "major" : "minor"] ??= {});
      slot[tag.name.slice(2) as "latin" | "ea" | "cs"] ??= tag.attributes.get("typeface");
    }
    // The first font given each East Asian or right-to-left script (a:font), for an East Asian or complex script slot left empty (themeFont).
    const script = tag.name === "a:font" ? tag.attributes.get("script") ?? "" : "";
    const typeface = tag.attributes.get("typeface");
    if (Object.hasOwn(THEME_SCRIPTS, script) && typeface && path.at(-2) === "a:fontScheme" && (path.at(-1) === "a:majorFont" || path.at(-1) === "a:minorFont")) {
      const kind = path.at(-1) === "a:majorFont" ? "major" : "minor";
      if (!scriptsSeen.has(`${kind} ${script}`)) (((fonts[kind] ??= {}).scripts ??= {})[THEME_SCRIPTS[script]!] ??= []).push(typeface);
      scriptsSeen.add(`${kind} ${script}`);
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

/** Whether the document asks Word to update all its fields when it opens it (w:updateFields): their results may then all change. */
function updatesFields(settingsXml: string | undefined) {
  let updates = false;
  visitXmlTags(settingsXml ?? "", tag => {
    if (!tag.closing && tag.name === "w:updateFields") updates = !/^(false|0|off)$/i.test(tag.attributes.get("w:val") ?? "");
  });
  return updates;
}

/** The distance between Word's default tab stops (w:defaultTabStop), in points. */
function defaultTabStop(settingsXml: string | undefined) {
  let stop = DEFAULT_TAB_STOP_PT;
  visitXmlTags(settingsXml ?? "", tag => {
    if (!tag.closing && tag.name === "w:defaultTabStop") stop = measurePt(tag.attributes.get("w:val"), 20) ?? stop;
  });
  return stop > 0 ? stop : DEFAULT_TAB_STOP_PT;
}

/** How a document numbers its notes or its pages: the formats it gives (w:numFmt, w:fmt; undefined when a note's is not given) and the first numbers (w:numStart, w:start), each once, the highest of them. */
type Numbering = { formats: Array<string | undefined>; starts: number[]; highest: number };
/** Of footnotes, endnotes and pages (by the element that draws their number); `pages`: the most pages the document may have. */
type Numberings = Record<"w:footnoteReference" | "w:endnoteReference" | "w:pgNum", Numbering> & { pages: number };

/**
 * How a document numbers its footnotes, endnotes and pages: every format and
 * first number its settings (w:footnotePr, w:endnotePr) and its sections
 * (those, w:pgNumType) give, from the settings part, then from the main one
 * (a section may number them otherwise); notes the settings give no format
 * or first number as Word may number them, pages in figures from 1 too (a
 * section of no w:pgNumType). `pages`: the most pages the document may have.
 */
function numberings(settingsXml: string | undefined, pages: number): Survey<Numberings> {
  type Given = { formats: Set<string | undefined>; starts: Set<number> };
  const found: Record<"w:footnoteReference" | "w:endnoteReference" | "w:pgNum", Given> = {
    "w:footnoteReference": { formats: new Set(), starts: new Set() },
    "w:endnoteReference": { formats: new Set(), starts: new Set() },
    "w:pgNum": { formats: new Set(["decimal"]), starts: new Set([1]) },
  };
  const number = (value: string | undefined) => {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), MAX_NUMBER) : undefined;
  };
  let notes: Given | undefined;
  const visit = (tag: XmlTag) => {
    if (tag.name === "w:footnotePr" || tag.name === "w:endnotePr") {
      notes = tag.closing || tag.selfClosing ? undefined : found[tag.name === "w:footnotePr" ? "w:footnoteReference" : "w:endnoteReference"];
      return;
    }
    if (tag.closing) return;
    if (notes && tag.name === "w:numFmt") notes.formats.add(tag.attributes.get("w:val") ?? "decimal");
    else if (notes && tag.name === "w:numStart") {
      const start = number(tag.attributes.get("w:val"));
      if (start !== undefined) notes.starts.add(start);
    } else if (tag.name === "w:pgNumType") {
      const start = number(tag.attributes.get("w:start"));
      found["w:pgNum"].formats.add(tag.attributes.get("w:fmt") ?? "decimal");
      if (start !== undefined) found["w:pgNum"].starts.add(start);
    }
  };
  visitXmlTags(settingsXml ?? "", visit);
  notes = undefined;
  for (const kind of ["w:footnoteReference", "w:endnoteReference"] as const) {
    if (!found[kind].formats.size) found[kind].formats.add(undefined);
    if (!found[kind].starts.size) found[kind].starts.add(1);
  }
  const given = ({ formats, starts }: Given): Numbering => ({ formats: Array.from(formats), starts: Array.from(starts), highest: Array.from(starts).reduce((most, start) => Math.max(most, start), 0) });
  return { visit, done: () => ({ "w:footnoteReference": given(found["w:footnoteReference"]), "w:endnoteReference": given(found["w:endnoteReference"]), "w:pgNum": given(found["w:pgNum"]), pages }) };
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
  if (!pattern) VML_PROPERTIES.set(property, (pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([+-]?[\\d.]+)\\s*(pt|px|in|cm|mm|pc)?\\s*(?:;|$)`, "i")));
  const match = pattern.exec(style);
  const value = match ? Number(match[1]) * VML_UNITS_PT[(match[2] ?? "px").toLowerCase()]! : undefined;
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

/** A length of a VML style, in points (0 when absent). */
const vmlLength = (style: string, property: string) => vmlMeasure(style, property) ?? 0;

/** A length of the style of a VML shape in line with the text, in points: 0 when absent, NaN when not read or negative (of no length known). */
function inlineVmlLength(style: string, property: string) {
  const length = vmlMeasure(style, property);
  if (length !== undefined) return length >= 0 ? length : Number.NaN;
  return new RegExp(`(?:^|;)\\s*${property}\\s*:`, "i").test(style) ? Number.NaN : 0;
}

/** VML elements other than shapes and groups that a w:pict or an OLE object's w:object may draw in line with the text; those of a size their points give (VML_BY_POINTS, not read). */
const INLINE_VML = new Set(["v:image", "v:arc", "v:line", "v:polyline", "v:curve"]);
const VML_BY_POINTS = new Set(["v:line", "v:polyline", "v:curve"]);

/** The largest DrawingML length (EMU) read: Word may not read one beyond a 32-bit integer as written (a box of 2^32 EMU and 1 pt…). */
const MAX_EMU = 2 ** 31 - 1;

/** A DrawingML length (EMU) in points, signed as XML Schema writes integers (+2540000, -12700); undefined when unreadable or beyond MAX_EMU. */
const emuPt = (value: string | undefined) => {
  if (value === undefined || !/^\s*[+-]?\d+\s*$/.test(value)) return undefined;
  const emu = Number(value);
  return Math.abs(emu) <= MAX_EMU ? emu / EMU_PER_PT : undefined;
};

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

/** The store Word binds content controls to the document's core properties by (w:dataBinding w:storeItemID): docProps/core.xml. */
const CORE_PROPERTIES_STORE = "{6C3C8BC8-F283-45AE-878A-BAB7291924A1}";
const CORE_PROPERTIES_RELATIONSHIP = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";

/**
 * The document's core properties (docProps/core.xml), by the local name of each element (title, creator, subject…): the data Word
 * draws a content control bound to one of them with.
 */
function coreProperties(xml: string | undefined) {
  const values = new Map<string, string>();
  let open: { name: string; start: number } | undefined;
  visitXmlTags(xml ?? "", tag => {
    const name = tag.name.slice(tag.name.indexOf(":") + 1);
    if (!tag.closing && !tag.selfClosing) open = { name, start: tag.end };
    else if (tag.closing && open?.name === name) {
      if (!values.has(name)) values.set(name, decodeXml(xml!.slice(open.start, tag.start)));
      open = undefined;
    }
  });
  return values;
}

/**
 * The content controls bound to data (w:dataBinding) whose content Word draws as it stores it, by where their w:sdt starts: bound
 * to a core property of the document (CORE_PROPERTIES_STORE, the last step of the binding's XPath naming it, as Word writes
 * /ns1:coreProperties[1]/ns0:title[1]) whose value is their text, spaces aside.
 */
function storedAsBound(xml: string, properties: Map<string, string>): Survey<Set<number>> {
  const same = new Set<number>();
  const open: Array<{ start: number; property?: string; content: number; text: string }> = [];
  let textStart: number | null = null;
  const spaced = (text: string) => text.replace(/\s+/g, " ").trim();
  const visit = (tag: XmlTag) => {
    const control = open.at(-1);
    if (tag.name === "w:sdt") {
      if (!tag.closing && !tag.selfClosing) open.push({ start: tag.start, content: 0, text: "" });
      else if (tag.closing && control) {
        open.pop();
        const value = control.property !== undefined ? properties.get(control.property) : undefined;
        if (value !== undefined && spaced(value) === spaced(control.text)) same.add(control.start);
      }
    } else if (control && tag.name === "w:dataBinding" && !tag.closing && control.content === 0) {
      const last = /([^/:[\]]+)(?:\[\d+\])?\s*$/.exec(tag.attributes.get("w:xpath") ?? "")?.[1];
      if ((tag.attributes.get("w:storeItemID") ?? "").toUpperCase() === CORE_PROPERTIES_STORE && last) control.property = last;
    } else if (control && tag.name === "w:sdtContent" && !tag.selfClosing) control.content += tag.closing ? -1 : 1;
    else if (control && control.content > 0 && tag.name === "w:t" && !tag.selfClosing) {
      if (!tag.closing) textStart = tag.end;
      else if (textStart !== null) {
        const text = decodeXml(xml.slice(textStart, tag.start));
        for (const each of open) if (each.content > 0) each.text += text;
        textStart = null;
      }
    }
  };
  return { visit, done: () => same };
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
type PageAcross = { width: number; widestMargin: number; narrowestMargin: number; columnShift: number; narrowestColumn: number; widestColumn: number; columnStart: (breaks: number) => number; grid?: DocumentGrid };
/**
 * A section's document grid (w:docGrid, ECMA-376 Part 1, 17.6.5): of lines (lines, linesAndChars), Word sets each line of a
 * paragraph that snaps to it (w:snapToGrid) on a whole number of its pitches (w:linePitch), a line up to a pitch taller, in
 * points; of characters (linesAndChars, snapToChars), each character on a whole number of cells of a pitch its w:charSpace
 * changes, which the check does not follow.
 */
type DocumentGrid = { pitch: number; characters: boolean };
const FIRST_COLUMN = () => 0;

/** The page of each section, by where its w:sectPr starts: a paragraph lies in the first section that ends after it. */
function sectionPages(): Survey<Array<{ end: number; page: PageAcross }>> {
  const sections: Array<{ end: number; page: PageAcross }> = [];
  /** `widths`, `spaces`: of each column given (w:col), and the space after it. */
  type Section = { start: number; width?: number; left?: number; right?: number; gutter?: number; columns: number; space?: number; widths: number[]; spaces: number[]; grid?: DocumentGrid };
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
    sections.push({ end: current.start, page: { width, widestMargin: Math.max(left, right) + gutter, narrowestMargin: Math.min(left, right), columnShift: columns > 1 ? Math.max(0, text - narrowestColumn) : 0, narrowestColumn, widestColumn, columnStart, grid: current.grid } });
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
    else if (tag.name === "w:docGrid") {
      const type = tag.attributes.get("w:type") ?? "default";
      const pitch = twips(tag, "linePitch");
      const lines = /^(lines|linesAndChars)$/i.test(type);
      const characters = /^(linesAndChars|snapToChars)$/i.test(type);
      // A pitch not read: of no height known.
      section.grid = lines || characters ? { pitch: lines ? (pitch !== undefined && pitch >= 0 ? pitch : Number.POSITIVE_INFINITY) : 0, characters } : undefined;
    }
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

/** Of each character of the Basic Multilingual Plane, its kind (CHARACTER_KIND_NAMES, from 1) and whether it is wide (2) or not (1), found once (0: not yet). */
const CHARACTER_KIND_NAMES: CharacterKind[] = ["capital", "figure", "letter", "punctuation", "sign", "space", "wide"];
const kinds = new Uint8Array(0x10000);
const wides = new Uint8Array(0x10000);
/** The kind of a character, by its code point. */
function kindOf(code: number): CharacterKind {
  if (code > 0xffff) return characterKind(String.fromCodePoint(code));
  if (!kinds[code]) kinds[code] = CHARACTER_KIND_NAMES.indexOf(characterKind(String.fromCharCode(code))) + 1;
  return CHARACTER_KIND_NAMES[kinds[code]! - 1]!;
}
/** Whether a character, by its code point, is about as wide as it is tall (WIDE_CHARACTER). */
function isWide(code: number) {
  if (code > 0xffff) return WIDE_CHARACTER.test(String.fromCodePoint(code));
  if (!wides[code]) wides[code] = WIDE_CHARACTER.test(String.fromCharCode(code)) ? 2 : 1;
  return wides[code] === 2;
}
/** How many letters a number takes in roman numerals (viii: 4), as Word may number notes and pages: an M for each thousand. */
function romanLength(value: number) {
  let letters = Math.floor(value / 1000);
  value %= 1000;
  for (const [step, count] of [[900, 2], [500, 1], [400, 2], [100, 1], [90, 2], [50, 1], [40, 2], [10, 1], [9, 2], [5, 1], [4, 2], [1, 1]] as const) {
    for (; value >= step; value -= step) letters += count;
  }
  return letters;
}
/** A character in capitals, by its code point, when it is one character in capitals too (ß stays ß). */
function upperCase(code: number) {
  if (code >= 97 && code <= 122) return code - 32;
  if (code < 128) return code;
  const character = String.fromCodePoint(code);
  const upper = character.toUpperCase();
  return upper.length === character.length ? upper.codePointAt(0)! : code;
}

/**
 * Alignments of a paragraph Word may fill its lines in by stretching Arabic with kashidas (ECMA-376 Part 1, 17.18.44 ST_Jc: both,
 * distribute, lowKashida, mediumKashida, highKashida, thaiDistribute).
 */
const STRETCHED_ALIGNMENTS = /^(both|distribute|lowKashida|mediumKashida|highKashida|thaiDistribute)$/i;
/** Where Word may break a line within a word: after a hyphen, a dash, a soft hyphen or a zero-width space. */
const BREAK_AFTER = new Set([0x2d, 0xad, 0x200b, 0x2010, 0x2012, 0x2013, 0x2014, 0x2015]);
/** Spaces Word breaks no line at (no-break, narrow no-break, figure, zero-width no-break): as wide as spaces, they join the words around them. */
const NO_BREAK_SPACES = new Set([0xa0, 0x202f, 0x2007, 0xfeff]);
/** Whether a line may break at a character (its first UTF-16 unit): a space but those. */
const breaksLine = (code: number) => SPACES[code] === 1 && !NO_BREAK_SPACES.has(code);
/**
 * Text up to this many points wider than its line, its advances added, still
 * fits on it in the most room: half a twip, the rounding of a length to
 * Word's unit (lines are as wide as the twips of their cell, frame, page or
 * indents), the advances being bounds of Word's, rounded up. Kerning, which
 * widens some pairs, is counted where a run asks for it (DOCX_KERNING_MOST,
 * makeMeasure).
 */
const FIT_TOLERANCE_PT = 1 / 40;
/** Where each character measured (DOCX_FONT_CHARACTERS, all of one UTF-16 unit) is in the widths of a font, by its code: -1 when not measured. */
const MEASURED_INDEX = new Int16Array(0x10000).fill(-1);
for (let index = 0; index < DOCX_FONT_CHARACTERS.length; index += 1) MEASURED_INDEX[DOCX_FONT_CHARACTERS.charCodeAt(index)] = index;
/** Of each character measured, where its base letter is (the first character of its canonical decomposition), for DOCX_FONT_AS_BASE. */
const MEASURED_BASES = Array.from(DOCX_FONT_CHARACTERS, character => Math.max(0, MEASURED_INDEX[character.normalize("NFD").charCodeAt(0)]!));
/** The styles of a font Word draws. */
type FontStyle = "regular" | "italic" | "bold" | "boldItalic";
/** The widths of each style of each font of DOCX_FONT_METRICS, in sizes of their text, read once from their digits. */
const fontWidths = new Map<string, number[]>();

/**
 * The widths of a style of a font of DOCX_FONT_METRICS, in sizes of their
 * text: of a slanted style (italic) left out, those of its upright one, as
 * Word slants the upright style of a font that has no slanted one.
 */
function styleWidths(font: string, style: FontStyle): number[] {
  const key = `${font}:${style}`;
  let widths = fontWidths.get(key);
  if (widths) return widths;
  const metrics = DOCX_FONT_METRICS[font]!;
  const digits = metrics[style];
  const upright = style === "italic" ? styleWidths(font, "regular") : style === "boldItalic" ? styleWidths(font, "bold") : undefined;
  if (digits === undefined) return upright!;
  const value = (at: number) => DOCX_FONT_WIDTH_DIGITS.indexOf(digits[at]!);
  widths = [];
  for (let at = 0; at < digits.length; at += digits[at] === DOCX_FONT_AS_BASE ? 1 : 2) {
    if (digits[at] === DOCX_FONT_AS_UPRIGHT) for (let count = value(at + 1); count >= 0; count -= 1) widths.push(upright![widths.length]!);
    else if (digits[at] === DOCX_FONT_AS_BEFORE) for (let count = value(at + 1); count >= 0; count -= 1) widths.push(widths.at(-1)!);
    else widths.push(digits[at] === DOCX_FONT_AS_BASE ? widths[MEASURED_BASES[widths.length]!]! : (value(at) * DOCX_FONT_WIDTH_DIGITS.length + value(at + 1)) / 1000);
  }
  fontWidths.set(key, widths);
  return widths;
}

/**
 * A font Word may draw characters in: the widths of each of its styles
 * (DOCX_FONT_CHARACTERS, in sizes of their text, 0 for a character it
 * lacks), the height of its line of single spacing (in sizes).
 */
type DrawnFont = { widths: (style: FontStyle) => number[]; line: number };

/**
 * The fonts a run's characters may be laid out in, by the name it gives: Word
 * draws them in one of them (`fonts`), each word as wide as in the widest for
 * it; the widest of them character by character (`widest`), and their
 * tallest line.
 */
type LaidFont = { fonts: DrawnFont[]; widest: (style: FontStyle) => number[]; line: number };
/** The fonts a run's characters may be laid out in, by the name it gives (fontResolver); and one font laid out alone (`alone`); the complex script font a name may be (`complex`). */
type FontsOf = ((name: string | undefined) => LaidFont) & { alone: (font: DrawnFont) => LaidFont; complex: ComplexOf };

/**
 * What a run's complex script font (w:rFonts w:cs) gives its Hebrew and Arabic: whether DOCX_COMPLEX_METRICS bounds them, in
 * every font the name may stand for (DOCX_COMPLEX_FONTS, or those Word draws a font it does not have with), and the tallest line
 * of these fonts, in sizes of their text.
 */
type ComplexFont = { bounded: boolean; line: number };
type ComplexOf = (name: string | undefined) => ComplexFont;

/**
 * An advance or a line height of no bound known, in sizes of the text: of a
 * font of no metrics of the reader (Wide Latin…), or the document embeds. Each
 * character of it takes a line of its own, each line all the room left: what
 * follows it in a row, a text box or a frame of fixed size is set aside.
 */
const UNBOUNDED_SIZES = 1e6;
/** The height, in points, of lines of no extent known: no container holds them, nor what follows them in it. */
const UNBOUNDED_EXTENT_PT = 1e9;
const UNBOUNDED_WIDTHS = new Array<number>(DOCX_FONT_CHARACTERS.length).fill(UNBOUNDED_SIZES);
const UNBOUNDED_FONT: DrawnFont = { widths: () => UNBOUNDED_WIDTHS, line: UNBOUNDED_SIZES };
const UNBOUNDED_COMPLEX: ComplexFont = { bounded: false, line: UNBOUNDED_SIZES };
/** The line of a complex script font of DOCX_COMPLEX_FONTS, in sizes of its text. */
const complexFontLine = (key: string) => (key === "complex" ? DOCX_COMPLEX_METRICS.line : DOCX_FONT_METRICS[key]!.line) / 1000;
/** The fonts of DOCX_FONT_METRICS, each read once. */
const measuredFonts = new Map<string, DrawnFont>();
/** A font of DOCX_FONT_METRICS by its key, or of no bound (DOCX_SUBSTITUTE_FONTS.unbounded). */
function measuredFont(key: string): DrawnFont {
  if (key === DOCX_SUBSTITUTE_FONTS.unbounded) return UNBOUNDED_FONT;
  let font = measuredFonts.get(key);
  if (!font) measuredFonts.set(key, (font = { widths: style => styleWidths(key, style), line: DOCX_FONT_METRICS[key]!.line / 1000 }));
  return font;
}

/** Of each character measured, whether it is a letter, a figure, punctuation or a space, rather than a sign. */
const LETTER_LIKE = Uint8Array.from(DOCX_FONT_CHARACTERS, character => (characterKind(character) === "sign" ? 0 : 1));
const lackingWidths = new Map<FontStyle, number[]>();
/**
 * The most a character measured is wide, in sizes of its text, in a font
 * that lacks it (of a width 0), which Word draws in another: a letter, a
 * figure, punctuation or a space as in the widest of the reader's text fonts
 * (`listed`) or of its East Asian ones (`eastAsian`, a full em for one of an
 * ambiguous width), whichever Word takes; a sign, which Word draws in a font
 * of signs (Segoe UI Symbol, Segoe UI Emoji, MS Gothic…, of no metrics
 * published), as the widest of the fonts of signs measured a quarter more,
 * never narrower than an East Asian font nor, of one Word may draw as an
 * emoji, an emoji (DOCX_SIGN_FALLBACK); a character none of them holds, of no
 * bound.
 */
function lacking(style: FontStyle): number[] {
  let widths = lackingWidths.get(style);
  if (!widths) {
    const listed = measuredFont(DOCX_SUBSTITUTE_FONTS.listed).widths(style);
    const eastAsian = measuredFont(DOCX_SUBSTITUTE_FONTS.eastAsian).widths(style);
    const signs = measuredFont(DOCX_SIGN_FALLBACK).widths(style);
    lackingWidths.set(style, (widths = listed.map((width, at) => (LETTER_LIKE[at] ? Math.max(width, eastAsian[at]!) : signs[at]!) || UNBOUNDED_SIZES)));
  }
  return widths;
}
/** The height of a line of a font of signs Word draws a sign in that the run's font lacks, in sizes of its text. */
const SIGN_LINE = DOCX_FONT_METRICS[DOCX_SIGN_FALLBACK]!.line / 1000;

/** Where each character of Hebrew and Arabic the check bounds is in DOCX_COMPLEX_METRICS, by its code: -1 when it is not one. */
const COMPLEX_INDEX = new Int16Array(0x10000).fill(-1);
for (let index = 0; index < DOCX_COMPLEX_CHARACTERS.length; index += 1) COMPLEX_INDEX[DOCX_COMPLEX_CHARACTERS.charCodeAt(index)] = index;
/** Whether a character is one of Arabic Word may stretch with kashidas in a line it justifies (the Arabic blocks, U+0600 to U+08FF, Presentation Forms). */
const isArabic = (code: number) => (code >= 0x0600 && code <= 0x08ff) || (code >= 0xfb50 && code <= 0xfeff);
/** The widths of DOCX_COMPLEX_METRICS in each weight, in sizes of their text (0: of no bound), read once. */
const complexWidths = new Map<"regular" | "bold", number[]>();
function complexWidthsOf(weight: "regular" | "bold") {
  let widths = complexWidths.get(weight);
  if (widths) return widths;
  const digits = DOCX_COMPLEX_METRICS[weight];
  const value = (at: number) => DOCX_FONT_WIDTH_DIGITS.indexOf(digits[at]!);
  widths = [];
  for (let at = 0; at < digits.length; at += 2) {
    if (digits[at] === DOCX_FONT_AS_BEFORE) for (let count = value(at + 1); count >= 0; count -= 1) widths.push(widths.at(-1)!);
    else widths.push((value(at) * DOCX_FONT_WIDTH_DIGITS.length + value(at + 1)) / 1000);
  }
  complexWidths.set(weight, widths);
  return widths;
}

/**
 * Characters Word draws as an emoji, in Segoe UI Emoji (Extended_Pictographic, Emoji_Presentation, the regional indicators of
 * flags, the skin tones, the enclosing keycap): those the check does not measure (DOCX_FONT_CHARACTERS) as wide as
 * DOCX_EMOJI_METRICS bounds them, each part of a sequence (ZWJ, a flag, a skin tone, a keycap) so, which a sequence drawn as one
 * emoji is not wider than; by code point once.
 */
const EMOJI = new RegExp("[\\p{Extended_Pictographic}\\p{Emoji_Presentation}\\p{Regional_Indicator}\\p{Emoji_Modifier}\\u20e3]", "u");
const emojis = new Uint8Array(0x10000);
function isEmoji(code: number) {
  if (code > 0xffff) return EMOJI.test(String.fromCodePoint(code));
  if (!emojis[code]) emojis[code] = EMOJI.test(String.fromCharCode(code)) ? 2 : 1;
  return emojis[code] === 2;
}

/**
 * Characters Word draws nothing of, beyond ZERO_WIDTH: marks of direction, embedding and isolation (U+200E, U+200F, U+202A to
 * U+202E, U+2066 to U+2069, the Arabic letter mark U+061C), invisible operators (U+2061 to U+2064), variation selectors (U+FE00 to
 * U+FE0F, U+E0100 to U+E01EF) and tags (U+E0020 to U+E007F), which an emoji's presentation and a flag of a region use.
 */
const isUndrawn = (code: number) =>
  code === 0x200e || code === 0x200f || code === 0x061c || (code >= 0x202a && code <= 0x202e) || (code >= 0x2061 && code <= 0x206f) || (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0xe0020 && code <= 0xe007f) || (code >= 0xe0100 && code <= 0xe01ef);
/** Combining marks, drawn over the letter before them: of no width in the least room. */
const COMBINING_MARK = new RegExp("\\p{M}", "u");
const marks = new Uint8Array(0x10000);
function isMark(code: number) {
  if (code > 0xffff) return COMBINING_MARK.test(String.fromCodePoint(code));
  if (!marks[code]) marks[code] = COMBINING_MARK.test(String.fromCharCode(code)) ? 2 : 1;
  return marks[code] === 2;
}

/**
 * The most a character the check does not measure (DOCX_FONT_CHARACTERS) is
 * wide, in sizes of its text: a space below U+0021, one of no width within a
 * line (ZERO_WIDTH) or a format control Word draws as nothing (isUndrawn), as
 * LAYOUTS gives their kind; a Chinese, Japanese or Korean one a full em, as
 * East Asian fonts draw them; an emoji as DOCX_EMOJI_METRICS bounds it (but in
 * a run one of whose fonts is of no bound, which may hold it); any other
 * (Indic or Thai letters, Latin combining marks, the private use area…), Word
 * drawing it in a font the check does not measure, shaping some of them, of no
 * bound. Hebrew and Arabic are bounded apart, in the run's complex script font
 * (makeMeasure).
 */
function unmeasuredShare(code: number, typewriter: boolean, bold = false, unbounded = false) {
  if (code <= 32 || ZERO_WIDTH.has(code) || isUndrawn(code)) {
    const kind = kindOf(code);
    return typewriter && kind !== "wide" ? LAYOUTS[MOST]!.typewriter : LAYOUTS[MOST]!.widths[kind];
  }
  if (isWide(code)) return LAYOUTS[MOST]!.widths.wide;
  return !unbounded && isEmoji(code) ? (bold ? DOCX_EMOJI_METRICS.bold : DOCX_EMOJI_METRICS.regular) / 1000 : UNBOUNDED_SIZES;
}

/**
 * Characters Word shows nothing of (zero-width spaces and joiners, soft
 * hyphen, BOM), or spaces of another kind than a space inside a name: a font
 * named with them may not be the font its name reads as.
 */
const UNSEEN_IN_NAMES = /[\u00ad\u200b-\u200f\u2060-\u2064\ufeff]/g;
const DOUBTFUL_NAME = /[\u00ad\u200b-\u200f\u2060-\u2064\ufeff]|\S[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+\S/;
/** A font's name as DOCX_FONT_ALIASES writes it: without the characters Word shows nothing of, its spaces as one, in lower case; as written otherwise, Word taking no other characters for its own (Ａｒｉａｌ is no Arial, ＭＳ ゴシック is MS Gothic's Japanese name). */
const fontName = (name: string) => name.replace(UNSEEN_IN_NAMES, "").replace(/\s+/g, " ").trim().toLowerCase();
/** Names of typewriter fonts, all of whose characters are as wide (Consolas, Source Code Pro, Cascadia Mono, Inconsolata…). */
const TYPEWRITER_NAME = /\b(mono|monospaced?|code|courier|consolas|inconsolata|cascadia|typewriter|fixedsys|menlo|monaco)\b|lucida console|\bocr[- ]?[ab]\b/;
/** Names of East Asian fonts not listed (DOCX_FONT_ALIASES): written in their scripts, or naming them. */
const EAST_ASIAN_NAME = /[぀-ヿ㐀-䶿一-鿿가-힯]|\bcjk\b|\bhan (sans|serif)\b|\bwenquanyi\b/;
/**
 * Names of heavy or wide fonts not listed (Lato Black, Montserrat ExtraBold, Wide Latin…): drawn wider than any measured, of no
 * width known; their words apart by a space, an underscore or a hyphen (Calibri Extra-Bold), or glued to another (SemiExpanded,
 * ExtraBlack, UltraWide), as heavyName reads them.
 */
const HEAVY_NAME = /\b(\w*black|\w*heavy|ultra|extra ?bold|ultra ?bold|fat|\w*wide|\w*extended|\w*expanded|poster)\b/;
const heavyName = (name: string) => HEAVY_NAME.test(name.replace(/[_-]+/g, " "));
/** A theme font written as DrawingML writes it: +mn-lt, the theme's body font for Latin text… */
const THEME_REFERENCE = /^\+(mn|mj)-(lt|ea|cs)$/;
/** A font's name as Word's font box shows it, the theme's font it is: Calibri (Body), Calibri Light (Headings)… */
const SHOWN_NAME = /^(.+?)\s*\([^()]*\)$/;
/** How many fonts of a list of names (LibreOffice writes alternatives apart by semicolons) are looked for; past them, the list is of no width known. */
const MAX_LISTED_FONTS = 8;
/** How many entries of one name in the font table are read: past them, the font is of no width known. */
const MAX_FONT_ENTRIES = 8;
/** How many fonts a run's text may be drawn in are each laid out word by word (RunFonts): past them, its characters are as wide as in the widest. */
const MAX_CHOSEN_FONTS = 8;

/**
 * The East Asian fonts of Office's themes, for Japanese, Chinese and Korean
 * text (a:font), as a list of names (fontResolver): Word's when a run asks for
 * an East Asian font and the document names none, or its theme leaves its
 * East Asian one empty.
 */
const OFFICE_EAST_ASIAN_FONTS = "ＭＳ 明朝;游明朝;宋体;等线;新細明體;맑은 고딕";

/**
 * A theme font Word draws a run in (w:asciiTheme…): minorEastAsia the
 * theme's East Asian body font (a:ea), majorBidi its complex script one for
 * headings (a:cs)…; when the theme leaves either empty, as Office's does,
 * Word takes the one it gives the script of the document's language
 * (a:font): any of those of its East Asian or right-to-left scripts, as a
 * list of names (fontResolver), else Office's East Asian ones; empty when it
 * gives none.
 */
function themeFont(theme: Theme, name: string) {
  const fonts = theme.fonts?.[/^major/i.test(name) ? "major" : "minor"];
  const slot = /EastAsia$/i.test(name) ? "ea" : /Bidi$/i.test(name) ? "cs" : "latin";
  if (slot === "latin" || fonts?.[slot]) return fonts?.[slot] ?? "";
  const scripts = fonts?.scripts?.[slot];
  return scripts?.length ? scripts.join(";") : slot === "ea" ? OFFICE_EAST_ASIAN_FONTS : "";
}

/**
 * What a document's font table (w:fonts) says of a font it names: another name for it, its kind, pitch and PANOSE classification;
 * of no width known when the document embeds it (w:embedRegular…), or lists more entries of its name than are read (MAX_FONT_ENTRIES).
 */
type FontEntry = { altName?: string; family?: string; pitch?: string; panose?: string; unbounded?: boolean };

/** A font the document embeds, in any style (ECMA-376 Part 1, 17.8.3.3 to 17.8.3.6). */
const EMBEDDED = /^w:embed(Regular|Bold|Italic|BoldItalic)$/;

/**
 * The fonts of a document's font table (word/fontTable.xml), by their names (fontName); each entry of a name, as Word may read any; a
 * name of more entries than are read (MAX_FONT_ENTRIES) as one entry of no width known.
 */
function readFontTable(xml: string | undefined) {
  const entries = new Map<string, FontEntry[]>();
  let entry: FontEntry | undefined;
  visitXmlTags(xml ?? "", tag => {
    if (tag.name === "w:font") {
      const name = tag.attributes.get("w:name");
      entry = tag.closing || tag.selfClosing || name === undefined ? undefined : {};
      if (entry) {
        const named = entries.get(fontName(name!)) ?? [];
        entries.set(fontName(name!), named);
        if (named.length < MAX_FONT_ENTRIES && !named[0]?.unbounded) named.push(entry);
        else {
          named.splice(0, named.length, { unbounded: true });
          entry = undefined;
        }
      }
    } else if (entry && !tag.closing) {
      const value = tag.attributes.get("w:val");
      if (tag.name === "w:altName") entry.altName = value;
      else if (tag.name === "w:family") entry.family = value;
      else if (tag.name === "w:pitch") entry.pitch = value;
      else if (tag.name === "w:panose1") entry.panose = value;
      // Word draws a font the document embeds in its own glyphs, whose advances, substitutions (GSUB) and kerning (GPOS, kern) it
      // follows by the character map it reads: never measured here, of no bound.
      else if (EMBEDDED.test(tag.name)) entry.unbounded = true;
    }
  });
  return entries;
}

/**
 * Words a font's name may go on with after its family's name (Yu Gothic Medium, Segoe UI Semilight Italic, Arial Nova Cond,
 * SimSun-ExtB, Calibri-Light…): of its weight, width, style or use.
 */
const VARIANT_WORD = /^(thin|hairline|extra|ultra|semi|demi|light|extralight|ultralight|semilight|demilight|book|regular|normal|roman|medium|demibold|semibold|bold|condensed|cond|semicondensed|narrow|compressed|italic|oblique|ui|display|text|small|caption|subheading|heading|banner|ext[a-z])$/;
/**
 * Words after a family's name that make the font wider or heavier than the family (IA-01, round 12), read glued together, in any
 * order: Black, Heavy, ExtraBold, UltraBold (Extra Bold, Ultra-Bold), Ultra (but UltraLight, UltraThin), Fat, Wide, Extended,
 * Expanded (SemiExpanded…), Poster: of no bound; Display, Rounded: as a font of the reader of no metrics here (`listed`), never
 * the family's.
 */
const WIDENING_WORDS = /black|heavy|extrabold|ultrabold|ultra(?!light|thin)|fat|wide|extend|expand|poster/;
const DISPLAY_WORDS = /display|rounded/;
const WIDENING_WORD = /^(black|heavy|extrabold|ultrabold|fat|wide|extended|expanded|semiexpanded|extraexpanded|ultraexpanded|extrablack|ultrablack|semiblack|poster|rounded)$/;

/** What parts a font's name in words (familyOf): a space, an underscore, a hyphen. */
const NAME_SEPARATOR = /[\s_-]/;
/** The longest name DOCX_FONT_ALIASES lists: no longer part of a name is looked up (familyOf). */
const LONGEST_ALIAS = Object.keys(DOCX_FONT_ALIASES).reduce((longest, name) => Math.max(longest, name.length), 0);

/**
 * The font of DOCX_FONT_METRICS a font's name not listed stands for as a
 * variant of a family (familyOf): the longest name of DOCX_FONT_ALIASES it
 * starts with, followed by words of VARIANT_WORD only, the family's; followed
 * by a word that widens it (WIDENING_WORDS, DISPLAY_WORDS), of no bound or
 * `listed`, never the family's; none for a heavy or wide one (HEAVY_NAME),
 * of no bound. Its words are read once each, from its end, and only a start
 * of it no longer than a name listed is looked up, however long the name.
 */
function familyOf(name: string) {
  if (heavyName(name)) return undefined;
  /** The words after the family read so far, glued (ExtraBold read as Extra and Bold). */
  let words = "";
  for (let end = name.length; end > 0; ) {
    let start = end;
    while (start > 0 && !NAME_SEPARATOR.test(name[start - 1]!)) start -= 1;
    let cut = start;
    while (cut > 0 && NAME_SEPARATOR.test(name[cut - 1]!)) cut -= 1;
    // A name ending apart, or of a word with nothing before it, or not of a variant: of no family.
    const word = name.slice(start, end);
    if (start === end || cut === start || !(VARIANT_WORD.test(word) || WIDENING_WORD.test(word))) return undefined;
    words = word + words;
    const rest = cut <= LONGEST_ALIAS ? name.slice(0, cut) : undefined;
    if (rest !== undefined && Object.hasOwn(DOCX_FONT_ALIASES, rest)) {
      if (WIDENING_WORDS.test(words)) return DOCX_SUBSTITUTE_FONTS.unbounded;
      return DISPLAY_WORDS.test(words) ? DOCX_SUBSTITUTE_FONTS.listed : DOCX_FONT_ALIASES[rest]!;
    }
    end = cut;
  }
  return undefined;
}

/**
 * The font of DOCX_FONT_METRICS a font name stands for when listed (DOCX_FONT_ALIASES: of its metrics, or the bound of a font of the
 * reader of none), or a variant of a family listed (familyOf: the family's, never narrower), or when it names a typewriter or East
 * Asian font; of no bound, a heavy or wide one.
 */
function knownFont(name: string) {
  // A name of Object.prototype (constructor, __proto__) is no font listed.
  if (Object.hasOwn(DOCX_FONT_ALIASES, name)) return DOCX_FONT_ALIASES[name]!;
  const family = familyOf(name);
  if (family !== undefined) return family;
  if (TYPEWRITER_NAME.test(name)) return DOCX_SUBSTITUTE_FONTS.typewriter;
  if (EAST_ASIAN_NAME.test(name)) return DOCX_SUBSTITUTE_FONTS.eastAsian;
  if (heavyName(name)) return DOCX_SUBSTITUTE_FONTS.unbounded;
  return undefined;
}

/**
 * The fonts Word may draw a font it does not have with, by what the
 * document's font table says of it (each of them may be false: none narrows
 * what another gives): its other name (w:altName) when that is a font known;
 * a typewriter one for a fixed pitch (w:pitch), a modern kind (w:family) or a
 * monospaced PANOSE proportion; of no bound for a script or decorative kind,
 * or PANOSE hand written or decorative (Word may pick any of its display
 * fonts); Arial for a sans serif one, swiss, or of a PANOSE sans serif style,
 * Times New Roman for a serif one, roman, or of a PANOSE serif style: Word
 * takes the one these say, either when they disagree or say nothing (of a
 * family auto too, or of no entry).
 */
function substituteFonts(entry: FontEntry | undefined) {
  const { sans, serif, typewriter, unbounded } = DOCX_SUBSTITUTE_FONTS;
  if (!entry) return [sans, serif];
  if (entry.unbounded) return [unbounded];
  const keys: string[] = [];
  const alternate = entry.altName ? knownFont(fontName(entry.altName)) : undefined;
  if (alternate) keys.push(alternate);
  const panose = /^[0-9a-f]{20}$/i.test(entry.panose ?? "") ? entry.panose!.match(/../g)!.map(pair => Number.parseInt(pair, 16)) : undefined;
  const family = entry.family?.toLowerCase();
  if (/^fixed$/i.test(entry.pitch ?? "") || family === "modern" || (panose?.[0] === 2 && panose[3] === 9)) keys.push(typewriter);
  if (family === "script" || family === "decorative" || panose?.[0] === 3 || panose?.[0] === 4) keys.push(unbounded);
  // A family auto, or another, says nothing of the font (ECMA-376, ST_FontFamily).
  const byFamily = family === "roman" ? serif : family === "swiss" ? sans : undefined;
  const byPanose = panose?.[0] === 2 ? (panose[1]! >= 11 && panose[1]! <= 13 ? sans : panose[1]! >= 2 && panose[1]! <= 10 ? serif : undefined) : undefined;
  if (byFamily && byPanose && byFamily !== byPanose) keys.push(sans, serif);
  else if (byFamily ?? byPanose) keys.push((byFamily ?? byPanose)!);
  else if (!keys.length) keys.push(sans, serif);
  return keys;
}

/** Names of fonts that tell their kind (FreeSans, Noto Serif…): the font of that kind is one they may be drawn as, beyond what the font table says. */
const SANS_NAME = /sans/;
const SERIF_NAME = /serif/;

/**
 * The fonts a document's runs may be laid out in, by the name they give
 * (w:rFonts, a theme's font): a font of the reader (DOCX_WORD_FONTS) in its
 * metrics, or its bound (knownFont), whatever the document says of it; a
 * font the reader does not have in the fonts Word may draw it with
 * (substituteFonts, by each entry of its name in the font table), and in its
 * own metrics when measured (the reader may have it) or the kind its name
 * tells; a font the document embeds (w:embedRegular…) of no bound, whatever
 * its name; Times New Roman, Word's, when none is named. A name that may be
 * read otherwise may be any of what it may be: with characters Word shows
 * nothing of, or spaces of another kind (Calibri followed by a zero-width
 * space: Calibri, or a font Word does not have), of characters NFKC writes
 * otherwise (Ａｒｉａｌ Ｎａｒｒｏｗ in full-width letters: a font Word does
 * not have, Word not reading it as Arial Narrow, or Arial Narrow), as Word's
 * font box shows a theme font (Calibri (Body): Calibri, or such a font), as
 * DrawingML refers to a theme font (+mn-lt: the theme's, or such a font), as a
 * list of alternatives (each, as themeFont gives the fonts of a theme's
 * scripts). Each name looked for once.
 */
function fontResolver(table: Map<string, FontEntry[]>, theme: Theme): FontsOf {
  const laid = new Map<string, LaidFont>();
  const byName = new Map<string, LaidFont>();
  /** The fonts Word may draw a font it does not have with, by each entry of its name in the font table. */
  const substitutes = (entries: FontEntry[] | undefined) => (entries ? entries.flatMap(substituteFonts) : substituteFonts(undefined)).map(measuredFont);
  /** The fonts a name may stand for. */
  const candidates = (raw: string, depth: number): DrawnFont[] => {
    const name = fontName(raw);
    const entries = table.get(name);
    const known = knownFont(name);
    const fonts: DrawnFont[] = [];
    if (entries?.some(entry => entry.unbounded)) fonts.push(UNBOUNDED_FONT);
    if (known) fonts.push(measuredFont(known));
    if (!known || !DOCX_WORD_FONTS.has(name)) {
      fonts.push(...substitutes(entries));
      if (SANS_NAME.test(name)) fonts.push(measuredFont(DOCX_SUBSTITUTE_FONTS.sans));
      if (SERIF_NAME.test(name) && !/sans serif/.test(name)) fonts.push(measuredFont(DOCX_SUBSTITUTE_FONTS.serif));
    }
    if (DOUBTFUL_NAME.test(raw.trim())) fonts.push(...substitutes(entries));
    const folded = fontName(raw.normalize("NFKC"));
    if (!known && folded !== name) fonts.push(...(knownFont(folded) ? [measuredFont(knownFont(folded)!)] : substitutes(table.get(folded))));
    const reference = THEME_REFERENCE.exec(name);
    if (reference && depth === 0) {
      const slots: Record<string, string> = { lt: "HAnsi", ea: "EastAsia", cs: "Bidi" };
      const themed = themeFont(theme, `${reference[1] === "mj" ? "major" : "minor"}${slots[reference[2]!]}`);
      fonts.push(...substitutes(undefined), ...themed.split(";").flatMap(item => candidates(item, 1)));
    }
    const shown = SHOWN_NAME.exec(name);
    if (shown && depth === 0) fonts.push(...substitutes(undefined), ...candidates(shown[1]!, 1));
    const listed = name.split(";").map(item => item.trim()).filter(Boolean);
    if (listed.length > 1 && depth === 0) fonts.push(...(listed.length > MAX_LISTED_FONTS ? [UNBOUNDED_FONT] : listed.flatMap(item => candidates(item, 1))));
    return fonts;
  };
  /** These fonts, each once, their widest character by character in each style, and their tallest line: read once for each set of fonts. */
  const fontIds = new Map<DrawnFont, number>();
  const laidOf = (each: DrawnFont[]): LaidFont => {
    const fonts = Array.from(new Set(each));
    for (const font of fonts) if (!fontIds.has(font)) fontIds.set(font, fontIds.size);
    const key = fonts.map(font => fontIds.get(font)!).sort((left, right) => left - right).join("+");
    let font = laid.get(key);
    if (!font) {
      const styles = new Map<FontStyle, number[]>();
      font = {
        fonts,
        line: Math.max(...fonts.map(item => item.line)),
        widest: style => {
          let widths = styles.get(style);
          if (!widths) {
            const all = fonts.map(item => item.widths(style));
            const gaps = lacking(style);
            widths = all[0]!.map((_, at) => Math.max(...all.map(item => item[at]! || gaps[at]!)));
            styles.set(style, widths);
          }
          return widths;
        },
      };
      laid.set(key, font);
    }
    return font;
  };
  /** Text of no font named: in Word's, Times New Roman, never narrower than the widest common fonts give each kind of character (LAYOUTS). */
  const serif = measuredFont(DOCX_SUBSTITUTE_FONTS.serif);
  const unnamedWidths = new Map<FontStyle, number[]>();
  const unnamed = laidOf([{
    line: Math.max(serif.line, LAYOUTS[MOST]!.lineHeight),
    widths: style => {
      let widths = unnamedWidths.get(style);
      if (!widths) unnamedWidths.set(style, (widths = serif.widths(style).map((width, at) => (width ? Math.max(width, LAYOUTS[MOST]!.widths[characterKind(DOCX_FONT_CHARACTERS[at]!)]) : 0))));
      return widths;
    },
  }]);
  const resolve = (name: string | undefined) => {
    if (name === undefined) return unnamed;
    let font = byName.get(name);
    if (!font) byName.set(name, (font = laidOf(candidates(name, 0))));
    return font;
  };
  /**
   * The complex script fonts a name may stand for, as `candidates` reads it: of DOCX_COMPLEX_FONTS, their line; a font of the
   * reader not of them (Courier New, Dubai, David…), embedded, of a script or decorative kind or a typewriter one, of no bound; a
   * font the reader does not have, in those Word may draw it with, Arial or Times New Roman (substituteFonts), or the kind its name
   * tells. Each name looked for once.
   */
  const substituteLine = (key: string) => (key === DOCX_SUBSTITUTE_FONTS.sans || key === DOCX_SUBSTITUTE_FONTS.serif ? DOCX_FONT_METRICS[key]!.line / 1000 : undefined);
  const complexCandidates = (raw: string, depth: number): Array<number | undefined> => {
    const name = fontName(raw);
    const entries = table.get(name);
    const lines: Array<number | undefined> = [];
    if (entries?.some(entry => entry.unbounded)) lines.push(undefined);
    if (Object.hasOwn(DOCX_COMPLEX_FONTS, name)) lines.push(complexFontLine(DOCX_COMPLEX_FONTS[name]!));
    else if (DOCX_WORD_FONTS.has(name) || knownFont(name) === DOCX_SUBSTITUTE_FONTS.unbounded) lines.push(undefined);
    else {
      lines.push(...(entries ? entries.flatMap(substituteFonts) : substituteFonts(undefined)).map(substituteLine));
      if (SANS_NAME.test(name)) lines.push(substituteLine(DOCX_SUBSTITUTE_FONTS.sans));
      if (SERIF_NAME.test(name) && !/sans serif/.test(name)) lines.push(substituteLine(DOCX_SUBSTITUTE_FONTS.serif));
    }
    if (DOUBTFUL_NAME.test(raw.trim())) lines.push(...(entries ? entries.flatMap(substituteFonts) : substituteFonts(undefined)).map(substituteLine));
    const folded = fontName(raw.normalize("NFKC"));
    if (folded !== name && depth === 0) lines.push(...complexCandidates(folded, 1));
    const reference = THEME_REFERENCE.exec(name);
    if (reference && depth === 0) lines.push(...themeFont(theme, `${reference[1] === "mj" ? "major" : "minor"}Bidi`).split(";").flatMap(item => (item.trim() ? complexCandidates(item, 1) : [substituteLine(DOCX_SUBSTITUTE_FONTS.serif)])));
    const shown = SHOWN_NAME.exec(name);
    if (shown && depth === 0) lines.push(...complexCandidates(shown[1]!, 1));
    const listed = name.split(";").map(item => item.trim()).filter(Boolean);
    if (listed.length > 1 && depth === 0) lines.push(...(listed.length > MAX_LISTED_FONTS ? [undefined] : listed.flatMap(item => complexCandidates(item, 1))));
    return lines;
  };
  const complexByName = new Map<string, ComplexFont>();
  /** No complex script font named: Word's, Times New Roman. */
  const unnamedComplex: ComplexFont = { bounded: true, line: complexFontLine(DOCX_COMPLEX_FONTS["times new roman"]!) };
  const complex: ComplexOf = name => {
    if (name === undefined || !name.trim()) return unnamedComplex;
    let found = complexByName.get(name);
    if (!found) {
      const lines = complexCandidates(name, 0);
      complexByName.set(name, (found = lines.length && lines.every(line => line !== undefined) ? { bounded: true, line: Math.max(...(lines as number[])) } : UNBOUNDED_COMPLEX));
    }
    return found;
  };
  return Object.assign(resolve, { alone: (font: DrawnFont) => laidOf([font]), complex });
}

/** The slots of a run's fonts (RunFonts): for Basic Latin, for its other characters, East Asian; either of the last two, as wide as the wider. */
const ASCII_SLOT = 0;
const OTHER_SLOT = 1;
const EAST_ASIAN_SLOT = 2;
const EITHER_SLOT = 3;
/**
 * Of Latin-1, the characters Word draws in a run's East Asian font when it
 * asks for it (w:hint eastAsia), as ECMA-376 lays it down (Part 1, 17.3.2.26,
 * rFonts): its signs (¡ ¤ § ¨ ª, the soft hyphen, ¯, ° to ´, ¶ to º, ¼ to ¿, ×
 * ÷), and, of a run in Chinese (w:lang w:eastAsia), its vowels à á è é ê ì í ò
 * ó ù ú ü; its other letters in the run's other Latin font. Of a run of no East
 * Asian language given, Word takes its own, which may be Chinese or not: those
 * vowels in either font. Beyond Latin-1 (Latin Extended-A, punctuation,
 * signs), the check does not follow the rule: either font.
 */
const HINT_EAST_ASIAN = new Set([0xa1, 0xa4, 0xa7, 0xa8, 0xaa, 0xad, 0xaf, 0xb0, 0xb1, 0xb2, 0xb3, 0xb4, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xbc, 0xbd, 0xbe, 0xbf, 0xd7, 0xf7]);
const HINT_CHINESE = new Set([0xe0, 0xe1, 0xe8, 0xe9, 0xea, 0xec, 0xed, 0xf2, 0xf3, 0xf9, 0xfa, 0xfc]);
/** Of each character measured, its slot: without the hint; with it, of a run not in Chinese, in Chinese, or that may be (`chinese` undefined: its language not given). */
const slotsOf = (hint: boolean, chinese: boolean | undefined) => Int8Array.from(DOCX_FONT_CHARACTERS, character => {
  const code = character.charCodeAt(0);
  if (code < 0x80) return ASCII_SLOT;
  if (!hint) return OTHER_SLOT;
  if (code > 0xff) return EITHER_SLOT;
  if (HINT_EAST_ASIAN.has(code)) return EAST_ASIAN_SLOT;
  if (!HINT_CHINESE.has(code)) return OTHER_SLOT;
  return chinese === undefined ? EITHER_SLOT : chinese ? EAST_ASIAN_SLOT : OTHER_SLOT;
});
const PLAIN_SLOTS = slotsOf(false, false);
const HINT_SLOTS = slotsOf(true, false);
const CHINESE_HINT_SLOTS = slotsOf(true, true);
const UNKNOWN_LANGUAGE_HINT_SLOTS = slotsOf(true, undefined);

/**
 * The fonts a run's characters are drawn in (fontsOf): of each slot, the
 * widths of every font it may be (LaidFont `fonts`), in the run's style, or
 * past MAX_CHOSEN_FONTS of them, of their widest only; the slot of each
 * character measured; of those either slot may draw, the wider;
 * the widest each character may be (for the numbers and dates Word writes);
 * how wide a character a font lacks may be (lacking); the tallest line;
 * whether each slot is of one font only. Of its Hebrew and Arabic, in its
 * complex script font (`complex`): their widths (DOCX_COMPLEX_METRICS, null
 * when that font does not bound them) and their line. Whether one of its fonts
 * is of no bound (`unbounded`: an emoji may be drawn in it). Of each character
 * measured, the line it sets in the most room (`lines`): the run's, or a font
 * of signs' when its font lacks a sign (SIGN_LINE).
 */
type RunFonts = {
  slots: number[][][]; slotOf: Int8Array; either: number[] | undefined; widest: number[]; lacking: number[]; line: number; single: boolean;
  complex: { widths: number[] | null; line: number }; unbounded: boolean; lines: Float64Array; bold: boolean;
};

function runFonts(style: FontStyle, ascii: LaidFont, other: LaidFont, eastAsian: LaidFont | undefined, language: string | undefined, complex: ComplexFont, complexBold: boolean): RunFonts {
  const laid = [ascii, other, eastAsian ?? other];
  const slots = laid.map(font => (font.fonts.length > MAX_CHOSEN_FONTS ? [font.widest(style)] : font.fonts.map(item => item.widths(style))));
  const slotOf = !eastAsian ? PLAIN_SLOTS : language === undefined ? UNKNOWN_LANGUAGE_HINT_SLOTS : /^zh/i.test(language) ? CHINESE_HINT_SLOTS : HINT_SLOTS;
  const widestOf = laid.map(font => font.widest(style));
  const either = eastAsian ? widestOf[OTHER_SLOT]!.map((width, at) => Math.max(width, widestOf[EAST_ASIAN_SLOT]![at]!)) : undefined;
  const widest = Array.from(slotOf, (slot, at) => (slot === EITHER_SLOT ? either![at]! : widestOf[slot]![at]!));
  const line = Math.max(ascii.line, other.line, eastAsian?.line ?? 0);
  // A sign a font of its slot lacks (or one of either slot) is drawn in a font of signs, of its line.
  const lines = Float64Array.from(slotOf, (slot, at) => {
    const lacks = (fonts: number[][]) => fonts.some(widths => !widths[at]);
    return !LETTER_LIKE[at] && (slot === EITHER_SLOT ? lacks(slots[OTHER_SLOT]!) || lacks(slots[EAST_ASIAN_SLOT]!) : lacks(slots[slot]!)) ? Math.max(line, SIGN_LINE) : line;
  });
  return {
    slots, slotOf, either, widest, lacking: lacking(style), line, single: slots.every(slot => slot.length === 1), lines, bold: /bold/i.test(style),
    complex: { widths: complex.bounded ? complexWidthsOf(complexBold ? "bold" : "regular") : null, line: complex.line },
    unbounded: laid.some(font => font.fonts.includes(UNBOUNDED_FONT)),
  };
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
    // A theme font (w:asciiTheme…) wins over the font named: of headings or body, for the script it names (minorEastAsia: the
    // theme's East Asian font, majorBidi: its complex script one…), else Latin; empty when the theme gives none (themeFont).
    const named = (kind: string) => {
      const themed = tag.attributes.get(`w:${kind}Theme`);
      return themed ? themeFont(theme, themed) : tag.attributes.get(`w:${kind}`);
    };
    const ascii = named("ascii");
    const other = named("hAnsi");
    const eastAsian = named("eastAsia");
    // The complex script font's theme attribute is w:cstheme (ECMA-376 Part 1, 17.3.2.26).
    const complex = tag.attributes.has("w:cstheme") ? themeFont(theme, tag.attributes.get("w:cstheme")!) : tag.attributes.get("w:cs");
    const hint = tag.attributes.get("w:hint");
    if (ascii !== undefined) layer.font = ascii;
    if (other !== undefined) layer.otherFont = other;
    if (eastAsian !== undefined) layer.eastAsianFont = eastAsian;
    if (complex !== undefined) layer.complexFont = complex;
    if (hint !== undefined) layer.eastAsianHint = /^eastAsia$/i.test(hint);
    const font = ascii ?? other;
    if (font !== undefined) layer.typewriter = TYPEWRITER_NAME.test(fontName(font));
  } else if (tag.name === "w:lang") {
    const language = tag.attributes.get("w:eastAsia");
    if (language !== undefined) layer.eastAsianLanguage = language;
  } else if ((tag.name === "w:b" || tag.name === "w:i" || tag.name === "w:caps" || tag.name === "w:smallCaps") && !/^(false|0|off)$/i.test(value ?? "")) {
    layer[tag.name === "w:b" ? "bold" : tag.name === "w:i" ? "italic" : "capitals"] = true;
  } else if ((tag.name === "w:bCs" || tag.name === "w:iCs") && !/^(false|0|off)$/i.test(value ?? "")) {
    layer[tag.name === "w:bCs" ? "complexBold" : "complexItalic"] = true;
  } else if (tag.name === "w:vertAlign") {
    layer.vertical = /^(superscript|subscript)$/i.test(value ?? "");
  } else if (tag.name === "w:em") {
    layer.emphasis = value !== undefined && !/^none$/i.test(value);
  } else if (tag.name === "w:eastAsianLayout") {
    const on = (name: string) => tag.attributes.has(name) && !/^(false|0|off)$/i.test(tag.attributes.get(name)!);
    layer.eastAsianLayout = on("w:combine") || on("w:vert");
  } else if (tag.name === "w:fitText") {
    const width = measurePt(value, 20);
    if (width !== undefined && width >= 0) layer.fitText = width;
  } else if (tag.name === "w:kern") {
    const size = measurePt(value, 2);
    if (size !== undefined) layer.kern = Math.max(0, size);
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
type ParagraphLayer = Partial<{ start: number; end: number; firstLine: number; align: string; bidi: boolean; line: string; lineRule: string; before: number; after: number; contextual: boolean; snapToGrid: boolean; tabs: Array<[number, string]> }>;

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
  } else if (tag.name === "w:snapToGrid") {
    layer.snapToGrid = !/^(false|0|off)$/i.test(attribute("val") ?? "");
  }
}

/** A paragraph's layer once resolved; `line`: its exact or least line height in points, or its multiple of single spacing. */
type ParagraphFormat = { start: number; end: number; firstLine: number; align?: string; bidi: boolean; line: { rule: "exact" | "atLeast" | "auto"; value: number }; before: number; after: number; contextual: boolean; snapToGrid: boolean };

/** `layers`: the document's defaults, the paragraph's styles from the base, its own. */
function paragraphFormat(layers: ParagraphLayer[]): ParagraphFormat {
  const layer: ParagraphLayer = Object.assign({}, ...layers);
  const rule: ParagraphFormat["line"]["rule"] = layer.lineRule === "exact" || layer.lineRule === "atLeast" ? layer.lineRule : "auto";
  const value = layer.line === undefined ? undefined : rule === "auto" ? Number(layer.line) / 240 : measurePt(layer.line, 20);
  const line: ParagraphFormat["line"] = value !== undefined && Number.isFinite(value) ? { rule, value: Math.abs(value) } : { rule: "auto", value: 1 };
  return { start: layer.start ?? 0, end: layer.end ?? 0, firstLine: layer.firstLine ?? 0, align: layer.align, bidi: layer.bidi ?? false, line, before: layer.before ?? 0, after: layer.after ?? 0, contextual: layer.contextual ?? false, snapToGrid: layer.snapToGrid ?? true };
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
 * single spacing that of its fonts (`factor`, fontsOf).
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
 * so that a line laid later over it can still set it aside; the word it is
 * part of when the word goes on over passages or lines (`word`).
 */
type Segment = {
  from: number;
  to: number;
  start: number;
  end: number;
  text: string;
  judgement: Judgement;
  settled?: { recorded: boolean; paragraph?: Frame; drawn?: { verdicts: Judgement[]; from: number; to: number } };
  word?: WordParts;
};

/** A word over passages or lines, read or set aside whole: its visible segments, and how they are all set aside once one of its parts is not read (`cut`). */
type WordParts = { segments: Segment[]; cut?: Judgement };

/**
 * A passage once laid out (layText): the judgement and the line of the first
 * layout of each of its first UTF-16 units, those after them left unlaid;
 * where the word it ends in starts; its words whose parts go with others.
 */
type LaidText = { judgements: Judgement[]; lines: number[]; wordFrom: number; joined: Array<{ from: number; to: number; parts: WordParts }> };

/**
 * A line of a paragraph in one of LAYOUTS: its index, the top of it, how far
 * along it the text has gone, the largest size of its text, the tallest
 * picture on it (in points), the tallest single spacing of the fonts measured
 * on it (fontsOf, in sizes; 0 when none).
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
 * largest size and spacing of its letters, its parts), to go whole to the
 * next line, or to be set aside whole.
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
  word?: { x: number; width: number; size: number; factor: number; parts: WordParts };
  /** Past something of no width known on its lines (a field Word computes in a format not followed…), where the rest lies is unknown in the most room. */
  lost?: boolean;
  /** Its section's grid of lines, which may make each line up to a pitch taller in the most room (in points, 0: none), and whether it has a grid of characters. */
  gridPitch: number;
  charGrid: boolean;
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
  texts?: Array<{ text: string; place: TextPlace; segments: Segment[]; field: Judgement }>;
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
  /** DrawingML anchors and inline drawings of a size not read (wp:extent): their text box may show any of its text, or none. */
  unsized?: boolean;
  /**
   * DrawingML inline drawings Word draws in a paragraph's line: their size (wp:extent), what their effects add on each side
   * (wp:effectExtent), the width of their outline (a:ln); NaN when a number of them is not read.
   */
  inline?: { width: number; height: number; left: number; top: number; right: number; bottom: number; outline: number };
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
  /**
   * Content controls whose content Word replaces, as it opens the document, by the data they are bound to (w:dataBinding), and
   * their content (w:sdtContent): what it stores may not be drawn, and what is drawn may be longer.
   */
  bound?: boolean;
  dataBound?: boolean;
  /** Content controls: where their w:sdt starts. */
  sdtStart?: number;
  /** DrawingML fills, and their colours being read: the shape they fill; the colour's lightness changes (lumMod, lumOff), its opacity. */
  fillOf?: Frame;
  colour?: { hex: string | undefined; scale: number; offset: number; alpha: number; shape: Frame };
  /**
   * A no-break or soft hyphen (DRAWN_CHARACTERS) once laid out: its character, its place in its paragraph, how it was judged there
   * (layText), its paragraph and its layout, whether deleted, where it starts in the XML.
   */
  character?: { text: string; place: TextPlace; judged?: LaidText; layout: ParagraphLayout | null; holder: Frame; deleted: boolean; start: number; field: Judgement };
  /**
   * mc:AlternateContent: the text of the mc:Choice Word draws, without spaces, the judgement of each of its characters, and how far the
   * fallback's text matched it; whether Word may draw another branch instead (`either`: drawnByWord), and whether one of the choices
   * read so far is one Word surely draws (`settled`: none after it is); how many choices it has.
   */
  drawn?: { text: string; verdicts: Judgement[]; cursor: number; either: boolean; settled?: boolean };
  choices?: number;
  /** mc:Choice: the one Word draws, or one it may draw. */
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
/** A passage recorded as set aside: where it lies in the part, its text, why, and the ordinal of its paragraph (-1: none). */
type SettledPassage = { start: number; end: number; text: string; judgement: Judgement; paragraph: number };
/** A paragraph's style, and the space it leaves below it (dropped next to its style when contextual). In points. */
type Spacing = { style: string | undefined; after: number; contextual: boolean };

/** An entity of an XML text's value: a character reference, or one of XML's own. */
const ENTITY = /^&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/i;

/**
 * Where, in the XML of a text's value (decodeXml), each of these parts of it
 * (their UTF-16 units) starts and ends; undefined when they cannot be told
 * apart. Read once, in the order of the XML.
 */
function textOffsets(raw: string, length: number, parts: Array<{ from: number; to: number }>) {
  const marks = Array.from(new Set(parts.flatMap(part => [part.from, part.to]))).sort((left, right) => left - right);
  const starts = new Map<number, number>();
  const ends = new Map<number, number>();
  let first = 0;
  let last = 0;
  let unit = 0;
  for (let index = 0; index < raw.length; ) {
    const code = raw.charCodeAt(index);
    if (code === LESS && (raw.startsWith("<![CDATA[", index) || raw.startsWith("<!--", index))) return undefined;
    const match = code === AMPERSAND ? ENTITY.exec(raw.slice(index, index + 12)) : null;
    const size = match ? match[0].length : 1;
    const units = match ? decodeXml(match[0]).length : 1;
    // The marks within the units it writes start where it starts; those after them end where it ends.
    for (; first < marks.length && marks[first]! < unit + units; first += 1) if (marks[first]! >= unit) starts.set(marks[first]!, index);
    for (; last < marks.length && marks[last]! <= unit + units; last += 1) if (marks[last]! > unit) ends.set(marks[last]!, index + size);
    unit += units;
    index += size;
  }
  return unit === length ? parts.map(part => ({ start: starts.get(part.from)!, end: ends.get(part.to)! })) : undefined;
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

/** Namespaces of Office and of the standard, of which Word may understand one that WORD_NAMESPACES does not list. */
const OFFICE_NAMESPACE = /^(http:\/\/schemas\.microsoft\.com\/office\/|http:\/\/schemas\.openxmlformats\.org\/|http:\/\/purl\.oclc\.org\/ooxml\/|urn:schemas-microsoft-com:)/;

/**
 * Whether Word draws a mc:Choice: it understands every namespace it
 * requires (WORD_NAMESPACES), and draws it (`choice`); one is of another
 * vocabulary, and it draws the next choice or the mc:Fallback instead
 * (`fallback`); or it may draw either, the choice requiring nothing, or a
 * namespace of Office or of the standard the list does not hold (`either`):
 * it, the next choices up to one Word surely draws, and the fallback are then
 * all laid out, the fallback's text read only where seen in each (set aside
 * when there are several choices).
 */
function drawnByWord(choice: XmlTag): "choice" | "fallback" | "either" {
  const namespaces = (choice.attributes.get("Requires") ?? "").split(/\s+/).filter(Boolean).map(prefix => choice.namespaces.get(prefix) ?? "");
  if (!namespaces.length) return "either";
  if (namespaces.every(namespace => WORD_NAMESPACES.has(namespace))) return "choice";
  return namespaces.some(namespace => !WORD_NAMESPACES.has(namespace) && !OFFICE_NAMESPACE.test(namespace)) ? "fallback" : "either";
}

const INVISIBLE: Judgement = { verdict: "invisible" };
const OUT_OF_PLACE: Judgement = { verdict: "unverifiable", reason: "layout" };
const UNLAID: Judgement = { verdict: "unverifiable", reason: "layout_unfinished" };
/** Of text Word draws in one branch or in another, as each shows it: hidden only where both hide it, seen only where both show it, else set aside. */
const eitherOf = (left: Judgement, right: Judgement) =>
  left.verdict === right.verdict ? graver(left, right) : left.verdict === "unverifiable" ? left : right.verdict === "unverifiable" ? right : OUT_OF_PLACE;
const UNBOUNDED: Pair = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];

/**
 * The main document part without the text of its invisible runs, nor of
 * those that may show on a drawing or that their place may cut; the text of
 * each, paragraph by paragraph. `fromPage`: a picture behind the text may lie
 * under any text. `pageShown`: Word shows the page colour. `tabStop`: the
 * distance between default tab stops. `budget`: the layout work left
 * (docxLayoutWorkUnits). `fonts`: the font each name a run gives is laid
 * out in (fontResolver). `numbering`: how the document numbers its notes and
 * pages, read with the part (numberings). `axes`, when given: the names of
 * the runs laid out that may stand for several fonts (laidLayouts), noted as
 * met with how many. Also returns where it cuts the part (`cuts`) and each
 * passage it records (`settled`), to merge layouts.
 */
function cutInvisibleRuns(xml: string, styles: Styles, theme: Theme, fromPage: boolean, pageShown: boolean, tabStop: number, budget: { units: number }, fonts: (name: string | undefined) => LaidFont, complexOf: ComplexOf, numbering: Survey<Numberings>, updatesFields: boolean, properties: Map<string, string>, tags = readXmlTags(xml), axes?: Map<string, number>) {
  // One reading of the part for all that the main one needs to know ahead.
  const largest = largestPage();
  const rowCells = tableRows();
  const merges = mergedCellRooms();
  const shapeFills = vmlFills();
  const boxes = textBoxes(xml);
  const sectionPage = sectionPages();
  const reach = drawingReachSurvey(xml);
  const bound = storedAsBound(xml, properties);
  visitXmlTags(tags, largest.visit, rowCells.visit, merges.visit, shapeFills.visit, boxes.visit, sectionPage.visit, reach.visit, numbering.visit, bound.visit);
  const drawnAsStoredControls = bound.done();
  const page = largest.done();
  const tables = rowCells.done();
  const mergedRooms = merges.done();
  const { fills, pictures: vmlPictures, types: vmlTypes } = shapeFills.done();
  const { shapes: drawingBoxes, chains: linkedHeights } = boxes.done(page);
  const sections = sectionPage.done();
  const pictures = reach.done();
  const numbered = numbering.done();
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
  const held = { offPage: 0, unplaced: 0, covered: 0, nested: 0, textBoxes: 0, deleted: 0, ruby: 0, bound: 0 };
  const hold = (frame: Frame, change: number) => {
    if (frame.name === "w:ruby") held.ruby += change;
    if (frame.bound) held.bound += change;
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
  /** Cuts out a part of the XML: one that goes on from the last cut, as runs of hyphens or characters one after the other, extends it. */
  const cutOut = (start: number, end: number) => {
    const last = cuts.at(-1);
    if (last && start >= last[0] && start <= last[1]) last[1] = Math.max(last[1], end);
    else cuts.push([start, end]);
  };
  const found: Passages = { invisible: [], unverifiable: [] };
  const settled: SettledPassage[] = [];
  let textStart: number | null = null;
  /**
   * The fields open where the visit is (w:fldChar begin to end, w:fldSimple):
   * their code read so far (w:instrText), whether their result has begun
   * (w:fldChar separate), how Word shows the result the file stores (as set
   * aside: recomputed, updated, drawn from the code or of a field the check
   * does not bound, Word draws another), whether marked to update (w:dirty),
   * the formatting of the run that begins them and of the runs of their code,
   * whether their code holds another field (`nested`); where the text of a
   * field code being read starts; the formatting of the last run.
   */
  const fields: Array<{ code: string; result: boolean; shown: Judgement; dirty: boolean; simple: boolean; effective?: RunLayer; formats: RunLayer[]; nested?: boolean }> = [];
  let instrStart: number | null = null;
  let lastRunFormat: RunLayer | undefined;
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
  /**
   * The fonts a run's characters may be drawn in, in its style (runFonts):
   * its font for Basic Latin (w:ascii), for the others (w:hAnsi), and, when it
   * asks Word to (w:hint eastAsia), its East Asian font, or Office's when it
   * names none; its Hebrew and Arabic in its complex script font (w:rFonts
   * w:cs, complexOf), bold and italic as it says of them (w:bCs, w:iCs); all
   * its text so of a run of complex script (w:cs, w:rtl). Read once for each
   * run's formatting.
   */
  const laidFonts = new WeakMap<RunLayer, RunFonts>();
  /** The same fonts for many runs: read once for each style, fonts and language. */
  const laidIds = new Map<LaidFont | ComplexFont, number>();
  const sameFonts = new Map<string, RunFonts>();
  const laidId = (font: LaidFont | ComplexFont | undefined) => (font ? laidIds.get(font) ?? laidIds.set(font, laidIds.size).get(font)! : -1);
  const fontsOf = (effective: RunLayer) => {
    let found = laidFonts.get(effective);
    if (found === undefined) {
      const marked = effective["w:cs"] || effective["w:rtl"];
      const [bold, italic] = marked ? [effective.complexBold, effective.complexItalic] : [effective.bold, effective.italic];
      const style: FontStyle = bold ? (italic ? "boldItalic" : "bold") : italic ? "italic" : "regular";
      const ascii = fonts(marked ? effective.complexFont : effective.font ?? effective.otherFont);
      const other = marked ? ascii : fonts(effective.otherFont ?? effective.font);
      const eastAsian = !marked && effective.eastAsianHint ? fonts(effective.eastAsianFont ?? OFFICE_EAST_ASIAN_FONTS) : undefined;
      const language = effective.eastAsianLanguage;
      const complex = complexOf(effective.complexFont);
      const complexBold = effective.complexBold === true;
      const key = `${style}:${laidId(ascii)}:${laidId(other)}:${laidId(eastAsian)}:${eastAsian ? language ?? "" : ""}:${laidId(complex)}:${complexBold}`;
      if (!(found = sameFonts.get(key))) sameFonts.set(key, (found = runFonts(style, ascii, other, eastAsian, language, complex, complexBold)));
      laidFonts.set(effective, found);
    }
    return found;
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
    let characters = 0;
    let shares = 0;
    if (effective.scale !== undefined || effective.spacing !== undefined) {
      for (let at = 0; at < text.length; characters += 1) {
        const code = text.codePointAt(at)!;
        shares += isWide(code) ? 1 : 0.5;
        at += code > 0xffff ? 2 : 1;
      }
    }
    const width = shares * size * (effective.scale ?? 100) / 100;
    const squeezed = characters > 0 && width / characters + (effective.spacing ?? 0) < MIN_ADVANCE_PT;
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
    // Of a choice Word may not draw, or of several, which it draws first, the fallback may show where the choice shows nothing.
    const missing = drawn.either ? OUT_OF_PLACE : INVISIBLE;
    if (drawn.either && (stack[alternate]!.choices ?? 0) > 1) return { judgement: graver(seen, OUT_OF_PLACE) };
    const at = searchBudget > 0 ? drawn.text.indexOf(letters, drawn.cursor) : drawn.text.startsWith(letters, drawn.cursor) ? drawn.cursor : -1;
    if (at === -1) {
      searchBudget -= drawn.text.length - drawn.cursor;
      return { judgement: graver(seen, missing) };
    }
    drawn.cursor = at + letters.length;
    const fromChoice = drawn.verdicts.slice(at, drawn.cursor).reduce(graver, VISIBLE);
    // Of a choice Word may not draw, the fallback it may draw instead, as both show the text (the choice cutting it, the fallback not: set aside).
    return { judgement: drawn.either ? eitherOf(seen, fromChoice) : graver(seen, fromChoice) };
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
    const grid = format.snapToGrid ? across.grid : undefined;
    paragraph.layout = {
      format, slack, width, edge: pastEdge ? edge : undefined, pageWidth: across.width, tight, gridPitch: grid?.pitch ?? 0, charGrid: grid?.characters ?? false,
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
  /** Starts the next line of a paragraph in a layout; `size`, `factor`: the size and spacing (fontsOf) of the text that ends the line, for an empty one. No word goes on from one line to the next. */
  const newLine = (layout: ParagraphLayout, model: number, size = 0, factor = 0) => {
    const line = layout.lines[model];
    line.top += lineHeight(layout.format, Math.max(line.size, size), model, line.objects, Math.max(line.factor, factor)) + (model === MOST ? layout.gridPitch : 0);
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
    const width = lineWidth(layout, line, model) + (model === MOST ? FIT_TOLERANCE_PT : 0);
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
  const placeObject = (layout: ParagraphLayout, width: number, height: number, size: number, least = width) => {
    layout.word = undefined;
    // Of no width or height known, it may take any number of lines: what follows it in the most room may lie anywhere below.
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      layout.lost = true;
      return;
    }
    for (const model of [MOST, LEAST]) {
      const line = layout.lines[model]!;
      const room = model === MOST ? width : least;
      if (line.x > 0 && line.x + room > lineWidth(layout, line, model)) newLine(layout, model);
      line.x += room;
      line.objects = Math.max(line.objects, height);
      line.size = Math.max(line.size, size);
    }
  };
  /** Something of no extent known in the paragraph read: where it and what follows lie is unknown in the most room (placeObject), and across, for its indents. */
  const loseParagraph = () => {
    const at = stack.findLastIndex(item => item.name === "w:p");
    const holder = stack[at];
    if (!holder?.flow) return;
    holder.flow.tabbed = true;
    const layout = layoutOf(at);
    if (layout) placeObject(layout, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 0);
  };
  /** Something of no extent known in the container read (body, cell, text box…): what follows it there may lie anywhere below in the most room. */
  const loseContainer = () => {
    const content = innermost()?.content;
    if (content) content.filled = [content.filled[MOST] + UNBOUNDED_EXTENT_PT, content.filled[LEAST]];
  };
  /**
   * Moves a paragraph's lines, in the most room, to a positional tab (w:ptab):
   * the text after it aligned at the start, the centre or the end of its
   * column, or of its indents (on the next line when the start is behind its
   * text); the least room keeps the text where it is.
   */
  const positionalTab = (layout: ParagraphLayout, tag: XmlTag) => {
    budget.units -= 1;
    layout.word = undefined;
    const line = layout.lines[MOST];
    line.x = lineEnd(layout, line);
    layout.tab = undefined;
    const alignment = (tag.attributes.get("w:alignment") ?? "left").toLowerCase();
    const indents = /^indent$/i.test(tag.attributes.get("w:relativeTo") ?? "");
    // Where its column, or its indents, start and end, from the column's start.
    const from = indents ? layout.format.start : 0;
    const to = layout.width[MOST]! - (indents ? layout.format.end : 0);
    const start = lineStart(layout, line);
    if (alignment === "center" || alignment === "right") layout.tab = { position: alignment === "center" ? (from + to) / 2 : to, kind: alignment, line: line.index, width: 0 };
    else if (from - start < line.x - 0.01) newLine(layout, MOST);
    else line.x = from - start;
  };
  /** How many notes of each kind a run referred to so far: Word numbers them in order. */
  const notesReferred = { "w:footnoteReference": 0, "w:endnoteReference": 0 };
  /** Of each kind of note and each format it may be numbered in, the most characters its numbers took so far: anew from its first number on each page or section, they may be any of those up to the last. */
  const notesLongest = { "w:footnoteReference": new Map<string, number>(), "w:endnoteReference": new Map<string, number>() };
  /** The widest of the characters a number or a date Word writes may hold, in a run's fonts and style (in sizes of its text, in capitals when it is), and no narrower than a capital letter in the most room. */
  const writtenAdvance = (characters: string, effective: RunLayer) => {
    const runFonts = fontsOf(effective);
    let widest = LAYOUTS[MOST]!.widths.capital;
    for (let at = 0; at < characters.length; at += 1) {
      const code = effective.capitals ? upperCase(characters.charCodeAt(at)) : characters.charCodeAt(at);
      const index = MEASURED_INDEX[code]!;
      const width = index >= 0 ? runFonts.widest[index]! : 0;
      widest = Math.max(widest, width || unmeasuredShare(code, effective.typewriter === true, runFonts.bold, runFonts.unbounded));
    }
    return widest;
  };
  /**
   * The most room a note's or a page's number takes on its line: in each
   * format it may be in (numberings), as many characters as it may have, each
   * as wide as the widest it may be (writtenAdvance); a note numbered from a
   * first number given, as many on as notes of its kind referred to so far,
   * or fewer when numbered anew (notesLongest); a page, from the highest
   * first number given, as many on as the document may have pages. In a
   * format of no length known (NUMBER_FORMATS), no width known.
   */
  const numberWidth = (kind: "w:footnoteReference" | "w:endnoteReference" | "w:pgNum", effective: RunLayer, size: number, spacing: number, field?: { formats: string[]; added: number }) => {
    const { starts, highest } = numbered[kind];
    // A page's field may give its own format (PAGE \* roman), and add characters around the number.
    const formats = field?.formats ?? numbered[kind].formats;
    const count = kind === "w:pgNum" ? numbered.pages : (notesReferred[kind] += 1);
    let width = 0;
    for (const given of formats) {
      for (const name of given === undefined && kind !== "w:pgNum" ? UNGIVEN_NOTE_FORMATS[kind] : [given ?? "decimal"]) {
        const format = Object.hasOwn(NUMBER_FORMATS, name) ? NUMBER_FORMATS[name]! : undefined;
        if (!format) return Number.POSITIVE_INFINITY;
        const most = format.most ?? format.length;
        let characters = most(highest + count - 1) + (field?.added ?? 0);
        if (kind !== "w:pgNum" && starts.length <= MAX_NUMBER_STARTS) {
          const longest = notesLongest[kind];
          characters = longest.get(name) ?? 0;
          for (const start of starts) characters = Math.max(characters, format.length(start + count - 1));
          longest.set(name, characters);
        }
        width = Math.max(width, characters * (writtenAdvance(format.characters, effective) * size + spacing));
      }
    }
    return width;
  };
  /**
   * The width, in the most room, of what an element of a run draws on its
   * line other than text: a symbol (w:sym) in each font its font may be
   * (fonts): of a font of the reader measured, its advance of the character
   * the code stands for (symbol fonts write theirs from F000 on); of another,
   * its widest character (no bound for a font of none, embedded too); a note's
   * number (footnotes, endnotes) and the page's, in the formats and from the
   * first numbers the document gives (numberWidth: of no width known in
   * another format, the rest of their line then set aside), and the dates
   * Word writes (WRITTEN_FIELDS), each character as wide as the widest it may
   * be; undefined for other elements. A symbol's advance found once for
   * each style, code and font.
   */
  const symbolWidths = new Map<string, number>();
  const drawnWidth = (tag: XmlTag, effective: RunLayer) => {
    const size = fontSize(effective, "") * (effective.scale ?? 100) / 100;
    const spacing = Math.max(0, effective.spacing ?? 0);
    if (tag.name === "w:sym") {
      const code = Number.parseInt(tag.attributes.get("w:char") ?? "", 16);
      const style: FontStyle = effective.bold ? "bold" : "regular";
      const name = tag.attributes.get("w:font");
      const key = `${style}\n${Number.isFinite(code) ? code : ""}\n${name ?? ""}`;
      let width = symbolWidths.get(key);
      if (width === undefined) {
        const index = Number.isFinite(code) ? MEASURED_INDEX[code >= 0xf000 && code <= 0xf0ff ? code - 0xf000 : code] ?? -1 : -1;
        const ofReader = name !== undefined && DOCX_WORD_FONTS.has(fontName(name));
        width = 0;
        for (const font of fonts(name).fonts) {
          const widths = font.widths(style);
          width = Math.max(width, ofReader && index >= 0 && widths[index]! > 0 ? widths[index]! : Math.max(...widths));
        }
        symbolWidths.set(key, width);
      }
      return width * size + spacing;
    }
    if (tag.name === "w:footnoteReference" || tag.name === "w:endnoteReference") {
      // A note whose mark follows as text (w:customMarkFollows) draws no number.
      if (/^(1|true|on)$/i.test(tag.attributes.get("w:customMarkFollows") ?? "")) return 0;
      return numberWidth(tag.name, effective, size, spacing);
    }
    if (tag.name === "w:pgNum") return numberWidth(tag.name, effective, size, spacing);
    const characters = WRITTEN_FIELDS[tag.name];
    return characters === undefined ? undefined : characters * (writtenAdvance(DATE_CHARACTERS, effective) * size + spacing);
  };
  /**
   * The most room the result of a field Word computes takes on its line,
   * each character as wide as the widest it may be (writtenAdvance), whatever
   * the result stored: a page's number as numberWidth gives it, in the format
   * its switch gives (\* roman…); the number of pages, of the section's
   * pages, or the section's, as many figures as the document may have pages;
   * a date or a time in its picture (\@, pictureLength), or the longest of
   * none. Of no width known (infinite): a format, a picture or a switch not
   * followed (\* CardText, \# numbers, \h a Hijri date…), another field.
   */
  const fieldWidth = (code: string, effective: RunLayer) => {
    const { type, switches } = fieldCode(code);
    const size = fontSize(effective, "") * (effective.scale ?? 100) / 100;
    const spacing = Math.max(0, effective.spacing ?? 0);
    const dated = type === "DATE" || type === "TIME";
    let picture: string | undefined;
    let number: { formats: string[]; added: number } | undefined;
    for (const [name, argument] of switches) {
      if (name === "!" || (name === "*" && FIELD_CASES.test(argument))) continue;
      if (dated && name === "@") picture = argument;
      else if (!dated && name === "*" && Object.hasOwn(FIELD_NUMBER_FORMATS, argument.toLowerCase())) number = FIELD_NUMBER_FORMATS[argument.toLowerCase()]!;
      else return Number.POSITIVE_INFINITY;
    }
    if (dated) {
      const length = picture !== undefined ? pictureLength(picture) : type === "DATE" ? DEFAULT_DATE_LENGTH : DEFAULT_TIME_LENGTH;
      return length * (writtenAdvance(DATE_CHARACTERS + (picture ?? ""), effective) * size + spacing);
    }
    if (type === "PAGE") return numberWidth("w:pgNum", effective, size, spacing, number);
    if (type !== "NUMPAGES" && type !== "SECTIONPAGES" && type !== "SECTION") return Number.POSITIVE_INFINITY;
    let width = 0;
    for (const name of number?.formats ?? ["decimal"]) {
      const format = NUMBER_FORMATS[name]!;
      width = Math.max(width, ((format.most ?? format.length)(numbered.pages) + (number?.added ?? 0)) * (writtenAdvance(format.characters, effective) * size + spacing));
    }
    return width;
  };
  /**
   * The most room the text of a field Word draws from its code takes on its
   * line (CODE_DRAWN_FIELDS): its code after its type and first argument, as
   * wide as that text in the format of the run that begins the field or of
   * any run of its code, the widest, in the font it is widest in (chooseFonts).
   * Each measure laid out once, however many runs of its format the code has,
   * each character of it costing a unit of layout work: past the work allowed,
   * of no width known.
   */
  const displayWidth = (field: (typeof fields)[number]) => {
    const text = /^\s*\S+\s+\S+\s?([\s\S]*)$/.exec(field.code)?.[1] ?? "";
    // The size of the text in each format (fontSize) by one character of it, of a complex script when the text has no other letter.
    const sample = OTHER_LETTER.test(text) ? "" : COMPLEX_SCRIPT.exec(text)?.[0] ?? "";
    const measures = new Set([field.effective ?? lastRunFormat ?? styles.defaults, ...field.formats].map(effective => measureOf(effective, fontSize(effective, sample))));
    let widest = 0;
    for (const measure of Array.from(measures)) {
      budget.units -= text.length;
      if (budget.units <= 0) return Number.POSITIVE_INFINITY;
      if (measure.several) measure.chooseFonts(text, 0, text.length);
      let width = 0;
      for (let at = 0; at < text.length; ) {
        const code = text.codePointAt(at)!;
        at += code > 0xffff ? 2 : 1;
        width += measure.advance(MOST, code);
      }
      widest = Math.max(widest, width);
    }
    return widest;
  };
  /**
   * Whether Word draws a field's result as stored: of a field it does not
   * compute (STORED_FIELDS) and does not update, or whose result it keeps
   * (KEPT_FIELDS); not of a code that holds another field.
   */
  const drawnAsStored = (field: (typeof fields)[number]) => {
    const { type } = fieldCode(field.code);
    return !field.nested && STORED_FIELDS.has(type) && (KEPT_FIELDS.has(type) || !(field.dirty || updatesFields));
  };
  /**
   * How Word shows the text read here of the fields open: never their code
   * (but as the user shows field codes): hidden; their result drawn other than
   * stored, or perhaps (drawnAsStored), which is set aside.
   */
  const fieldShown = (): Judgement => {
    let judgement = VISIBLE;
    for (const field of fields) judgement = graver(judgement, field.result ? field.shown : INVISIBLE);
    return judgement;
  };
  const beginResult = (field: (typeof fields)[number]) => {
    field.result = true;
    field.shown = drawnAsStored(field) ? VISIBLE : OUT_OF_PLACE;
  };
  /**
   * A field ended: of a result Word draws otherwise than stored, what it may
   * draw takes its width on its line, beyond the result stored, laid out as
   * text: a field it computes, as fieldWidth bounds it; one drawn from its
   * code, its text (displayWidth); any other, updated, or of a code that holds
   * another field, no width known.
   */
  const endField = (field: (typeof fields)[number]) => {
    if (!field.result) beginResult(field);
    if (field.shown === VISIBLE) return;
    const at = stack.findLastIndex(item => item.name === "w:p");
    const holder = stack[at];
    if (!holder?.flow) return;
    const effective = field.effective ?? lastRunFormat ?? styles.defaults;
    const { type } = fieldCode(field.code);
    const width = field.nested ? Number.POSITIVE_INFINITY
      : CODE_DRAWN_FIELDS.has(type) ? displayWidth(field)
      : RECOMPUTED_FIELDS.has(type) ? fieldWidth(field.code, effective)
      : Number.POSITIVE_INFINITY;
    if (Number.isFinite(width)) holder.flow.advance += width;
    const layout = held.deleted > 0 ? null : layoutOf(at);
    const size = fontSize(effective, "");
    if (layout) placeObject(layout, width, 0, size, Math.min(width, LAYOUTS[LEAST]!.widths.sign * size));
  };
  /**
   * A drawing in line with the text, once read, takes its place on its
   * paragraph's line: in the most room, its extent, what its effects add on
   * each side (wp:effectExtent, the room Word keeps for them) and its outline
   * (a:ln); in the least, its extent less what its effects take back, none in
   * a branch Word may not draw (maybeDrawn). Of a number not read, of no width
   * known (placeObject).
   */
  const placeInline = (inline: NonNullable<Frame["inline"]>) => {
    const at = stack.findLastIndex(item => item.name === "w:p");
    const holder = stack[at];
    if (!holder?.flow) return;
    const { width, height, left, top, right, bottom, outline } = inline;
    const most = width + Math.max(0, left) + Math.max(0, right) + outline;
    if (Number.isFinite(most)) holder.flow.advance += most;
    const layout = layoutOf(at);
    if (layout) placeObject(layout, most, height + Math.max(0, top) + Math.max(0, bottom) + outline, 0, maybeDrawn() ? 0 : Math.max(0, width + Math.min(0, left) + Math.min(0, right)));
  };
  /**
   * A VML shape in line with the text (w:pict, an OLE object's w:object)
   * Word draws takes its place on its paragraph's line likewise: its style's
   * width and height and its outline (strokeweight, 0.75 pt unless it says
   * otherwise or none, stroked false) in the most room, its width in the
   * least (none in a branch Word may not draw, maybeDrawn). Of a length not
   * read or negative, or of a size its points give, of no width known.
   */
  const placeInlineVml = (tag: XmlTag, style: string) => {
    if (!drawnHere()) return;
    const at = stack.findLastIndex(item => item.name === "w:p");
    const holder = stack[at];
    if (!holder?.flow) return;
    const type = vmlTypes.get(tag.attributes.get("type")?.trim().replace(/^#/, "") ?? "");
    const attribute = (name: string) => tag.attributes.get(name) ?? type?.attributes.get(name);
    const weight = attribute("strokeweight");
    const outline = /^(f|false)$/i.test(attribute("stroked") ?? "") ? 0 : weight === undefined ? 0.75 : vmlValue(weight) ?? Number.NaN;
    const width = VML_BY_POINTS.has(tag.name) ? Number.NaN : inlineVmlLength(style, "width");
    const most = width + outline;
    if (Number.isFinite(most)) holder.flow.advance += most;
    const layout = layoutOf(at);
    if (layout) placeObject(layout, most, inlineVmlLength(style, "height") + outline, 0, maybeDrawn() ? 0 : width);
  };
  /**
   * The segments of a line that a line laid later over it covers, or may
   * cover (`judgement`: why): set aside those that were read, once, with the
   * other parts of their word (cutWord); none of them is visible after,
   * wherever else they are kept.
   */
  const setAside = (segments: Segment[] | undefined, judgement: Judgement) => {
    for (const segment of segments ?? []) {
      if (segment.judgement.verdict !== "visible") continue;
      segment.judgement = judgement;
      const settled = segment.settled;
      if (settled) {
        cutOut(segment.start, segment.end);
        if (settled.drawn) for (let index = settled.drawn.from; index < settled.drawn.to; index += 1) settled.drawn.verdicts[index] = graver(settled.drawn.verdicts[index]!, judgement);
        if (settled.recorded) record(judgement, segment, settled.paragraph);
      }
      if (segment.word) cutWord(segment.word, judgement);
    }
    if (segments) segments.length = 0;
  };
  /** Sets aside a word over passages or lines once one of its parts is not read: its visible parts, and those still to come (`cut`). */
  const cutWord = (word: WordParts | undefined, judgement: Judgement) => {
    if (!word || word.cut) return;
    word.cut = judgement.verdict === "invisible" ? OUT_OF_PLACE : judgement;
    setAside(word.segments, word.cut);
  };
  /**
   * Leaves the rest of a passage unlaid, the layout work allowed spent: a line of an exact spacing not laid out may still run into the
   * lines above it, which are set aside; the word it goes on from the passages before (`before`), set aside whole.
   */
  const leaveUnlaid = (layout: ParagraphLayout, container: Frame | undefined, before: ParagraphLayout["word"]) => {
    if (layout.tight) {
      setAside(container?.content?.last?.segments, UNLAID);
      for (const entry of layout.pending) setAside(entry.segments, UNLAID);
    }
    cutWord(before?.parts, UNLAID);
    layout.word = undefined;
  };
  /** The width each character of a word being laid out takes in the most room, kept from its measure to its place on its line: grown as words need. */
  let steps = new Float64Array(256);
  /**
   * How the characters of a run are measured (makeMeasure), by its fonts, size, scale, spacing, capitals and typewriter kind: made once
   * for all the runs that share them, not for each passage; the last one of each run's formatting kept at hand.
   */
  const measures = new Map<RunFonts, Map<string, ReturnType<typeof makeMeasure>>>();
  const lastMeasures = new WeakMap<RunLayer, ReturnType<typeof makeMeasure>>();
  /** Notes the names of a run whose text is laid out that may stand for several fonts, but more than are laid out word by word (`axes`). */
  const noted = new WeakSet<RunLayer>();
  const noteAxes = (effective: RunLayer) => {
    if (!axes || noted.has(effective)) return;
    noted.add(effective);
    const names = effective["w:cs"] || effective["w:rtl"] ? [effective.complexFont]
      : [effective.font ?? effective.otherFont, effective.otherFont ?? effective.font, effective.eastAsianHint ? effective.eastAsianFont ?? OFFICE_EAST_ASIAN_FONTS : undefined];
    for (const name of names) {
      const count = name === undefined ? 0 : fonts(name).fonts.length;
      if (count >= 2 && count <= MAX_CHOSEN_FONTS && !axes.has(name!)) axes.set(name!, count);
    }
  };
  const measureOf = (effective: RunLayer, size: number) => {
    noteAxes(effective);
    const last = lastMeasures.get(effective);
    if (last?.size === size) return last;
    const runFonts = fontsOf(effective);
    let byFormat = measures.get(runFonts);
    if (!byFormat) measures.set(runFonts, (byFormat = new Map()));
    const sizes = effective["w:cs"] || effective["w:rtl"] ? "" : `${effective.size ?? ""}:${effective.complexScriptSize ?? ""}`;
    const key = `${size}:${sizes}:${effective.scale ?? 100}:${effective.spacing ?? 0}:${effective.capitals ? 1 : 0}:${effective.typewriter ? 1 : 0}:${effective.fitText ?? ""}:${effective.kern ?? ""}`;
    let measure = byFormat.get(key);
    if (!measure) byFormat.set(key, (measure = makeMeasure(effective, size)));
    lastMeasures.set(effective, measure);
    return measure;
  };
  const makeMeasure = (effective: RunLayer, size: number) => {
    const scale = (effective.scale ?? 100) / 100;
    const spacing = effective.spacing ?? 0;
    const runFonts = fontsOf(effective);
    /** Of each slot of the run's fonts, the one the word being laid out is drawn in (RunFonts). */
    const choice = [0, 0, 0];
    // Word sets a run's Hebrew and Arabic in its complex script size (w:szCs), its other characters in w:sz, but all of a run marked
    // complex script in w:szCs: of a passage laid out at one size, each character at its own, as a share of it.
    const marked = effective["w:cs"] || effective["w:rtl"];
    const complexShare = size > 0 ? (effective.complexScriptSize ?? DEFAULT_FONT_SIZE_PT) / size : 1;
    const otherShare = size > 0 && !marked ? (effective.size ?? DEFAULT_FONT_SIZE_PT) / size : complexShare;
    const sizeShare = (code: number) => (code <= 0xffff && COMPLEX_INDEX[code]! >= 0 ? complexShare : otherShare);
    const complex = runFonts.complex.widths;
    // Kerned (w:kern, from its size on; 0: not), each character may be wider by the largest positive pair adjustment of the fonts
    // measured, in the most room (DOCX_KERNING_MOST); narrower, in the least, which takes as little already.
    const kerning = effective.kern && size >= effective.kern ? DOCX_KERNING_MOST / 1000 : 0;
    /**
     * In the most room, a character measured is as wide as in the font of
     * its slot chosen for its word (`font`, else `choice`), or, of either
     * slot, in the wider; one that font lacks, as Word may draw it instead
     * (lacking); a character of Hebrew or Arabic as DOCX_COMPLEX_METRICS bounds
     * it in the run's complex script font, of no bound in another; others as
     * unmeasuredShare bounds them; in capitals as their capital.
     */
    const mostShare = (code: number, font?: number) => {
      const shown = effective.capitals ? upperCase(code) : code;
      let share = 0;
      const index = shown <= 0xffff ? MEASURED_INDEX[shown]! : -1;
      if (index >= 0) {
        const slot = runFonts.slotOf[index]!;
        share = slot === EITHER_SLOT ? runFonts.either![index]! : runFonts.slots[slot]![font ?? choice[slot]!]![index]! || runFonts.lacking[index]!;
      } else if (shown <= 0xffff && COMPLEX_INDEX[shown]! >= 0) return complex?.[COMPLEX_INDEX[shown]!] || UNBOUNDED_SIZES;
      return share || unmeasuredShare(shown, effective.typewriter === true, runFonts.bold, runFonts.unbounded);
    };
    return {
      size,
      runFonts,
      several: !runFonts.single,
      sizeShare,
      /**
       * The height of single spacing a character sets on its line in the most room, in sizes of its text: the run's fonts', its
       * complex script font's for Hebrew and Arabic, a font of signs' for a sign its font lacks (RunFonts `lines`), an emoji's.
       */
      lineOf: (code: number) => {
        const index = code <= 0xffff ? MEASURED_INDEX[code]! : -1;
        if (index >= 0) return runFonts.lines[index]!;
        if (code <= 0xffff && COMPLEX_INDEX[code]! >= 0) return runFonts.complex.line;
        return code > 32 && !ZERO_WIDTH.has(code) && !isUndrawn(code) && !runFonts.unbounded && isEmoji(code) ? Math.max(runFonts.line, DOCX_EMOJI_METRICS.line / 1000) : runFonts.line;
      },
      // In the least room, a character of no width (a zero-width space, a soft hyphen within a line, a mark of direction, a combining
      // mark over the letter before it) takes none, nor one of text fitted to a width (w:fitText), which Word may squeeze into it.
      advance: (model: number, code: number) => {
        if (model === MOST) return Math.max(0, (mostShare(code) + kerning) * size * sizeShare(code) * scale + spacing);
        if (ZERO_WIDTH.has(code) || isUndrawn(code) || isMark(code) || effective.fitText !== undefined) return 0;
        const kind = kindOf(code);
        return Math.max(0, (effective.typewriter && kind !== "wide" ? LAYOUTS[LEAST]!.typewriter : LAYOUTS[LEAST]!.widths[kind]) * size * sizeShare(code) * scale + spacing);
      },
      /**
       * A run whose font is one of several (a font Word does not have and the
       * fonts it may draw it with): Word draws it in one of them, so a word is
       * as wide as in the widest of them for it, of each slot (no wider than
       * the widest character by character). The units of the word, from
       * `from` to `to`; the font of each slot it is drawn in kept in `choice`.
       */
      chooseFonts: (text: string, from: number, to: number) => {
        for (let slot = ASCII_SLOT; slot <= EAST_ASIAN_SLOT; slot += 1) {
          const fonts = runFonts!.slots[slot]!;
          choice[slot] = 0;
          if (fonts.length < 2) continue;
          let widest = -1;
          for (let font = 0; font < fonts.length; font += 1) {
            let width = 0;
            for (let at = from; at < to; ) {
              const code = text.codePointAt(at)!;
              at += code > 0xffff ? 2 : 1;
              const shown = effective.capitals ? upperCase(code) : code;
              const index = shown <= 0xffff ? MEASURED_INDEX[shown]! : -1;
              if (index >= 0 && runFonts!.slotOf[index] === slot) width += mostShare(code, font);
            }
            if (width > widest) {
              widest = width;
              choice[slot] = font;
            }
          }
        }
      },
    };
  };
  /**
   * Lays a passage of a run on its paragraph's lines, in both layouts
   * (deleted text in the first only), and judges each of its UTF-16 units:
   * hidden when even the least room takes it out of its row, text box, frame
   * or page, or runs its line into the letters of the one above;
   * unverifiable when only the most room does, or when its line runs into the
   * one above, which is then set aside too; a word judged whole, with its
   * part in the passages before. With its line in the first layout, for the
   * lines below that may run into it, and the words whose parts here go with
   * others (`joined`: their units and parts, WordParts): broken over lines, or
   * going on from the passages before. Each character laid out costs a unit
   * of layout work: once all the work allowed is spent, the passage is no
   * longer laid out from the word or the spaces it stops in, which are set
   * aside with the rest of it, unlaid (the units judged are the first ones).
   */
  const layText = (layout: ParagraphLayout, text: string, effective: RunLayer, container: Frame | undefined, deleted: boolean): LaidText => {
    const judgements: Judgement[] = [];
    const lines: number[] = [];
    const joined: Array<{ from: number; to: number; parts: WordParts }> = [];
    /** The word the passage goes on, from the passages before. */
    const before = text.length > 0 && !breaksLine(text.charCodeAt(0)) ? layout.word : undefined;
    if (budget.units <= 0) {
      leaveUnlaid(layout, container, before);
      return { judgements, lines, wordFrom: text.length, joined };
    }
    const { format } = layout;
    const size = fontSize(effective, text);
    const lowered = Math.max(0, -(effective.position ?? 0));
    const { runFonts, several, advance, chooseFonts, sizeShare, lineOf } = measureOf(effective, size);
    const factor = runFonts.line;
    // Letters set on their line otherwise than the check lays them out (emphasis marks, two lines in one or turned, ruby above
    // them), or on a grid of characters: of no extent known, they and what follows them may lie anywhere in the most room.
    if (effective.emphasis || effective.eastAsianLayout || held.ruby > 0 || layout.charGrid) layout.lost = true;
    // Raised or lowered (w:position, a superscript or a subscript), letters make their line taller in the most room by as much (half
    // their size for a superscript or subscript), of a multiple of single spacing that much more.
    const shift = Math.abs(effective.position ?? 0) + (effective.vertical ? size / 2 : 0);
    const multiple = format.line.rule === "auto" ? Math.max(1, format.line.value) : 1;
    // Text fitted to a width (w:fitText) Word spreads over it, or squeezes into it: in the most room, as wide as the wider.
    let stretch = 1;
    if (effective.fitText !== undefined && text.length) {
      let measured = 0;
      for (let at = 0; at < text.length; ) {
        const code = text.codePointAt(at)!;
        at += code > 0xffff ? 2 : 1;
        measured += advance(MOST, code);
      }
      budget.units -= text.length;
      stretch = measured > 0 ? Math.max(1, effective.fitText / measured) : effective.fitText > 0 ? Number.POSITIVE_INFINITY : 1;
    }
    /** The largest size and line of the passage's letters so far, for the word it ends in. */
    let largest = 0;
    let tallest = 0;
    /** Whether the passage holds Arabic, which Word may stretch with kashidas in a line it justifies. */
    let arabic = false;
    /** Whether text at `from` on a line of a layout leaves its place (4), and how far it runs into the line above (1: into its bottom, 2: into its letters). */
    const placing = (model: number, line: Line, from: number) => {
      const across = layout.edge && layout.edge[model]! + lineStart(layout, line);
      const out = (model === MOST && layout.lost && (across !== undefined || Number.isFinite(layout.slack[MOST])))
        || outOfPlace(layout.slack, model, line.top, lowered, line.size)
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
      return (out ? 4 : 0) + overlap;
    };
    // A line alone in an exact spacing far smaller than its letters: Word cuts most of them, LibreOffice draws them over the space above.
    const alone = layout.tight && format.line.rule === "exact" && format.line.value < MIN_ALONE_EXACT_LINE_SHARE * size;
    /** Lines of the paragraph in the first layout (-1: the last one of the container above it) that a line below runs into. */
    const covered = new Set<number>();
    /** The last word of the passage: where it starts (unit, place on its line of the first layout), whether it goes on with the word before it, whether a line may break after it. */
    let last: { unit: number; x: number; line: number; continued: boolean; ends: boolean } | undefined;
    /** The words of the passage: their units, the line of the first layout they start on here, whether they go on with the word before. */
    const words: Array<{ from: number; to: number; line: number; continued: boolean }> = [];
    /** Where the passage stops being laid out, the work allowed spent, and whether a word starts there. */
    let stopped: { unit: number; word: boolean } | undefined;
    passage: for (let unit = 0; unit < text.length; ) {
      const space = breaksLine(text.charCodeAt(unit));
      let end = unit;
      let width = 0;
      let count = 0;
      let lastCode = 0;
      // Spaces, or a word up to where Word may break its line: after a hyphen or a dash, around an ideograph; joined by no-break spaces.
      while (end < text.length) {
        const code = text.codePointAt(end)!;
        if (breaksLine(text.charCodeAt(end)) !== space || (!space && end > unit && isWide(code))) break;
        if (budget.units <= 0) {
          stopped = { unit, word: !space };
          break passage;
        }
        budget.units -= 1;
        if (count === steps.length) {
          const grown = new Float64Array(steps.length * 2);
          grown.set(steps);
          steps = grown;
        }
        const step = several ? 0 : advance(MOST, code) * stretch;
        steps[count++] = step;
        width += step;
        end += code > 0xffff ? 2 : 1;
        lastCode = code;
        if (!space && (BREAK_AFTER.has(code) || isWide(code))) break;
      }
      if (several) {
        // Measured once the word is known: in the fonts it is widest in.
        chooseFonts(text, unit, end);
        for (let at = unit, index = 0; at < end; index += 1) {
          const code = text.codePointAt(at)!;
          at += code > 0xffff ? 2 : 1;
          steps[index] = advance(MOST, code) * stretch;
          width += steps[index]!;
        }
      }
      // In the most room, a word goes whole to the next line when it does not fit on this one, with its part in the passages before.
      const first = layout.lines[MOST];
      const word = !space && unit === 0 ? layout.word : undefined;
      if (word && word.x > 0 && first.x + width > lineReach(layout, first, MOST, width)) {
        const from = first.index;
        newLine(layout, MOST, size, factor);
        Object.assign(first, { x: word.width, size: word.size, factor: word.factor });
        if (placing(MOST, first, 0) > 0) cutWord(word.parts, OUT_OF_PLACE);
        else moveSegments(layout, word.parts.segments, from, first.index);
        layout.word = { ...word, x: 0 };
      } else if (!space && first.x > 0 && first.x + width > lineReach(layout, first, MOST, width)) newLine(layout, MOST, size, factor);
      last = { unit, x: first.x, line: first.index, continued: word !== undefined, ends: space || BREAK_AFTER.has(lastCode) || isWide(lastCode) };
      if (!space) words.push({ from: unit, to: end, line: first.index, continued: word !== undefined });
      for (let index = 0; unit < end; index += 1) {
        const code = text.codePointAt(unit)!;
        // Its own size (w:sz, or w:szCs for Hebrew and Arabic), and the line its font sets in the most room.
        const charSize = size * sizeShare(code);
        const charLine = lineOf(code);
        largest = Math.max(largest, charSize);
        tallest = Math.max(tallest, charLine);
        if (!arabic && isArabic(code)) arabic = true;
        // The character on its line in each layout (past it, on the next one, in a word), and how it is placed there (placing).
        let most = 0;
        let least = 0;
        for (let model = MOST; model <= (deleted ? MOST : LEAST); model += 1) {
          const line = layout.lines[model]!;
          const step = model === MOST ? steps[index]! : advance(LEAST, code);
          if (!space && line.x > 0 && line.x + step > lineReach(layout, line, model, step)) newLine(layout, model, size, factor);
          const from = line.x;
          line.x += step;
          line.size = Math.max(line.size, charSize);
          if (model === MOST) {
            line.factor = Math.max(line.factor, charLine);
            if (shift > 0) line.objects = Math.max(line.objects, (charLine * charSize + shift) * multiple);
          }
          if (model === MOST && layout.tab?.line === line.index) layout.tab.width += step;
          if (deleted) continue;
          if (model === MOST) most = placing(model, line, from);
          else least = placing(model, line, from);
        }
        let judgement = VISIBLE;
        if (!deleted) {
          if (least >= 4 || (least & 3) === 2) judgement = INVISIBLE;
          else if (most > 0 || alone) judgement = OUT_OF_PLACE;
          if ((most & 3) > 0) covered.add(layout.lines[MOST].index - 1);
        }
        for (const stop = unit + (code > 0xffff ? 2 : 1); unit < stop; unit += 1) {
          judgements.push(judgement);
          lines.push(layout.lines[MOST].index);
        }
      }
    }
    // The line above in the same paragraph, or the last line of text above it (LastLine), whatever its spacing.
    for (const line of Array.from(covered)) setAside(line < 0 ? container?.content?.last?.segments : layout.pending.find(entry => entry.line === line)?.segments, OUT_OF_PLACE);
    if (covered.size) for (let index = 0; index < judgements.length; index += 1) if (judgements[index] === VISIBLE && covered.has(lines[index]!)) judgements[index] = OUT_OF_PLACE;
    // A word is read or set aside whole, never cut where Word may not break its line: what is left of one partly hidden or set aside,
    // here or in the passages before, is set aside with it (unverifiable, not counted as hidden). Going on from the passages before, or
    // broken over lines here (longer than its line), its parts go with one another, whichever line is covered later.
    let cut: Judgement | undefined;
    for (const word of words) {
      cut = word.continued ? before?.parts.cut : undefined;
      for (let index = word.from; index < word.to && !cut; index += 1) if (judgements[index]!.verdict !== "visible") cut = judgements[index]!.verdict === "invisible" ? OUT_OF_PLACE : judgements[index];
      if (cut) {
        for (let index = word.from; index < word.to; index += 1) if (judgements[index] === VISIBLE) judgements[index] = cut;
        if (word.continued) cutWord(before?.parts, cut);
      } else if (word.continued || lines[word.to - 1] !== word.line) joined.push({ from: word.from, to: word.to, parts: (word.continued && before?.parts) || { segments: [] } });
    }
    // Arabic in a line Word justifies may be stretched with kashidas (w:jc both, distribute, the kashida justifications), of no
    // length known: what follows it may lie anywhere in the most room.
    if (arabic && STRETCHED_ALIGNMENTS.test(format.align ?? "")) layout.lost = true;
    if (stopped) {
      leaveUnlaid(layout, container, stopped.unit === 0 && stopped.word ? before : undefined);
      return { judgements, lines, wordFrom: text.length, joined };
    }
    // A word the passage ends in may go on in the next one: kept, to go with it to the next line, or be set aside with it. Broken over
    // two lines here, it starts the last one.
    let wordFrom = text.length;
    if (last && !last.ends) {
      const first = layout.lines[MOST];
      const word = last.continued ? layout.word : undefined;
      const x = first.index !== last.line ? 0 : word?.x ?? last.x;
      const parts = joined.at(-1)?.to === text.length ? joined.at(-1)!.parts : (last.continued && before?.parts) || { segments: [] };
      layout.word = { x, width: first.x - x, size: Math.max(word?.size ?? 0, largest || size), factor: Math.max(word?.factor ?? 0, tallest || factor), parts };
      parts.cut ??= cut;
      wordFrom = word ? 0 : last.unit;
    } else if (last) layout.word = undefined;
    return { judgements, lines, wordFrom, joined };
  };
  /**
   * A passage cut where its judgement or its line changes, and where the word
   * it ends in, which the next passage may go on, starts (`wordFrom`); its
   * visible parts kept for the lines below (of its last lines when laid out),
   * and with that word, or a word whose parts go with others (joined), to be
   * set aside with it; cut too where such a word starts and ends; what is
   * left of it unlaid set aside apart. Whole when its XML cannot be cut apart.
   */
  const segmentsOf = (raw: string, start: number, text: string, paragraph: Frame | undefined, layout: ParagraphLayout | null, judged?: LaidText): Segment[] => {
    const groups: Array<{ from: number; to: number; judgement: Judgement; line: number }> = [];
    // Where a word starts or ends, a part ends: where the passage's last word starts, at the ends of the words it joins to others.
    const bounds = judged?.joined.length ? new Set(judged.joined.flatMap(word => [word.from, word.to])) : undefined;
    const laid = judged?.judgements.length ?? 0;
    for (let index = 0; index < laid; index += 1) {
      const group = groups.at(-1);
      if (group && group.judgement === judged!.judgements[index] && group.line === judged!.lines[index] && index !== judged!.wordFrom && !bounds?.has(index)) group.to = index + 1;
      else groups.push({ from: index, to: index + 1, judgement: judged!.judgements[index]!, line: judged!.lines[index]! });
    }
    if (judged && laid < text.length) groups.push({ from: laid, to: text.length, judgement: UNLAID, line: judged.lines.at(-1) ?? 0 });
    const offsets = groups.length > 1 ? textOffsets(raw, text.length, groups) : undefined;
    const parts = offsets
      ? groups.map((group, index) => ({ ...group, start: start + offsets[index]!.start, end: start + offsets[index]!.end }))
      : [{ from: 0, to: text.length, judgement: groups.map(group => group.judgement).reduce(graver, VISIBLE), line: groups.at(-1)?.line ?? 0, start, end: start + raw.length }];
    /** The first word of judged.joined not before the part. */
    let span = 0;
    return parts.map(part => {
      const segment: Segment = { from: part.from, to: part.to, start: part.start, end: part.end, text: text.slice(part.from, part.to), judgement: part.judgement };
      if (part.judgement !== VISIBLE) return segment;
      if (layout) {
        // Only the last two lines may still be run into.
        while (layout.pending.length && layout.pending[0]!.line < part.line - 1) layout.pending.shift();
        let entry = layout.pending.find(item => item.line === part.line);
        if (!entry) layout.pending.push((entry = { line: part.line, segments: [] }));
        entry.segments.push(segment);
        // Of the word the passage ends in, which the next may go on, or of a word joined to others: kept with its other parts.
        while (judged && span < judged.joined.length && judged.joined[span]!.to <= part.from) span += 1;
        // (An empty passage, <w:t></w:t>, is of no word.)
        const word = judged && part.to > judged.wordFrom ? layout.word?.parts : judged && span < judged.joined.length && part.from >= judged.joined[span]!.from ? judged.joined[span]!.parts : undefined;
        if (word) {
          word.segments.push(segment);
          segment.word = word;
        }
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
  /** Keeps a no-break or soft hyphen laid out as text with its run's passages, once it ends in the XML (`end`): read, or cut out with them; deleted, mammoth does not read it. */
  const keepCharacter = (frame: Frame, run: Frame | undefined, end: number) => {
    const character = frame.character;
    if (!character || character.deleted || !run?.texts) return;
    run.texts.push({ text: character.text, place: character.place, segments: segmentsOf(xml.slice(character.start, end), character.start, character.text, character.holder, character.layout, character.judged), field: character.field });
  };
  const paintShape = ({ hex, scale, offset, alpha, shape }: NonNullable<Frame["colour"]>) => {
    const colour = hex && (scale === 1 && offset === 0 ? hex : withLightness(hex, lightness => lightness * scale + offset));
    // Partly transparent, it shows the page through it, as a VML fill.
    shape.paint = colour ? [alpha < 1 ? blend(pageColour, colour, alpha) : colour] : null;
    shape.opaque = colour !== undefined && alpha >= OPAQUE_FILL;
  };
  /** Records text set aside in its paragraph, or apart once the paragraph is read; and where it lies in the part. */
  const record = (judgement: Judgement, { text, start, end }: Segment, paragraph: Frame | undefined) => {
    settled.push({ start, end, text, judgement, paragraph: paragraph?.ordinal ?? -1 });
    const passages = paragraph && !paragraph.closed ? paragraph.passages! : found;
    if (judgement.verdict === "invisible") passages.invisible.push(text);
    else passages.unverifiable.push({ text, reason: judgement.reason ?? "drawing" });
  };
  /** A shape once read (DrawingML anchor, VML shape): in front of the text without wrapping it, whose fill hides it, Word drawing it, it may cover the paragraphs of the body it reaches. */
  const coverByShape = (shape: Frame) => {
    const { front, box } = shape;
    if (front && !front.behind && front.wrapNone && front.opaque && box && !box.simple && !shape.offPage && !shape.hidden && drawnHere()) coverFrom(nearest("w:p"), { across: front.across, down: front.down, ...box });
  };
  /** Whether what is read here is in a mc:AlternateContent of which Word may draw either branch: what it draws takes room in the most room only. */
  const maybeDrawn = () => stack[openAlternate()]?.drawn?.either === true;
  /** Whether Word draws what is read here: not in a mc:Fallback whose mc:Choice it draws, nor in a mc:Choice it does not draw. */
  const drawnHere = () => {
    const alternate = openAlternate();
    const branch = stack[alternate + 1];
    const drawn = stack[alternate]?.drawn;
    return alternate === -1 || !branch || (branch.name === "mc:Choice" ? branch.chosen === true : drawn === undefined || drawn.either);
  };
  /**
   * Where the run being read lies: in the copy mammoth reads of what Word draws from mc:Choice, which takes its place from the
   * choice (its own, its VML box's insets, does not count); whether its text is counted (mammoth reads text boxes from
   * mc:Fallback and VML only: what mc:Choice repeats, or a DrawingML text box holds, is not); its paragraph.
   */
  const runPlace = () => {
    const alternate = openAlternate();
    return {
      copy: alternate !== -1 && stack[alternate]!.drawn?.either === false && stack[alternate + 1]?.name === "mc:Fallback",
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
    cutOut(segment.start, segment.end);
    if (recorded) record(judgement, segment, paragraph);
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
      // A content control bound to data may draw more than it stores: what follows it in its paragraph, or its container, is set aside.
      if (frame?.dataBound) {
        if (stack.at(-1)?.name === "w:p") loseParagraph();
        else loseContainer();
      }
      if (frame?.name === "mc:Choice" || frame?.name === "w:drawing") unread -= 1;
      if (frame?.character) keepCharacter(frame, stack.at(-1), tag.end);
      if (frame?.name === "w:instrText" && instrStart !== null) {
        const field = fields.at(-1);
        if (field && !field.result) {
          field.code += decodeXml(xml.slice(instrStart, tag.start));
          const run = stack.at(-1);
          if (run?.name === "w:r") field.formats.push(runFormat(run));
        }
        instrStart = null;
      }
      if (frame?.name === "w:fldSimple" && fields.at(-1)?.simple) endField(fields.pop()!);
      if (frame?.inline) placeInline(frame.inline);
      if (frame?.name === "w:r" && fields.length) lastRunFormat = runFormat(frame);
      if ((frame?.name === "w:t" || frame?.name === "w:delText") && textStart !== null) {
        const run = stack.at(-1);
        const raw = xml.slice(textStart, tag.start);
        const text = decodeXml(raw);
        const at = stack.findLastIndex(item => item.name === "w:p");
        const holder = stack[at];
        const effective = run?.texts ? runFormat(run) : undefined;
        let layout: ParagraphLayout | null = null;
        let judged: LaidText | undefined;
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
        if (frame.name === "w:t" && run?.texts) run.texts.push({ text, place: frame.place ?? { before: 0, tabbed: true }, segments: segmentsOf(raw, textStart, text, holder, layout, judged), field: fieldShown() });
        textStart = null;
      } else if (frame?.name === "w:r" && frame.texts?.length) {
        const effective = runFormat(frame);
        const seen = visibility(frame.texts.map(passage => passage.text).join(""), effective);
        // Off the page with some margins, or under a shape in front of the body (not in a text box, which may be drawn over it): unverifiable.
        // Text a content control stores that Word replaces by the data it is bound to (w:dataBinding), or fitted to a width (w:fitText)
        // of less than a point a character, which Word may squeeze into it so that its letters run into one another: unverifiable.
        const characters = effective.fitText !== undefined ? frame.texts.reduce((count, passage) => count + codePoints(passage.text), 0) : 0;
        const squeezed = characters > 0 && effective.fitText! / characters < MIN_ADVANCE_PT;
        const judgement = graver({ verdict: seen, reason: seen === "unverifiable" ? "drawing" : undefined }, held.unplaced > 0 || (held.covered > 0 && held.textBoxes === 0) || held.bound > 0 || squeezed ? OUT_OF_PLACE : VISIBLE);
        // Each passage of the run in its place: its indents may take it off the page, its row, text box or line spacing part of it.
        const place = runPlace();
        for (const passage of frame.texts) {
          const placed = graver(offIndents(passage, effective) ? graver(judgement, INVISIBLE) : judgement, passage.field);
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
              // Of lines of no extent known, the paragraph leaves no room below it in the most room.
              const lost = model === MOST && layout!.lost ? UNBOUNDED_EXTENT_PT : 0;
              return lost + above + line.top + lineHeight(format, line.size || markSize, model, line.objects, line.size ? line.factor : fontsOf(mark).line) + (model === MOST ? layout!.gridPitch : 0);
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
      } else placeInlineVml(tag, style);
    } else if (INLINE_VML.has(tag.name) && (parent?.name === "w:pict" || parent?.name === "w:object") && !/(?:^|;)\s*position\s*:\s*absolute/i.test(tag.attributes.get("style") ?? "")) {
      placeInlineVml(tag, tag.attributes.get("style") ?? "");
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
    // A drawing in line with the text Word draws (not the copy of a mc:Fallback whose mc:Choice it draws, its VML shape already taking its place) takes its place on its line once read (placeInline).
    if (tag.name === "wp:inline" && !tag.selfClosing && drawnHere()) frame.inline = { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0, outline: 0 };
    // A DrawingML drawing's size: of none known when a length is not read or negative (ST_PositiveCoordinate).
    if (tag.name === "wp:extent" && (parent?.name === "wp:anchor" || parent?.name === "wp:inline")) {
      const height = emuPt(tag.attributes.get("cy"));
      const width = emuPt(tag.attributes.get("cx"));
      const sized = height !== undefined && width !== undefined && height >= 0 && width >= 0;
      parent.extent = sized ? [height, height] : undefined;
      parent.width = sized ? [width, width] : undefined;
      parent.unsized = !sized;
      if (parent.inline) Object.assign(parent.inline, sized ? { width, height } : { width: Number.NaN, height: Number.NaN });
    }
    if (tag.name === "wp:effectExtent" && parent?.inline) {
      const side = (name: string) => (tag.attributes.has(name) ? emuPt(tag.attributes.get(name)) ?? Number.NaN : 0);
      Object.assign(parent.inline, { left: side("l"), top: side("t"), right: side("r"), bottom: side("b") });
    }
    // The outline of an inline drawing's shape or picture (a:ln w), centred on its edge.
    if (tag.name === "a:ln" && parent?.name.endsWith(":spPr")) {
      const inline = stack.findLast(item => item.name === "wp:inline" || item.name === "wp:anchor")?.inline;
      const width = tag.attributes.has("w") ? emuPt(tag.attributes.get("w")) ?? Number.NaN : 0;
      if (inline) inline.outline = Math.max(inline.outline, Math.abs(width));
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
      // A box of a size not read may show none of its text, or all of it.
      if (holder?.unsized) frame.room = [0, Number.POSITIVE_INFINITY];
      else if (holder?.extent) frame.room = [Math.max(0, holder.extent[MOST]), Math.max(0, holder.extent[LEAST])];
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
    if (tag.name === "mc:Choice" && parent?.name === "mc:AlternateContent") parent.choices = (parent.choices ?? 0) + 1;
    // Word draws the first choice it understands: past one it may not understand (either), the next ones may be drawn too, up to one it
    // surely draws (settled), their shapes covering the text and their objects taking room as those of a branch Word may draw.
    const open = tag.name === "mc:Choice" && parent?.name === "mc:AlternateContent" && (!parent.drawn || (parent.drawn.either && !parent.drawn.settled));
    const drawnChoice = open ? drawnByWord(tag) : "fallback";
    if (drawnChoice !== "fallback") {
      frame.chosen = true;
      if (parent!.drawn) parent!.drawn.settled = drawnChoice === "choice";
      else parent!.drawn = { text: "", verdicts: [], cursor: 0, either: drawnChoice === "either" };
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
    // A content control bound to data (w:dataBinding): Word draws the data, not the content it stores, which is set aside, and what
    // it draws may be longer (closing it, above).
    // But one bound to a core property of the document that its content says (storedAsBound): Word draws it as stored.
    if (tag.name === "w:sdt") frame.sdtStart = tag.start;
    if (tag.name === "w:dataBinding" && parent?.name === "w:sdtPr" && grandParent?.name === "w:sdt" && !drawnAsStoredControls.has(grandParent.sdtStart ?? -1)) grandParent.dataBound = true;
    if (tag.name === "w:sdtContent" && parent?.dataBound) frame.bound = true;
    // What Word draws that the check does not lay out: an equation (m:oMath, m:oMathPara, in Cambria Math, which mammoth does not
    // read), a subdocument (w:subDoc): of no extent known, what follows it in its paragraph may lie anywhere in the most room; a
    // document imported in its place (w:altChunk, which mammoth does not read either): what follows it in its container.
    if ((tag.name === "m:oMath" || tag.name === "m:oMathPara" || tag.name === "w:subDoc") && !stack.some(item => item.name === "m:oMath" || item.name === "m:oMathPara")) loseParagraph();
    if (tag.name === "w:altChunk") loseContainer();
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
    // Where the run's text lies in its paragraph: a line break starts a line below; a tab moves it to a tab stop (for its indents, anywhere along the line); a symbol,
    // a note's number, a number or a date Word writes take their width on it (drawnWidth), a no-break or soft hyphen is laid out and read as text. Hidden, they move
    // nothing; deleted, only in the most room.
    const flowing = parent?.name === "w:r" && (IN_FLOW.has(tag.name) || tag.name === "w:delText") && !hides(runFormat(parent));
    if (flowing) {
      const at = stack.findLastIndex(item => item.name === "w:p");
      const holder = stack[at];
      const flow = holder?.flow;
      const layout = flow && tag.name !== "w:t" && tag.name !== "w:delText" ? layoutOf(at) : null;
      const deleted = held.deleted > 0;
      const effective = runFormat(parent);
      if (layout && (tag.name === "w:br" || tag.name === "w:cr")) for (const model of deleted ? [MOST] : [MOST, LEAST]) newLine(layout, model, fontSize(effective, ""));
      if (flow && (tag.name === "w:tab" || tag.name === "w:ptab")) flow.tabbed = true;
      if (layout && tag.name === "w:tab" && !deleted) tabOn(layout, holder!);
      if (layout && tag.name === "w:ptab" && !deleted) positionalTab(layout, tag);
      const width = flow ? drawnWidth(tag, effective) : undefined;
      if (flow && width !== undefined) {
        flow.advance += Math.max(width, widestAdvance(effective));
        if (layout && !deleted) placeObject(layout, width, 0, fontSize(effective, ""), Math.min(width, LAYOUTS[LEAST]!.widths.sign * fontSize(effective, "")));
      }
      const character = DRAWN_CHARACTERS[tag.name];
      if (flow && character !== undefined) {
        const place = { before: flow.advance, tabbed: flow.tabbed };
        if (!deleted) flow.advance += widestAdvance(effective);
        if (!deleted && tag.name === "w:noBreakHyphen") holder!.inked = true;
        // Its place in the XML is known once it ends: at once when self-closing.
        frame.character = { text: character, place, judged: layout ? layText(layout, character, effective, stack[containerIndex(at)], deleted) : undefined, layout, holder: holder!, deleted, start: tag.start, field: fieldShown() };
        if (tag.selfClosing) keepCharacter(frame, parent, tag.end);
      }
    }
    // Fields: a complex one's code, then its result, between its w:fldChar; a simple one's result inside it (w:fldSimple w:instr).
    const dirty = (tag.name === "w:fldChar" || tag.name === "w:fldSimple") && /^(1|true|on)$/i.test(tag.attributes.get("w:dirty") ?? "");
    if (tag.name === "w:fldChar" && parent?.name === "w:r") {
      const kind = tag.attributes.get("w:fldCharType");
      const open = fields.at(-1);
      // A field begun in the code of another makes that code what the check does not bound.
      if (kind === "begin" && open && !open.result) open.nested = true;
      if (kind === "begin") fields.push({ code: "", result: false, shown: VISIBLE, dirty, simple: false, effective: runFormat(parent), formats: [] });
      else if (kind === "separate" && open && !open.simple && !open.result) beginResult(open);
      else if (kind === "end" && open && !open.simple) endField(fields.pop()!);
    }
    if (tag.name === "w:instrText" && !tag.selfClosing && parent?.name === "w:r") instrStart = tag.end;
    if (tag.name === "w:fldSimple") {
      const open = fields.at(-1);
      if (open && !open.result) open.nested = true;
      const field = { code: tag.attributes.get("w:instr") ?? "", result: false, shown: VISIBLE, dirty, simple: true, formats: [] };
      beginResult(field);
      if (tag.selfClosing) endField(field);
      else fields.push(field);
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
  return { xml: visible + xml.slice(from), cut: cuts.length > 0, invisibleText: found.invisible, unverifiableText: found.unverifiable, cuts, settled };
}

/** How many layouts of one font for each name of several fonts (laidLayouts) the check makes at most. */
const MAX_LAYOUTS = 16;
/**
 * What reading a part again costs in each layout of one font (laidLayouts),
 * in units of layout work (1,000,000 take about 0.25 s): its tags, a pass
 * over a part of 20 MB and 2.6 million tags taking 5.4 s, some 2 µs or 8 units
 * a tag; its bytes, a pass over 19 MB of text in 1,900 paragraphs 0.11 s, some
 * 42 bytes a unit, counted at 16.
 */
const LAYOUT_UNITS_PER_TAG = 8;
const BYTES_PER_LAYOUT_UNIT = 16;

/**
 * The text of a part judged in layouts of one font at a time: a run's text
 * whose font may be any of several (a font Word does not have and the ones it
 * may draw it with instead, a name read otherwise…) is laid out first as wide
 * as in the widest of them, word by word (`first`, a bound of each); when that
 * sets some text aside for its place, it is laid out again in each of them
 * alone, the document being drawn in one: for each name met in that order
 * (`axes`), crossed with the others, as long as the layouts stay within
 * MAX_LAYOUTS and the work left, the names left over laid out word by word in
 * each; text is read only if seen in every layout (mergedLayouts). Each layout
 * costs the reading of the part again (LAYOUT_UNITS_PER_TAG,
 * BYTES_PER_LAYOUT_UNIT) and the work it lays out: past the work allowed
 * (`budget`), the first layout alone is kept.
 */
function laidLayouts(xml: string, tagCount: number, first: ReturnType<typeof cutInvisibleRuns>, axes: Map<string, number>, fonts: FontsOf, budget: { units: number }, pass: (resolve: (name: string | undefined) => LaidFont) => ReturnType<typeof cutInvisibleRuns>) {
  if (!first.unverifiableText.some(passage => passage.reason === "layout")) return first;
  // The work left must cover the reading of the part in each layout, before any is made: as many as it covers, MAX_LAYOUTS at most.
  const reading = LAYOUT_UNITS_PER_TAG * tagCount + Math.ceil(xml.length / BYTES_PER_LAYOUT_UNIT);
  const most = Math.min(MAX_LAYOUTS, Math.floor((budget.units - 1) / reading));
  const crossed: Array<[string, number]> = [];
  let count = 1;
  for (const [name, fontCount] of Array.from(axes)) {
    if (count * fontCount > most) continue;
    crossed.push([name, fontCount]);
    count *= fontCount;
  }
  if (!crossed.length) return first;
  const layouts: Array<ReturnType<typeof cutInvisibleRuns>> = [];
  for (let layout = 0; layout < count; layout += 1) {
    budget.units -= reading;
    // The font each crossed name is laid out in here, alone.
    const chosen = new Map<string, LaidFont>();
    let rest = layout;
    for (const [name, fontCount] of crossed) {
      chosen.set(name, fonts.alone(fonts(name).fonts[rest % fontCount]!));
      rest = Math.floor(rest / fontCount);
    }
    layouts.push(pass(name => (name !== undefined && chosen.get(name)) || fonts(name)));
    if (budget.units <= 0) return first;
  }
  return mergedLayouts(xml, layouts);
}

/**
 * Layouts of one part merged: what any of them cuts out is cut out; each
 * stretch of it any of them sets aside is recorded once, as the gravest of
 * them judges it, in its paragraph, as cutInvisibleRuns records passages (a
 * paragraph's hidden text as one, its other text by reason).
 */
function mergedLayouts(xml: string, layouts: Array<ReturnType<typeof cutInvisibleRuns>>) {
  const cuts = layouts.flatMap(layout => layout.cuts).sort((left, right) => left[0] - right[0]);
  const passages = layouts.flatMap(layout => layout.settled).sort((left, right) => left.start - right.start || left.end - right.end);
  const bounds = Array.from(new Set(passages.flatMap(passage => [passage.start, passage.end]))).sort((left, right) => left - right);
  const paragraphs = new Map<number, { invisible: string[]; unverifiable: Map<DocxUnverifiableReason, string[]> }>();
  let next = 0;
  const open: SettledPassage[] = [];
  for (let index = 0; index + 1 < bounds.length; index += 1) {
    const [from, to] = [bounds[index]!, bounds[index + 1]!];
    while (next < passages.length && passages[next]!.start <= from) open.push(passages[next++]!);
    for (let at = open.length - 1; at >= 0; at -= 1) if (open[at]!.end <= from) open.splice(at, 1);
    if (!open.length) continue;
    const gravest = open.reduce((found, passage) => (SEVERITY[passage.judgement.verdict] > SEVERITY[found.judgement.verdict] ? passage : found));
    // A character drawn by an element (a no-break hyphen) is its passage's text; a stretch of a w:t, its text.
    const text = xml[gravest.start] === "<" ? gravest.text : decodeXml(xml.slice(from, to));
    let paragraph = paragraphs.get(gravest.paragraph);
    if (!paragraph) paragraphs.set(gravest.paragraph, (paragraph = { invisible: [], unverifiable: new Map() }));
    if (gravest.judgement.verdict === "invisible") paragraph.invisible.push(text);
    else {
      const reason = gravest.judgement.reason ?? "drawing";
      const texts = paragraph.unverifiable.get(reason);
      if (texts) texts.push(text);
      else paragraph.unverifiable.set(reason, [text]);
    }
  }
  const invisibleText: string[] = [];
  const unverifiableText: Array<{ text: string; reason: DocxUnverifiableReason }> = [];
  for (const { invisible, unverifiable } of Array.from(paragraphs.values())) {
    if (invisible.length) invisibleText.push(invisible.join(""));
    for (const [reason, texts] of Array.from(unverifiable)) unverifiableText.push({ text: texts.join(""), reason });
  }
  let visible = "";
  let from = 0;
  for (const [start, end] of cuts) {
    if (start > from) visible += xml.slice(from, start);
    from = Math.max(from, end);
  }
  return { xml: visible + xml.slice(from), cut: cuts.length > 0, invisibleText, unverifiableText, cuts, settled: passages };
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
  const fonts = fontResolver(readFontTable(parts.get(related("fontTable"))?.toString("utf8")), theme);
  // A page holds a character at least of the text flowing over the pages: of the document, of its notes.
  const pages = [mainDocument, related("footnotes"), related("endnotes")].reduce((size, name) => size + (parts.get(name)?.length ?? 0), 0);
  const styles = readStyles(parts.get(stylesPart)?.toString("utf8"), theme);
  // The core properties a content control bound to data may draw (storedAsBound).
  const properties = coreProperties(parts.get(relatedPart(parts, "_rels/.rels", CORE_PROPERTIES_RELATIONSHIP, "") ?? "docProps/core.xml")?.toString("utf8"));
  const pass = (resolve: (name: string | undefined) => LaidFont, axes?: Map<string, number>) =>
    cutInvisibleRuns(xml, styles, theme, onEveryPage, showsPageColour(settings), defaultTabStop(settings), budget, resolve, fonts.complex, numberings(settings, pages), updatesFields(settings), properties, tags, axes);
  const axes = new Map<string, number>();
  const visible = laidLayouts(xml, tags.count, pass(fonts, axes), axes, fonts, budget, resolve => pass(resolve));
  if (!visible.cut && !linkedNumbering) return { buffer, invisibleText: [], unverifiableText: [] };
  parts.set(mainDocument, Buffer.from(visible.xml, "utf8"));
  return { buffer: storedZip(parts), invisibleText: visible.invisibleText, unverifiableText: visible.unverifiableText };
}
