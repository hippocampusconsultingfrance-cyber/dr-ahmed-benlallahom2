import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("calendrier annuel de revue", () => {
  it("couvre les revues de traduction, accessibilité, visuels, contenus médicaux et RGPD", async () => {
    const calendar = await readFile(path.resolve(process.cwd(), "ANNUAL_REVIEW_CALENDAR.md"), "utf8");

    expect(calendar).toContain("Traductions et identité visuelle");
    expect(calendar).toContain("Accessibilité et performances");
    expect(calendar).toContain("Droits sur visuels et logos");
    expect(calendar).toContain("Contenus médicaux et sources");
    expect(calendar).toContain("Pages légales et RGPD");
    expect(calendar).toContain("Communications et documents");
    expect(calendar).toContain("Réservation et paiement");
    expect(calendar).toContain("Administration et qualité technique");
    expect(calendar).toContain("Expérience utilisateur");
    expect(calendar).toContain("Clarté des parcours médicaux et transactionnels");
    expect(calendar).toContain("Référencement et navigation");
    expect(calendar).toContain("Système visuel et interactions");
    expect(calendar).toContain("États et primitives d’interface");
    expect(calendar).toContain("Composants et système visuel");
    expect(calendar).toContain("Canaux et artefacts");
    expect(calendar).toContain("Pages de support");
    expect(calendar).toContain("Pages éditoriales et métier");
    expect(calendar).toContain("Routes et indexation");
    expect(calendar).toContain("Liens de service");
    expect(calendar).toContain("Navigation et droits");
    expect(calendar).toContain("Liens légaux et droits");
    expect(calendar).toContain("Fournisseurs et exploitation");
    expect(calendar).toContain("Contact et service");
    expect(calendar).toContain("Revue graphique trimestrielle");
    expect(calendar).toContain("Routes critiques");
    expect(calendar).toContain("Traçabilité");
  });
});
