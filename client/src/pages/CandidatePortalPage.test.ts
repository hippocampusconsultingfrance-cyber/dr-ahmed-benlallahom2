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
    }
  });
});
