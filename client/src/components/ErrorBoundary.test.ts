import { describe, expect, it } from "vitest";
import { errorBoundaryCopy } from "./ErrorBoundary";

describe("ErrorBoundary translations", () => {
  it("provides safe fallback text in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(errorBoundaryCopy[language].title.length, language).toBeGreaterThan(0);
      expect(errorBoundaryCopy[language].description.length, language).toBeGreaterThan(0);
      expect(errorBoundaryCopy[language].description).not.toContain("inform");
    }
  });
});
