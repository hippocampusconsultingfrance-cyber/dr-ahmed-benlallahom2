import { candidateDocumentAllowsAiAnalysis } from "./candidateDocumentCategories";

const ACTIVE_ANALYSIS_STATES = new Set(["queued", "extracting", "analyzing"]);

export function canRequestCandidateDocumentReanalysis(input: { status: string; analysisStatus: string; category?: string | null }) {
  // Documents reserved for human review (identity, address, retired categories) never go to the AI (LEGAL-12).
  if (input.category !== undefined && !candidateDocumentAllowsAiAnalysis(input.category)) return false;
  return input.status !== "rejected" && !ACTIVE_ANALYSIS_STATES.has(input.analysisStatus);
}
