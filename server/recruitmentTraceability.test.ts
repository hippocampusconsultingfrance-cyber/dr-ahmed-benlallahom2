import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("traçabilité reproductible des analyses CV", () => {
  it("persiste le texte extrait et le modèle effectivement utilisé avec les métadonnées techniques", async () => {
    const [schema, processing, analysis] = await Promise.all([
      readFile(new URL("../drizzle/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("./recruitmentProcessing.ts", import.meta.url), "utf8"),
      readFile(new URL("./recruitmentAnalysis.ts", import.meta.url), "utf8"),
    ]);

    expect(schema).toContain('extractedText: text("extracted_text")');
    expect(schema).toContain("analysisModel:");
    expect(schema).toContain("analysisPromptVersion:");
    expect(schema).toContain("extractionMethod:");
    expect(processing).toContain("extractedText: extraction.text");
    expect(processing).toContain("set(cvExtractionPersistenceFields(validation, extraction))");
    expect(processing).toContain("await onExtracted?.({ validation, extraction });");
    expect(processing.indexOf("await onExtracted?.({ validation, extraction });"))
      .toBeLessThan(processing.indexOf("await steps.analyze({"));
    expect(processing).toContain("analysisModel: pipeline.analysisModel");
    expect(processing).toContain("analysisPromptVersion: RECRUITMENT_ANALYSIS_PROMPT_VERSION");
    expect(analysis).toContain("await db.batch([");
    expect(analysis).toContain("analysisPromptVersion: RECRUITMENT_ANALYSIS_PROMPT_VERSION");
  });
});
