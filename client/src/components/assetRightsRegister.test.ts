import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("registre de droits visuels", () => {
  it("distingue la provenance technique des autorisations à obtenir", async () => {
    const register = await readFile(path.resolve(process.cwd(), "ASSET_RIGHTS_REGISTER.md"), "utf8");

    expect(register).toContain("ne remplace pas une autorisation écrite");
    expect(register).toContain("À confirmer individuellement");
    expect(register).toContain("Autorisation de reproduction");
    expect(register).toContain("hippocampus-linkedin-recruitment-international_930594ab.png");
    expect(register).toContain("reste ouverte");
  });
});
