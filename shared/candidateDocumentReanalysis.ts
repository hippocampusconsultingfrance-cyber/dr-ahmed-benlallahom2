const ACTIVE_ANALYSIS_STATES = new Set(["queued", "extracting", "analyzing"]);

export function canRequestCandidateDocumentReanalysis(input: { status: string; analysisStatus: string }) {
  return input.status !== "rejected" && !ACTIVE_ANALYSIS_STATES.has(input.analysisStatus);
}
