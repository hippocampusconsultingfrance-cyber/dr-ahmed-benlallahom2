import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "./recruitmentAnalysis";

describe("scores de recrutement vérifiés", () => {
  it("versionne les nouvelles analyses et neutralise les anciens scores dans les requêtes", async () => {
    expect(RECRUITMENT_ANALYSIS_PROMPT_VERSION).toBe("recruitment-v7-verified-score");
    expect(RECRUITMENT_ANALYSIS_PROMPT_VERSION.length).toBeLessThanOrEqual(40);
    const source = await readFile(path.join(process.cwd(), "server/routers.ts"), "utf8");
    expect(source).toContain("const verifiedRecruitmentScore");
    expect(source).toContain("aiScore: verifiedRecruitmentScore");
    expect(source).toContain("eq(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION)");
    expect(source).toContain("THEN ${cvApplications.aiSummary} ELSE NULL");
    expect(source).toContain("THEN ${cvApplications.aiExtractedSkills} ELSE NULL");
    expect(source).toContain("verifiedApplicationIds");
    expect(source).toContain("certificationDateIsCurrent(certification.expiresAt)");
  });
});
