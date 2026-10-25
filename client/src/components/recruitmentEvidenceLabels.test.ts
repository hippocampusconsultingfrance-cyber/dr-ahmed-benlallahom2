import { describe, expect, it } from "vitest";
import { contradictionEvidenceLabel, CV_REVIEW_REMINDER, fieldEvidenceStatusLabel } from "./recruitmentEvidenceLabels";

describe("libellés des preuves IA d’un CV (IA-01)", () => {
  it("une citation retrouvée dans le texte lu n’est jamais présentée comme vérifiée", () => {
    expect(fieldEvidenceStatusLabel({ sourceLocation: "page 1", evidenceVerified: true })).toBe("Citation trouvée dans le texte lu par l’outil (à comparer au CV)");
    expect(fieldEvidenceStatusLabel({ sourceLocation: "page 1", evidenceVerified: false })).toBe("Citation à vérifier manuellement");
    expect(fieldEvidenceStatusLabel({ evidenceVerified: undefined })).toBe("Citation à vérifier manuellement");
    expect(contradictionEvidenceLabel(true)).toBe("citation trouvée dans le texte lu par l’outil");
    expect(contradictionEvidenceLabel(undefined)).toBe("citation à vérifier");
    for (const label of [fieldEvidenceStatusLabel({ evidenceVerified: true }), contradictionEvidenceLabel(true)]) expect(label).not.toMatch(/vérifiée/i);
  });

  it("une donnée du formulaire reste une déclaration, même avec une citation retrouvée", () => {
    expect(fieldEvidenceStatusLabel({ sourceLocation: "formulaire de candidature", evidenceVerified: true })).toBe("Donnée déclarée, non vérifiée dans le CV");
  });

  it("rappelle d’ouvrir le CV avant toute shortlist", () => {
    expect(CV_REVIEW_REMINDER).toMatch(/^Ouvrir le CV avant toute shortlist/);
  });
});
