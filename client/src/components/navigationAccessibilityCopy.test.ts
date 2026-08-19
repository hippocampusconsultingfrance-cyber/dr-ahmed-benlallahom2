import { describe, expect, it } from "vitest";
import { navigationAccessibilityCopy } from "./navigationAccessibilityCopy";

describe("libellés accessibles de navigation", () => {
  it("couvre les quatre langues actives sans libellé vide", () => {
    expect(Object.keys(navigationAccessibilityCopy)).toEqual(["fr", "en", "de", "zh"]);
    for (const copy of Object.values(navigationAccessibilityCopy)) {
      for (const value of Object.values(copy)) {
        expect(value.trim()).not.toHaveLength(0);
      }
    }
  });
});
