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
  const document = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W_NAMESPACE}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:v="urn:schemas-microsoft-com:vml"><w:body>${body}${SECTION}</w:body></w:document>`;
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

  it("une police de largeur non bornée, w:fitText, une image flottante ou le résultat d’un champ avant la tabulation : une espace, même loin", async () => {
    const far = stops([8000]);
    expect(await read(docx(tabbed(far)))).toEqual([title, "Réanimateur"]);
    for (const properties of ['<w:rFonts w:ascii="Wide Latin" w:hAnsi="Wide Latin"/>', '<w:rFonts w:ascii="Lato Black" w:hAnsi="Lato Black"/>', '<w:fitText w:val="2000" w:id="1"/>']) {
      expect(await read(docx(tabbed(far, title, "Réanimateur", properties))), properties).toEqual([`${title} Réanimateur`]);
    }
    // A run of a complex script, in its complex script font (here none: bounded as an unknown font), and a picture in the line, as
    // wide as its extent, are measured (IA04-P1-DOCX-NONMESURE); a floating picture is not.
    expect(await read(docx(tabbed(far, title, "Réanimateur", "<w:rtl/>")))).toEqual([title, "Réanimateur"]);
    const drawing = '<w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/></wp:inline></w:drawing></w:r>';
    expect(await read(docx(paragraph(drawing + run(title) + tab() + run("Réanimateur"), far)))).toEqual([title, "Réanimateur"]);
    const floating = '<w:r><w:drawing><wp:anchor><wp:extent cx="100" cy="100"/></wp:anchor></w:drawing></w:r>';
    expect(await read(docx(paragraph(floating + run(title) + tab() + run("Réanimateur"), far)))).toEqual([`${title} Réanimateur`]);
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

describe("ce que Word ne montre pas d’un champ, les fins de ligne écrites dans un run, les cadres et les zones de texte d’une ligne, les écritures sans métrique (IA-04)", () => {
  const claims = ["Médecin anesthésiste ·", "Réanimateur ·", "Licence DHA"];
  const field = (code: string) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> QUOTE "</w:instrText></w:r>${code}<w:r><w:instrText xml:space="preserve">" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(" ")}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

  it("un saut de ligne ou une tabulation du code d’un champ, entre son début et son séparateur, n’est rien : Word n’en montre que le résultat (IA04-R4-CHAMP)", async () => {
    // Before (d1fe5af): a line break each, a line per claim, 30 points and a score of 60.
    const lines = await read(docx(paragraph(run(claims[0]!) + field("<w:r><w:br/></w:r>") + run(claims[1]!) + field(tab()) + run(claims[2]!), stops([9000]))));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.replace(/\s+/g, " ")).toBe("Médecin anesthésiste · Réanimateur · Licence DHA");
    // The result of a field is shown: a line break there is one.
    const result = `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> QUOTE x </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:br/></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    expect(await read(docx(paragraph(run(claims[0]!) + result + run(claims[1]!))))).toEqual([claims[0], claims[1]]);
  });

  it("une fin de ligne écrite dans le texte d’un run (&#10;, U+2028, U+2029, U+0085, un saut littéral) se lit comme une espace ; &#13; reste ce qu’il est (IA04-R4-CARACTERES)", async () => {
    for (const separator of ["&#10;", "&#xA;", " ", " ", "\u0085", "&#133;", "\n"]) {
      const text = `<w:r><w:t xml:space="preserve">${claims.join(separator)}</w:t></w:r>`;
      // Before: mammoth wrote each as a line's end, a line per claim.
      expect((await read(docx(paragraph(text)))).map(line => line.replace(/\s+/g, " ")), JSON.stringify(separator)).toEqual(["Médecin anesthésiste · Réanimateur · Licence DHA"]);
    }
    expect(await read(docx(paragraph(`<w:r><w:t xml:space="preserve">${claims.join("&#13;")}</w:t></w:r>`)))).toEqual([claims.join("\r")]);
  });

  it("des cadres côte à côte à une même hauteur sans grand écart : une ligne ; un grand écart, ou les paragraphes d’un même cadre, des lignes (IA04-R4-CADRES)", async () => {
    const framed = (text: string, x: number, width: number, y = 6000) => paragraph(run(text), `<w:framePr w:w="${width}" w:hSpace="0" w:wrap="around" w:vAnchor="page" w:hAnchor="page" w:x="${x}" w:y="${y}"/>`);
    // Arial 11 pt: each frame as wide as its text, the next one right after it. Before: a line per frame, 30 points and a score of 60.
    const side = framed("Médecin anesthésiste · ", 1134, 2400) + framed("Réanimateur · ", 3534, 1450) + framed("Licence DHA", 4984, 1500);
    expect((await read(docx(side))).map(line => line.replace(/\s+/g, " "))).toEqual(["Médecin anesthésiste · Réanimateur · Licence DHA"]);
    // Two columns far apart, the frames of one column one under the other: lines of their own.
    expect(await read(docx(framed("Titre", 1134, 1500) + framed("Spécialité", 8000, 1500)))).toEqual(["Titre", "Spécialité"]);
    expect(await read(docx(framed("Titre", 1134, 3000) + framed("Spécialité", 1134, 3000)))).toEqual(["Titre", "Spécialité"]);
    expect(await read(docx(framed("Titre", 1134, 3000) + framed("Spécialité", 5000, 3000, 7000)))).toEqual(["Titre", "Spécialité"]);
  });

  it("des zones de texte dessinées dans la ligne d’un paragraphe, d’une ligne chacune : une ligne avec son texte ; flottantes, des lignes (IA04-R4-CADRES)", async () => {
    const box = (text: string, style = "width:120pt;height:16pt") => `<w:r><w:pict><v:shape style="${style}" stroked="f" filled="f"><v:textbox inset="0,0,0,0"><w:txbxContent>${paragraph(run(text))}</w:txbxContent></v:textbox></v:shape></w:pict></w:r>`;
    // Before: mammoth wrote each box's paragraph after the paragraph that draws it, a line each.
    expect((await read(docx(paragraph(claims.map(text => box(text)).join("")))))).toHaveLength(1);
    expect((await read(docx(paragraph(box(claims[0]!) + run(" Réanimateur · Licence DHA")))))[0]!.replace(/\s+/g, " ")).toBe("Réanimateur · Licence DHA Médecin anesthésiste ·");
    // Floating boxes edge to edge at one height (IA04-R5-CADRES-BIS): one line. Before (2e58bec): a line each, 30 points and a score.
    const at = (text: string, left: number, top = 4, width = 120) => box(text, `position:absolute;margin-left:${left}pt;margin-top:${top}pt;width:${width}pt;height:16pt;mso-position-horizontal-relative:text;mso-position-vertical-relative:text`);
    // Arial 11 pt: the claims are 113.1, 69.7 and 64.2 pt wide; each box as wide as its claim and a space.
    const lefts = [0, 116, 189];
    const sizes = [116, 73, 75];
    const floating = claims.map((text, index) => at(text, lefts[index]!, 4, sizes[index])).join("");
    expect((await read(docx(paragraph(floating)))).map(line => line.replace(/\s+/g, " "))).toEqual(["Médecin anesthésiste · Réanimateur · Licence DHA"]);
    // Drawn in another order than they lie: still one line, as they are shown.
    expect(await read(docx(paragraph(at(claims[2]!, 189, 4, 75) + at(claims[0]!, 0) + at(claims[1]!, 116, 4, 75))))).toHaveLength(1);
    // At heights a line apart, or far apart on a line, or too narrow for their text: lines of their own.
    expect(await read(docx(paragraph(claims.map((text, index) => at(text, lefts[index]!, 4 + index * 16)).join(""))))).toHaveLength(3);
    expect(await read(docx(paragraph(at(claims[0]!, 0) + at(claims[1]!, 340))))).toHaveLength(2);
    expect(await read(docx(paragraph(at(claims[0]!, 0, 4, 40) + at(claims[1]!, 40, 4, 40))))).toHaveLength(2);
  });

  it("une lettrine se lit avec le paragraphe qu’elle ouvre ; des cadres alignés à gauche et à droite de la marge, loin l’un de l’autre, restent deux lignes (IA04-R5-CADRES-BIS, IA04-R5-CADRES-ALIGN)", async () => {
    // A drop cap in the text or in the margin, one line high. Before (2e58bec): its own line, 30 specialty points.
    for (const kind of ["drop", "margin"]) {
      const dropCap = paragraph(run("Médecin anesthésiste · "), `<w:framePr w:dropCap="${kind}" w:lines="1" w:wrap="around" w:vAnchor="text" w:hAnchor="text"/>`);
      expect((await read(docx(dropCap + paragraph(run("Réanimateur · Licence DHA"))))).map(line => line.replace(/\s+/g, " ")), kind).toEqual(["Médecin anesthésiste · Réanimateur · Licence DHA"]);
    }
    // Title and specialty in frames of known widths aligned on the left and on the right margin: placed, far apart, two lines.
    // Before (2e58bec): a frame placed by its alignment was never apart, one line, 15 points in DOCX and 30 in PDF.
    const aligned = (text: string, align: string, width: number) => paragraph(run(text), `<w:framePr w:w="${width}" w:wrap="around" w:vAnchor="text" w:hAnchor="margin" w:xAlign="${align}" w:y="1"/>`);
    expect(await read(docx(aligned("Médecin anesthésiste-réanimateur", "left", 4800) + aligned("Spécialité : anesthésie-réanimation", "right", 4200)))).toEqual(["Médecin anesthésiste-réanimateur", "Spécialité : anesthésie-réanimation"]);
    // Aligned right after the other, a centred frame next to a left one: one line where no wide gap lies between them.
    const centred = paragraph(run("Réanimateur"), '<w:framePr w:w="9638" w:wrap="around" w:vAnchor="text" w:hAnchor="margin" w:xAlign="center" w:y="1"/><w:jc w:val="center"/>');
    expect(await read(docx(aligned("Médecin", "left", 900) + centred))).toHaveLength(2);
    const near = (text: string, x: number, width: number) => paragraph(run(text), `<w:framePr w:w="${width}" w:wrap="around" w:vAnchor="text" w:hAnchor="margin" w:x="${x}" w:y="1"/>`);
    expect(await read(docx(aligned("Médecin anesthésiste · ", "left", 2400) + near("Réanimateur", 2400, 1450)))).toHaveLength(1);
  });

  it("d’un contenu alternatif, lit les sauts de ligne et les fins de paragraphe du choix que Word dessine, pas ceux du repli (IA04-R5-ALTERNATIF)", async () => {
    const line = claims.join(" ");
    const alternate = (choice: string, fallback: string, requires = "w14") => `<mc:AlternateContent xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:x="urn:example:other"><mc:Choice Requires="${requires}">${choice}</mc:Choice><mc:Fallback>${fallback}</mc:Fallback></mc:AlternateContent>`;
    const broken = `<w:r>${claims.map(text => `<w:t xml:space="preserve">${escape(text)}</w:t>`).join("<w:br/>")}</w:r>`;
    // The choice one line, the fallback (what mammoth reads) the same letters with line breaks, or a paragraph each. Before
    // (2e58bec): three lines, 30 points and a score of 60.
    expect(await read(docx(paragraph(alternate(run(line), broken))))).toEqual([claims.join(" ")]);
    expect((await read(docx(alternate(paragraph(run(line)), claims.map(text => paragraph(run(text))).join(""))))).map(line => line.replace(/\s+/g, " "))).toEqual([claims.join(" ")]);
    // The choice with the same breaks, a choice Word does not understand (it draws the fallback), or of other letters: the fallback's.
    expect(await read(docx(paragraph(alternate(broken, broken))))).toEqual(claims);
    expect(await read(docx(paragraph(alternate(run(line), broken, "x"))))).toEqual(claims);
    expect(await read(docx(paragraph(alternate(run("Autre texte"), broken))))).toEqual(claims);
  });

  it("les colonnes d’une section côte à côte, chacune d’une ligne, à une même hauteur et sans grand écart : une ligne (IA04-R5-COLONNES)", async () => {
    const pieces = ["Médecin anesthésiste · ", "Réanimateur · ", "Licence DHA"];
    // Arial 11 pt: each column as wide as its piece, no space between them.
    const widths = [2400, 1450, 5788];
    const columnsXml = (count: number, space = 0, list = true) => `<w:cols w:num="${count}" w:space="${space}"${list ? ` w:equalWidth="0">${widths.slice(0, count).map(width => `<w:col w:w="${width}" w:space="${space}"/>`).join("")}</w:cols>` : "/>"}`;
    const ending = (cols: string, type = "continuous") => `<w:p><w:pPr><w:sectPr><w:type w:val="${type}"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/>${cols}</w:sectPr></w:pPr></w:p>`;
    const columnBreak = '<w:r><w:br w:type="column"/></w:r>';
    const head = paragraph(run("Karim Benali")) + ending("");
    const after = paragraph(run("Soins infirmiers"));
    // A column break after each piece, in one paragraph or a paragraph each. Before (2e58bec): a line each, 30 points and a score.
    const oneParagraph = paragraph(pieces.map(run).join(columnBreak));
    expect((await read(docx(head + oneParagraph + ending(columnsXml(3)) + after))).map(line => line.replace(/\s+/g, " "))).toEqual(["Karim Benali", "Médecin anesthésiste · Réanimateur · Licence DHA", "Soins infirmiers"]);
    const paragraphs = pieces.map((piece, index) => paragraph((index ? columnBreak : "") + run(piece))).join("");
    expect((await read(docx(head + paragraphs + ending(columnsXml(3)) + after))).map(line => line.replace(/\s+/g, " "))).toEqual(["Karim Benali", "Médecin anesthésiste · Réanimateur · Licence DHA", "Soins infirmiers"]);
    // Columns Word balances (the next section starts on the same page), a paragraph each: one line too.
    const balanced = pieces.map(piece => paragraph(run(piece))).join("");
    expect(await read(docx(head + balanced + ending(columnsXml(3)) + after.replace("<w:p>", '<w:p><w:pPr><w:sectPr><w:type w:val="continuous"/></w:sectPr></w:pPr>')))).toHaveLength(3);
    // Two equal columns far apart (the text of each short), or columns of several lines each: lines of their own.
    expect(await read(docx(head + paragraph(run("Titre") + columnBreak + run("Spécialité")) + ending(columnsXml(2, 720, false)) + after))).toEqual(["Karim Benali", "Titre", "Spécialité", "Soins infirmiers"]);
    const long = paragraph(run("Médecin anesthésiste-réanimateur, praticien hospitalier au CHU de Lyon depuis 2012, bloc opératoire") + columnBreak + run("Réanimateur"));
    expect(await read(docx(head + long + ending(columnsXml(2, 0, false)) + after))).toHaveLength(4);
  });

  it("une ligne arabe de longueur courante, puis une tabulation droite à la marge : un saut de ligne, comme l’écart du PDF (IA04-P1-DOCX-NONMESURE)", async () => {
    // Arial 11 pt, right to left, A4: the title and the specialty at a right stop at the margin, an em or more apart however the
    // letters are drawn (each letter by its form, as wide as DejaVu Sans Bold draws it at most). Before (2e58bec): an em a letter, the
    // texts wider than the line, a space: one line in DOCX, PDF 47 and DOCX 32.
    const arabic = (title: string, specialty: string) => paragraph(run(title, "<w:rtl/>") + tab() + run(specialty, "<w:rtl/>"), `${stops([9072, "right"])}<w:bidi/>`);
    expect(await read(docx(arabic("استشاري التخدير والعناية المركزة", "التخصص: تخدير وإنعاش")))).toEqual(["استشاري التخدير والعناية المركزة", "التخصص: تخدير وإنعاش"]);
    // In a font this reading does not know, and when the texts fill the line: a space.
    const unknown = paragraph(run("استشاري التخدير والعناية المركزة", '<w:rFonts w:ascii="Diwani Letter" w:hAnsi="Diwani Letter" w:cs="Diwani Letter"/><w:rtl/>') + tab() + run("التخصص: تخدير وإنعاش", '<w:rFonts w:ascii="Diwani Letter" w:hAnsi="Diwani Letter" w:cs="Diwani Letter"/><w:rtl/>'), `${stops([9072, "right"])}<w:bidi/>`);
    expect(await read(docx(unknown))).toHaveLength(1);
    expect(await read(docx(arabic("استشاري التخدير والعناية المركزة والطوارئ وطب الأطفال", "التخصص: تخدير وعناية مركزة وطب الطوارئ")))).toHaveLength(1);
  });

  it("les idéogrammes, l’arabe, une image en ligne mesurés : une tabulation large et des cellules écartées restent des lignes, comme dans le PDF (IA04-P1-DOCX-NONMESURE)", async () => {
    // Chinese, an ideograph one em: a right stop at the right margin. Before (d1fe5af): not measured, a space, the title and the
    // specialty on one line in DOCX only (PDF 47, DOCX 32).
    expect(await read(docx(paragraph(run("麻醉科主治医师") + tab() + run("专业：麻醉与重症医学"), stops([9600, "right"]))))).toEqual(["麻醉科主治医师", "专业：麻醉与重症医学"]);
    // A stop a few points after the ideographs: a space, as the PDF's narrow gap.
    expect(await read(docx(paragraph(run("麻醉科") + tab() + run("主治医师"), stops([680]))))).toEqual(["麻醉科 主治医师"]);
    // A Chinese table of labels and values.
    expect(await read(docx(table([[[1247, paragraph(run("职称"))], [3288, paragraph(run("麻醉科主治医师"))], [1247, paragraph(run("专业"))], [3288, paragraph(run("麻醉与重症医学"))]]], 108))))
      .toEqual(["职称", "麻醉科主治医师", "专业", "麻醉与重症医学"]);
    // Two cells each starting with an icon (its extent, 9.9 pt): measured, apart.
    const icon = '<w:r><w:drawing><wp:inline><wp:extent cx="125999" cy="125999"/></wp:inline></w:drawing></w:r>';
    expect(await read(docx(table([[[4535, paragraph(icon + run(" Médecin anesthésiste-réanimateur"))], [4535, paragraph(icon + run(" Anesthésie-réanimation"))]]], 108))))
      .toEqual(["Médecin anesthésiste-réanimateur", "Anesthésie-réanimation"]);
    // Arabic, its letters bounded (at most an em): a right-to-left table of two cells, a right-to-left paragraph with a far right stop.
    const arabic = (text: string) => paragraph(run(text, "<w:rtl/>"), "<w:bidi/>");
    const rightToLeft = table([[[4535, arabic("طبيب تخدير وإنعاش")], [4535, arabic("تخدير وإنعاش")]]], 108).replace("<w:tblPr>", "<w:tblPr><w:bidiVisual/>");
    expect(await read(docx(rightToLeft))).toEqual(["طبيب تخدير وإنعاش", "تخدير وإنعاش"]);
    expect(await read(docx(paragraph(run("طبيب تخدير", "<w:rtl/>") + tab() + run("التخصص: تخدير", "<w:rtl/>"), `${stops([9072, "right"])}<w:bidi/>`)))).toEqual(["طبيب تخدير", "التخصص: تخدير"]);
  });
});
