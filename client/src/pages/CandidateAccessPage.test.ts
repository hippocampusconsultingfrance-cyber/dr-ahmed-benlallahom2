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
      expect(copy.turnstileActivationMissing.length, language).toBeGreaterThan(
        0
      );
      expect(copy.activationSuccess.length, language).toBeGreaterThan(0);
      expect(copy.genericError.length, language).toBeGreaterThan(0);
      expect(copy.tooManyRequests.length, language).toBeGreaterThan(0);
    }
  });

  it("translates the stable reasons of the candidate portal refusals in every language (EN-06)", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = candidateAccessCopy[language];
      for (const text of [
        copy.invitationMismatch,
        copy.invalidCredentials,
        copy.serviceUnavailable,
      ])
        expect(text.length, language).toBeGreaterThan(5);
    }
    const english = candidateAccessCopy.en;
    expect(
      candidateNotice(
        "Cette invitation ne correspond pas à cette adresse email.",
        english,
        "BAD_REQUEST",
        "candidate_invitation_email_mismatch"
      )
    ).toBe(english.invitationMismatch);
    expect(
      candidateNotice(
        "Email ou mot de passe incorrect.",
        english,
        undefined,
        "candidate_credentials_invalid"
      )
    ).toBe(english.invalidCredentials);
    expect(
      candidateNotice(
        "Le service candidat est temporairement indisponible.",
        candidateAccessCopy.zh,
        "INTERNAL_SERVER_ERROR",
        "candidate_service_unavailable"
      )
    ).toBe(candidateAccessCopy.zh.serviceUnavailable);
    expect(
      candidateNotice(
        "Trop de tentatives de connexion depuis cet appareil.",
        candidateAccessCopy.de,
        "TOO_MANY_REQUESTS",
        "candidate_login_rate_limited"
      )
    ).toBe(candidateAccessCopy.de.tooManyAttempts);
    expect(
      candidateNotice(
        "La vérification anti-bot doit être renouvelée.",
        english,
        "BAD_REQUEST",
        "candidate_security_check_required"
      )
    ).toBe(english.turnstileError);
    // A name refused for its characters (INTL-05), whatever the code and the French message.
    expect(
      candidateNotice(
        "Un champ contient un saut de ligne ou un caractère invisible qui n’y est pas accepté.",
        english,
        "BAD_REQUEST",
        "invalid_characters"
      )
    ).toBe(
      "A field contains a line break or an invisible character that is not accepted there, often left by copying and pasting: type that text again on the keyboard, then send the form again."
    );
    expect(
      candidateNotice(
        "TRPCError",
        candidateAccessCopy.de,
        "BAD_REQUEST",
        "invalid_characters"
      )
    ).toBe(
      "Ein Feld enthält einen Zeilenumbruch oder ein unsichtbares Zeichen, das dort nicht zulässig ist, oft ein Rest vom Kopieren und Einfügen: Geben Sie diesen Text erneut über die Tastatur ein und senden Sie das Formular dann erneut."
    );
    // An unknown reason falls back to the code and field rules, never to the French text.
    expect(
      candidateNotice("Détail interne", english, undefined, "something_else")
    ).toBe(english.genericError);
  });

  it("maps known server validation codes to localised notices and masks unknown errors", () => {
    expect(
      candidateNotice("termsAccepted documentConsent", candidateAccessCopy.en)
    ).toBe(candidateAccessCopy.en.bothConsentMissing);
    expect(candidateNotice("candidate_turnstile", candidateAccessCopy.de)).toBe(
      candidateAccessCopy.de.turnstileError
    );
    expect(
      candidateNotice(
        "La vérification anti-bot doit être renouvelée avant de créer votre accès.",
        candidateAccessCopy.en,
        "BAD_REQUEST"
      )
    ).toBe(candidateAccessCopy.en.turnstileError);
    expect(
      candidateNotice(
        "Trop de tentatives. Veuillez réessayer plus tard.",
        candidateAccessCopy.de,
        "TOO_MANY_REQUESTS"
      )
    ).toBe(candidateAccessCopy.de.tooManyRequests);
    expect(candidateNotice("database detail", candidateAccessCopy.zh)).toBe(
      candidateAccessCopy.zh.genericError
    );
  });
});
