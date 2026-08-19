import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("revue documentaire administrative multilingue", () => {
  it("utilise une copie dans les quatre langues pour les contrôles et retours", async () => {
    const source = await readFile(new URL("./CandidateDocumentsAdminTab.tsx", import.meta.url), "utf8");
    expect(source).toContain("const candidateDocumentsCopy = {");
    expect(source).toContain("fr:");
    expect(source).toContain("en:");
    expect(source).toContain("de:");
    expect(source).toContain("zh:");
    expect(source).toContain("const { language } = useLanguage();");
    expect(source).toContain("placeholder={copy.reviewPlaceholder}");
  });
});
