import { describe, expect, it } from "vitest";
import { normalizeCookieConsent } from "./cookieConsentState";

describe("préférences de cookies", () => {
  it("normalise un consentement mémorisé et maintient les cookies essentiels", () => {
    expect(normalizeCookieConsent({ essential: false, performance: true, preferences: false })).toEqual({ essential: true, performance: true, preferences: false });
  });

  it("rejette une préférence incomplète ou mal formée", () => {
    expect(normalizeCookieConsent({ performance: "yes", preferences: false })).toBeNull();
    expect(normalizeCookieConsent(null)).toBeNull();
  });
});
