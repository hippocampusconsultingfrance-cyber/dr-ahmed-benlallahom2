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

type AnalysisInput = Parameters<typeof normalizeRecruitmentAnalysis>[0];

const analysisFixture = (overrides: Partial<AnalysisInput> = {}): AnalysisInput => ({
  summary: "Synthèse proposée par le modèle.",
  professionalTitle: "",
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
  fieldEvidence: [],
  contradictions: [],
  confidence: 90,
  scoreBreakdown: {
    specialtyMatch: 0,
    experienceEvidence: 0,
    skillsEvidence: 0,
    languageReadiness: 0,
    credentialReadiness: 0,
  },
  reasoning: "Raisonnement proposé par le modèle.",
  ...overrides,
});

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
      certifications: [{ name: "ACLS", issuingBody: "American Heart Association", country: "États-Unis", expiresAt: "2027-12", evidence: "Certification ACLS", sourceLocation: "page 2", confidence: 95 }],
      countriesOfInterest: ["France"],
      yearsExperience: 8,
      normalizedExperiences: [{ role: "Médecin", organization: "Hôpital", startDate: "2018-01", endDate: "2026-01", employmentType: "permanent", specialty: "Anesthésie", country: "Tunisie", durationMonths: 96, evidence: "Médecin anesthésiste, Hôpital, 2018-2026", sourceLocation: "page 1", confidence: 96 }],
      strengths: ["Expérience documentée"],
      gaps: [],
      dataQualityWarnings: [],
      requiredFollowUps: ["Confirmer l’inscription ordinale"],
      fieldEvidence: [
        { field: "professionalTitle", value: "Médecin anesthésiste", evidence: "Médecin anesthésiste", sourceLocation: "page 1", confidence: 97 },
        { field: "specialty", value: "Anesthésie", evidence: "Spécialité : Anesthésie", sourceLocation: "page 1", confidence: 96 },
        { field: "skill", value: "Réanimation", evidence: "Compétence : Réanimation", sourceLocation: "page 1", confidence: 94 },
      ],
      contradictions: [],
      confidence: 91,
      scoreBreakdown: { specialtyMatch: 29, experienceEvidence: 23, skillsEvidence: 18, languageReadiness: 13, credentialReadiness: 7 },
      reasoning: "Score fondé uniquement sur les éléments professionnels cités.",
    }, `[PAGE 1]
	Médecin anesthésiste, Hôpital, 2018-2026
	Spécialité : Anesthésie
	Compétence : Réanimation
7 ans (2019-2026)
[PAGE 2]
Français : courant
	Certification ACLS`, {
      specialty: "Anesthésie",
      targetCountries: ["France"],
      languages: ["Français"],
      yearsExperience: 8,
    });

    expect(result.relevanceScore).toBe(60);
    expect(result.scoreBreakdown).toEqual({
      specialtyMatch: 30,
      experienceEvidence: 10,
      skillsEvidence: 5,
      languageReadiness: 10,
      credentialReadiness: 5,
    });
    expect(result.evidenceCoverage).toBe(100);
    expect(result.specialties).toEqual(["Anesthésie"]);
    expect(result.fieldEvidence[0]?.sourceLocation).toBe("page 1");
    expect(result.fieldEvidence[0]?.evidenceVerified).toBe(true);
    expect(result.contradictions).toHaveLength(0);
    expect(result.normalizedLanguages[0]?.proficiency).toBe("fluent");
    expect(result.normalizedExperiences[0]).toMatchObject({
      startDate: null,
      endDate: null,
      employmentType: "unknown",
      specialty: "",
      country: null,
      durationMonths: null,
    });
    expect(result.certifications[0]).toMatchObject({
      issuingBody: null,
      country: null,
      expiresAt: null,
    });
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
    }, "[PAGE 1]\nMédecin anesthésiste en réanimation.", {
      specialty: "Anesthésie",
      targetCountries: [],
      languages: [],
    });

    expect(result.evidenceCoverage).toBe(50);
    expect(result.relevanceScore).toBeNull();
    expect(result.confidence).toBe(50);
    expect(result.scoreBreakdown.experienceEvidence).toBe(0);
    expect(result.scoreBreakdown.skillsEvidence).toBe(0);
    expect(result.scoreBreakdown.languageReadiness).toBe(0);
    expect(result.scoreBreakdown.credentialReadiness).toBe(0);
    expect(result.scoreBreakdown.specialtyMatch).toBe(0);
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

  it("exige une page réelle pour un PDF balisé mais accepte une section pour un document sans pages", () => {
    expect(verifyCvEvidence(
      "Certification ACLS",
      "section Langues",
      "[PAGE 1]\nCertification ACLS",
    )).toBe(false);
    expect(verifyCvEvidence(
      "Certification ACLS",
      "section Certifications",
      "Parcours professionnel\nCertification ACLS",
    )).toBe(true);
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
    }, "[PAGE 1]\nMédecin urgentiste", {
      specialty: "Médecin",
      targetCountries: [],
      languages: [],
    });

    expect(result.evidenceCoverage).toBe(100);
    expect(result.relevanceScore).toBeNull();
    expect(result.reasoning).toContain("Score non présenté");
  });

  it("refuse une preuve dont le libellé ne correspond pas au fait structuré", () => {
    const result = normalizeRecruitmentAnalysis({
      summary: "Une certification est citée, mais pas comme compétence.",
      professionalTitle: "Médecin",
      specialties: [],
      skills: ["Réanimation"],
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
      fieldEvidence: [{ field: "skill", value: "ACLS", evidence: "Certification ACLS", sourceLocation: "page 1", confidence: 99 }],
      contradictions: [],
      confidence: 99,
      scoreBreakdown: { specialtyMatch: 0, experienceEvidence: 0, skillsEvidence: 20, languageReadiness: 0, credentialReadiness: 0 },
      reasoning: "Score proposé par le modèle.",
    }, "[PAGE 1]\nCertification ACLS");

    expect(result.fieldEvidence[0]).toMatchObject({
      evidenceVerified: false,
      confidence: 25,
    });
    expect(result.scoreBreakdown.skillsEvidence).toBe(0);
    expect(result.relevanceScore).toBeNull();
  });

  it("ne transforme pas une négation en compétence ou certification vérifiée", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      skills: ["Réanimation"],
      certifications: [{ name: "ACLS", issuingBody: null, country: null, expiresAt: null, evidence: "ACLS non obtenue", sourceLocation: "page 1", confidence: 99 }],
      fieldEvidence: [{ field: "skill", value: "Réanimation", evidence: "Aucune expérience en Réanimation", sourceLocation: "page 1", confidence: 99 }],
    }), "[PAGE 1]\nAucune expérience en Réanimation\nACLS non obtenue");

    expect(result.fieldEvidence[0]?.evidenceVerified).toBe(false);
    expect(result.certifications[0]?.evidenceVerified).toBe(false);
    expect(result.scoreBreakdown.skillsEvidence).toBe(0);
    expect(result.scoreBreakdown.credentialReadiness).toBe(0);
  });

  it("rattache le niveau à la bonne langue dans une citation multi-entités", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      languages: ["English"],
      normalizedLanguages: [{ language: "English", proficiency: "fluent", evidence: "English basic; French fluent", sourceLocation: "page 1", confidence: 95 }],
    }), "[PAGE 1]\nEnglish basic; French fluent");

    expect(result.normalizedLanguages[0]).toMatchObject({
      evidenceVerified: true,
      proficiency: "unknown",
    });
    expect(result.scoreBreakdown.languageReadiness).toBe(2);
  });

  it("ne confond pas une spécialité prouvée avec la spécialité déclarée", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      professionalTitle: "Médecin cardiologue",
      specialties: ["Cardiologie"],
      fieldEvidence: [
        { field: "professionalTitle", value: "Médecin cardiologue", evidence: "Médecin cardiologue", sourceLocation: "page 1", confidence: 98 },
        { field: "specialty", value: "Cardiologie", evidence: "Spécialité : Cardiologie", sourceLocation: "page 1", confidence: 98 },
      ],
    }), "[PAGE 1]\nMédecin cardiologue\nSpécialité : Cardiologie", {
      specialty: "Anesthésie",
      targetCountries: [],
      languages: [],
    });

    expect(result.scoreBreakdown.specialtyMatch).toBe(0);
    expect(result.relevanceScore).toBeNull();
  });

  it("ne compte qu’une fois deux expériences issues de la même citation", () => {
    const sharedEvidence = "Médecin anesthésiste, Hôpital Central, 2018-2026";
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      normalizedExperiences: [
        { role: "Médecin", organization: "Hôpital Central", startDate: "2018", endDate: "2026", employmentType: "unknown", specialty: "", country: null, durationMonths: null, evidence: sharedEvidence, sourceLocation: "page 1", confidence: 95 },
        { role: "Médecin anesthésiste", organization: "Hôpital Central", startDate: "2018", endDate: "2026", employmentType: "unknown", specialty: "", country: null, durationMonths: null, evidence: sharedEvidence, sourceLocation: "page 1", confidence: 95 },
      ],
    }), `[PAGE 1]\n${sharedEvidence}`);

    expect(result.normalizedExperiences.every(item => item.evidenceVerified)).toBe(true);
    expect(result.scoreBreakdown.experienceEvidence).toBe(10);
  });

  it("conserve les contradictions distinctes, refuse un faux déclaré et neutralise le score", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      contradictions: [
        { field: "yearsExperience", declaredValue: "8 ans", documentValue: "7 ans", evidence: "Cardiologie, 7 ans", sourceLocation: "page 1", confidence: 95 },
        { field: "specialty", declaredValue: "Anesthésie", documentValue: "Cardiologie", evidence: "Cardiologie, 7 ans", sourceLocation: "page 1", confidence: 95 },
        { field: "yearsExperience", declaredValue: "20 ans", documentValue: "7 ans", evidence: "Cardiologie, 7 ans", sourceLocation: "page 1", confidence: 95 },
      ],
    }), "[PAGE 1]\nCardiologie, 7 ans", {
      specialty: "Anesthésie",
      targetCountries: [],
      languages: [],
      yearsExperience: 8,
    });

    expect(result.contradictions).toHaveLength(2);
    expect(result.contradictions.map(item => item.field)).toEqual(["yearsExperience", "specialty"]);
    expect(result.relevanceScore).toBeNull();
  });

  it("neutralise les chronologies incohérentes et les certifications expirées", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      certifications: [{ name: "ACLS", issuingBody: null, country: null, expiresAt: "2020", evidence: "ACLS expiration 2020", sourceLocation: "page 1", confidence: 95 }],
      normalizedExperiences: [{ role: "Médecin", organization: "Hôpital", startDate: "2026", endDate: "2018", employmentType: "unknown", specialty: "", country: null, durationMonths: null, evidence: "Médecin, Hôpital, 2026-2018", sourceLocation: "page 1", confidence: 95 }],
    }), "[PAGE 1]\nACLS expiration 2020\nMédecin, Hôpital, 2026-2018");

    expect(result.normalizedExperiences[0]).toMatchObject({ startDate: null, endDate: null });
    expect(result.scoreBreakdown.credentialReadiness).toBe(0);
    expect(result.dataQualityWarnings.join(" ")).toContain("dates d’expérience inversées");
    expect(result.dataQualityWarnings.join(" ")).toContain("Certification expirée");
    expect(verifiedRecruitmentFacts(result).certifications).toHaveLength(0);
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
        { language: "Espagnol", proficiency: "working", evidence: "Espagnol intermédiaire", sourceLocation: "page 3", confidence: 69, evidenceVerified: true },
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
