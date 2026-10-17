import { describe, expect, it } from "vitest";
import { shouldLoadAnalytics } from "./analyticsConsentLogic";

const recently = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe("chargement de l’analytique selon le consentement", () => {
  it("bloque l’analytique en l’absence de consentement ou de préférence de performance", () => {
    expect(shouldLoadAnalytics(null)).toBe(false);
    expect(shouldLoadAnalytics(JSON.stringify({ essential: true, performance: false, decidedAt: recently }))).toBe(false);
    expect(shouldLoadAnalytics(JSON.stringify({ essential: true, performance: false, preferences: true }))).toBe(false);
    expect(shouldLoadAnalytics("invalid")).toBe(false);
  });

  it("autorise l’analytique uniquement après consentement explicite de performance", () => {
    expect(shouldLoadAnalytics(JSON.stringify({ essential: true, performance: true, decidedAt: recently }))).toBe(true);
  });

  it("ne réutilise pas un consentement non daté ou expiré (13 mois)", () => {
    expect(shouldLoadAnalytics(JSON.stringify({ essential: true, performance: true, preferences: false }))).toBe(false);
    const fourteenMonthsAgo = new Date(Date.now() - 425 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldLoadAnalytics(JSON.stringify({ essential: true, performance: true, decidedAt: fourteenMonthsAgo }))).toBe(false);
  });
});
