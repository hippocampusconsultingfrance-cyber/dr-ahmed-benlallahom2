import { describe, expect, it } from "vitest";
import { analyzeCvText, extractCvText, normalizeRecruitmentAnalysis } from "./recruitmentAnalysis";

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

  it("recalcule le score côté serveur et mesure la couverture des preuves", () => {
    const result = normalizeRecruitmentAnalysis({
      summary: "Profil clinique documenté.",
      professionalTitle: "Médecin anesthésiste",
      specialties: ["Anesthésie", "Anesthésie"],
      skills: ["Réanimation"],
      languages: ["Français"],
      normalizedLanguages: [{ language: "Français", proficiency: "fluent", evidence: "Français : courant" }],
      certifications: [{ name: "ACLS", issuingBody: null, country: null, expiresAt: null, evidence: "Certification ACLS" }],
      countriesOfInterest: ["France"],
      yearsExperience: 8,
      normalizedExperiences: [{ role: "Médecin", organization: "Hôpital", startDate: "2018-01", endDate: "2026-01", employmentType: "permanent", specialty: "Anesthésie", country: "Tunisie", durationMonths: 96, evidence: "Médecin anesthésiste, Hôpital, 2018-2026" }],
      strengths: ["Expérience documentée"],
      gaps: [],
      dataQualityWarnings: [],
      requiredFollowUps: ["Confirmer l’inscription ordinale"],
      confidence: 91,
      scoreBreakdown: { specialtyMatch: 29, experienceEvidence: 23, skillsEvidence: 18, languageReadiness: 13, credentialReadiness: 7 },
      reasoning: "Score fondé uniquement sur les éléments professionnels cités.",
    });

    expect(result.relevanceScore).toBe(90);
    expect(result.evidenceCoverage).toBe(100);
    expect(result.specialties).toEqual(["Anesthésie"]);
  });
});
