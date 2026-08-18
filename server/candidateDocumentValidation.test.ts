import { describe, expect, it } from "vitest";
import { safeCandidateDocumentName, validateCandidateDocument } from "./candidateDocumentValidation";

describe("validation des documents candidats", () => {
  it("nettoie les noms de fichiers et rejette les chemins", () => {
    expect(safeCandidateDocumentName("../../passeport client.pdf")).not.toContain("/");
    expect(safeCandidateDocumentName("../../passeport client.pdf")).not.toContain("\\");
  });

  it("accepte une image PNG de signature valide", () => {
    const buffer = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 1)]);
    const result = validateCandidateDocument({ buffer, mimeType: "image/png", originalName: "diplome.png", size: buffer.length });
    expect(result.checksum).toHaveLength(64);
    expect(result.mimeType).toBe("image/png");
  });

  it("rejette un type déclaré dont la signature ne correspond pas", () => {
    const buffer = Buffer.concat([Buffer.from("%PDF-1.7\n/Type /Page\n"), Buffer.alloc(300, 1)]);
    expect(() => validateCandidateDocument({ buffer, mimeType: "image/png", originalName: "document.png", size: buffer.length })).toThrow("candidate_document_signature_invalid");
  });
});
