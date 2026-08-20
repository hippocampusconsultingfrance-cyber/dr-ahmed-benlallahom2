import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("registre de validations externes", () => {
  it("conserve les dépendances non automatisables et interdit leur clôture sans preuve", async () => {
    const register = await readFile(path.resolve(process.cwd(), "EXTERNAL_VALIDATION_REGISTER.md"), "utf8");

    for (const control of ["Lecteur d’écran", "Clavier seul et zoom 200 %", "Safari et Firefox", "E-mails HTML", "Rappel de rendez-vous", "Dashboard sur mobile/tablette", "Droits des tiers"]) {
      expect(register).toContain(control);
    }
    expect(register).toContain("À réaliser");
    expect(register).toContain("uniquement lorsque sa preuve est rattachée");
    expect(register).toContain("ne remplace jamais l’exécution du contrôle externe");
  });

  it("distingue le suivi interne clôturé de la preuve externe qui reste à archiver", async () => {
    const todo = await readFile(path.resolve(process.cwd(), "todo.md"), "utf8");

    for (const item of ["dashboard administrateur sur mobile réel/tablette", "Gmail, Outlook et Apple Mail", "lecteur d’écran", "navigateur réel", "rendez-vous de test autorisé"]) {
      expect(todo).toContain(item);
    }
    expect(todo).toContain("EXTERNAL_VALIDATION_REGISTER.md");
  });
});
