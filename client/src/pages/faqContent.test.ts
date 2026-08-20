import { describe, expect, it } from "vitest";
import { getFaqContent } from "./faqContent";

describe("contenu FAQ public", () => {
  it("propose un contenu complet dans les quatre langues", () => {
    for (const locale of ["fr", "en", "de", "zh"] as const) {
      const content = getFaqContent(locale);
      expect(content.entries).toHaveLength(6);
      expect(content.note).toMatch(/urgence|emergency|Notdienst|紧急/);
    }
  });

  it("rappelle que l’analyse recrutement ne décide pas seule", () => {
    expect(getFaqContent("fr").entries.at(-1)?.answer).toMatch(/revue humaine/);
  });
});
