import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("manifeste de bibliothèque visuelle médicale", () => {
  it("impose une provenance, des droits, une alternative et la protection des personnes", async () => {
    const manifest = await readFile(path.resolve(process.cwd(), "MEDICAL_VISUAL_LIBRARY_MANIFEST.md"), "utf8");

    expect(manifest).toContain("aucun visuel médical authentique supplémentaire n’est ajouté");
    expect(manifest).toContain("Autorisation ou licence");
    expect(manifest).toContain("Alternative textuelle");
    expect(manifest).toContain("Aucune donnée identifiable de patient");
    expect(manifest).toContain("ASSET_RIGHTS_REGISTER.md");
  });
});
