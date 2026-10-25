import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vérification des preuves IA dans l’administration", () => {
  it("signale les citations retrouvées et masque le détail d’un score neutralisé", async () => {
    const source = await readFile(path.join(process.cwd(), "client/src/components/RecruitmentTab.tsx"), "utf8");
    // Wording of each quote's status: see recruitmentEvidenceLabels.test.ts (IA-01).
    expect(source).toContain("{fieldEvidenceStatusLabel(item)}");
    expect(source).toContain("{contradictionEvidenceLabel(item.evidenceVerified)}");
    expect(source).toContain("{CV_REVIEW_REMINDER}");
    expect(source).not.toContain("Citation vérifiée");
    expect(source).toContain("verifiedScore !== null && extracted.scoreBreakdown");
    expect(source).toContain("recruitment-v7-verified-score");
    expect(source).toContain("Score à recalculer");
    expect(source).toContain("Compétences vérifiées");
    expect(source).toContain("Synthèse des preuves vérifiées");
    expect(source).toContain("Profil vérifié dans le CV");
    expect(source).toContain("Éléments professionnels vérifiés");
  });
});
