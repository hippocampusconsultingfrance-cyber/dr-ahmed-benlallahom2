import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("registre de validations externes", () => {
  it("conserve les dépendances non automatisables et interdit leur clôture sans preuve", async () => {
    const register = await readFile(path.resolve(process.cwd(), "EXTERNAL_VALIDATION_REGISTER.md"), "utf8");

    for (const control of ["Lecteur d’écran", "Safari et Firefox", "E-mails HTML", "Rappel de rendez-vous", "Droits des tiers"]) {
      expect(register).toContain(control);
    }
    expect(register).toContain("À réaliser");
    expect(register).toContain("uniquement lorsque sa preuve est rattachée");
  });
});
