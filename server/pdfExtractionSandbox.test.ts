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

  it("coupe un grand écart d’après la place des textes, l’élément qui finit la ligne compris, et sans élément blanc entre deux textes de droite à gauche (IA04-P1-EOL-ECART)", () => {
    const at = (str: string, x: number, width: number, hasEOL = false) => ({ str, width, height: 11, transform: [11, 0, 0, 11, x, 700], hasEOL });
    /** The text as pdf-parse writes it, each item's own text then a line break at its end of line. */
    const read = (items: Array<ReturnType<typeof at>>) => textCellsAsLines({ items }).items.map(item => item.str + (item.hasEOL ? "\n" : "")).join("");
    // As reportlab draws them: the title, pdf.js's whitespace item, the specialty aligned on the right ending the line. Before
    // (b22e964 to ddcc047): the item ending the line was left out of it, the gap never cut.
    const twoColumns = [at("Médecin anesthésiste-réanimateur", 90, 170), { ...at(" ", 260, 88.9), height: 0 }, at("Spécialité : anesthésie-réanimation", 348.9, 180, true)];
    expect(read(twoColumns)).toBe("Médecin anesthésiste-réanimateur\nSpécialité : anesthésie-réanimation\n");
    // Arabic, drawn from the right without a whitespace item between its cells: a line break is put before the second.
    const rightToLeft = [at("الوظيفة", 478.1, 35.5), at("طبيب تخدير وإنعاش", 309.6, 90.7, true)];
    expect(read(rightToLeft)).toBe("الوظيفة\nطبيب تخدير وإنعاش\n");
    // The same texts a space apart: one line, nothing written.
    const close = { items: [at("Médecin", 90, 40), at("anesthésiste", 133, 60, true)] };
    expect(textCellsAsLines(close)).toBe(close);
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

  it("rassemble une ligne dessinée en morceaux cisaillés, tournée d’une fraction de degré ou de quelques degrés, ou tournée avec sa page (IA04-R4-PENCHE)", () => {
    // The pieces of the nurse's line, drawn between the body's lines, each start along its baseline.
    const along = [0, 45, 110];
    const turned = (angle: number) => {
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      return { items: [0, 1, 2].flatMap(index => [
        { ...piece(index), transform: [9 * cos, 9 * sin, -9 * sin, 9 * cos, 50 + along[index]! * cos, 300 + along[index]! * sin] }, end, body(`Soins ${index}`, 780 - index * 20),
      ]) };
    };
    // Before (d1fe5af): an item whose matrix was not level was never gathered, a line per piece, 30 points and a score of 60.
    for (const angle of [0.2, 3].map(degrees => (degrees * Math.PI) / 180)) {
      expect(read(rowsTogether([turned(angle)])[0]!), String(angle)).toBe("Médecin Réanimateur Licence\nSoins 0\nSoins 1\nSoins 2\n");
    }
    // Each piece slanted by a shear of 0.0005, invisible: its baseline does not move.
    const sheared = { items: [0, 1, 2].flatMap(index => [{ ...piece(index, false, 300), transform: [9, 0, 0.0045, 9, footerAt[index]!, 300] }, end, body(`Soins ${index}`, 780 - index * 20)]) };
    expect(read(rowsTogether([sheared])[0]!)).toBe("Médecin Réanimateur Licence\nSoins 0\nSoins 1\nSoins 2\n");
    // A landscape page shown upright through /Rotate 90: its text drawn turned by a quarter turn, the pieces along x = 541.9.
    const quarter = (text: string, x: number, y: number, eol = false) => ({ str: text, width: text.length * 5, height: 9, transform: [0, 9, -9, 0, x, y], hasEOL: eol });
    const page = { items: [0, 1, 2].flatMap(index => [quarter(footer[index]!, 541.9, footerAt[index]!), end, quarter(`Soins ${index}`, 61.9 + index * 18, 50, true)]) };
    expect(read(rowsTogether([page])[0]!)).toBe("Médecin Réanimateur Licence\nSoins 0\nSoins 1\nSoins 2\n");
  });

  it("met dans sa rangée, sans la couper, un séparateur dessiné après la ligne dans l’écart que pdf.js y écrit en blanc (IA04-R4-SEPARATEURS)", () => {
    const blank = (x: number, width: number) => ({ str: " ", width, height: 0, transform: [9, 0, 0, 9, x, 300], hasEOL: false });
    // The claims drawn at once, a gap of 27 pt for each separator, then the separators drawn last, each gap between two of them a
    // whitespace item of pdf.js as wide as it. Before (d1fe5af): the row was cut at those whitespace items, a line per claim.
    const items = [
      body("Karim Benali", 780),
      at("Médecin", 50, 300), blank(85, 27), at("Réanimateur", 112, 300), blank(167, 27), at("Licence", 194, 300),
      at("•", 98, 300), blank(103, 59), at("•", 180, 300, true),
    ];
    const [read1] = rowsTogether([{ items }]);
    expect(read(read1!)).toBe("Karim Benali\nMédecin • Réanimateur • Licence\n");
    expect(textCellsAsLines(read1!)).toBe(read1);
  });

  it("écrit un pied de page de plusieurs rangées, l’une numérotée, sur une ligne au bas de chaque page", () => {
    const pages = [1, 2, 3].map(number => ({ items: [
      body(`Soins ${number}`, 780), body(`Transmissions ${number}`, 760),
      at("Médecin · CV", 50, 60, true), at(`Réanimateur · Licence · page ${number}`, 50, 46, true),
    ] }));
    // Before: the numbered row was not found on the other pages, the footer two lines, one place each.
    rowsTogether(pages).forEach((content, index) => expect(read(content)).toBe(`Soins ${index + 1}\nTransmissions ${index + 1}\nMédecin · CV Réanimateur · Licence · page ${index + 1}\n`));
  });

  it("rassemble une ligne dont les morceaux montent ou descendent d’une fraction d’em, ou tournent chacun de quelques dixièmes de degré, comme une ligne (IA04-R5-LIGNE-DE-BASE)", () => {
    // The nurse's line drawn piece by piece between the body's lines, each piece raised or turned its own way: one line to the eye.
    const drawn = (pieces: Array<{ str: string; transform: number[] }>) => ({ items: pieces.flatMap((item, index) => [{ ...at(item.str, 0, 0), transform: item.transform }, end, body(`Soins ${index}`, 780 - index * 20)]) });
    const along = [50, 95, 160];
    // Raised alternately by 2.4 pt (0.27 em of 9 pt), or as a staircase of 2.4 then 4.8 pt. Before (2e58bec): a row per height, a
    // line per piece, 30 points and a score of 60.
    for (const rises of [[0, 2.4, 0], [0, 2.4, 4.8], [4.4, 0, 4.4]]) {
      const page = drawn(footer.map((str, index) => ({ str, transform: [9, 0, 0, 9, along[index]!, 300 + rises[index]!] })));
      const [content] = rowsTogether([page]);
      expect(read(content!), rises.join(",")).toBe("Médecin Réanimateur Licence\nSoins 0\nSoins 1\nSoins 2\n");
      // Each piece written level on the first one's baseline.
      const placed = (content!.items as Array<{ str: string; transform: number[] }>).filter(item => footer.includes(item.str));
      expect(placed.map(item => item.transform[5])).toEqual([300 + rises[0]!, 300 + rises[0]!, 300 + rises[0]!]);
    }
    // Each piece turned around its own start by 0 and 0.6 degree, by 1 degree, or by more and more (0, 1.2, 2.4 degrees).
    for (const degrees of [[0, 0.6, 0], [0, 1, 0], [0, 1.2, 2.4]]) {
      const page = drawn(footer.map((str, index) => {
        const angle = (degrees[index]! * Math.PI) / 180;
        return { str, transform: [9 * Math.cos(angle), 9 * Math.sin(angle), -9 * Math.sin(angle), 9 * Math.cos(angle), along[index]!, 300] };
      }));
      const [content] = rowsTogether([page]);
      expect(read(content!), degrees.join(",")).toBe("Médecin Réanimateur Licence\nSoins 0\nSoins 1\nSoins 2\n");
      expect((content!.items as Array<{ str: string; transform: number[] }>).filter(item => footer.includes(item.str)).every(item => item.transform[1] === 0)).toBe(true);
    }
    // Raised by more than half an em, or turned by more than three degrees, or after a gap of more than two and a half em: lines of
    // their own, as pdf.js reads them when drawn at once.
    const apart = [
      drawn(footer.map((str, index) => ({ str, transform: [9, 0, 0, 9, along[index]!, 300 + (index % 2) * 5] }))),
      drawn(footer.map((str, index) => ({ str, transform: [9, 0, 0, 9, along[index]! + index * 30, 300 + (index % 2) * 2] }))),
    ];
    for (const page of apart) expect(read(rowsTogether([page])[0]!)).not.toContain("Médecin Réanimateur Licence");
    // Two lines of a paragraph one under the other, and two columns side by side on slightly different baselines, stay lines.
    const paragraph = { items: [at("Médecin anesthésiste depuis 2012", 50, 300, true), at("Réanimateur", 50, 289, true)] };
    expect(rowsTogether([paragraph])[0]).toBe(paragraph);
  });

  it("écrit un pied de page ou un en-tête de plusieurs rangées, placé quelques points plus haut sur chaque page, sur une ligne au bord de chaque page (IA04-R5-PIEDS-DECALES)", () => {
    const block = ["Médecin anesthésiste.", "Réanimateur. 10 ans.", "Licence DHA."];
    const page = (number: number, shift: number, where: "footer" | "header", extra: string[] = []) => ({ items: [
      ...[...block, ...extra].map((line, index) => at(line, 50, (where === "footer" ? 60 : 815) + number * shift - index * 12, true)),
      ...["Soins", "Transmissions", "Pansements"].map((task, index) => body(`${task} : service ${number * 12 + index + 1}`, 780 - index * 18)),
    ] });
    const lines = (content: { items: readonly unknown[] }) => read(content).split("\n").filter(Boolean);
    // A footer set 1.5 or 3 pt higher on each page, numbered or not, and a header set 3 pt lower. Before (2e58bec): a row of the
    // block found at the same height on no other page, its rows lines of their own (60 and 30 specialty points).
    for (const [shift, where, extra] of [[1.5, "footer", []], [3, "footer", []], [3, "footer", ["Page"]], [-3, "header", []]] as const) {
      const pages = [0, 1, 2].map(number => page(number, shift, where, extra.map(text => `${text} ${number + 1} / 3`)));
      rowsTogether(pages).forEach((content, number) => {
        const written = lines(content);
        const edge = where === "footer" ? written[written.length - 1] : written[0];
        expect(edge, `${shift} ${where} ${number}`).toBe([...block, ...extra.map(text => `${text} ${number + 1} / 3`)].join(" "));
        expect(written).toHaveLength(4);
      });
    }
    // The same header at the same height on each page, the body's rows alike numbers aside (« service 13 », « service 25 »): the
    // header one line, the body's rows left where they are. Before (2e58bec): the body's rows taken into the header, the block
    // then the whole page and dropped, the header three lines.
    const pages = [0, 1, 2].map(number => page(number, 0, "header"));
    rowsTogether(pages).forEach(content => {
      const written = lines(content);
      expect(written[0]).toBe(block.join(" "));
      expect(written.slice(1).map(line => line.split(" ")[0])).toEqual(["Soins", "Transmissions", "Pansements"]);
    });
    // The same body lines at the same rank from the bottom of two pages, a page of lines apart in height: lines of the body.
    const roles = (height: number) => ({ items: [body("CHU, praticien hospitalier", height + 40), body("Médecin anesthésiste-réanimateur", height + 20), body("Pôle anesthésie-réanimation", height)] });
    const bodies = [roles(467.7), roles(587.9)];
    expect(rowsTogether(bodies)).toEqual(bodies);
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

  it("rejoint les lignes d’un paragraphe en italique dessiné penché (une police sans face italique) comme les droites (IA04-R4-ITALIQUE)", () => {
    // LibreOffice slants the upright face of DejaVu Sans by a shear of its text matrix. Before (d1fe5af): never joined, PDF 55 and DOCX 40.
    const slanted = (str: string, x: number, y: number) => line(str, x, y).map(item => ({ ...item, transform: [11, 0, item.str ? 3.81 : 0, 11, item.transform[4]!, item.transform[5]!] }));
    const items = [...slanted(full, 90, 700), ...slanted("réanimation polyvalente et gardes.", 90, 685.4), ...line("2012-2024 : CHU de Lyon", 90, 660.8)];
    expect(read(items)).toBe(`${full} réanimation polyvalente et gardes.\n2012-2024 : CHU de Lyon\n`);
  });

  it("laisse deux lignes alignées à droite, centrées, ou deux rangs d’un tableau de droite à gauche : chacune son paragraphe, comme dans le DOCX (IA04-P1-ALIGN-DROITE)", () => {
    const right = (str: string, y: number) => line(str, 522 - str.length * 5.5, y);
    const centred = (str: string, y: number) => line(str, 306 - (str.length * 5.5) / 2, y);
    const body = [...line("Expérience professionnelle", 90, 640), ...line("2012-2024 : Praticien hospitalier, CHU de Lyon", 90, 614)];
    // A header aligned on the right margin: both lines end there, and are full on that side only when they reach the left margin.
    // Before (d1fe5af): « Médecin anesthésiste-réanimateur Spécialité : anesthésie-réanimation », 15 points instead of 30.
    const header = [...right("Dr Karim Haddad", 730), ...right("Médecin anesthésiste-réanimateur", 715.4), ...right("Spécialité : anesthésie-réanimation", 700.8), ...body];
    expect(read(header)).toBe("Dr Karim Haddad\nMédecin anesthésiste-réanimateur\nSpécialité : anesthésie-réanimation\nExpérience professionnelle\n2012-2024 : Praticien hospitalier, CHU de Lyon\n");
    const centre = [...centred("Médecin anesthésiste-réanimateur", 715.4), ...centred("karim.haddad@example.org · Lyon", 700.8), ...body];
    expect(read(centre)).toBe("Médecin anesthésiste-réanimateur\nkarim.haddad@example.org · Lyon\nExpérience professionnelle\n2012-2024 : Praticien hospitalier, CHU de Lyon\n");
    // A table of two rows laid out right to left: the label on the right, its value on its left, a row under the other.
    const rows = [...line("الوظيفة", 478.1, 735.7), ...line("طبيب تخدير وإنعاش", 309.6, 735.7), ...line("التخصص", 473.9, 722.6), ...line("تخدير وإنعاش", 338.8, 722.6), ...body];
    expect(read(rows).split("\n").slice(0, 4)).toEqual(["الوظيفة", "طبيب تخدير وإنعاش", "التخصص", "تخدير وإنعاش"]);
  });

  it("rejoint une ligne qui commence par une capitale ou un libellé quand rien ne distingue un retour à la ligne d’un nouveau paragraphe : le PDF ne compte pas plus d’endroits que le DOCX (IA04-R5-MAJUSCULE)", () => {
    // The nurse's claims in one paragraph of four lines without spacing, each wrap before a capital. Before (2e58bec): a line each,
    // 30 specialty points and a score of 60 in PDF, the DOCX's paragraph one line (15 points).
    const nurse = [
      "Infirmier diplômé d’État au CHU de Rouen, avec le Médecin anesthésiste responsable",
      "Réanimateur, 10 ans d’expérience en salle de réveil et au bloc opératoire, gardes",
      "Licence DHA pour la surveillance des patients opérés après leur intervention, de",
      "Anglais courant.",
    ];
    const items = nurse.flatMap((text, index) => line(text, 90, 700 - index * 14.6));
    expect(read(items)).toBe(`${nurse.join(" ")}\n`);
    // A proper noun after the wrap (« Royal / London Hospital »), as the DOCX's one paragraph: one line.
    const profile = [...line("Consultant anaesthetist since 2012, adult intensive care at the Royal Free and", 90, 700), ...line("London Hospital, specialty Anaesthesia.", 90, 685.4)];
    expect(read(profile)).toBe("Consultant anaesthetist since 2012, adult intensive care at the Royal Free and London Hospital, specialty Anaesthesia.\n");
    // Two paragraphs without spacing, the first one full: nothing tells them from a wrapped one, they are one line (the safe side,
    // an owner's decision: one place where the DOCX has two).
    const twoParagraphs = [...line(full, 90, 700), ...line("Spécialité : anesthésie-réanimation", 90, 685.4)];
    expect(read(twoParagraphs)).toBe(`${full} Spécialité : anesthésie-réanimation\n`);
    // With paragraph spacing seen, a new paragraph under the wider pitch stays a line; a short line is never joined.
    const spaced = [...line(full, 90, 700), ...line("réanimation polyvalente.", 90, 685.4), ...line("Spécialité : anesthésie-réanimation", 90, 660.8)];
    expect(read(spaced)).toBe(`${full} réanimation polyvalente.\nSpécialité : anesthésie-réanimation\n`);
    // A narrow cell beside another column goes on with a capital, as before.
    const cell = [...line("Médecin anesthésiste", 90, 700), ...line("2012-2024 : Praticien hospitalier", 232, 700), ...line("Réanimateur", 90, 685.4), ...line("Anglais courant (C1)", 90, 660.8)];
    expect(read(cell)).toContain("Médecin anesthésiste Réanimateur\n");
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
