import { describe, expect, it } from "vitest";
import { shouldLoadAnalytics } from "./analyticsConsent";

describe("chargement de l’analytique selon le consentement", () => {
  it("bloque l’analytique en l’absence de consentement ou de préférence de performance", () => {
    expect(shouldLoadAnalytics(null)).toBe(false);
    expect(shouldLoadAnalytics(JSON.stringify({ essential: true, performance: false, preferences: true }))).toBe(false);
    expect(shouldLoadAnalytics("invalid")).toBe(false);
  });

  it("autorise l’analytique uniquement après consentement explicite de performance", () => {
    expect(shouldLoadAnalytics(JSON.stringify({ essential: true, performance: true, preferences: false }))).toBe(true);
  });
});
