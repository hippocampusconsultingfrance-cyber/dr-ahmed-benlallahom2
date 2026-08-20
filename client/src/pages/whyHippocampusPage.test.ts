import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("présentation éditoriale Hippocampus", () => {
  it("conserve la méthode, les zones, la revue humaine et les quatre langues", async () => {
    const source = await readFile(path.join(process.cwd(), "client/src/pages/WhyHippocampusPage.tsx"), "utf8");
    for (const marker of ["fr:", "en:", "de:", "zh:", "Notre méthode en quatre étapes", "Europe · Canada · Moyen-Orient · Afrique", "toute sélection reste humaine", "/employers", "/recruitment"]) {
      expect(source).toContain(marker);
    }
  });
});
