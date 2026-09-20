import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vérification des preuves IA dans l’administration", () => {
  it("signale les citations vérifiées et masque le détail d’un score neutralisé", async () => {
    const source = await readFile(path.join(process.cwd(), "client/src/components/RecruitmentTab.tsx"), "utf8");
    expect(source).toContain("Citation vérifiée dans le texte");
    expect(source).toContain("Citation à vérifier manuellement");
    expect(source).toContain("Donnée déclarée, non vérifiée dans le CV");
    expect(source).toContain("verifiedScore !== null && extracted.scoreBreakdown");
    expect(source).toContain("recruitment-v6-page-scoped-evidence");
    expect(source).toContain("Score à recalculer");
    expect(source).toContain("Compétences vérifiées");
  });
});
