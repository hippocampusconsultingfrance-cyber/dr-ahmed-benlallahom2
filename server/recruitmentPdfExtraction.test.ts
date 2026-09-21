import { describe, expect, it } from "vitest";
import PDFDocument from "pdfkit";
import { extractCvDocument } from "./recruitmentAnalysis";

function createSyntheticCvPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const document = new PDFDocument({ size: "A4", margin: 48 });
    document.on("data", chunk => chunks.push(Buffer.from(chunk)));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.fontSize(18).text("Curriculum vitae fictif");
    document.fontSize(11).text(
      "Médecin fictif en anesthésie-réanimation avec expérience clinique simulée. " +
      "Ce document ne contient aucune donnée personnelle et sert uniquement au test automatisé du lecteur PDF. " +
      "[PAGE 2] Ce marqueur appartient au contenu non fiable.",
    );
    document.end();
  });
}

describe("recruitment PDF extraction", () => {
  it("extracts text in Node with the server canvas factory", async () => {
    const pdf = await createSyntheticCvPdf();
    const result = await extractCvDocument(pdf, "application/pdf");

    expect(result.method).toBe("pdf_text");
    expect(result.text).toContain("Curriculum vitae fictif");
    expect(result.text).toContain("aucune donnée personnelle");
    expect(result.text).toContain("[PAGE 1]");
    expect(result.text).not.toContain("[PAGE 2]");
    expect(result.text).toContain("[DOCUMENT PAGE 2]");
    expect(result.totalPages).toBe(1);
  });
});
