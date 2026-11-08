import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { DOCUMENT_DECOMPRESSION_LIMITS } from "./documentDecompressionLimits";
import { docxWithLaidOutLineBreaks, joinMarkedLines } from "./docxLineBreaks";
import { buildZip } from "./testing/zipFixture";

const W_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
/** A4 with margins of 2 cm, Arial 11 pt by default, tab stops every 36 pt: as the CVs the IA-04 bench draws. */
const SECTION = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
const DEFAULTS = '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>';

/** A DOCX of this body (prefix `prefix` for WordprocessingML), these styles after the defaults, and its settings. */
function docx(body: string, { styles = "", defaults = DEFAULTS, prefix = "w" } = {}) {
  const document = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W_NAMESPACE}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}${SECTION}</w:body></w:document>`;
  const prefixed = (xml: string) => (prefix === "w" ? xml : xml.replace(/<(\/?)w:/g, `<$1${prefix}:`).replace(/ w:/g, ` ${prefix}:`).replace(/xmlns:w=/g, `xmlns:${prefix}=`));
  return buildZip([
    { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: "word/_rels/document.xml.rels", content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>' },
    { name: "word/document.xml", content: prefixed(document) },
    { name: "word/styles.xml", content: prefixed(`<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W_NAMESPACE}">${defaults}${styles}</w:styles>`) },
    { name: "word/settings.xml", content: prefixed(`<?xml version="1.0" encoding="UTF-8"?><w:settings xmlns:w="${W_NAMESPACE}"><w:defaultTabStop w:val="720"/></w:settings>`) },
  ]);
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const run = (text: string, properties = "") => `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escape(text)}</w:t></w:r>`;
const paragraph = (content: string, properties = "") => `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${content}</w:p>`;
const tab = (properties = "") => `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:tab/></w:r>`;
const stops = (...positions: Array<[number, string?]>) => `<w:tabs>${positions.map(([position, kind = "left"]) => `<w:tab w:val="${kind}" w:pos="${position}"/>`).join("")}</w:tabs>`;
/** A table of rows of cells, each of its width (twips) and content; cell margins of `margin` twips. */
const table = (rows: Array<Array<[number, string, string?]>>, margin = 0) =>
  `<w:tbl><w:tblPr><w:tblCellMar><w:left w:w="${margin}" w:type="dxa"/><w:right w:w="${margin}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${rows[0]!.map(([width]) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>`
  + rows.map(cells => `<w:tr>${cells.map(([width, content, properties = ""]) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${properties}</w:tcPr>${content}</w:tc>`).join("")}</w:tr>`).join("") + "</w:tbl>";

/** The text the CV extraction reads: the DOCX laid out, read by mammoth, its marked lines joined. */
async function read(file: Buffer, limits = DOCUMENT_DECOMPRESSION_LIMITS) {
  const laidOut = docxWithLaidOutLineBreaks(file, limits);
  const raw = (await mammoth.extractRawText({ buffer: laidOut.buffer })).value;
  return joinMarkedLines(raw, laidOut.marker).split("\n").map(line => line.trim()).filter(Boolean);
}
const characters = (text: string) => Array.from(text.replace(/\s+/g, "")).sort().join("");

describe("tabulations mises en page comme Word les met, dans deux mesures du texte (IA-04)", () => {
  // Arial 11 pt: « Médecin anesthésiste » is 106.5 pt wide; the next text starts 33.5 pt after it, at 140 pt.
  const title = "Médecin anesthésiste";
  const tabbed = (stopsXml: string, before = title, after = "Réanimateur", runProperties = "") => paragraph(run(before, runProperties) + tab(runProperties) + run(after, runProperties), stopsXml);

  it("une tabulation large est un saut de ligne, une étroite une espace : taquets directs, du style, effacés, par défaut", async () => {
    // A stop 33.5 pt (3 em) after the title: wide; one 3.5 pt after it: a space.
    expect(await read(docx(tabbed(stops([2800]))))).toEqual([title, "Réanimateur"]);
    expect(await read(docx(tabbed(stops([2200]))))).toEqual([`${title} Réanimateur`]);
    // The style's stop, then the same stop cleared by the paragraph: the default stops (every 36 pt), the next one at 108 pt, 1.5 pt
    // after the title: a space.
    const styles = `<w:style w:type="paragraph" w:styleId="Colonnes"><w:pPr>${stops([2800])}</w:pPr></w:style>`;
    expect(await read(docx(tabbed('<w:pStyle w:val="Colonnes"/>'), { styles }))).toEqual([title, "Réanimateur"]);
    expect(await read(docx(tabbed(`<w:pStyle w:val="Colonnes"/>${stops([2800, "clear"])}`), { styles }))).toEqual([`${title} Réanimateur`]);
    // A default stop 21 pt after « AB »: wide (2 em, no other gap on its line), as the PDF's gap.
    expect(await read(docx(tabbed("", "AB", "CD")))).toEqual(["AB", "CD"]);
  });

  it("taquets droit, centré et décimal calculés avec le texte qui suit ; retrait négatif : le taquet implicite au retrait", async () => {
    // Right stop at the right margin: the date far from the name.
    expect(await read(docx(tabbed(stops([9600, "right"]), "Karim Benali", "2012-2024")))).toEqual(["Karim Benali", "2012-2024"]);
    // A right stop just after the title and its text: the text reaches back to the title, a space.
    expect(await read(docx(tabbed(stops([3500, "right"]), title, "réanimateur")))).toEqual([`${title} réanimateur`]);
    // A centred and a decimal stop far away: wide.
    expect(await read(docx(tabbed(stops([7000, "center"]), title, "réanimateur")))).toEqual([title, "réanimateur"]);
    expect(await read(docx(tabbed(stops([7000, "decimal"]), "Total", "12,50")))).toEqual(["Total", "12,50"]);
    // A hanging indent of 72 pt: the tab after « 2012 » goes to the indent, 47.5 pt on: wide; after a longer text, to the default stop.
    expect(await read(docx(tabbed('<w:ind w:left="1440" w:hanging="1440"/>', "2012", "CHU de Lyon")))).toEqual(["2012", "CHU de Lyon"]);
  });

  it("une police que les métriques ne connaissent pas, ou bornée, mesurée large et étroite : un saut de ligne seulement si la tabulation est large dans les deux", async () => {
    // In Arial, 33.5 pt after the title: a line break. In a font not measured, the title may be as wide as 130.5 pt (the widest of
    // the fonts measured), 9.5 pt from the stop: a space; in Bahnschrift, bounded by the fonts of the reader not measured, too.
    expect(await read(docx(tabbed(stops([2800]))))).toEqual([title, "Réanimateur"]);
    for (const font of ["Zorglub Sans", "Bahnschrift"]) {
      const fonts = `<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>`;
      expect(await read(docx(tabbed(stops([2800]), title, "Réanimateur", fonts))), font).toEqual([`${title} Réanimateur`]);
      // Far enough: wide in both measures.
      expect(await read(docx(tabbed(stops([5000]), title, "Réanimateur", fonts))), font).toEqual([title, "Réanimateur"]);
    }
  });

  it("une police de largeur non bornée, w:fitText, une image ou le résultat d’un champ avant la tabulation : une espace, même loin", async () => {
    const far = stops([8000]);
    expect(await read(docx(tabbed(far)))).toEqual([title, "Réanimateur"]);
    for (const properties of ['<w:rFonts w:ascii="Wide Latin" w:hAnsi="Wide Latin"/>', '<w:rFonts w:ascii="Lato Black" w:hAnsi="Lato Black"/>', '<w:fitText w:val="2000" w:id="1"/>', "<w:rtl/>"]) {
      expect(await read(docx(tabbed(far, title, "Réanimateur", properties))), properties).toEqual([`${title} Réanimateur`]);
    }
    const drawing = '<w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/></wp:inline></w:drawing></w:r>';
    expect(await read(docx(paragraph(drawing + run(title) + tab() + run("Réanimateur"), far)))).toEqual([`${title} Réanimateur`]);
    const field = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>REF titre</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
      + `${run(title)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    expect(await read(docx(paragraph(field + tab() + run("Réanimateur"), far)))).toEqual([`${title} Réanimateur`]);
    // A tab in a list, a text box or a frame: Word places it by what this reading does not lay out, a space.
    expect(await read(docx(paragraph(run(title) + tab() + run("Réanimateur"), `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>${far}`)))).toEqual([`${title} Réanimateur`]);
  });

  it("une ligne serrée (w:w) ou condensée (w:spacing) mesurée serrée : une tabulation qui la suit de près reste une espace", async () => {
    // Squeezed to half its width, the title ends at 53 pt; a stop at 60 pt, 7 pt on, is a space, where at its width it would wrap.
    expect(await read(docx(tabbed(stops([1200]), title, "Réanimateur", '<w:w w:val="50"/>')))).toEqual([`${title} Réanimateur`]);
    expect(await read(docx(tabbed(stops([1700]), title, "Réanimateur", '<w:spacing w:val="-30"/>')))).toEqual([`${title} Réanimateur`]);
  });
});

