import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("formulaire VVIP multilingue", () => {
  it("utilise des aides de saisie et choix de spécialité localisés", async () => {
    const source = await readFile(new URL("./VvipOffshorePage.tsx", import.meta.url), "utf8");

    expect(source).toContain("experiencePlaceholder");
    expect(source).toContain("certificationsPlaceholder");
    expect(source).toContain("fileHint");
    expect(source).toContain("{t.specialties.map((opt) => (");
    expect(source).toContain('placeholder={t.experiencePlaceholder}');
    expect(source).toContain('placeholder={t.certificationsPlaceholder}');
  });
});
