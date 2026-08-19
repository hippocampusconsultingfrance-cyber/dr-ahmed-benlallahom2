import { describe, expect, it } from "vitest";
import { candidateAccountCopy } from "./candidateAccountCopy";

describe("candidate account public page translations", () => {
  it("covers verification, reset and validation messages in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = candidateAccountCopy[language];
      expect(copy.verifyingTitle.length, language).toBeGreaterThan(0);
      expect(copy.invalidDescription.length, language).toBeGreaterThan(0);
      expect(copy.passwordMismatch.length, language).toBeGreaterThan(0);
      expect(copy.genericError.length, language).toBeGreaterThan(0);
    }
  });
});
