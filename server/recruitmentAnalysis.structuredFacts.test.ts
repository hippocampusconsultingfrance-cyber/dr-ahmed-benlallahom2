import { beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, cvCandidateCertifications, cvCandidateExperiences, cvCandidateLanguages } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { RecruitmentAnalysisResult } from "./recruitmentAnalysis";

// IA-02 — les faits structurés (certifications, langues, expériences,
// compétences) alimentent les filtres et le matching des missions : aucun
// n’est enregistré quand l’analyse relève une contradiction, et une
// certification confirmée par l’admin survit à une nouvelle analyse.

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));

vi.mock("./db", () => ({
  getDb: async () => {
    if (!state.memory) return null;
    // drizzle's pg-proxy has no batch: run the statements in order, like neon-http does atomically.
    const db = state.memory.db as { batch?: unknown };
    db.batch ??= async (queries: Array<PromiseLike<unknown>>) => { const results = []; for (const query of queries) results.push(await query); return results; };
    return db;
  },
}));

import { saveCvAnalysis } from "./recruitmentAnalysis";

const verified = { sourceLocation: "page 1", confidence: 90, evidenceVerified: true };

function analysis(overrides: Partial<RecruitmentAnalysisResult> = {}): RecruitmentAnalysisResult {
  return {
    summary: "Lecture automatisée.", professionalTitle: "Anesthésiste-réanimatrice", specialties: ["Anesthésie-réanimation"], skills: ["Intubation"], languages: ["Anglais"],
    normalizedLanguages: [{ language: "Anglais", proficiency: "fluent", evidence: "Anglais courant", ...verified }],
    certifications: [
      { name: "Licence DHA", issuingBody: "Dubai Health Authority", country: "Émirats arabes unis", expiresAt: null, evidence: "Licence DHA", ...verified },
      { name: "ACLS", issuingBody: null, country: null, expiresAt: null, evidence: "ACLS", ...verified },
    ],
    countriesOfInterest: [], yearsExperience: 8,
    normalizedExperiences: [{ role: "Anesthésiste", organization: "CHU de Lyon", startDate: "2015", endDate: "2024", employmentType: "permanent", specialty: "Anesthésie-réanimation", country: "France", durationMonths: 108, evidence: "CHU de Lyon 2015-2024", ...verified }],
    relevanceScore: 82, strengths: [], gaps: [], dataQualityWarnings: [], requiredFollowUps: [],
    fieldEvidence: [{ field: "skill", value: "Intubation", evidence: "Intubation", ...verified }],
    contradictions: [], confidence: 85, evidenceCoverage: 90,
    scoreBreakdown: { specialtyMatch: 30, experienceEvidence: 20, skillsEvidence: 12, languageReadiness: 10, credentialReadiness: 10 },
    reasoning: "Score déterministe.",
    ...overrides,
  };
}

const contradiction = { field: "specialty" as const, declaredValue: "Anesthésie-réanimation", documentValue: "Pédiatrie", evidence: "Pédiatre", ...verified };

let memory: MemoryPg;
let applicationId: number;

describe("faits structurés d’une analyse de CV (IA-02)", () => {
  beforeEach(() => {
    memory = createMemoryPg([cvApplications, cvCandidateCertifications, cvCandidateLanguages, cvCandidateExperiences]);
    state.memory = memory;
    applicationId = memory.seed(cvApplications, [{
      tracking_id: "CVFACTS00001", first_name: "Zoé", last_name: "Kowalska", email: "zoe@test.local", specialty: "Anesthésie-réanimation", target_countries: "[]",
      cv_file_key: "recruitment/cv/zoe.pdf", cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    }])[0]!.id as number;
  });

  it("enregistre les faits vérifiés d’une analyse sans contradiction", async () => {
    await saveCvAnalysis(applicationId, analysis());
    expect(memory.rows(cvCandidateCertifications).map(row => row.name)).toEqual(["Licence DHA", "ACLS"]);
    expect(memory.rows(cvCandidateLanguages).map(row => row.language)).toEqual(["Anglais"]);
    expect(memory.rows(cvCandidateExperiences)).toHaveLength(1);
    expect(JSON.parse(String(memory.rows(cvApplications)[0]!.ai_extracted_skills)).verifiedSkills).toEqual(["Intubation"]);
  });

  it("n’enregistre aucun fait structuré quand l’analyse relève une contradiction, mais garde la lecture pour l’admin", async () => {
    await saveCvAnalysis(applicationId, analysis());
    await saveCvAnalysis(applicationId, analysis({ contradictions: [contradiction], relevanceScore: null }));
    expect(memory.rows(cvCandidateCertifications)).toEqual([]);
    expect(memory.rows(cvCandidateLanguages)).toEqual([]);
    expect(memory.rows(cvCandidateExperiences)).toEqual([]);
    const [application] = memory.rows(cvApplications);
    expect([application!.normalized_certifications, application!.normalized_languages, application!.normalized_experiences]).toEqual(["[]", "[]", "[]"]);
    const extracted = JSON.parse(String(application!.ai_extracted_skills));
    expect(extracted.verifiedSkills).toEqual([]);
    // What the AI read stays visible in the admin sheet, with the contradiction.
    expect(extracted.contradictions).toHaveLength(1);
    expect(extracted.certifications.map((item: { name: string }) => item.name)).toEqual(["Licence DHA", "ACLS"]);
  });

  it("une preuve simplement manquante ne vide pas les autres faits", async () => {
    await saveCvAnalysis(applicationId, analysis({ certifications: [{ name: "Licence DHA", issuingBody: null, country: null, expiresAt: null, evidence: "Licence DHA", sourceLocation: "page 2", confidence: 90, evidenceVerified: false }], relevanceScore: null }));
    expect(memory.rows(cvCandidateCertifications)).toEqual([]);
    expect(memory.rows(cvCandidateLanguages).map(row => row.language)).toEqual(["Anglais"]);
    expect(memory.rows(cvCandidateExperiences)).toHaveLength(1);
  });

  it("garde les certifications confirmées par l’admin à chaque nouvelle analyse, sans les dupliquer", async () => {
    await saveCvAnalysis(applicationId, analysis());
    memory.rows(cvCandidateCertifications).find(row => row.name === "ACLS")!.confirmed_at = "2026-10-20 09:00:00.000";
    memory.seed(cvCandidateCertifications, [{ application_id: applicationId, name: "BLS", source: "declared", confirmed_at: "2026-10-20 09:05:00.000" }]);

    await saveCvAnalysis(applicationId, analysis({ contradictions: [contradiction], relevanceScore: null }));
    expect(memory.rows(cvCandidateCertifications).map(row => [row.name, row.source])).toEqual([["ACLS", "extracted"], ["BLS", "declared"]]);

    await saveCvAnalysis(applicationId, analysis({ certifications: [...analysis().certifications, { name: "acls", issuingBody: null, country: null, expiresAt: null, evidence: "acls", ...verified }] }));
    expect(memory.rows(cvCandidateCertifications).map(row => [row.name, row.confirmed_at !== null])).toEqual([["ACLS", true], ["BLS", true], ["Licence DHA", false]]);
  });
});
