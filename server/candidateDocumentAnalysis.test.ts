import { describe, expect, it } from "vitest";
import { parseCandidateDocumentAnalysis } from "./candidateDocumentAnalysis";

describe("analyse structurée des documents candidats", () => {
  it("accepte et borne une analyse structurée exploitable", () => {
    const result = parseCandidateDocumentAnalysis(JSON.stringify({
      documentKind: "Document de recette",
      summary: "Fichier fictif sans donnée sensible, à supprimer après la recette.",
      issuingOrganization: null,
      issueDate: null,
      expiryDate: null,
      confidence: 75,
      flags: ["document_fictif"],
      missingInformation: ["Revue humaine requise"],
    }));

    expect(result.confidence).toBe(75);
    expect(result.flags).toEqual(["document_fictif"]);
  });

  it("rejette une réponse IA vide pour permettre le repli vers un autre modèle", () => {
    expect(() => parseCandidateDocumentAnalysis("")).toThrow("candidate_document_ai_empty_response");
  });
});
