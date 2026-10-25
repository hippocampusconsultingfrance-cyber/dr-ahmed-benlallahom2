import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vérification des preuves IA dans l’administration", () => {
  it("signale les citations retrouvées sans les dire vérifiées et masque le détail d’un score neutralisé", async () => {
    const source = await readFile(path.join(process.cwd(), "client/src/components/RecruitmentTab.tsx"), "utf8");
    // Wording of each quote's status: see recruitmentEvidenceLabels.test.ts (IA-01).
    expect(source).toContain("{fieldEvidenceStatusLabel(item)}");
    expect(source).toContain("{contradictionEvidenceLabel(item.evidenceVerified)}");
    expect(source).toContain("{CV_REVIEW_REMINDER}");
    expect(source).toContain("{fieldEvidenceStatusTone(item)}");
    expect(source).not.toContain("Citation vérifiée");
    expect(source).toContain("verifiedScore !== null && extracted.scoreBreakdown");
    expect(source).toContain("recruitment-v7-verified-score");
    expect(source).toContain("Score à recalculer");
    // Headings and saved texts of the CV reading: see recruitmentEvidenceLabels.test.ts (IA-01).
    expect(source).toContain("{CV_READING_LABELS.skills}");
    expect(source).toContain("{CV_READING_LABELS.summary}");
    expect(source).toContain("{CV_READING_LABELS.profile}");
    expect(source).toContain("{CV_READING_LABELS.strengths}");
    expect(source).toContain("{cvReadingTextForDisplay(application.aiSummary)}");
    expect(source).toContain("{cvReadingTextForDisplay(application.aiMatchReasoning)}");
    expect(source).toContain("{cvReadingTextForDisplay(item)}");
    for (const legacy of ["Compétences vérifiées", "Synthèse des preuves vérifiées", "Profil vérifié dans le CV", "Éléments professionnels vérifiés", "Certifications vérifiées"]) expect(source).not.toContain(legacy);
  });
});
