import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("page Presse", () => {
  it("ne revendique aucune publication tierce et couvre les quatre langues", async () => {
    const source = await readFile(path.join(process.cwd(), "client/src/pages/PressPage.tsx"), "utf8");
    for (const marker of ["fr:", "en:", "de:", "zh:", "Aucun communiqué de presse", "sans source et autorisation", "siteConfig.email", "third-party publication"]) expect(source).toContain(marker);
  });
});
