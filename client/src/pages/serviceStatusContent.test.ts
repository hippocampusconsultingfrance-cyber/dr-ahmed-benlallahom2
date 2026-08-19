import { describe, expect, it } from "vitest";
import { getServiceStatusContent } from "./serviceStatusContent";

describe("contenus des états de service", () => {
  it("propose un message non technique dans les quatre langues", () => {
    for (const locale of ["fr", "en", "de", "zh"] as const) {
      const copy = getServiceStatusContent("error", locale);
      expect(copy.title).not.toBe("");
      expect(copy.description).not.toMatch(/stack|exception|trace/i);
      expect(copy.home).not.toBe("");
    }
  });

  it("distingue clairement la maintenance d’un incident", () => {
    expect(getServiceStatusContent("maintenance", "fr").title).toContain("maintenance");
    expect(getServiceStatusContent("error", "fr").title).toContain("technique");
  });

  it("couvre les actions de reprise pour les deux états dans chaque langue", () => {
    for (const kind of ["error", "maintenance"] as const) {
      for (const locale of ["fr", "en", "de", "zh"] as const) {
        const copy = getServiceStatusContent(kind, locale);
        expect(copy.eyebrow.length, `${kind}:${locale}`).toBeGreaterThan(0);
        expect(copy.home.length, `${kind}:${locale}`).toBeGreaterThan(0);
        expect(copy.retry.length, `${kind}:${locale}`).toBeGreaterThan(0);
      }
    }
  });
});
