import { describe, expect, it } from "vitest";
import {
  analyzeCvText,
  buildManualReviewFallback,
  extractCvText,
  isAiGatewayBillingUnavailable,
  normalizeRecruitmentAnalysis,
  verifyCvEvidence,
  verifiedRecruitmentFacts,
} from "./recruitmentAnalysis";

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
      normalizedLanguages: [{ language: "Français", proficiency: "fluent", evidence: "Français : courant", sourceLocation: "page 2", confidence: 98 }],
      certifications: [{ name: "ACLS", issuingBody: null, country: null, expiresAt: null, evidence: "Certification ACLS", sourceLocation: "page 2", confidence: 95 }],
      countriesOfInterest: ["France"],
      yearsExperience: 8,
      normalizedExperiences: [{ role: "Médecin", organization: "Hôpital", startDate: "2018-01", endDate: "2026-01", employmentType: "permanent", specialty: "Anesthésie", country: "Tunisie", durationMonths: 96, evidence: "Médecin anesthésiste, Hôpital, 2018-2026", sourceLocation: "page 1", confidence: 96 }],
      strengths: ["Expérience documentée"],
      gaps: [],
      dataQualityWarnings: [],
      requiredFollowUps: ["Confirmer l’inscription ordinale"],
      fieldEvidence: [
        { field: "professionalTitle", value: "Médecin anesthésiste", evidence: "Médecin anesthésiste", sourceLocation: "page 1", confidence: 97 },
        { field: "skill", value: "Réanimation", evidence: "Compétence : Réanimation", sourceLocation: "page 1", confidence: 94 },
      ],
      contradictions: [{ field: "yearsExperience", declaredValue: "8", documentValue: "7 ans", evidence: "7 ans (2019-2026)", sourceLocation: "page 1", confidence: 90 }],
      confidence: 91,
      scoreBreakdown: { specialtyMatch: 29, experienceEvidence: 23, skillsEvidence: 18, languageReadiness: 13, credentialReadiness: 7 },
      reasoning: "Score fondé uniquement sur les éléments professionnels cités.",
    }, `[PAGE 1]
Médecin anesthésiste, Hôpital, 2018-2026
Compétence : Réanimation
7 ans (2019-2026)
[PAGE 2]
Français : courant
Certification ACLS`);

    expect(result.relevanceScore).toBe(90);
    expect(result.evidenceCoverage).toBe(100);
    expect(result.specialties).toEqual(["Anesthésie"]);
    expect(result.fieldEvidence[0]?.sourceLocation).toBe("page 1");
    expect(result.fieldEvidence[0]?.evidenceVerified).toBe(true);
    expect(result.contradictions).toHaveLength(1);
  });

  it("neutralise le score lorsque les citations IA ne sont pas vérifiables dans le CV", () => {
    const result = normalizeRecruitmentAnalysis({
      summary: "Profil clinique à confirmer.",
      professionalTitle: "Médecin anesthésiste",
      specialties: ["Anesthésie"],
      skills: [],
      languages: [],
      normalizedLanguages: [],
      certifications: [{ name: "ACLS", issuingBody: null, country: null, expiresAt: null, evidence: "Certification ACLS 2025", sourceLocation: "page 9", confidence: 98 }],
      countriesOfInterest: [],
      yearsExperience: null,
      normalizedExperiences: [],
      strengths: [],
      gaps: [],
      dataQualityWarnings: [],
      requiredFollowUps: [],
      fieldEvidence: [{ field: "professionalTitle", value: "Médecin anesthésiste", evidence: "Médecin anesthésiste", sourceLocation: "page 1", confidence: 95 }],
      contradictions: [],
      confidence: 94,
      scoreBreakdown: { specialtyMatch: 30, experienceEvidence: 20, skillsEvidence: 15, languageReadiness: 10, credentialReadiness: 10 },
      reasoning: "Score proposé par le modèle.",
    }, "[PAGE 1]\nMédecin anesthésiste en réanimation.");

    expect(result.evidenceCoverage).toBe(50);
    expect(result.relevanceScore).toBeNull();
    expect(result.confidence).toBe(50);
    expect(result.scoreBreakdown.experienceEvidence).toBe(0);
    expect(result.scoreBreakdown.skillsEvidence).toBe(0);
    expect(result.scoreBreakdown.languageReadiness).toBe(0);
    expect(result.scoreBreakdown.credentialReadiness).toBe(0);
    expect(result.certifications[0]?.evidenceVerified).toBe(false);
    expect(result.certifications[0]?.confidence).toBe(25);
    expect(result.dataQualityWarnings.join(" ")).toContain("ne correspondent pas exactement");
    expect(result.requiredFollowUps).toContain("Vérifier manuellement les preuves avant d’utiliser le score professionnel.");
  });

  it("tolère les accents et la ponctuation, mais refuse une page inexistante", () => {
    const source = "[PAGE 2]\nMédecin-réanimateur : expérience confirmée.";
    expect(verifyCvEvidence("Medecin reanimateur, experience confirmee", "page 2", source)).toBe(true);
    expect(verifyCvEvidence("Médecin-réanimateur", "page 7", source)).toBe(false);
  });

  it("refuse une citation réelle lorsqu’elle est attribuée à la mauvaise page", () => {
    const source = "[PAGE 1]\nCertification ACLS\n[PAGE 2]\nFrançais courant";
    expect(verifyCvEvidence("Certification ACLS", "page 1", source)).toBe(true);
    expect(verifyCvEvidence("Certification ACLS", "page 2", source)).toBe(false);
  });

  it("ne calcule pas de score à partir d’une seule citation même vérifiée", () => {
    const result = normalizeRecruitmentAnalysis({
      summary: "Information professionnelle trop limitée pour un score.",
      professionalTitle: "Médecin",
      specialties: [],
      skills: [],
      languages: [],
      normalizedLanguages: [],
      certifications: [],
      countriesOfInterest: [],
      yearsExperience: null,
      normalizedExperiences: [],
      strengths: [],
      gaps: [],
      dataQualityWarnings: [],
      requiredFollowUps: [],
      fieldEvidence: [{ field: "professionalTitle", value: "Médecin", evidence: "Médecin urgentiste", sourceLocation: "page 1", confidence: 90 }],
      contradictions: [],
      confidence: 90,
      scoreBreakdown: { specialtyMatch: 20, experienceEvidence: 0, skillsEvidence: 0, languageReadiness: 0, credentialReadiness: 0 },
      reasoning: "Une seule information a été trouvée.",
    }, "[PAGE 1]\nMédecin urgentiste");

    expect(result.evidenceCoverage).toBe(100);
    expect(result.relevanceScore).toBeNull();
    expect(result.reasoning).toContain("Score non présenté");
  });

  it("reconnaît uniquement le blocage de facturation explicite du Gateway", () => {
    expect(isAiGatewayBillingUnavailable(new Error(
      "AI Gateway requires a valid credit card on file to service requests. Please add a card and unlock your free credits.",
    ))).toBe(true);
    expect(isAiGatewayBillingUnavailable(new Error("ai_provider_timeout"))).toBe(false);
  });

  it("préserve un CV pour revue humaine sans produire de score quand le Gateway est bloqué", () => {
    const execution = buildManualReviewFallback({
      firstName: "Amina",
      lastName: "Martin",
      specialty: "Anesthésie",
      targetCountries: ["France", "France"],
      languages: ["Français"],
      yearsExperience: 8,
      extractedText: "CV professionnel extrait avec suffisamment de texte pour une revue humaine complète.",
    });

    expect(execution.model).toBe("local/manual-review-fallback");
    expect(execution.result.relevanceScore).toBeNull();
    expect(execution.result.confidence).toBe(0);
    expect(execution.result.countriesOfInterest).toEqual(["France"]);
    expect(execution.result.dataQualityWarnings).toContain(
      "Mode dégradé : seules les données déclarées dans le formulaire ont été structurées.",
    );
    expect(execution.result.fieldEvidence.every(item => !item.evidenceVerified)).toBe(true);
  });

  it("réserve le matching aux faits dont la preuve a été vérifiée", () => {
    const base = buildManualReviewFallback({
      firstName: "Amina",
      lastName: "Martin",
      specialty: "Anesthésie",
      targetCountries: ["France"],
      languages: ["Français"],
      extractedText: "CV professionnel extrait avec suffisamment de texte pour une revue humaine complète.",
    }).result;
    const facts = verifiedRecruitmentFacts({
      ...base,
      skills: ["Réanimation", "Gestion d’équipe"],
      normalizedLanguages: [
        { language: "Français", proficiency: "fluent", evidence: "Français courant", sourceLocation: "page 1", confidence: 95, evidenceVerified: true },
        { language: "Anglais", proficiency: "fluent", evidence: "English fluent", sourceLocation: "page 2", confidence: 20, evidenceVerified: false },
      ],
      certifications: [
        { name: "ACLS", issuingBody: null, country: null, expiresAt: null, evidence: "Certification ACLS", sourceLocation: "page 1", confidence: 90, evidenceVerified: true },
        { name: "ATLS", issuingBody: null, country: null, expiresAt: null, evidence: "ATLS", sourceLocation: "page 2", confidence: 20, evidenceVerified: false },
      ],
      fieldEvidence: [
        { field: "skill", value: "Réanimation", evidence: "Compétence : Réanimation", sourceLocation: "page 1", confidence: 92, evidenceVerified: true },
        { field: "skill", value: "Gestion d’équipe", evidence: "Gestion d’équipe", sourceLocation: "page 2", confidence: 20, evidenceVerified: false },
      ],
    });

    expect(facts.skills).toEqual(["Réanimation"]);
    expect(facts.languages.map(item => item.language)).toEqual(["Français"]);
    expect(facts.certifications.map(item => item.name)).toEqual(["ACLS"]);
  });
});
