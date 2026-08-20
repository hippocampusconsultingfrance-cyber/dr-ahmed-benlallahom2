import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("portée de confiance du calendrier annuel", () => {
  it("documente les revues de design, confidentialité et gouvernance", async () => {
    const source = await readFile(path.join(process.cwd(), "ANNUAL_REVIEW_CALENDAR.md"), "utf8");
    for (const marker of ["Consentement et incidents", "intégration, E2E, régression visuelle", "migrations, sauvegardes et restauration", "administration, rôles, authentification", "données personnelles et de santé", "information médicale, urgence, disclaimer"]) expect(source).toContain(marker);
  });
});
