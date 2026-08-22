import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../client/src/components/MedicalQuestionsAdminTab.tsx", import.meta.url), "utf8");

describe("sélection administrative Questions santé", () => {
  it("préserve le panneau de réponse lorsqu’une question contient une URL ou une chaîne longue", () => {
    expect(source).toContain("lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]");
    expect(source).toContain("min-w-0 w-full rounded-2xl");
    expect(source).toContain("[overflow-wrap:anywhere]");
  });

  it("affiche une erreur exploitable si la fiche privée ne peut pas être chargée", () => {
    expect(source).toContain("selected.error");
    expect(source).toContain("Impossible de charger cette demande privée.");
    expect(source).toContain("Réessayer le chargement");
  });
});
