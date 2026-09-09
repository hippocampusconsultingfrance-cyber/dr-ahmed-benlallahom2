import { describe, expect, it } from "vitest";
import {
  RECRUITMENT_ANALYSIS_FALLBACK_MODEL,
  RECRUITMENT_ANALYSIS_PRIMARY_MODEL,
  RECRUITMENT_OCR_MODEL,
} from "./recruitmentAnalysis";

describe("réponse IA recrutement", () => {
  it("utilise des identifiants AI Gateway explicites et versionnés", () => {
    expect(RECRUITMENT_ANALYSIS_PRIMARY_MODEL).toBe("openai/gpt-6-astra");
    expect(RECRUITMENT_ANALYSIS_FALLBACK_MODEL).toBe("google/gemini-3.8-flash");
    expect(RECRUITMENT_OCR_MODEL).toBe(RECRUITMENT_ANALYSIS_FALLBACK_MODEL);
  });

  it("ne dépend plus d’un modèle Manus historique", () => {
    expect(RECRUITMENT_ANALYSIS_PRIMARY_MODEL).not.toContain("manus");
    expect(RECRUITMENT_ANALYSIS_FALLBACK_MODEL).not.toContain("preview");
  });
});
