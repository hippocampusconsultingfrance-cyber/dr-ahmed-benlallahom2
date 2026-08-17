import { describe, expect, it } from "vitest";
import { analysisCompletionStatus, extractionMethodFor, retryDelayMs } from "./recruitmentProcessing";

describe("règles déterministes du pipeline de traitement CV", () => {
  it("identifie les parseurs attendus pour PDF, DOCX et DOC", () => {
    expect(extractionMethodFor("application/pdf")).toBe("pdf_text_or_vision");
    expect(extractionMethodFor("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
    expect(extractionMethodFor("application/msword")).toBe("doc");
    expect(extractionMethodFor("text/plain")).toBe("unknown");
  });

  it("applique des reprises exponentielles plafonnées", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(10)).toBe(3_600_000);
  });

  it("termine une analyse propre et impose une revue humaine en cas d’incertitude", () => {
    expect(analysisCompletionStatus({ gaps: [], dataQualityWarnings: [] })).toBe("completed");
    expect(analysisCompletionStatus({ gaps: ["certification non vérifiée"], dataQualityWarnings: [] })).toBe("needs_review");
    expect(analysisCompletionStatus({ gaps: [], dataQualityWarnings: ["date ambiguë"] })).toBe("needs_review");
  });
});
