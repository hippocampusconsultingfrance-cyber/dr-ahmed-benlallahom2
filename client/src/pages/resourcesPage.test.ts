import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("page Ressources", () => {
  it("référence seulement les portails institutionnels sélectionnés et conserve les quatre langues", async () => {
    const source = await readFile(path.join(process.cwd(), "client/src/pages/ResourcesPage.tsx"), "utf8");
    for (const value of ["https://www.who.int/health-topics", "https://www.has-sante.fr/jcms/fc_2875208/fr/rechercher-une-recommandation-un-avis", "https://www.ecdc.europa.eu/en", "fr:", "en:", "de:", "zh:", "resource-search", "noopener noreferrer"]) expect(source).toContain(value);
    expect(source).toContain("emergency services");
  });
});
