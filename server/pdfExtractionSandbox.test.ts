import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DOCUMENT_DECOMPRESSION_LIMITS } from "./documentDecompressionLimits";
import { readPdfIsolated } from "./pdfExtractionSandbox";
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
