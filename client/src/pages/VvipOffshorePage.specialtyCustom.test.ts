import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("spécialité personnalisée — candidature VVIP", () => {
  it("demande une précision pour Autre et transmet la valeur personnalisée", async () => {
    const page = await readFile(path.join(process.cwd(), "client/src/pages/VvipOffshorePage.tsx"), "utf8");
    expect(page).toContain("specialtyCustom: string;");
    expect(page).toContain('id="vvip-specialty-custom"');
    expect(page).toContain("const finalSpecialty = isCustomSpecialty ? form.specialtyCustom.trim() : form.specialty;");
  });
});
