import { describe, expect, it } from "vitest";
import { candidatePortalCopy } from "./CandidatePortalPage";

describe("candidate portal translations", () => {
  it("provides document, session and upload language in every supported locale", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = candidatePortalCopy[language];
      expect(copy.portal.length, language).toBeGreaterThan(0);
      expect(copy.uploadError.length, language).toBeGreaterThan(0);
      expect(copy.status.completed.length, language).toBeGreaterThan(0);
      expect(copy.categories.identity_document.length, language).toBeGreaterThan(0);
      expect(copy.revokeAll.length, language).toBeGreaterThan(0);
      expect(copy.uploadSuccess.length, language).toBeGreaterThan(0);
      expect(copy.noDocuments.length, language).toBeGreaterThan(0);
      expect(copy.loadErrorTitle.length, language).toBeGreaterThan(0);
      expect(copy.loadErrorDescription.length, language).toBeGreaterThan(0);
      expect(copy.retry.length, language).toBeGreaterThan(0);
    }
  });

  it("conserves distinct secure-portal controls in the translated copies", () => {
    expect(candidatePortalCopy.en.portal).toBe("Secure candidate portal");
    expect(candidatePortalCopy.de.revokeAll).toBe("Alle widerrufen");
    expect(candidatePortalCopy.zh.status.needs_review).toBe("需要人工审核");
  });

  it("explains that unavailable data is not shown as an empty vault", () => {
    expect(candidatePortalCopy.fr.loadErrorDescription).toContain("incomplète");
    expect(candidatePortalCopy.en.loadErrorDescription).toContain("incomplete");
  });
});
