import { describe, expect, it } from "vitest";
import { canRequestCandidateDocumentReanalysis } from "../shared/candidateDocumentReanalysis";

describe("reprise d’analyse documentaire candidate", () => {
  it("autorise la relance d’un document passé en revue humaine après une analyse indisponible", () => {
    expect(
      canRequestCandidateDocumentReanalysis({
        status: "reviewed",
        analysisStatus: "needs_review",
      })
    ).toBe(true);
  });

  it("bloque un document refusé ou une analyse déjà active", () => {
    expect(
      canRequestCandidateDocumentReanalysis({
        status: "rejected",
        analysisStatus: "needs_review",
      })
    ).toBe(false);
    expect(
      canRequestCandidateDocumentReanalysis({
        status: "needs_review",
        analysisStatus: "analyzing",
      })
    ).toBe(false);
  });

  it("suit la tâche quand elle est connue : un document resté « en attente » ou « en cours » sans tâche active se relance (DATA-06)", () => {
    expect(
      canRequestCandidateDocumentReanalysis({
        status: "uploaded",
        analysisStatus: "queued",
        category: "diploma",
        hasActiveAnalysisJob: false,
      })
    ).toBe(true);
    expect(
      canRequestCandidateDocumentReanalysis({
        status: "analyzing",
        analysisStatus: "analyzing",
        category: "diploma",
        hasActiveAnalysisJob: false,
      })
    ).toBe(true);
    expect(
      canRequestCandidateDocumentReanalysis({
        status: "needs_review",
        analysisStatus: "needs_review",
        category: "diploma",
        hasActiveAnalysisJob: true,
      })
    ).toBe(false);
    expect(
      canRequestCandidateDocumentReanalysis({
        status: "rejected",
        analysisStatus: "queued",
        category: "diploma",
        hasActiveAnalysisJob: false,
      })
    ).toBe(false);
    expect(
      canRequestCandidateDocumentReanalysis({
        status: "uploaded",
        analysisStatus: "queued",
        category: "identity_document",
        hasActiveAnalysisJob: false,
      })
    ).toBe(false);
  });
});
