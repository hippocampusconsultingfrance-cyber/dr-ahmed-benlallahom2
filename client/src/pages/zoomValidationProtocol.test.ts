import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("protocole de zoom à 200 %", () => {
  it("relie la recette navigateur aux garde-fous de grille et de lisibilité", async () => {
    const root = process.cwd();
    const [protocol, grid, readability] = await Promise.all([
      readFile(path.join(root, "EXTERNAL_VALIDATION_REGISTER.md"), "utf8"),
      readFile(path.join(root, "client/src/pages/publicLayoutGrid.test.ts"), "utf8"),
      readFile(path.join(root, "client/src/contexts/highReadabilityControl.test.ts"), "utf8"),
    ]);
    for (const marker of ["Recette de zoom à 200 %", "défilement horizontal", "l’accueil", "réservation", "ressources", "presse", "bandeau cookies", "Réalisé"]) expect(protocol).toContain(marker);
    expect(grid).toContain("padding-left: 2rem");
    expect(readability).toContain("font-size: 106.25%");
  });
});
