import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("vivier administratif multilingue", () => {
  it("utilise une copie dans les quatre langues pour les filtres et actions", async () => {
    const source = await readFile(new URL("./VivierTab.tsx", import.meta.url), "utf8");
    expect(source).toContain("const vivierCopy = {");
    expect(source).toContain("const { language } = useLanguage();");
    expect(source).toContain("placeholder={copy.specialtyPlaceholder}");
    expect(source).toContain("placeholder={copy.countryPlaceholder}");
    expect(source).toContain("placeholder={copy.availabilityPlaceholder}");
    expect(source).toContain("placeholder={copy.mobilityPlaceholder}");
  });
});
