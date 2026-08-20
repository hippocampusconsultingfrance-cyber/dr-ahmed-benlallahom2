import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("checklist de validation manuelle", () => {
  it("distingue les preuves automatisées des contrôles sur appareil réel", async () => {
    const checklist = await readFile(path.resolve(process.cwd(), "MANUAL_VALIDATION_CHECKLIST.md"), "utf8");

    expect(checklist).toContain("Clavier seul");
    expect(checklist).toContain("Lecteur d’écran");
    expect(checklist).toContain("Zoom natif 200 %");
    expect(checklist).toContain("Correspondance avec les contrôles automatisés");
    expect(checklist).toContain("appareil réel");
    expect(checklist).toContain("Compatibilité multi-navigateurs");
    expect(checklist).toContain("Firefox récent");
    expect(checklist).toContain("Safari macOS / iOS récent");
  });
});
