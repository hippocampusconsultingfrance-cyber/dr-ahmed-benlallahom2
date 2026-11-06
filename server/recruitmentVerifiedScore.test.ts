import { describe, expect, it } from "vitest";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "./recruitmentAnalysis";

// The scores of older analyses are set aside in the lists, the pool and the
// campaign audiences: server/recruitmentScoreUnavailable.test.ts and
// server/adminRecruitmentProcedures.test.ts run those queries.
describe("scores de recrutement vérifiés", () => {
  it("versionne les nouvelles analyses dans la colonne analysis_prompt_version", () => {
    expect(RECRUITMENT_ANALYSIS_PROMPT_VERSION).toBe("recruitment-v7-verified-score");
    expect(RECRUITMENT_ANALYSIS_PROMPT_VERSION.length).toBeLessThanOrEqual(40);
  });
});
