import { describe, expect, it } from "vitest";
import { contactCopy } from "./ContactSection";

describe("ContactSection translations", () => {
  it("provides confirmation, validation and error text in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = contactCopy[language];
      expect(copy.sent.length, language).toBeGreaterThan(0);
      expect(copy.sendError.length, language).toBeGreaterThan(0);
      expect(copy.consentRequired.length, language).toBeGreaterThan(0);
      expect(copy.successDescription.length, language).toBeGreaterThan(0);
    }
  });
});
