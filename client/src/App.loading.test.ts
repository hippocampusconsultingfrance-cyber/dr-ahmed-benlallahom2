import { describe, expect, it } from "vitest";
import { routeLoadingCopy } from "./App";

describe("Route loading translations", () => {
  it("provides a loading title and caption in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(routeLoadingCopy[language].title.length, language).toBeGreaterThan(0);
      expect(routeLoadingCopy[language].caption.length, language).toBeGreaterThan(0);
    }
  });
});
