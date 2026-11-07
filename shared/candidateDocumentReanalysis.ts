import { candidateDocumentAllowsAiAnalysis } from "./candidateDocumentCategories";

const ACTIVE_ANALYSIS_STATES = new Set(["queued", "extracting", "analyzing"]);

/** States of an analysis job still to run or running (DATA-06). */
export const CANDIDATE_DOCUMENT_ACTIVE_JOB_STATUSES = ["queued", "retry", "running"] as const;

/**
 * `hasActiveAnalysisJob`, when known (the admin's list and the reanalysis
 * itself read it), decides whether an analysis is under way: a document left
 * « en attente » or « en cours » with no job queued, retried or running (an
 * interrupted upload or run) can be analysed again (DATA-06). Without it, the
 * document's own analysis status decides.
 */
export function canRequestCandidateDocumentReanalysis(input: { status: string; analysisStatus: string; category?: string | null; hasActiveAnalysisJob?: boolean }) {
  // Documents reserved for human review (identity, address, retired categories) never go to the AI (LEGAL-12).
  if (input.category !== undefined && !candidateDocumentAllowsAiAnalysis(input.category)) return false;
  const analysisActive = input.hasActiveAnalysisJob ?? ACTIVE_ANALYSIS_STATES.has(input.analysisStatus);
  return input.status !== "rejected" && !analysisActive;
}
