import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("registres externes de conformité", () => {
  it("n’autorise pas une clôture sans preuve externe et protège les visuels non justifiés", async () => {
    const [external, assets, partners, todo] = await Promise.all([
      readFile(path.resolve(process.cwd(), "EXTERNAL_VALIDATION_REGISTER.md"), "utf8"),
      readFile(path.resolve(process.cwd(), "VISUAL_ASSET_RIGHTS_REGISTER.md"), "utf8"),
      readFile(path.resolve(process.cwd(), "PARTNER_PUBLICATION_REGISTER.md"), "utf8"),
      readFile(path.resolve(process.cwd(), "todo.md"), "utf8"),
    ]);

    expect(external).toContain("ne remplace jamais la preuve externe");
    expect(external).toContain("Gmail, Outlook et Apple Mail");
    expect(assets).toContain("Aucune publication nouvelle par défaut");
    expect(assets).toContain("Aucun nouveau visuel médical authentique");
    expect(partners).toContain("Aucune page Partenaires");
    expect(partners).toContain("accord implicite");
    expect(todo).toContain("EXTERNAL_VALIDATION_REGISTER.md");
    expect(todo).toContain("VISUAL_ASSET_RIGHTS_REGISTER.md");
    expect(todo).toContain("PARTNER_PUBLICATION_REGISTER.md");
  });
});
