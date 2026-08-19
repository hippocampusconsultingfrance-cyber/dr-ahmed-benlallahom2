import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("briefs Employeurs multilingues", () => {
  it("localise les statuts, actions et résultats de shortlist dans les quatre langues actives", async () => {
    const source = await readFile(new URL("./EmployerBriefsTab.tsx", import.meta.url), "utf8");
    expect(source).toContain("const briefCopy = {");
    expect(source).toContain("const { language } = useLanguage();");
    expect(source).toContain("copy.statuses");
    expect(source).toContain("{copy.title}");
    expect(source).toContain("{copy.viewProfiles}");
    expect(source).toContain("{copy.shortlistAssisted}");
    expect(source).toContain("{copy.humanReview}");
    expect(source).toContain("{copy.previous}");
    expect(source).toContain("{copy.loadError}</p>");
    expect(source).not.toContain("{copy.loadError}: {error.message}");
  });
});
