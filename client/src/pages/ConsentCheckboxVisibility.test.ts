import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

// Les formulaires appliquent ces états après une tentative d’envoi :
// client/src/publicForms.turnstile.test.ts (contact, espace candidat, candidatures).

describe("consentements obligatoires visibles", () => {
  it("applique des états de contraste, de focus et d’erreur rouge", async () => {
    const css = await readFile(new URL("../index.css", import.meta.url), "utf8");
    expect(css).toContain(".form-consent-checkbox");
    expect(css).toContain(".form-consent-item-invalid");
    expect(css).toContain(".candidate-consent-item-invalid");
    expect(css).toContain("#fb7185");
  });

  it("applique les états rouges aux champs requis et au fichier des candidatures", async () => {
    const css = await readFile(new URL("../index.css", import.meta.url), "utf8");
    expect(css).toContain(".form-field-invalid");
    expect(css).toContain(".form-file-invalid");
    expect(css).toContain("input[required]:user-invalid");
  });
});
