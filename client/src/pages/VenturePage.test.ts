import { describe, expect, it } from "vitest";
import {
  ventureNarrativesDe,
  ventureNarrativesZh,
} from "@/data/ventureNarratives";
import { venturesEn } from "@/data/ventures-en";
import { ventureMetaDescription, venturePageCopy } from "./VenturePage";

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

  it("creates a concise SEO description without cutting a word", () => {
    const description = ventureMetaDescription([
      "Hippocampus Consulting accompagne les organisations dans leur transformation digitale, leur développement international et leur croissance durable avec une approche exigeante et adaptée.",
      "Ce second paragraphe ne doit pas être inclus.",
    ]);

    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toMatch(/…$/);
    expect(description).not.toContain("second paragraphe");
  });

  it("keeps an already concise SEO description unchanged", () => {
    expect(
      ventureMetaDescription(["Une présentation claire et concise."])
    ).toBe("Une présentation claire et concise.");
  });
});