describe("ce que Word cache d’une ligne : tabulation, saut de ligne, marque de paragraphe (IA-04)", () => {
  const far = stops([8000]);
  it("une tabulation, un saut de ligne ou un retour chariot cachés ne sont rien, par la passe, son style de caractère ou les défauts du document", async () => {
    const hidden = "<w:vanish/>";
    for (const element of ["<w:tab/>", "<w:br/>", "<w:cr/>", '<w:br w:type="page"/>']) {
      const body = paragraph(run("Médecin anesthésiste ") + `<w:r><w:rPr>${hidden}</w:rPr>${element}</w:r>` + run("Réanimateur"), far);
      expect(await read(docx(body)), element).toEqual(["Médecin anesthésiste Réanimateur"]);
    }
    // Hidden by a character style, or by the document's defaults (the text shown by its own formats).
    const styles = '<w:style w:type="character" w:styleId="Cache"><w:rPr><w:specVanish/></w:rPr></w:style>';
    expect(await read(docx(paragraph(run("Médecin anesthésiste ") + '<w:r><w:rPr><w:rStyle w:val="Cache"/></w:rPr><w:br/></w:r>' + run("Réanimateur")), { styles }))).toEqual(["Médecin anesthésiste Réanimateur"]);
    const defaults = '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:webHidden/></w:rPr></w:rPrDefault></w:docDefaults>';
    const shown = '<w:webHidden w:val="0"/>';
    expect(await read(docx(paragraph(run("Médecin anesthésiste ", shown) + tab() + run("Réanimateur", shown), far), { defaults }))).toEqual(["Médecin anesthésiste Réanimateur"]);
  });

  it("un saut de ligne ou un retour chariot montrés sont un saut de ligne, que mammoth n’écrivait pas", async () => {
    for (const element of ["<w:br/>", "<w:cr/>"]) {
      // Before: « Médecin anesthésisteRéanimateur ».
      expect(await read(docx(paragraph(`<w:r><w:t>Médecin anesthésiste</w:t>${element}<w:t>Réanimateur</w:t></w:r>`))), element).toEqual(["Médecin anesthésiste", "Réanimateur"]);
    }
  });

  it("une marque de paragraphe cachée, par le paragraphe ou par son style : le paragraphe lu avec le suivant, comme Word les montre", async () => {
    const hiddenMark = "<w:rPr><w:vanish/></w:rPr>";
    const body = paragraph(run("Médecin anesthésiste "), hiddenMark) + paragraph(run("· Réanimateur "), hiddenMark) + paragraph(run("· Licence DHA")) + paragraph(run("Anglais courant"));
    // Before: four paragraphs, four lines.
    expect(await read(docx(body))).toEqual(["Médecin anesthésiste · Réanimateur · Licence DHA", "Anglais courant"]);
    const styles = '<w:style w:type="paragraph" w:styleId="Suite"><w:rPr><w:vanish/></w:rPr></w:style>';
    expect(await read(docx(paragraph(run("Médecin anesthésiste "), '<w:pStyle w:val="Suite"/>') + paragraph(run("Réanimateur")), { styles }))).toEqual(["Médecin anesthésiste Réanimateur"]);
    // Its text shown, the mark hidden only: the last paragraph of a cell is not read with the next cell's.
    const cells = table([[[4000, paragraph(run("Médecin anesthésiste"), hiddenMark)], [4000, paragraph(run("Réanimateur"))]]], 108);
    expect(await read(docx(cells))).toEqual(["Médecin anesthésiste", "Réanimateur"]);
  });
});

