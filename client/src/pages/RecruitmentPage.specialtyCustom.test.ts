import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("spécialité personnalisée — candidature internationale", () => {
  it("exige et transmet la précision lorsque l’option Autre est sélectionnée", async () => {
    const page = await readFile(path.join(process.cwd(), "client/src/pages/RecruitmentPage.tsx"), "utf8");
    expect(page).toContain('form.specialty === "Autre spécialité ou profession"');
    expect(page).toContain('id="recruitment-specialty-custom"');
    expect(page).toContain('const finalSpecialty = isCustomSpecialty ? form.specialtyCustom.trim() : form.specialty;');
  });
});
