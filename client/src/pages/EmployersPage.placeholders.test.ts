import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("aides de saisie Employeurs", () => {
  it("emploie les exemples localisés plutôt que des chaînes françaises fixes", async () => {
    const source = await readFile(new URL("./EmployersPage.tsx", import.meta.url), "utf8");

    for (const key of ["specialtyPlaceholder", "countryPlaceholder", "timelinePlaceholder", "notesPlaceholder"]) {
      expect(source).toContain(key);
    }
    expect(source).toContain("placeholder={t.specialtyPlaceholder}");
    expect(source).toContain("placeholder={t.countryPlaceholder}");
    expect(source).toContain("placeholder={t.timelinePlaceholder}");
    expect(source).toContain("placeholder={t.notesPlaceholder}");
  });
});
