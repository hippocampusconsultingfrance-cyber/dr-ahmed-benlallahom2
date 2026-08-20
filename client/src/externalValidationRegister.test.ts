import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("registre des prérequis externes", () => {
  it("documente les validations impossibles à simuler localement", async () => {
    const source = await readFile(path.join(process.cwd(), "EXTERNAL_VALIDATION_REGISTER.md"), "utf8");
    for (const marker of ["Visuels médicaux authentiques", "Prévisualisation de facture", "Notifications SMS", "Dépôt de candidature de production", "Antivirus du coffre candidat"]) {
      expect(source).toContain(marker);
    }
  });
});
