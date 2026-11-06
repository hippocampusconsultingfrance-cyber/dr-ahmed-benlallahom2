import { describe, expect, it } from "vitest";
import { candidateDocumentRefusalMessage } from "./candidateDocumentUploadErrors";

// Codes returned by /api/candidate/documents when validateCandidateDocument refuses a file, by refusal reason.
const refusals = {
  tooLargeWhenOpened: ["cv_validation_pdf_decompressed_size_exceeded", "cv_validation_pdf_image_too_large"],
  pageLimit: ["candidate_document_pdf_page_limit"],
  passwordProtected: ["candidate_document_pdf_encrypted"],
  activeContent: ["candidate_document_pdf_active_content", "candidate_document_docx_active_content"],
  invalidContent: ["candidate_document_type_mismatch", "candidate_document_signature_invalid", "candidate_document_pdf_page_structure_invalid", "candidate_document_pdf_object_stream_unreadable", "candidate_document_docx_container_invalid"],
};
const frenchMessage = "Le document est refusé (texte français du serveur).";

describe("REC-02 — refus d’un document du coffre", () => {
  it("affiche en français le message du serveur", () => {
    for (const code of Object.values(refusals).flat()) expect(candidateDocumentRefusalMessage({ error: frenchMessage, code }, "fr"), code).toBe(frenchMessage);
  });

  it.each(["en", "de", "zh"] as const)("le traduit d’après son code, un texte par motif (%s)", language => {
    const shown = Object.values(refusals).map(codes => {
      const translations = new Set(codes.map(code => candidateDocumentRefusalMessage({ error: frenchMessage, code }, language)));
      expect(translations.size, codes.join(", ")).toBe(1);
      return [...translations][0];
    });
    expect(new Set(shown).size).toBe(shown.length);
    for (const message of shown) {
      expect(message).toBeTruthy();
      expect(message).not.toBe(frenchMessage);
    }
    expect(candidateDocumentRefusalMessage({ error: frenchMessage, code: "candidate_document_pdf_page_limit" }, language)).toContain("25");
  });

  it("laisse la page afficher son propre message pour les autres échecs", () => {
    expect(candidateDocumentRefusalMessage({ error: "Ce type de document n’est pas collecté.", code: "candidate_document_category_retired" }, "en")).toBeNull();
    expect(candidateDocumentRefusalMessage({ error: "Le document dépasse 4 Mo.", code: "candidate_document_too_large" }, "en")).toBeNull();
    expect(candidateDocumentRefusalMessage({ error: "Votre session a expiré." }, "en")).toBeNull();
    expect(candidateDocumentRefusalMessage(null, "en")).toBeNull();
  });
});
