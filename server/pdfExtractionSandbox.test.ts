import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DOCUMENT_DECOMPRESSION_LIMITS } from "./documentDecompressionLimits";
import { readPdfIsolated, rowsTogether, textCellsAsLines, wrappedLinesTogether } from "./pdfExtractionSandbox";
import { validateCvFile } from "./recruitmentFileValidation";

/** A one-page PDF whose page content is the given stream (with a valid xref table). */
function onePagePdf(contentDictionary: string, payload: Buffer) {
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let position = 0;
  const push = (chunk: Buffer | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "latin1");
    parts.push(buffer);
    position += buffer.length;
  };
  push("%PDF-1.7\n");
  offsets[1] = position; push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  offsets[2] = position; push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n");
  offsets[3] = position; push("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj\n");
  offsets[4] = position; push(`4 0 obj << ${contentDictionary} /Length ${payload.length} >>\nstream\n`); push(payload); push("\nendstream\nendobj\n");
  offsets[5] = position; push("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n");
  const xref = position;
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}

function textContent(bytes: number) {
  const unit = Buffer.from("BT /F1 12 Tf 72 712 Td (Dr Candidat fictif - anesthesie reanimation) Tj ET\n");
  const content = Buffer.alloc(bytes);
  for (let offset = 0; offset < bytes; offset += unit.length) unit.copy(content, offset, 0, Math.min(unit.length, bytes - offset));
  return content;
}

describe("lecteur PDF isolé : la décompression réelle est bornée", () => {
  it("lit le texte d’un PDF normal dans le worker", async () => {
    const pdf = onePagePdf("/Filter /FlateDecode", deflateSync(textContent(400)));
    const reading = await readPdfIsolated(pdf, { kind: "text", first: 25 });
    expect(reading.total).toBe(1);
    expect(reading.pages[0]!.text).toContain("Dr Candidat fictif");
  });

  it("arrête un PDF piégé que le contrôle statique ne voit pas (ASCIIHex puis Flate) et le refuse définitivement", async () => {
    // 40 MB of page content behind a filter chain the static check does not decode.
    const hidden = Buffer.from(`${deflateSync(textContent(40 * 1024 * 1024)).toString("hex")}>`, "latin1");
    const pdf = onePagePdf("/Filter [/ASCIIHexDecode /FlateDecode]", hidden);
    expect(pdf.length).toBeLessThan(400 * 1024);
    expect(validateCvFile({ buffer: pdf, mimeType: "application/pdf", originalName: "cv.pdf", size: pdf.length }).pageCount).toBe(1);

    const limits = { ...DOCUMENT_DECOMPRESSION_LIMITS, pdfReaderMaxMemoryGrowthBytes: 192 * 1024 * 1024, pdfTextTimeoutMs: 2_500 };
    const startedAt = Date.now();
    await expect(readPdfIsolated(pdf, { kind: "text", first: 25 }, limits)).rejects.toThrow(/^cv_validation_pdf_(decompressed_size_exceeded|processing_timeout)$/);
    expect(Date.now() - startedAt).toBeLessThan(6_000);
  }, 20_000);
});

describe("cellules d’une rangée et colonnes côte à côte lues comme des lignes (IA-04)", () => {
  /** pdf.js's text items of one line: words of 11 pt, each gap a whitespace item as wide as it, then the end of the line. */
  const line = (...parts: Array<string | number>) => [
    ...parts.map(part => typeof part === "number" ? { str: " ", width: part, height: 0, hasEOL: false } : { str: part, width: part.length * 5, height: 11, hasEOL: false }),
    { str: "", width: 0, height: 0, hasEOL: true },
  ];
  /** The page text as pdf-parse writes it: each item, a line break at each end of line. */
  const read = (items: ReturnType<typeof line>) => textCellsAsLines({ items }).items.map(item => (item.hasEOL ? "\n" : item.str)).join("");

  it("met une ligne à un grand écart entre deux textes, jamais aux espaces réguliers d’une ligne justifiée, et ne change rien d’autre", () => {
    // Two cells of a row, or two columns: one wide gap.
    expect(read(line("Spécialité : anesthésie-réanimation", 21.4, "Médecin anesthésiste-réanimateur"))).toBe("Spécialité : anesthésie-réanimation\nMédecin anesthésiste-réanimateur\n");
    // A wide gap twice as wide as the others of its line, the justified spaces of a column beside it.
    expect(read(line("Anglais courant (C1)", 80, "2012-2024", 12.2, ":", 12.2, "Praticien"))).toBe("Anglais courant (C1)\n2012-2024 : Praticien\n");
    // The even spaces of a justified line, up to two and a half em, and a gap under one em, stay spaces.
    expect(read(line("continue", 17.1, "en", 17.1, "anesthésie-réanimation", 17.1, "pédiatrique"))).toBe("continue en anesthésie-réanimation pédiatrique\n");
    expect(read(line("Médecin", 8, "anesthésiste"))).toBe("Médecin anesthésiste\n");
    // From two and a half em, even gaps are columns.
    expect(read(line("Nom", 30, "Prénom", 30, "Ville"))).toBe("Nom\nPrénom\nVille\n");
    // A gap with no text before it on its line (an indent) or after it stays.
    expect(read([{ str: "", width: 0, height: 0, hasEOL: true }, ...line(40, "Retrait", 40)])).toBe("\n Retrait \n");
    // Each line on its own: a gap is compared with those of its line only.
    expect(read([...line("Titre", 12, "court"), ...line("mot", 30, "mot", 30, "mot")])).toBe("Titre\ncourt\nmot\nmot\nmot\n");
    const unchanged = { items: line("Sans", 3, "écart") };
    expect(textCellsAsLines(unchanged)).toBe(unchanged);
  });
});