describe("cellules d’une rangée dont les textes sont sur une ligne sans grand écart, lues comme une ligne (IA-04)", () => {
  // Arial 11 pt: « Médecin anesthésiste » (106.5 pt) fills a cell of 110 pt without margins: the next cell's text starts 3.5 pt after it.
  const pieces: Array<[number, string]> = [[2200, "Médecin anesthésiste"], [1400, "· Réanimateur"], [2200, "· 10 ans d’expérience"], [1500, "· Licence DHA"]];
  const one = (text: string) => paragraph(run(text));

  it("chaque cellule d’un paragraphe d’une ligne : une ligne, même suivie de paragraphes vides ; un grand écart sépare", async () => {
    expect(await read(docx(table([pieces.map(([width, text]) => [width, one(text)])])))).toEqual(["Médecin anesthésiste · Réanimateur · 10 ans d’expérience · Licence DHA"]);
    // Each cell's paragraph followed by an empty one (before: four lines).
    expect(await read(docx(table([pieces.map(([width, text]) => [width, one(text) + paragraph("") + "<w:p/>"])])))).toEqual(["Médecin anesthésiste · Réanimateur · 10 ans d’expérience · Licence DHA"]);
    // Two columns far apart, with Word's margins: two lines.
    expect(await read(docx(table([[[5000, one("Spécialité : anesthésie-réanimation")], [4600, one("Médecin anesthésiste-réanimateur")]]], 108)))).toEqual(["Spécialité : anesthésie-réanimation", "Médecin anesthésiste-réanimateur"]);
    // A table that gives no width (no w:tcW, no w:tblGrid), Word fitting its columns to their text: what is not measured is never
    // apart, one line.
    const unsized = `<w:tbl><w:tr>${pieces.map(([, text]) => `<w:tc>${one(text)}</w:tc>`).join("")}</w:tr></w:tbl>`;
    expect(await read(docx(unsized))).toEqual(["Médecin anesthésiste · Réanimateur · 10 ans d’expérience · Licence DHA"]);
  });

  it("des cellules d’autant de paragraphes d’une ligne pareils : les paragraphes de même rang ensemble ; une cellule qui contient un tableau reste à part", async () => {
    const twoEach = pieces.map(([width, text]) => [width, one(text) + one(".")] as [number, string]);
    expect(await read(docx(table([twoEach])))).toEqual(["Médecin anesthésiste · Réanimateur · 10 ans d’expérience · Licence DHA", ". . . ."]);
    const nested = table([[[1400, one("Réanimateur")]]]);
    expect(await read(docx(table([[[2200, one("Médecin anesthésiste")], [1400, nested]]])))).toEqual(["Médecin anesthésiste", "Réanimateur"]);
  });

  it("un U+E000 écrit dans le document ne réunit rien, et aucun marqueur ne reste dans le texte", async () => {
    // A marker of an earlier reading, or one written by hand: the text as written.
    const typed = "Médecin anesthésiste \uE0000123456789abcdefS\uE001";
    const lines = await read(docx(one(typed) + one("Réanimateur") + table([pieces.map(([width, text]) => [width, one(text)])])));
    expect(lines).toEqual([typed, "Réanimateur", "Médecin anesthésiste · Réanimateur · 10 ans d’expérience · Licence DHA"]);
    const laidOut = docxWithLaidOutLineBreaks(docx(table([pieces.map(([width, text]) => [width, one(text)])])));
    const other = docxWithLaidOutLineBreaks(docx(table([pieces.map(([width, text]) => [width, one(text)])])));
    // Drawn anew at each reading.
    expect(laidOut.marker).toMatch(/^\uE000[0-9a-z]{16}$/);
    expect(other.marker).not.toBe(laidOut.marker);
    const raw = (await mammoth.extractRawText({ buffer: laidOut.buffer })).value;
    expect(joinMarkedLines(raw, other.marker)).toContain(laidOut.marker);
    expect(joinMarkedLines(raw, laidOut.marker)).not.toMatch(/[\uE000\uE001]/);
  });
});

