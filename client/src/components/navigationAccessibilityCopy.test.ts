import { describe, expect, it } from "vitest";
import { navigationAccessibilityCopy } from "./navigationAccessibilityCopy";

// Le logo et le menu de langue rendus, nommés ainsi : Navigation.dom.test.ts.
describe("libellés accessibles de navigation", () => {
  it("couvre les quatre langues actives sans libellé vide", () => {
    expect(Object.keys(navigationAccessibilityCopy)).toEqual(["fr", "en", "de", "zh"]);
    for (const copy of Object.values(navigationAccessibilityCopy)) {
      for (const value of Object.values(copy)) {
        expect(value.trim()).not.toHaveLength(0);
      }
    }
  });

  it("commence le nom du logo par le texte qu’il affiche, dans chaque langue (A11Y-18)", () => {
    for (const copy of Object.values(navigationAccessibilityCopy)) {
      expect(copy.home.startsWith("Dr. Ben Lallahom — "), copy.home).toBe(true);
    }
  });
});
