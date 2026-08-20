import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("registre de publication Partenaires", () => {
  it("interdit toute publication avant autorisation écrite et contenu approuvé", async () => {
    const register = await readFile(path.resolve(process.cwd(), "PARTNER_PUBLICATION_REGISTER.md"), "utf8");

    expect(register).toContain("aucune page Partenaires n’est publiée");
    expect(register).toContain("accord implicite");
    expect(register).toContain("Logo/visuel approuvé");
    expect(register).toContain("Bloquée jusqu’à validation complète");
    expect(register).toContain("désactivation immédiate");
  });
});
