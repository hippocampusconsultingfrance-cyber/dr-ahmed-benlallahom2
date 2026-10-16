import { describe, expect, it } from "vitest";
import {
  COOKIE_ACCEPTANCE_VALIDITY_DAYS,
  COOKIE_REFUSAL_VALIDITY_DAYS,
  createCookieConsent,
  isCookieConsentExpired,
  normalizeCookieConsent,
  readValidCookieConsent,
  shouldShowCookiePreferences,
} from "./cookieConsentState";

const DAY = 24 * 60 * 60 * 1000;

describe("préférences de cookies", () => {
  it("normalise un consentement mémorisé et maintient les cookies essentiels", () => {
    expect(normalizeCookieConsent({ essential: false, performance: true, decidedAt: "2026-10-01T10:00:00.000Z" })).toEqual({ essential: true, performance: true, decidedAt: "2026-10-01T10:00:00.000Z" });
  });

  it("ignore l'ancienne catégorie « préférences », qui n'avait aucun effet (PUB-COOKIE-04)", () => {
    const legacy = normalizeCookieConsent({ essential: true, performance: false, preferences: true });
    expect(legacy).toEqual({ essential: true, performance: false });
    expect(legacy).not.toHaveProperty("preferences");
    expect(createCookieConsent(true)).not.toHaveProperty("preferences");
  });

  it("rejette une préférence incomplète ou mal formée", () => {
    expect(normalizeCookieConsent({ performance: "yes", preferences: false })).toBeNull();
    expect(normalizeCookieConsent(null)).toBeNull();
    expect(readValidCookieConsent("{not json")).toBeNull();
  });

  it("date le choix et le redemande après 6 mois (refus) ou 13 mois (accord) (LEGAL-15)", () => {
    const now = Date.parse("2027-06-01T00:00:00Z");
    const refusal = createCookieConsent(false, new Date(now - (COOKIE_REFUSAL_VALIDITY_DAYS - 1) * DAY));
    const oldRefusal = createCookieConsent(false, new Date(now - (COOKIE_REFUSAL_VALIDITY_DAYS + 1) * DAY));
    const acceptance = createCookieConsent(true, new Date(now - (COOKIE_ACCEPTANCE_VALIDITY_DAYS - 1) * DAY));
    const oldAcceptance = createCookieConsent(true, new Date(now - (COOKIE_ACCEPTANCE_VALIDITY_DAYS + 1) * DAY));

    expect(isCookieConsentExpired(refusal, now)).toBe(false);
    expect(isCookieConsentExpired(oldRefusal, now)).toBe(true);
    expect(isCookieConsentExpired(acceptance, now)).toBe(false);
    expect(isCookieConsentExpired(oldAcceptance, now)).toBe(true);
    // Choix antérieur à l'horodatage : redemandé.
    expect(readValidCookieConsent(JSON.stringify({ essential: true, performance: true, preferences: true }), now)).toBeNull();
    expect(readValidCookieConsent(JSON.stringify(acceptance), now)).toEqual(acceptance);
  });

  it("garde l’accès aux préférences après fermeture du bandeau sans choix", () => {
    expect(shouldShowCookiePreferences(true)).toBe(false);
    expect(shouldShowCookiePreferences(false)).toBe(true);
  });
});
