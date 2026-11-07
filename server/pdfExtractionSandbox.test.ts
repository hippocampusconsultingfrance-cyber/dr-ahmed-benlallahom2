import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DOCUMENT_DECOMPRESSION_LIMITS } from "./documentDecompressionLimits";
import { readPdfIsolated, textCellsAsLines } from "./pdfExtractionSandbox";
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
