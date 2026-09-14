import { describe, expect, it } from "vitest";
import { candidateAccessCopy, candidateNotice } from "./CandidateAccessPage";

describe("candidate access translations", () => {
  it("provides complete validation and consent text in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = candidateAccessCopy[language];
      expect(copy.brandTitle.length, language).toBeGreaterThan(0);
      expect(copy.passwordMismatch.length, language).toBeGreaterThan(0);
      expect(copy.bothConsentMissing.length, language).toBeGreaterThan(0);
      expect(copy.turnstileRegisterMissing.length, language).toBeGreaterThan(0);
      expect(copy.turnstileActivationMissing.length, language).toBeGreaterThan(0);
      expect(copy.activationSuccess.length, language).toBeGreaterThan(0);
      expect(copy.genericError.length, language).toBeGreaterThan(0);
    }
  });

  it("maps known server validation codes to localised notices and masks unknown errors", () => {
    expect(candidateNotice("termsAccepted documentConsent", candidateAccessCopy.en)).toBe(candidateAccessCopy.en.bothConsentMissing);
    expect(candidateNotice("candidate_turnstile", candidateAccessCopy.de)).toBe(candidateAccessCopy.de.turnstileError);
    expect(candidateNotice("database detail", candidateAccessCopy.zh)).toBe(candidateAccessCopy.zh.genericError);
  });
});