describe("ligne dessinée en morceaux entre les autres lignes lue d’un tenant, en-tête et pied de page au bord de leur page (IA-04)", () => {
  /** A piece of text drawn at (x, y), 5 pt a character, 9 pt high; `eol`: pdf.js ends the line after it. */
  const at = (str: string, x: number, y: number, eol = false) => ({ str, width: str.length * 5, height: 9, transform: [9, 0, 0, 9, x, y], hasEOL: eol });
  /** The end of line pdf.js writes between two pieces drawn on different rows. */
  const end = { str: "", width: 0, height: 0, transform: [1, 0, 0, 1, 0, 0], hasEOL: true };
  /** The page text as pdf-parse writes it: each item, a line break at each end of line. */
  const read = (content: { items: readonly unknown[] }) => (content.items as Array<{ str: string; hasEOL: boolean }>).map(item => item.str + (item.hasEOL ? "\n" : "")).join("");
  const footer = ["Médecin", "Réanimateur", "Licence"];
  // Each piece starts 10 pt after the end of the one before it on the footer's row.
  const footerAt = [50, 95, 160];
  const piece = (index: number, eol = false, y = 40) => at(footer[index]!, footerAt[index]!, y, eol);
  const body = (text: string, y: number) => at(text, 50, y, true);

  it("rassemble les morceaux d’un pied de page répété, dans leur ordre sur la ligne, et le met au bas de sa page", () => {
    const pages = [
      // Each piece between two lines of the body.
      { items: [piece(0), end, body("Soins 1", 780), piece(1), end, body("Soins 2", 760), piece(2), end, body("Soins 3", 740)] },
      // Drawn from the last piece, two of them together.
      { items: [body("Soins 4", 780), piece(2), end, body("Soins 5", 760), piece(1), piece(0, true), body("Soins 6", 740)] },
      // Drawn at once, between two lines of the body.
      { items: [body("Soins 7", 780), piece(0), piece(1), piece(2, true), body("Soins 8", 760)] },
    ];
    const [first, second, third] = rowsTogether(pages);
    // Before: « Médecin\nSoins 1\nRéanimateur\nSoins 2… », a line per piece, grouped differently on each page.
    expect(read(first!)).toBe("Soins 1\nSoins 2\nSoins 3\nMédecin Réanimateur Licence\n");
    expect(read(second!)).toBe("Soins 4\nSoins 5\nSoins 6\nMédecin Réanimateur Licence\n");
    expect(read(third!)).toBe("Soins 7\nSoins 8\nMédecin Réanimateur Licence\n");
    // The space put between two pieces is as wide as the gap between them, on their row.
    expect(first!.items).toContainEqual({ str: " ", width: 10, height: 0, transform: [9, 0, 0, 9, 85, 40], hasEOL: false });
  });

  it("rassemble aussi une ligne écrite une seule fois, sur une page ou sur la dernière, là où est dessiné son premier morceau", () => {
    // The nurse's only claim, drawn piece by piece between the lines of a one-page CV: one line, not three.
    const page = { items: [piece(0, false, 300), end, body("Karim Benali", 780), piece(1, false, 300), end, body("Infirmier", 760), piece(2, true, 300), body("Soins 1", 740)] };
    const [read1] = rowsTogether([page]);
    expect(read(read1!)).toBe("Médecin Réanimateur Licence\nKarim Benali\nInfirmier\nSoins 1\n");
    const [, last] = rowsTogether([{ items: [body("Parcours", 780)] }, page]);
    expect(read(last!)).toBe("Médecin Réanimateur Licence\nKarim Benali\nInfirmier\nSoins 1\n");
  });

  it("laisse deux colonnes dessinées l’une après l’autre, les lignes du corps répétées à la même hauteur, et le texte tourné", () => {
    // Two columns: the left one, then the right one, each row of the page drawn in two pieces one em apart or more.
    const columns = { items: [at("Spécialité", 50, 780, true), at("Langues", 50, 760, true), at("Titre", 300, 780, true), at("Anglais", 300, 760, true)] };
    const other = { items: [at("Expérience", 50, 780, true), at("CHU", 300, 780, true)] };
    const result = rowsTogether([columns, other]);
    expect(result[0]).toBe(columns);
    expect(result[1]).toBe(other);
    // The same role in two experiences, at the same height on two pages, between other lines of the body: not a header.
    const role = (page: number) => ({ items: [body(`Hôpital ${page}`, 780), body("Médecin", 760), body(`Service ${page}`, 740)] });
    const pages = [role(1), role(2)];
    expect(rowsTogether(pages)).toEqual(pages);
    // Rotated text, or text without a position, is never moved.
    const rotated = { items: [{ ...piece(0), transform: [0, 9, -9, 0, 50, 40] }, end, body("Soins", 780), { ...piece(1), transform: [0, 9, -9, 0, 95, 40] }] };
    expect(rowsTogether([rotated, rotated])[0]).toBe(rotated);
  });

  it("rassemble une ligne dont les morceaux ne sont séparés que par des fins de ligne : dessinée de droite à gauche, ou chaque morceau suivi d’une fin de ligne", () => {
    // Before (843ab77): a line written on one page only was left in pieces, a line each.
    const reversed = { items: [body("Karim Benali", 780), piece(2, true, 300), piece(1, true, 300), piece(0, true, 300), body("Soins 1", 280)] };
    expect(read(rowsTogether([reversed])[0]!)).toBe("Karim Benali\nMédecin Réanimateur Licence\nSoins 1\n");
    const ended = { items: [body("Karim Benali", 780), piece(0), { ...end, transform: [1, 0, 0, 1, 85, 300] }, piece(1), { ...end, transform: [1, 0, 0, 1, 150, 300] }, piece(2, true)].map(item => ({ ...item, transform: item.str === "" ? item.transform : [9, 0, 0, 9, item.transform[4], item.str === "Karim Benali" ? 780 : 300] })) };
    expect(read(rowsTogether([ended])[0]!)).toBe("Karim Benali\nMédecin Réanimateur Licence\n");
    // A line drawn at once is left as it is: the same object.
    const once = { items: [body("Karim Benali", 780), piece(0, false, 300), piece(1, false, 300), piece(2, true, 300)] };
    expect(rowsTogether([once])[0]).toBe(once);
  });

  it("met une ligne d’arabe ou d’hébreu rassemblée dans l’ordre de droite à gauche", () => {
    // « طبيب تخدير » (anaesthetist): its first word on the right, drawn after the second, the body's line between them.
    const page = { items: [at("تخدير", 100, 300), end, body("Karim Benali", 780), at("طبيب", 128, 300, true)] };
    expect(read(rowsTogether([page])[0]!)).toBe("طبيب تخدير\nKarim Benali\n");
  });

  it("reste en O(n log n) des éléments : 25 pages de 2 000 rangées de trois morceaux, du même texte ou non, en moins de 2 s", () => {
    for (const same of [true, false]) {
      const pages = Array.from({ length: 25 }, (_, page) => ({
        items: Array.from({ length: 2000 }, (_, row) => [
          at(same ? "x" : `ligne ${row} page ${page}`, 50, 800 - row * 0.4),
          { str: " ", width: 2, height: 9, transform: [9, 0, 0, 9, 110, 800 - row * 0.4], hasEOL: false },
          at("aaaa bbbb cccc", 112, 800 - row * 0.4, true),
        ]).flat(),
      }));
      const started = performance.now();
      const result = rowsTogether(pages);
      expect(performance.now() - started, same ? "same" : "text").toBeLessThan(2000);
      // Only the order of the items may change.
      expect(result.reduce((total, page) => total + page.items.filter(item => (item as { str: string }).str.trim()).length, 0)).toBe(25 * 2000 * 2);
    }
  });
});

