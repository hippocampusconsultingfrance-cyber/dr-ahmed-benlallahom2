import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const processingSource = readFileSync(new URL("./recruitmentProcessing.ts", import.meta.url), "utf8");

describe("relance immédiate des analyses CV", () => {
  it("traite immédiatement le CV explicitement relancé", () => {
    expect(routerSource).toContain("processDueCvAnalysisJobs(1, [application.id])");
    expect(processingSource).toContain("inArray(cvProcessingJobs.applicationId, applicationIds)");
  });

  it("reprend aussi les dossiers déjà placés dans la file par une relance précédente", () => {
    expect(routerSource).toContain('inArray(cvApplications.analysisStatus, ["failed", "queued"])');
    expect(routerSource).toContain("ne(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION)");
    expect(routerSource).toContain("processDueCvAnalysisJobs(Math.min(applicationIds.length, 2), applicationIds)");
  });
});


