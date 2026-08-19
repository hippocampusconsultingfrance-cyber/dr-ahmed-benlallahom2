import { describe, expect, it } from "vitest";
import { ventureNarrativesDe, ventureNarrativesZh } from "@/data/ventureNarratives";
import { venturesEn } from "@/data/ventures-en";
import { venturePageCopy } from "./VenturePage";

describe("Venture page translations", () => {
  it("provides all visible interface labels in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      for (const value of Object.values(venturePageCopy[language])) {
        expect(value.length, language).toBeGreaterThan(0);
      }
    }
  });

  it("provides a German and Chinese narrative for every venture", () => {
    for (const venture of venturesEn) {
      for (const narratives of [ventureNarrativesDe, ventureNarrativesZh]) {
        const narrative = narratives[venture.slug];
        expect(narrative?.tagline).toBeTruthy();
        expect(narrative?.description).toHaveLength(3);
        expect(narrative?.description.join(" ").length).toBeGreaterThan(80);
      }
    }
  });
});
