import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ventureNarrativesDe,
  ventureNarrativesZh,
} from "@/data/ventureNarratives";
import { venturesEn } from "@/data/ventures-en";
import { venturesFr } from "@/data/ventures-fr";
import {
  TEAM_PHOTO_PLACEHOLDER,
  VENTURE_LOGO_PLACEHOLDER,
  failedSourceAfterError,
  ventureMetaDescription,
  venturePageCopy,
} from "./VenturePage";

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

describe("Venture page images", () => {
  const publicAsset = (url: string) =>
    resolve(import.meta.dirname, "../../public", url.replace(/^\//, ""));

  it("falls back once to a local placeholder when a logo or portrait fails to load", () => {
    const photo = "/manus-storage/photo-ahmed-new_b06c9b06.png";

    expect(failedSourceAfterError(photo, photo, TEAM_PHOTO_PLACEHOLDER)).toBe(
      photo
    );
    // The placeholder itself failing must not trigger another switch (no onError loop).
    expect(
      failedSourceAfterError(
        photo,
        TEAM_PHOTO_PLACEHOLDER,
        TEAM_PHOTO_PLACEHOLDER
      )
    ).toBeNull();
  });

  it("uses existing local placeholders for logos and portraits", () => {
    expect(existsSync(publicAsset(VENTURE_LOGO_PLACEHOLDER))).toBe(true);
    expect(existsSync(publicAsset(TEAM_PHOTO_PLACEHOLDER))).toBe(true);
  });

  it("renders the venture data images through the fallback component", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "VenturePage.tsx"),
      "utf8"
    );

    expect(source).toContain("src={venture.logo}");
    expect(source).toContain("fallbackSrc={VENTURE_LOGO_PLACEHOLDER}");
    expect(source).toContain("src={member.photo}");
    expect(source).toContain("fallbackSrc={TEAM_PHOTO_PLACEHOLDER}");
    expect(source).toMatch(
      /onError=\{\(\) => \{\s*const failed = failedSourceAfterError/
    );
  });

  it("keeps the original venture image URLs until the files are re-uploaded", () => {
    const images = [...venturesFr, ...venturesEn].flatMap(venture => [
      venture.logo,
      ...(venture.team ?? []).map(member => member.photo),
    ]);

    expect(images.filter(Boolean).length).toBeGreaterThan(10);
  });
});