describe("ce que la mise en page ne peut pas suivre, et ce qu’elle ne change pas (IA-04)", () => {
  const far = stops([8000]);
  const pieces: Array<[number, string]> = [[2200, "Médecin anesthésiste"], [1400, "· Réanimateur"]];

  it("un préfixe autre que w: : le même document, lu de même", async () => {
    const body = paragraph(run("Karim Benali") + tab() + run("2012-2024"), far) + table([pieces.map(([width, text]) => [width, paragraph(run(text))])]);
    const expected = ["Karim Benali", "2012-2024", "Médecin anesthésiste · Réanimateur"];
    expect(await read(docx(body))).toEqual(expected);
    // Before: the cells on two lines, the tab a tab (a space) whatever its width.
    expect(await read(docx(body, { prefix: "x" }))).toEqual(expected);
  });

  it("au-delà du budget de mise en page : chaque tabulation une espace, chaque rangée une ligne ; les sauts de ligne et ce qui est caché comme avant", async () => {
    const body = paragraph(run("Karim Benali") + tab() + run("2012-2024"), far) + paragraph(`<w:r><w:t>Titre</w:t><w:br/><w:t>Spécialité</w:t></w:r>`)
      + table([[[5000, paragraph(run("Spécialité : anesthésie-réanimation")) + paragraph(run("Langues"))], [4600, paragraph(run("Médecin anesthésiste-réanimateur"))]]], 108);
    expect(await read(docx(body))).toEqual(["Karim Benali", "2012-2024", "Titre", "Spécialité", "Spécialité : anesthésie-réanimation", "Langues", "Médecin anesthésiste-réanimateur"]);
    const limits = { ...DOCUMENT_DECOMPRESSION_LIMITS, docxLayoutWorkUnits: 10 };
    expect(await read(docx(body), limits)).toEqual(["Karim Benali 2012-2024", "Titre", "Spécialité", "Spécialité : anesthésie-réanimation Langues Médecin anesthésiste-réanimateur"]);
  });

  it("les mêmes caractères que mammoth lit du document, seuls les blancs et l’ordre changent ; un document sans rien à écrire est rendu tel quel", async () => {
    const file = docx(paragraph(run("Karim Benali") + tab() + run("2012-2024"), far) + paragraph(`<w:r><w:t>Titre</w:t><w:br/><w:t>Spécialité</w:t></w:r>`)
      + table([pieces.map(([width, text]) => [width, paragraph(run(text)) + paragraph(run("."))])]) + paragraph(run("Fin "), "<w:rPr><w:vanish/></w:rPr>") + paragraph(run("du CV")));
    const before = (await mammoth.extractRawText({ buffer: file })).value;
    expect(characters((await read(file)).join("\n"))).toBe(characters(before));
    const plain = docx(paragraph(run("Karim Benali")));
    expect(docxWithLaidOutLineBreaks(plain).buffer).toBe(plain);
  });
});
