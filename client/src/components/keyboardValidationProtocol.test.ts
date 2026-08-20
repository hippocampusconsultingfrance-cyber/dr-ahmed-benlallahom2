import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("protocole de navigation clavier", () => {
  it("relie les garde-fous automatisés à la recette navigateur réelle", async () => {
    const root = process.cwd();
    const [protocol, navigation, dialog] = await Promise.all([
      readFile(path.join(root, "EXTERNAL_VALIDATION_REGISTER.md"), "utf8"),
      readFile(path.join(root, "client/src/components/navigationKeyboard.test.ts"), "utf8"),
      readFile(path.join(root, "client/src/components/dialogKeyboard.test.ts"), "utf8"),
    ]);
    for (const marker of ["Recette de navigation clavier", "lien d’évitement", "ordre de tabulation", "Échap", "retour de focus", "Contact/RGPD/Réservation"]) expect(protocol).toContain(marker);
    expect(navigation).toContain("getMenuFocusIndex");
    expect(navigation).toContain("isNavigationDismissKey");
    expect(dialog).toContain("Escape");
  });
});
