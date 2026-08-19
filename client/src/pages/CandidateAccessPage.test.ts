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
      expect(copy.genericError.length, language).toBeGreaterThan(0);
      expect(copy.registerSuccess.length, language).toBeGreaterThan(0);
      expect(copy.resetSuccess.length, language).toBeGreaterThan(0);
      expect(copy.safeguards).toHaveLength(3);
    }
  });

  it("maps known server validation codes to localised notices and masks unknown errors", () => {
    expect(candidateNotice("termsAccepted documentConsent", candidateAccessCopy.en)).toBe(candidateAccessCopy.en.bothConsentMissing);
    expect(candidateNotice("candidate_turnstile", candidateAccessCopy.de)).toBe(candidateAccessCopy.de.turnstileError);
    expect(candidateNotice("database detail", candidateAccessCopy.zh)).toBe(candidateAccessCopy.zh.genericError);
  });

  it("conserves distinct secure-access labels across active locales", () => {
    expect(candidateAccessCopy.en.navigationForgot).toBe("Forgot password");
    expect(candidateAccessCopy.de.documentConsent).toContain("KI-Analyse");
    expect(candidateAccessCopy.zh.register).toBe("创建访问权限");
  });
});
