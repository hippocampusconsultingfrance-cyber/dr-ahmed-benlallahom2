import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("affiche LinkedIn de recrutement", () => {
  it("préserve les zones et contraintes éditoriales de la campagne internationale", async () => {
    const brief = await readFile(path.resolve(process.cwd(), "LINKEDIN_RECRUITMENT_POST.md"), "utf8");

    expect(brief).toContain("hippocampus-linkedin-recruitment-international_930594ab.png");
    expect(brief).toContain("Europe, Canada, Moyen-Orient, Afrique et missions offshore");
    expect(brief).toContain("médicaux et paramédicaux");
    expect(brief).toContain("ne pas ajouter de référence à des résidences de prestige");
  });
});
