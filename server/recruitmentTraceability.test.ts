import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("traçabilité reproductible des analyses CV", () => {
  it("persiste le texte extrait et le modèle effectivement utilisé avec les métadonnées techniques", async () => {
    const [schema, processing] = await Promise.all([
      readFile(new URL("../drizzle/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("./recruitmentProcessing.ts", import.meta.url), "utf8"),
    ]);

    expect(schema).toContain('extractedText: text("extracted_text")');
    expect(schema).toContain("analysisModel:");
    expect(schema).toContain("analysisPromptVersion:");
    expect(schema).toContain("extractionMethod:");
    expect(processing).toContain("extractedText: pipeline.extraction.text");
    expect(processing).toContain("analysisModel: pipeline.analysisModel");
    expect(processing).toContain("analysisPromptVersion: ANALYSIS_PROMPT_VERSION");
  });
});
