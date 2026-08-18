import { describe, expect, it } from "vitest";
import { analysisProviderForAttempt, analyzeCvText, extractCvText } from "./recruitmentAnalysis";

describe("recruitment analysis safeguards", () => {
  it("refuses unknown formats instead of pretending they were analyzed", async () => {
    await expect(extractCvText(Buffer.from("unknown"), "application/octet-stream")).rejects.toThrow(
      "non pris en charge",
    );
  });

  it("rejects CV text that is too short before calling the LLM", async () => {
    await expect(
      analyzeCvText({
        firstName: "A",
        lastName: "Candidate",
        specialty: "Médecine",
        targetCountries: ["France"],
        languages: ["Français"],
        extractedText: "CV trop court",
      }),
    ).rejects.toThrow("insuffisant");
  });

  it("alterne le fournisseur IA lors d’une reprise afin de limiter le délai de chaque tentative", () => {
    expect(analysisProviderForAttempt(1)).toBe("gpt-5-mini");
    expect(analysisProviderForAttempt(2)).toBe("gemini-3-flash-preview");
    expect(analysisProviderForAttempt(3)).toBe("claude-haiku-4-5");
  });
});
