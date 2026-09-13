import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./RecruitmentTab.tsx", import.meta.url), "utf8");

describe("reprise manuelle de l'accusé de candidature", () => {
  it("propose une reprise lorsque le suivi est absent ou en échec", () => {
    expect(source).toContain('application.emailDelivery?.eventType === "email.failed" || !application.emailDelivery?.eventType');
    expect(source).toContain('"Envoyer l’accusé"');
    expect(source).toContain('"Renvoyer l’accusé"');
  });

  it("avertit l'administrateur du risque de doublon avant un envoi sans trace", () => {
    expect(source).toContain("Aucune preuve d’envoi n’est disponible.");
    expect(source).toContain("un doublon reste possible");
  });
});
