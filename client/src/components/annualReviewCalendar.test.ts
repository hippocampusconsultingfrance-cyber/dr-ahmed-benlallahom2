import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("calendrier annuel de revue", () => {
  it("prépare les revues éditoriales, conformité, parcours et technique", async () => {
    const source = await readFile(path.join(process.cwd(), "ANNUAL_REVIEW_CALENDAR.md"), "utf8");
    for (const marker of ["T1", "T2", "T3", "T4", "Traductions", "Lecteur d’écran", "Droits sur visuels", "pages légales/RGPD", "Réservation", "dashboard", "Domaines", "sitemap", "Sobriété"]) expect(source).toContain(marker);
  });
});