describe("lignes d’un paragraphe coupées faute de place lues comme une ligne (IA-04)", () => {
  /** A line of text at (x, y), 5.5 pt a character, 11 pt high, then its end of line. */
  const line = (str: string, x: number, y: number) => [
    { str, width: str.length * 5.5, height: 11, transform: [11, 0, 0, 11, x, y], hasEOL: false },
    { str: "", width: 0, height: 0, transform: [1, 0, 0, 1, x, y - 14.6], hasEOL: true },
  ];
  /** A page of US Letter: its text as pdf-parse writes it, an item after the other, a line break at each end of line, a tab at a jump. */
  const read = (items: unknown[]) => {
    const content = wrappedLinesTogether({ items }, { box: [0, 0, 612, 792], rotation: 0 });
    let text = "";
    let y: number | undefined;
    for (const item of content.items as Array<{ str: string; hasEOL: boolean; transform: number[] }>) {
      if (y !== undefined && Math.abs(y - item.transform[5]!) > 4.6 && !text.endsWith("\n") && item.str.trim() !== "") text += "\n";
      text += item.str + (item.hasEOL ? "\n" : "");
      y = item.transform[5];
    }
    return text;
  };
  // 78 characters of 5.5 pt from x = 90: the line ends at 519, by the right margin of 522 the page's left margin of 90 leaves.
  const full = "Médecin anesthésiste-réanimateur depuis 2012 au CHU de Lyon, bloc opératoire,";

  it("rejoint la ligne suivante d’un paragraphe, à l’interligne serré et sous le même bord, quand son premier mot ne tenait plus", () => {
    const items = [...line(full, 90, 700), ...line("réanimation polyvalente et gardes.", 90, 685.4), ...line("2012-2024 : CHU de Lyon", 90, 660.8)];
    expect(read(items)).toBe(`${full} réanimation polyvalente et gardes.\n2012-2024 : CHU de Lyon\n`);
    // After a hyphen, no space.
    const hyphen = [...line("Médecin anesthésiste-réanimateur depuis 2012 au CHU de Lyon, spécialité anesthésie-", 90, 700), ...line("réanimation.", 90, 685.4), ...line("Anglais courant", 90, 660.8)];
    expect(read(hyphen)).toContain("anesthésie-réanimation.\n");
  });

  it("laisse une ligne courte, un nouvel alinéa (interligne plus large), un élément de liste, une autre colonne ; ne change rien d’autre", () => {
    // A short line: the next word would have fitted.
    const short = [...line("Médecin anesthésiste-réanimateur", 90, 700), ...line("Spécialité : anesthésie-réanimation", 90, 685.4), ...line(full, 90, 660.8), ...line("suite", 90, 646.2)];
    expect(read(short)).toBe(`Médecin anesthésiste-réanimateur\nSpécialité : anesthésie-réanimation\n${full} suite\n`);
    // A full line, then the next paragraph, under the paragraph spacing.
    const spaced = [...line(full, 90, 700), ...line("Spécialité : anesthésie-réanimation", 90, 675.4), ...line(full, 90, 650.8), ...line("suite", 90, 636.2)];
    expect(read(spaced)).toBe(`${full}\nSpécialité : anesthésie-réanimation\n${full} suite\n`);
    // A list item, or a line starting under another column.
    const list = [...line(full, 90, 700), ...line("• Spécialité : anesthésie-réanimation", 90, 685.4), ...line(full, 90, 660.8), ...line("Titre", 300, 646.2)];
    expect(read(list)).toBe(`${full}\n• Spécialité : anesthésie-réanimation\n${full}\nTitre\n`);
    const unchanged = { items: line("Sans suite", 90, 700) };
    expect(wrappedLinesTogether(unchanged, { box: [0, 0, 612, 792] })).toBe(unchanged);
    // Only the place of the items changes, and the ends of line between the lines of a paragraph: the same text otherwise.
    const items = [...line(full, 90, 700), ...line("réanimation polyvalente et gardes.", 90, 685.4)];
    const characters = (value: unknown[]) => (value as Array<{ str: string }>).map(item => item.str).join("").replace(/\s+/g, "");
    expect(characters(wrappedLinesTogether({ items }, { box: [0, 0, 612, 792] }).items)).toBe(characters(items));
  });

  it("laisse une page tournée, et une page dont la recherche des lignes voisines dépasse son budget : aucune jonction, le même objet", () => {
    const content = { items: [...line(full, 90, 700), ...line("réanimation polyvalente et gardes.", 90, 685.4)] };
    expect(wrappedLinesTogether(content, { box: [0, 0, 612, 792], rotation: 90 })).toBe(content);
    // 3 000 full lines of one column: each line's neighbours are all the others, past the budget.
    const crowded = { items: Array.from({ length: 3000 }, (_, index) => line(full, 90, 700 - index * 14.6)).flat() };
    expect(wrappedLinesTogether(crowded, { box: [0, 0, 612, 792] })).toBe(crowded);
  });

  it("25 pages de 1 000 lignes, d’un même texte ou non, en moins de 2 s", () => {
    for (const same of [true, false]) {
      const pages = Array.from({ length: 25 }, (_, page) => ({ items: Array.from({ length: 1000 }, (_, index) => line(same ? full : `${full} ${page} ${index}`, 90, 780 - index * 0.75)).flat() }));
      const started = performance.now();
      for (const page of pages) wrappedLinesTogether(page, { box: [0, 0, 612, 792] });
      expect(performance.now() - started, same ? "same" : "text").toBeLessThan(2000);
    }
  });
});
