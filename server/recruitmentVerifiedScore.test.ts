import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "./recruitmentAnalysis";

describe("scores de recrutement vérifiés", () => {
  it("versionne les nouvelles analyses et neutralise les anciens scores dans les requêtes", async () => {
    expect(RECRUITMENT_ANALYSIS_PROMPT_VERSION).toBe("recruitment-v6-page-scoped-evidence");
    const source = await readFile(path.join(process.cwd(), "server/routers.ts"), "utf8");
    expect(source).toContain("const verifiedRecruitmentScore");
    expect(source).toContain("aiScore: verifiedRecruitmentScore");
    expect(source).toContain("eq(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION)");
  });
});
