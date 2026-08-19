import { describe, expect, it } from "vitest";
import { canRequestCandidateDocumentReanalysis } from "../shared/candidateDocumentReanalysis";

describe("reprise d’analyse documentaire candidate", () => {
  it("autorise la relance d’un document passé en revue humaine après une analyse indisponible", () => {
    expect(canRequestCandidateDocumentReanalysis({ status: "reviewed", analysisStatus: "needs_review" })).toBe(true);
  });

  it("bloque un document refusé ou une analyse déjà active", () => {
    expect(canRequestCandidateDocumentReanalysis({ status: "rejected", analysisStatus: "needs_review" })).toBe(false);
    expect(canRequestCandidateDocumentReanalysis({ status: "needs_review", analysisStatus: "analyzing" })).toBe(false);
  });
});
