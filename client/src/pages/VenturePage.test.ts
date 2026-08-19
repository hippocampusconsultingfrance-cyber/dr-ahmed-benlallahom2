import { describe, expect, it } from "vitest";
import { venturePageCopy } from "./VenturePage";

describe("Venture page translations", () => {
  it("provides all visible interface labels in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      for (const value of Object.values(venturePageCopy[language])) {
        expect(value.length, language).toBeGreaterThan(0);
      }
    }
  });
});
