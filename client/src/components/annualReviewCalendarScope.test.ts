import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("portée de confiance du calendrier annuel", () => {
  it("documente les revues de design, confidentialité et gouvernance", async () => {
    const source = await readFile(path.join(process.cwd(), "ANNUAL_REVIEW_CALENDAR.md"), "utf8");
    for (const marker of ["Confiance, design et gouvernance", "conversion et analytics", "DPA, contrats", "reprise après sinistre", "Résilience et intégrité éditoriale", "vérification des sources", "auteur, relecteur, publication", "Contenu structuré et représentation", "alternatives textuelles", "témoignages authentiques et autorisés", "Conformité, confidentialité et droits", "Core Web Vitals", "transferts internationaux", "Consentement et incidents", "registre des traitements", "retrait, version, journalisation", "rendu mobile/tablette/bureau/navigateurs", "zoom, réduction de mouvement", "skeleton, toast, modal, drawer et dropdown", "select, input, textarea", "alert dialog, command et context menu", "menubar, navigation menu, sidebar", "collapsible, combobox et date picker"]) expect(source).toContain(marker);
  });
});
