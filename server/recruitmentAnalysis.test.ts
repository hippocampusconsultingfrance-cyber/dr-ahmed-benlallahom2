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

  it("dit trouvés dans le texte lu par l’outil, jamais vérifiés, les faits que l’admin lit (IA-01)", () => {
    const sourceText = "[PAGE 1]\nMédecin anesthésiste, Hôpital, 2018-2026\nSpécialité : Anesthésie\nCompétence : Réanimation\n[PAGE 2]\nFrançais : courant\nCertification ACLS";
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      professionalTitle: "Médecin anesthésiste",
      specialties: ["Anesthésie"],
      skills: ["Réanimation"],
      languages: ["Français"],
      normalizedLanguages: [{ language: "Français", proficiency: "fluent", evidence: "Français : courant", sourceLocation: "page 2", confidence: 98 }],
      certifications: [{ name: "ACLS", issuingBody: null, country: null, expiresAt: null, evidence: "Certification ACLS", sourceLocation: "page 2", confidence: 95 }],
      normalizedExperiences: [{ role: "Médecin", organization: "Hôpital", startDate: null, endDate: null, employmentType: "unknown", specialty: "", country: null, durationMonths: null, evidence: "Médecin anesthésiste, Hôpital, 2018-2026", sourceLocation: "page 1", confidence: 96 }],
      fieldEvidence: [
        { field: "professionalTitle", value: "Médecin anesthésiste", evidence: "Médecin anesthésiste", sourceLocation: "page 1", confidence: 97 },
        { field: "specialty", value: "Anesthésie", evidence: "Spécialité : Anesthésie", sourceLocation: "page 1", confidence: 96 },
        { field: "skill", value: "Réanimation", evidence: "Compétence : Réanimation", sourceLocation: "page 1", confidence: 94 },
      ],
    }), sourceText, { specialty: "Anesthésie", targetCountries: [], languages: [] });

    expect(result.relevanceScore).not.toBeNull();
    expect(result.summary).toBe("Lecture automatisée : 6 citation(s) sur 6 trouvée(s) dans le texte lu par l’outil, à comparer au CV. 1 expérience(s), 1 certification(s) et 1 langue(s) s’appuient sur une citation de ce texte. Revue humaine obligatoire.");
    expect(result.strengths).toEqual([
      "Titre professionnel trouvé dans le texte lu par l’outil : Médecin anesthésiste.",
      "Spécialité(s) trouvée(s) dans le texte lu par l’outil : Anesthésie.",
      "1 expérience(s) professionnelle(s) sourcée(s).",
      "Compétence(s) trouvée(s) dans le texte lu par l’outil : Réanimation.",
      "Langue(s) trouvée(s) dans le texte lu par l’outil : Français.",
      "Certification(s) trouvée(s) dans le texte lu par l’outil : ACLS.",
    ]);
    expect(result.reasoning).toBe("Score déterministe calculé uniquement à partir de faits professionnels trouvés dans le texte lu par l’outil et rapprochés de la spécialité déclarée, à comparer au CV.");

    const unscored = normalizeRecruitmentAnalysis(analysisFixture({
      professionalTitle: "Médecin",
      fieldEvidence: [{ field: "professionalTitle", value: "Médecin", evidence: "Médecin urgentiste", sourceLocation: "page 1", confidence: 90 }],
    }), "[PAGE 1]\nMédecin urgentiste", { specialty: "Médecin", targetCountries: [], languages: [] });
    expect(unscored.reasoning).toBe("Score non présenté : les citations trouvées dans le texte lu par l’outil sont insuffisantes, contradictoires ou non rapprochées de la spécialité déclarée (100 % de couverture).");

    for (const text of [result.summary, result.reasoning, unscored.summary, unscored.reasoning, ...result.strengths]) expect(text).not.toMatch(/vérifié/i);
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
    expect(result.scoreBreakdown.specialtyMatch).toBe(15);
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

  it("date une certification expirée comme la fiche de la candidature : au mois, au jour ou à l’année (IA-02)", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      certifications: [
        { name: "ACLS", issuingBody: null, country: null, expiresAt: "2023-05", evidence: "ACLS expiration 2023-05", sourceLocation: "page 1", confidence: 95 },
        { name: "BLS", issuingBody: null, country: null, expiresAt: "2022-03-31", evidence: "BLS expiration 2022-03-31", sourceLocation: "page 1", confidence: 95 },
        { name: "PALS", issuingBody: null, country: null, expiresAt: "2020", evidence: "PALS expiration 2020", sourceLocation: "page 1", confidence: 95 },
      ],
    }), "[PAGE 1]\nACLS expiration 2023-05\nBLS expiration 2022-03-31\nPALS expiration 2020");

    expect(result.dataQualityWarnings).toEqual(expect.arrayContaining([
      "Certification expirée à confirmer : ACLS (expirée en mai 2023).",
      "Certification expirée à confirmer : BLS (expirée le 31/03/2022).",
      "Certification expirée à confirmer : PALS (expirée en 2020).",
    ]));
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
    expect(execution.result.professionalTitle).toBe("");
    expect(execution.result.specialties).toEqual([]);
    expect(execution.result.countriesOfInterest).toEqual([]);
    expect(execution.result.languages).toEqual([]);
    expect(execution.result.yearsExperience).toBeNull();
    expect(execution.result.dataQualityWarnings).toContain(
      "Mode dégradé : seules les données déclarées dans le formulaire ont été structurées.",
    );
    expect(execution.result.fieldEvidence.every(item => !item.evidenceVerified)).toBe(true);
  });

  it("exige un rapprochement de spécialité avant de publier un score", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      normalizedExperiences: [{ role: "Médecin", organization: "Hôpital", startDate: null, endDate: null, employmentType: "unknown", specialty: "", country: null, durationMonths: null, evidence: "Médecin Hôpital", sourceLocation: "page 1", confidence: 95 }],
      normalizedLanguages: [{ language: "Français", proficiency: "fluent", evidence: "Français courant", sourceLocation: "page 1", confidence: 95 }],
      certifications: [{ name: "ACLS", issuingBody: null, country: null, expiresAt: null, evidence: "Certification ACLS", sourceLocation: "page 1", confidence: 95 }],
    }), "[PAGE 1]\nMédecin Hôpital\nFrançais courant\nCertification ACLS", {
      specialty: "Dermatologie",
      targetCountries: [],
      languages: [],
    });

    expect(result.scoreBreakdown.specialtyMatch).toBe(0);
    expect(result.relevanceScore).toBeNull();
  });

  it("limite une unique provenance de spécialité à quinze points", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      specialties: ["Cardiologie"],
      fieldEvidence: [{ field: "specialty", value: "Cardiologie", evidence: "Spécialité Cardiologie", sourceLocation: "page 1", confidence: 95 }],
    }), "[PAGE 1]\nSpécialité Cardiologie", {
      specialty: "Cardiologie",
      targetCountries: [],
      languages: [],
    });

    expect(result.scoreBreakdown.specialtyMatch).toBe(15);
  });

  it("déduplique une même expérience même si l’IA fournit deux citations", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      normalizedExperiences: [
        { role: "Médecin", organization: "Hôpital Central", startDate: null, endDate: null, employmentType: "unknown", specialty: "", country: null, durationMonths: null, evidence: "Médecin Hôpital Central", sourceLocation: "page 1", confidence: 95 },
        { role: "Médecin", organization: "Hôpital Central", startDate: null, endDate: null, employmentType: "unknown", specialty: "", country: null, durationMonths: null, evidence: "Médecin à Hôpital Central depuis 2020", sourceLocation: "page 1", confidence: 94 },
      ],
    }), "[PAGE 1]\nMédecin Hôpital Central\nMédecin à Hôpital Central depuis 2020");

    expect(result.normalizedExperiences).toHaveLength(1);
    expect(result.scoreBreakdown.experienceEvidence).toBe(10);
  });

  it("n’attribue pas à une langue le niveau d’une autre langue reliée par une conjonction", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      languages: ["French"],
      normalizedLanguages: [{ language: "French", proficiency: "fluent", evidence: "French basic and English fluent", sourceLocation: "page 1", confidence: 95 }],
    }), "[PAGE 1]\nFrench basic and English fluent");

    expect(result.normalizedLanguages[0]?.evidenceVerified).toBe(true);
    expect(result.normalizedLanguages[0]?.proficiency).toBe("unknown");
    expect(result.scoreBreakdown.languageReadiness).toBe(2);
  });

  it("rejette une certification explicitement expirée même sans date structurée", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      certifications: [{ name: "ACLS", issuingBody: null, country: null, expiresAt: null, evidence: "Certification ACLS expirée", sourceLocation: "page 1", confidence: 95 }],
    }), "[PAGE 1]\nCertification ACLS expirée");

    expect(result.certifications[0]?.evidenceVerified).toBe(false);
    expect(result.scoreBreakdown.credentialReadiness).toBe(0);
    expect(verifiedRecruitmentFacts(result).certifications).toHaveLength(0);
  });

  it("écarte une fausse contradiction identique à la donnée déclarée", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      contradictions: [{ field: "specialty", declaredValue: "Cardiologie", documentValue: "Cardiologie", evidence: "Cardiologie", sourceLocation: "page 1", confidence: 95 }],
    }), "[PAGE 1]\nCardiologie", {
      specialty: "Cardiologie",
      targetCountries: [],
      languages: [],
    });

    expect(result.contradictions).toEqual([]);
  });

  it("neutralise toutes les preuves quand la confiance OCR est insuffisante", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      specialties: ["Cardiologie"],
      fieldEvidence: [{ field: "specialty", value: "Cardiologie", evidence: "Spécialité Cardiologie", sourceLocation: "page 1", confidence: 99 }],
    }), "[PAGE 1]\nSpécialité Cardiologie", {
      specialty: "Cardiologie",
      targetCountries: [],
      languages: [],
      extractionConfidence: 20,
    });

    expect(result.fieldEvidence[0]?.evidenceVerified).toBe(false);
    expect(result.relevanceScore).toBeNull();
    expect(result.dataQualityWarnings.join(" ")).toContain("Confiance OCR insuffisante");
  });

  it("masque le score d'un PDF partiellement lisible sans rejeter ses citations valides", () => {
    const source = "[PAGE 1]\nTitre : Médecin anesthésiste. Spécialité : Anesthésie. Compétence : Réanimation.";
    const fixture = analysisFixture({
      professionalTitle: "Médecin anesthésiste",
      specialties: ["Anesthésie"],
      skills: ["Réanimation"],
      fieldEvidence: [
        { field: "professionalTitle", value: "Médecin anesthésiste", evidence: "Médecin anesthésiste", sourceLocation: "page 1", confidence: 95 },
        { field: "specialty", value: "Anesthésie", evidence: "Spécialité : Anesthésie", sourceLocation: "page 1", confidence: 95 },
        { field: "skill", value: "Réanimation", evidence: "Compétence : Réanimation", sourceLocation: "page 1", confidence: 95 },
      ],
    });
    const complete = normalizeRecruitmentAnalysis(fixture, source, {
      specialty: "Anesthésie", targetCountries: [], languages: [],
    });
    const incomplete = normalizeRecruitmentAnalysis(fixture, source, {
      specialty: "Anesthésie", targetCountries: [], languages: [], extractionIncomplete: true,
    });
    expect(complete.relevanceScore).not.toBeNull();
    expect(incomplete.relevanceScore).toBeNull();
    expect(incomplete.dataQualityWarnings).toContain(
      "Extraction incomplète du document : au moins une page nécessite une vérification manuelle."
    );
    expect(incomplete.fieldEvidence.every(item => item.evidenceVerified)).toBe(true);
  });

  it("refuse les faits niés même lorsque la négation est éloignée", () => {
    const result = normalizeRecruitmentAnalysis(analysisFixture({
      skills: ["Réanimation"],
      fieldEvidence: [{ field: "skill", value: "Réanimation", evidence: "Sans aucune expérience professionnelle documentée dans le domaine de la Réanimation", sourceLocation: "page 1", confidence: 95 }],
    }), "[PAGE 1]\nSans aucune expérience professionnelle documentée dans le domaine de la Réanimation");

    expect(result.fieldEvidence[0]?.evidenceVerified).toBe(false);
    expect(verifiedRecruitmentFacts(result).skills).toEqual([]);
  });

  it("cherche une citation dans toutes les sections portant le même numéro de page", () => {
    const source = "[PAGE 1]\n\n[PAGE 1]\nCertification ACLS";
    expect(verifyCvEvidence("Certification ACLS", "page 1", source)).toBe(true);
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
