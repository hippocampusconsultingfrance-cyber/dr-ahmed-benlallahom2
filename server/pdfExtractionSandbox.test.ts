import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DOCUMENT_DECOMPRESSION_LIMITS } from "./documentDecompressionLimits";
import { readPdfIsolated, repeatedRowsTogether, textCellsAsLines } from "./pdfExtractionSandbox";
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

describe("ligne répétée sur plusieurs pages, dessinée en morceaux entre les autres lignes, lue d’un tenant (IA-04)", () => {
  /** A piece of text drawn at (x, y), 5 pt a character, 9 pt high; `eol`: pdf.js ends the line after it. */
  const at = (str: string, x: number, y: number, eol = false) => ({ str, width: str.length * 5, height: 9, transform: [9, 0, 0, 9, x, y], hasEOL: eol });
  /** The end of line pdf.js writes between two pieces drawn on different rows. */
  const end = { str: "", width: 0, height: 0, transform: [1, 0, 0, 1, 0, 0], hasEOL: true };
  /** The page text as pdf-parse writes it: each item, a line break at each end of line. */
  const read = (content: { items: readonly unknown[] }) => (content.items as Array<{ str: string; hasEOL: boolean }>).map(item => item.str + (item.hasEOL ? "\n" : "")).join("");
  const footer = ["Médecin", "Réanimateur", "Licence"];
  // Each piece starts 10 pt after the end of the one before it on the footer's row.
  const footerAt = [50, 95, 160];
  const piece = (index: number, eol = false) => at(footer[index]!, footerAt[index]!, 40, eol);
  const body = (text: string, y: number) => at(text, 50, y, true);

  it("rassemble ses morceaux, dans leur ordre sur la ligne, là où est dessiné le premier, et ne change pas l’ordre du reste", () => {
    const pages = [
      // Each piece between two lines of the body.
      { items: [piece(0), end, body("Soins 1", 780), piece(1), end, body("Soins 2", 760), piece(2), end, body("Soins 3", 740)] },
      // Drawn from the last piece, two of them together.
      { items: [body("Soins 4", 780), piece(2), end, body("Soins 5", 760), piece(1), piece(0, true), body("Soins 6", 740)] },
      // Drawn at once: left as it is.
      { items: [body("Soins 7", 780), piece(0), piece(1), piece(2, true), body("Soins 8", 760)] },
    ];
    const [first, second, third] = repeatedRowsTogether(pages);
    // Before: « Médecin\nSoins 1\nRéanimateur\nSoins 2… », a line per piece, grouped differently on each page.
    expect(read(first!)).toBe("Médecin Réanimateur Licence\nSoins 1\nSoins 2\nSoins 3\n");
    expect(read(second!)).toBe("Soins 4\nMédecin Réanimateur Licence\nSoins 5\nSoins 6\n");
    expect(third).toBe(pages[2]);
    // The space put between two pieces is as wide as the gap between them, on their row.
    expect(first!.items[1]).toEqual({ str: " ", width: 10, height: 0, transform: [9, 0, 0, 9, 85, 40], hasEOL: false });
  });

  it("laisse les lignes écrites sur une seule page, même dessinées en morceaux (deux colonnes), et les pages sans ligne répétée", () => {
    // Two columns: the left one, then the right one, each row of the page drawn in two pieces.
    const columns = { items: [at("Spécialité", 50, 780, true), at("Langues", 50, 760, true), at("Titre", 300, 780, true), at("Anglais", 300, 760, true)] };
    const other = { items: [at("Expérience", 50, 780, true), at("CHU", 300, 780, true)] };
    const result = repeatedRowsTogether([columns, other]);
    expect(result[0]).toBe(columns);
    expect(result[1]).toBe(other);
    // Rotated text, or text without a position, is never moved.
    const rotated = { items: [{ ...piece(0), transform: [0, 9, -9, 0, 50, 40] }, end, body("Soins", 780), { ...piece(1), transform: [0, 9, -9, 0, 95, 40] }] };
    expect(repeatedRowsTogether([rotated, rotated])[0]).toBe(rotated);
  });
});
