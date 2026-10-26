import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientBriefCandidates, clientBriefs, cvApplications, cvCandidateCertifications, cvCandidateExperiences, cvCandidateLanguages, cvGoogleDriveExportJobs, candidateAccounts, recruitmentAuditLogs, recruitmentCampaignRecipients, recruitmentCampaigns, recruitmentEmailEvents, recruitmentFollowUpTasks } from "../drizzle/schema";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION, saveCvAnalysis, type RecruitmentAnalysisResult } from "./recruitmentAnalysis";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));

vi.mock("./db", () => ({
  getDb: async () => {
    if (!state.memory) return null;
    // drizzle's pg-proxy has no batch (a CV analysis is saved in one): run the statements in order, like neon-http does atomically.
    const db = state.memory.db as { batch?: unknown };
    db.batch ??= async (queries: Array<PromiseLike<unknown>>) => { const results = []; for (const query of queries) results.push(await query); return results; };
    return db;
  },
}));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
  isAdminMfaVerified: vi.fn(async () => true),
}));

import { appRouter, MISSION_MATCHING_MAX_CANDIDATES } from "./routers";

let memory: MemoryPg;

function admin() {
  const ctx: TrpcContext = {
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

let seeded = 0;
function seedCandidate(extra: Record<string, unknown> = {}) {
  seeded += 1;
  return memory.seed(cvApplications, [{
    tracking_id: `CVMISSION${String(seeded).padStart(5, "0")}`, first_name: `Prénom${seeded}`, last_name: "Nom", email: `m${seeded}@test.local`, specialty: "Pédiatrie", target_countries: "[]",
    cv_file_key: `recruitment/cv/m${seeded}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, ...extra,
  }])[0]!;
}
const scored = (score: number) => ({ ai_score: score, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION });

const verified = { sourceLocation: "page 1", confidence: 90, evidenceVerified: true };
/** An analysis of the CV that reads the DHA licence, with its proof. */
function cvAnalysis(overrides: Partial<RecruitmentAnalysisResult> = {}): RecruitmentAnalysisResult {
  return {
    summary: "Lecture automatisée.", professionalTitle: "Anesthésiste-réanimatrice", specialties: ["Anesthésie-réanimation"], skills: [], languages: [], normalizedLanguages: [],
    certifications: [{ name: "Licence DHA", issuingBody: "Dubai Health Authority", country: "Émirats arabes unis", expiresAt: null, evidence: "Licence DHA", ...verified }],
    countriesOfInterest: [], yearsExperience: 8, normalizedExperiences: [], relevanceScore: 80, strengths: [], gaps: [], dataQualityWarnings: [], requiredFollowUps: [],
    fieldEvidence: [], contradictions: [], confidence: 85, evidenceCoverage: 90,
    scoreBreakdown: { specialtyMatch: 30, experienceEvidence: 20, skillsEvidence: 10, languageReadiness: 10, credentialReadiness: 10 },
    reasoning: "Score déterministe.",
    ...overrides,
  };
}

function seedBrief(extra: Record<string, unknown> = {}) {
  return memory.seed(clientBriefs, [{ brief_id: `BRIEF-M${seeded}`, organization_name: "Hôpital du Golfe", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie-réanimation", country: "Émirats arabes unis", ...extra }])[0]!;
}

describe("missions employeurs : classement, certifications et accord du candidat", () => {
  beforeEach(() => {
    memory = createMemoryPg([cvApplications, cvCandidateCertifications, cvCandidateLanguages, cvCandidateExperiences, clientBriefs, clientBriefCandidates, recruitmentAuditLogs, recruitmentCampaigns, recruitmentCampaignRecipients, recruitmentFollowUpTasks, candidateAccounts, cvGoogleDriveExportJobs, recruitmentEmailEvents]);
    state.memory = memory;
    seeded = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("calcule la compatibilité de tous les candidats avant de trier puis de paginer, les dossiers sans score IA après les autres (ADM-04)", async () => {
    // 40 well-scored paediatricians, created first, then four anaesthetists the AI scored low or not at all.
    for (let index = 0; index < 40; index += 1) seedCandidate(scored(95));
    const unscored = seedCandidate({ specialty: "Anesthésie-réanimation", target_countries: '["Émirats arabes unis"]' });
    const low = seedCandidate({ specialty: "Anesthésie-réanimation", target_countries: '["Émirats arabes unis"]', ...scored(20) });
    const lower = seedCandidate({ specialty: "Anesthésie-réanimation", target_countries: '["Émirats arabes unis"]', ...scored(10) });
    const specialtyOnly = seedCandidate({ specialty: "Anesthésie-réanimation", ...scored(30) });
    seedCandidate({ specialty: "Anesthésie-réanimation", status: "rejected" });
    const brief = seedBrief();
    const statementsBefore = memory.statements.length;

    const first = await admin().admin.clientBriefs.candidates({ briefId: brief.id as number, limit: 10 });
    expect(first.candidates.slice(0, 4).map(candidate => [candidate.id, candidate.match.score])).toEqual([[low.id, 50], [lower.id, 50], [unscored.id, 50], [specialtyOnly.id, 35]]);
    expect(first.pagination).toEqual({ page: 0, limit: 10, total: 44, totalPages: 5 });
    expect(first.ranking).toEqual({ eligible: 44, ranked: 44 });
    // Ties after compatibility: AI score, the newest dossier first.
    expect(first.candidates.slice(4).map(candidate => candidate.id)).toEqual([40, 39, 38, 37, 36, 35]);
    // Three grouped reads whatever the number of candidates: no query per candidate.
    const statements = memory.statements.slice(statementsBefore);
    expect(statements.filter(statement => /from "cv_candidate_certifications"/.test(statement.sql))).toHaveLength(1);
    expect(statements.filter(statement => /from "cv_candidate_languages"/.test(statement.sql))).toHaveLength(1);
    expect(statements.filter(statement => /from "cv_applications"/.test(statement.sql)).length).toBeLessThanOrEqual(3);

    const second = await admin().admin.clientBriefs.candidates({ briefId: brief.id as number, limit: 10, page: 1 });
    expect(second.candidates.map(candidate => candidate.id)).toEqual([34, 33, 32, 31, 30, 29, 28, 27, 26, 25]);

    // Minimum compatibility, then the shortlist filters, both before paging.
    const atLeast40 = await admin().admin.clientBriefs.candidates({ briefId: brief.id as number, minimumMatch: 40 });
    expect(atLeast40.candidates.map(candidate => candidate.id)).toEqual([low.id, lower.id, unscored.id]);
    expect(atLeast40.pagination.total).toBe(3);
    await admin().admin.clientBriefs.associateCandidate({ briefId: brief.id as number, applicationId: lower.id as number, status: "shortlisted" });
    await admin().admin.clientBriefs.associateCandidate({ briefId: brief.id as number, applicationId: 3, status: "declined" });
    const shortlisted = await admin().admin.clientBriefs.candidates({ briefId: brief.id as number, shortlist: "shortlisted" });
    expect(shortlisted.candidates.map(candidate => candidate.id)).toEqual([lower.id]);
    expect(shortlisted.candidates[0]!.association).toMatchObject({ status: "shortlisted", candidateConsentAt: null });
    const notYet = await admin().admin.clientBriefs.candidates({ briefId: brief.id as number, minimumMatch: 40, shortlist: "not_shortlisted" });
    expect(notYet.candidates.map(candidate => candidate.id)).toEqual([low.id, unscored.id]);
  });

  it(`ne classe que les ${MISSION_MATCHING_MAX_CANDIDATES} dossiers ouverts les plus récents, et le dit, mais toujours les candidats de la mission`, async () => {
    for (let index = 0; index <= MISSION_MATCHING_MAX_CANDIDATES + 1; index += 1) seedCandidate();
    const brief = seedBrief();
    const briefId = brief.id as number;
    const result = await admin().admin.clientBriefs.candidates({ briefId });
    expect(result.ranking).toEqual({ eligible: MISSION_MATCHING_MAX_CANDIDATES + 2, ranked: MISSION_MATCHING_MAX_CANDIDATES });
    expect(result.pagination.total).toBe(MISSION_MATCHING_MAX_CANDIDATES);
    expect(result.candidates[0]!.id).toBe(MISSION_MATCHING_MAX_CANDIDATES + 2);

    // The oldest dossier, beyond the bound, was shortlisted: it stays on screen,
    // to note the candidate's agreement or remove them from the shortlist.
    await admin().admin.clientBriefs.associateCandidate({ briefId, applicationId: 1, status: "shortlisted" });
    const shortlisted = await admin().admin.clientBriefs.candidates({ briefId, shortlist: "shortlisted" });
    expect(shortlisted.candidates.map(candidate => candidate.id)).toEqual([1]);
    expect(shortlisted).toMatchObject({ shortlistedCount: 1, ranking: { eligible: MISSION_MATCHING_MAX_CANDIDATES + 2, ranked: MISSION_MATCHING_MAX_CANDIDATES + 1 } });
    expect((await admin().admin.clientBriefs.candidates({ briefId })).pagination.total).toBe(MISSION_MATCHING_MAX_CANDIDATES + 1);
  });

  it("renvoie la dernière page quand celle demandée s’est vidée, par exemple après un retrait de la shortlist (ADM-04)", async () => {
    for (let index = 0; index < 11; index += 1) seedCandidate();
    const brief = seedBrief();
    const briefId = brief.id as number;
    for (let id = 1; id <= 11; id += 1) await admin().admin.clientBriefs.associateCandidate({ briefId, applicationId: id, status: "shortlisted" });
    const secondPage = await admin().admin.clientBriefs.candidates({ briefId, shortlist: "shortlisted", limit: 10, page: 1 });
    expect(secondPage.candidates.map(candidate => candidate.id)).toEqual([1]);
    expect(secondPage.pagination).toEqual({ page: 1, limit: 10, total: 11, totalPages: 2 });

    // The admin removes the only candidate of page 2 from the shortlist.
    await admin().admin.clientBriefs.associateCandidate({ briefId, applicationId: 1, status: "declined" });
    const after = await admin().admin.clientBriefs.candidates({ briefId, shortlist: "shortlisted", limit: 10, page: 1 });
    expect(after.pagination).toEqual({ page: 0, limit: 10, total: 10, totalPages: 1 });
    expect(after.candidates).toHaveLength(10);

    // Nobody left: page 0, empty.
    const none = await admin().admin.clientBriefs.candidates({ briefId, minimumMatch: 100, page: 3 });
    expect(none.pagination).toEqual({ page: 0, limit: 25, total: 0, totalPages: 0 });
    expect(none.candidates).toEqual([]);
  });

  it("une licence lue seulement dans le CV reste « à confirmer » jusqu’à ce que l’admin la confirme, déclarée ou extraite (IA-02)", async () => {
    // The latest analysis read the licence in the CV: its facts and its row.
    const hidden = seedCandidate({ specialty: "Anesthésie-réanimation", target_countries: '["Émirats arabes unis"]', certifications: "BLS", normalized_certifications: '[{"name":"Licence DHA","issuingBody":"Dubai Health Authority"}]', ...scored(80) });
    memory.seed(cvCandidateCertifications, [{ application_id: hidden.id, name: "Licence DHA", issuing_body: "Dubai Health Authority", source: "extracted" }]);
    const brief = seedBrief({ required_certifications: "Licence DHA, BLS" });
    const briefId = brief.id as number;
    const matchOf = async () => (await admin().admin.clientBriefs.candidates({ briefId })).candidates[0]!.match;

    expect(await matchOf()).toMatchObject({
      score: 50,
      breakdown: { certifications: 0 },
      certificationsToConfirm: ["Licence DHA", "BLS"],
      certifications: [
        { name: "Licence DHA", origins: ["extracted"], status: "to_confirm" },
        { name: "BLS", origins: ["declared"], status: "to_confirm" },
      ],
    });

    // The admin checks the licence on the authority's register and confirms it.
    await admin().admin.recruitment.candidate.confirmCertification({ id: hidden.id as number, name: "licence dha", confirmed: true });
    expect(memory.rows(cvCandidateCertifications)[0]!.confirmed_at).not.toBeNull();
    expect(await matchOf()).toMatchObject({ score: 60, matchedCertifications: ["Licence DHA"], certificationsToConfirm: ["BLS"] });

    // A certification declared in the form only gets its own confirmed row.
    await admin().admin.recruitment.candidate.confirmCertification({ id: hidden.id as number, name: "BLS", confirmed: true });
    expect(memory.rows(cvCandidateCertifications).map(row => [row.name, row.source, row.confirmed_at !== null])).toEqual([["Licence DHA", "extracted", true], ["BLS", "declared", true]]);
    expect(await matchOf()).toMatchObject({ score: 70, certifications: [
      { name: "Licence DHA", origins: ["extracted", "confirmed"], status: "matched" },
      { name: "BLS", origins: ["declared", "confirmed"], status: "matched" },
    ] });

    // Withdrawn: the points go again. The analysis still retains the licence:
    // « à confirmer » in the mission, found by the filters, case aside.
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id: hidden.id as number, name: "Licence DHA", confirmed: false })).resolves.toEqual({ success: true, changed: true });
    expect(await matchOf()).toMatchObject({ score: 60, certificationsToConfirm: ["Licence DHA"] });
    expect((await admin().admin.recruitment.list({ certification: "dha" })).items.map(item => item.id)).toEqual([hidden.id]);
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id: hidden.id as number, name: "Licence MOH", confirmed: true })).rejects.toThrow("Cette certification ne figure pas dans le dossier.");

    // The certification filter (and the admin sheet, from the same facts) show each origin too.
    const filtered = await admin().admin.recruitment.list({ certification: "BLS" });
    expect(filtered.items.map(item => item.certificationFacts)).toEqual([[
      { name: "BLS", origins: ["declared", "confirmed"], expiresAt: null },
      { name: "Licence DHA", origins: ["extracted"], expiresAt: null },
    ]]);
    expect(memory.rows(recruitmentAuditLogs).map(row => JSON.parse(String(row.metadata)).event)).toEqual(["certification_confirmed", "certification_confirmed", "certification_unconfirmed"]);

    // Nothing changes, nothing is logged: confirmed twice, or withdrawn when not confirmed.
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id: hidden.id as number, name: "BLS", confirmed: true })).resolves.toEqual({ success: true, changed: false });
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id: hidden.id as number, name: "Licence DHA", confirmed: false })).resolves.toEqual({ success: true, changed: false });
    expect(memory.rows(recruitmentAuditLogs)).toHaveLength(3);
  });

  it("confirme une certification déclarée plus longue qu’une ligne enregistrée (180 caractères) (IA-02)", async () => {
    const longName = `Diplôme ${"universitaire ".repeat(20)}`.trim();
    const candidate = seedCandidate({ certifications: `${longName}; BLS` });
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id: candidate.id as number, name: longName, confirmed: true })).resolves.toEqual({ success: true, changed: true });
    expect(memory.rows(cvCandidateCertifications).map(row => row.name)).toEqual([longName.slice(0, 180)]);
    const { items } = await admin().admin.recruitment.list({});
    expect(items.find(item => item.id === candidate.id)!.certificationFacts).toEqual([
      { name: longName, origins: ["declared", "confirmed"], expiresAt: null },
      { name: "BLS", origins: ["declared"], expiresAt: null },
    ]);
    // The same name again: already confirmed.
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id: candidate.id as number, name: longName, confirmed: true })).resolves.toEqual({ success: true, changed: false });
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id: candidate.id as number, name: longName, confirmed: false })).resolves.toEqual({ success: true, changed: true });
    expect(memory.rows(cvCandidateCertifications)[0]!.confirmed_at).toBeNull();
  });

  it("le vivier filtré par certification renvoie l’origine de chaque certification (IA-02)", async () => {
    const trapped = seedCandidate({ marketing_consent: 1, certifications: "BLS", normalized_certifications: '[{"name":"Licence DHA"}]', analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION });
    memory.seed(cvCandidateCertifications, [{ application_id: trapped.id, name: "Licence DHA", source: "extracted" }]);
    seedCandidate({ marketing_consent: 1, certifications: "ACLS" });
    const pool = await admin().admin.recruitment.pool.list({ certification: "DHA" });
    expect(pool.map(candidate => [candidate.id, candidate.certificationFacts])).toEqual([[trapped.id, [
      { name: "BLS", origins: ["declared"], expiresAt: null },
      { name: "Licence DHA", origins: ["extracted"], expiresAt: null },
    ]]]);
  });

  it("filtre les candidatures par certification, langue et pays sans tenir compte des majuscules, comme le vivier (IA-02)", async () => {
    const declared = seedCandidate({ certifications: "Licence DHA", languages: '["Anglais"]', target_countries: '["Qatar"]' });
    const analysed = seedCandidate({ normalized_certifications: '[{"name":"Licence DHA"}]', normalized_languages: '[{"language":"Anglais"}]', target_countries: '["Émirats arabes unis","Qatar"]', ...scored(70) });
    seedCandidate({ certifications: "BLS", languages: '["Arabe"]', target_countries: '["Suisse"]' });
    const idsOf = async (filters: { certification?: string; language?: string; country?: string }) => (await admin().admin.recruitment.list(filters)).items.map(item => item.id).sort();
    for (const certification of ["DHA", "dha", "licence dha"]) expect(await idsOf({ certification })).toEqual([declared.id, analysed.id]);
    for (const language of ["Anglais", "anglais", "ANGLAIS"]) expect(await idsOf({ language })).toEqual([declared.id, analysed.id]);
    for (const country of ["Qatar", "qatar"]) expect(await idsOf({ country })).toEqual([declared.id, analysed.id]);
    expect((await admin().admin.recruitment.list({ certification: "dha" })).total).toBe(2);
  });

  it("les filtres « certification » trouvent une certification confirmée que la mission compte, même après une analyse qui n’a enregistré aucun fait (IA-02)", async () => {
    // A new analysis found a contradiction (or hidden text): it stored no
    // facts, but kept the licence the admin had confirmed.
    const confirmed = seedCandidate({ specialty: "Anesthésie-réanimation", target_countries: '["Émirats arabes unis"]', marketing_consent: 1, normalized_certifications: "[]", ...scored(70) });
    const unrelated = seedCandidate({ marketing_consent: 1, normalized_certifications: "[]", ...scored(70) });
    memory.seed(cvCandidateCertifications, [
      { application_id: confirmed.id, name: "Licence DHA", issuing_body: "Dubai Health Authority", source: "extracted", confirmed_at: "2026-10-20 09:00:00.000" },
      { application_id: unrelated.id, name: "BLS", source: "declared", confirmed_at: "2026-10-20 09:00:00.000" },
    ]);
    const brief = seedBrief({ required_certifications: "Licence DHA" });
    const [first] = (await admin().admin.clientBriefs.candidates({ briefId: brief.id as number })).candidates;
    expect(first).toMatchObject({ id: confirmed.id, match: { breakdown: { certifications: 20 }, certifications: [{ name: "Licence DHA", status: "matched" }] } });

    // The Candidatures list and the pool say the same, with the origins.
    const listed = await admin().admin.recruitment.list({ certification: "DHA" });
    expect(listed.items.map(item => [item.id, item.certificationFacts])).toEqual([[confirmed.id, [{ name: "Licence DHA", origins: ["extracted", "confirmed"], expiresAt: null }]]]);
    expect(listed.total).toBe(1);
    expect((await admin().admin.recruitment.pool.list({ certification: "dha" })).map(candidate => candidate.id)).toEqual([confirmed.id]);
    // Withdrawn, it no longer counts anywhere: the latest analysis did not
    // retain it, so the row read in the CV goes with the confirmation. The
    // mission, the 360° sheet and the filters agree it is no longer there.
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id: confirmed.id as number, name: "Licence DHA", confirmed: false })).resolves.toEqual({ success: true, changed: true, notRetainedByAnalysis: true });
    expect(memory.rows(cvCandidateCertifications).map(row => [row.application_id, row.name])).toEqual([[unrelated.id, "BLS"]]);
    expect((await admin().admin.recruitment.list({ certification: "DHA" })).items).toEqual([]);
    expect(await admin().admin.recruitment.pool.list({ certification: "DHA" })).toEqual([]);
    const withdrawn = (await admin().admin.clientBriefs.candidates({ briefId: brief.id as number })).candidates.find(candidate => candidate.id === confirmed.id);
    expect(withdrawn!.match).toMatchObject({ breakdown: { certifications: 0 }, certifications: [], certificationsToConfirm: [] });
    // The admin sheet reads the same facts as the 360° one.
    expect((await admin().admin.recruitment.list({})).items.find(item => item.id === confirmed.id)!.certificationFacts).toEqual([]);
    expect(memory.rows(recruitmentAuditLogs).map(row => JSON.parse(String(row.metadata)))).toEqual([{ event: "certification_unconfirmed", certification: "Licence DHA", notRetainedByAnalysis: true }]);
  });

  it("retire partout une licence extraite et confirmée qu’une nouvelle analyse avec contradiction ne retient plus, quand l’admin retire sa confirmation (IA-02)", async () => {
    const candidate = seedCandidate({ specialty: "Anesthésie-réanimation", target_countries: '["Émirats arabes unis"]', marketing_consent: 1 });
    const id = candidate.id as number;
    const briefId = seedBrief({ required_certifications: "Licence DHA" }).id as number;
    const missionCertifications = async () => (await admin().admin.clientBriefs.candidates({ briefId })).candidates.find(item => item.id === id)!.match.certifications;
    // The Candidatures list, then the pool, filtered by certification; the facts of the admin sheet, as the 360° one reads them.
    const filtersFind = async () => [(await admin().admin.recruitment.list({ certification: "DHA" })).items.map(item => item.id), (await admin().admin.recruitment.pool.list({ certification: "DHA" })).map(item => item.id)];
    const sheetFacts = async () => (await admin().admin.recruitment.list({})).items[0]!.certificationFacts;

    await saveCvAnalysis(id, cvAnalysis());
    await admin().admin.recruitment.candidate.confirmCertification({ id, name: "Licence DHA", confirmed: true });
    // A new analysis finds a contradiction: no fact stored, the confirmed licence kept and counted.
    await saveCvAnalysis(id, cvAnalysis({ contradictions: [{ field: "specialty", declaredValue: "Anesthésie-réanimation", documentValue: "Pédiatrie", evidence: "Pédiatre", ...verified }], relevanceScore: null }));
    expect(await missionCertifications()).toMatchObject([{ name: "Licence DHA", origins: ["extracted", "confirmed"], status: "matched" }]);
    expect(await filtersFind()).toEqual([[id], [id]]);

    // Withdrawn: nothing vouches for the licence any more. The mission, the
    // sheet and the filters no longer show it, instead of « à confirmer » on
    // one side and nothing on the other.
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id, name: "Licence DHA", confirmed: false })).resolves.toEqual({ success: true, changed: true, notRetainedByAnalysis: true });
    expect(memory.rows(cvCandidateCertifications)).toEqual([]);
    expect(await missionCertifications()).toEqual([]);
    expect(await sheetFacts()).toEqual([]);
    expect(await filtersFind()).toEqual([[], []]);

    // A later analysis that reads it again without doubt brings it back, to confirm.
    await saveCvAnalysis(id, cvAnalysis());
    expect(await missionCertifications()).toMatchObject([{ name: "Licence DHA", origins: ["extracted"], status: "to_confirm" }]);
    expect(await sheetFacts()).toEqual([{ name: "Licence DHA", origins: ["extracted"], expiresAt: null }]);
    expect(await filtersFind()).toEqual([[id], [id]]);
  });

  it("dit qu’une certification a expiré, et la compte une fois son renouvellement confirmé, avec ou sans nouvelle date, journalisé (IA-02)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T10:00:00.000Z"), toFake: ["Date"] });
    // « PALS, ACLS » declared without a date; the AI read ACLS until 2023-05 in the CV.
    const candidate = seedCandidate({ specialty: "Cardiologie", certifications: "PALS, ACLS", normalized_certifications: '[{"name":"ACLS","expiresAt":"2023-05"}]', analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION });
    memory.seed(cvCandidateCertifications, [{ application_id: candidate.id, name: "ACLS", source: "extracted", expires_at: "2023-05" }]);
    const brief = seedBrief({ specialty_needed: "Cardiologie", country: "Suisse", required_certifications: "ACLS" });
    memory.seed(clientBriefCandidates, [{ brief_id: brief.id, application_id: candidate.id, association_status: "shortlisted", candidate_consent_at: "2026-10-20 12:00:00.000" }]);
    const id = candidate.id as number;
    const matchOf = async () => (await admin().admin.clientBriefs.candidates({ briefId: brief.id as number })).candidates[0]!.match;
    const confirm = (renewal?: { expiresAt: string | null }) => admin().admin.recruitment.candidate.confirmCertification({ id, name: "ACLS", confirmed: true, renewal });
    const rows = () => memory.rows(cvCandidateCertifications).map(row => [row.name, row.source, row.expires_at, row.confirmed_at !== null]);
    // The certifications cell of the file sent to the employer.
    const exportedCertifications = async () => {
      const [, row] = (await admin().admin.recruitment.exportCsv({ type: "shortlist", briefId: brief.id as number })).csv.split("\n");
      return row!.split('";"')[10];
    };

    expect(await matchOf()).toMatchObject({ score: 35, certificationsToConfirm: [], certifications: [{ name: "ACLS", origins: ["declared", "extracted"], expiresAt: "2023-05", status: "expired" }] });
    // Confirmed as it is, it stays expired, and the screen still says so.
    await confirm();
    expect(await matchOf()).toMatchObject({ score: 35, certifications: [{ origins: ["declared", "extracted", "confirmed"], expiresAt: "2023-05", status: "expired" }] });

    // Each refusal carries a stable reason next to its French message.
    await expect(confirm({ expiresAt: "2025-01-31" })).rejects.toMatchObject({ message: "La nouvelle date d’expiration est déjà passée : la certification resterait expirée.", cause: { reason: "renewal_date_past" } });
    await expect(confirm({ expiresAt: "2027-02-30" })).rejects.toMatchObject({ message: "Nouvelle date d’expiration invalide.", cause: { reason: "renewal_date_invalid" } });
    // Nor more than 15 years ahead: a typing error would count it for good.
    for (const expiresAt of ["9999-12-31", "2041-10-27"]) {
      await expect(confirm({ expiresAt })).rejects.toMatchObject({ message: "La nouvelle date d’expiration est à plus de 15 ans : vérifiez-la sur le justificatif (le 26/10/2041 au plus tard).", cause: { reason: "renewal_date_too_far" } });
    }
    expect(rows()).toEqual([["ACLS", "extracted", "2023-05", true]]);
    await expect(confirm({ expiresAt: "2031-06-30" })).resolves.toEqual({ success: true, changed: true });
    // The renewal has a row of its own: the row read in the CV keeps its date.
    expect(rows()).toEqual([["ACLS", "extracted", "2023-05", true], ["ACLS", "renewed", "2031-06-30", true]]);
    expect(await matchOf()).toMatchObject({ score: 55, breakdown: { certifications: 20 }, certifications: [{ origins: ["declared", "extracted", "confirmed"], expiresAt: "2031-06-30", status: "matched" }] });
    expect(await exportedCertifications()).toBe("PALS (déclarée par le candidat) ; ACLS (déclarée par le candidat, extraite du CV par l’IA, confirmée par l’admin), expire le 30/06/2031");
    // The same renewal again changes nothing; one without a date does.
    await expect(confirm({ expiresAt: "2031-06-30" })).resolves.toEqual({ success: true, changed: false });
    await expect(confirm({ expiresAt: null })).resolves.toEqual({ success: true, changed: true });
    expect(rows()).toEqual([["ACLS", "extracted", "2023-05", true], ["ACLS", "renewed", null, true]]);
    expect(await matchOf()).toMatchObject({ score: 55, certifications: [{ expiresAt: null, status: "matched" }] });

    // The certificate is rejected after all: the confirmation goes, the
    // renewal with it, and the admin sheet (the same facts as the 360° one),
    // the mission and the employer's file give the date read in the CV again,
    // as read by the AI.
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id, name: "ACLS", confirmed: false })).resolves.toEqual({ success: true, changed: true });
    expect(rows()).toEqual([["ACLS", "extracted", "2023-05", false]]);
    expect((await admin().admin.recruitment.list({})).items[0]!.certificationFacts).toEqual([
      { name: "PALS", origins: ["declared"], expiresAt: null },
      { name: "ACLS", origins: ["declared", "extracted"], expiresAt: "2023-05" },
    ]);
    expect(await matchOf()).toMatchObject({ score: 35, certifications: [{ origins: ["declared", "extracted"], expiresAt: "2023-05", status: "expired" }] });
    expect(await exportedCertifications()).toBe("PALS (déclarée par le candidat) ; ACLS (déclarée par le candidat, extraite du CV par l’IA), expirée en mai 2023");

    expect(memory.rows(recruitmentAuditLogs).filter(row => row.action !== "export").map(row => JSON.parse(String(row.metadata)))).toEqual([
      { event: "certification_confirmed", certification: "ACLS" },
      { event: "certification_renewed", certification: "ACLS", expiresAt: "2031-06-30", previousExpiresAt: ["2023-05"] },
      { event: "certification_renewed", certification: "ACLS", expiresAt: null, previousExpiresAt: ["2031-06-30"] },
      { event: "certification_unconfirmed", certification: "ACLS" },
    ]);
  });

  it("confirme le renouvellement d’une certification seulement déclarée dans sa propre ligne, retirée avec la confirmation (IA-02)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T10:00:00.000Z"), toFake: ["Date"] });
    const candidate = seedCandidate({ certifications: "BLS" });
    const id = candidate.id as number;
    // 15 years ahead at most, that day included.
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id, name: "bls", confirmed: true, renewal: { expiresAt: "2041-10-26" } })).resolves.toEqual({ success: true, changed: true });
    expect(memory.rows(cvCandidateCertifications).map(row => [row.name, row.source, row.expires_at, row.confirmed_at !== null])).toEqual([["BLS", "renewed", "2041-10-26", true]]);
    const factsOf = async () => (await admin().admin.recruitment.list({})).items[0]!.certificationFacts;
    expect(await factsOf()).toEqual([{ name: "BLS", origins: ["declared", "confirmed"], expiresAt: "2041-10-26" }]);
    // Already confirmed by its renewal.
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id, name: "BLS", confirmed: true })).resolves.toEqual({ success: true, changed: false });
    await expect(admin().admin.recruitment.candidate.confirmCertification({ id, name: "BLS", confirmed: false })).resolves.toEqual({ success: true, changed: true });
    expect(memory.rows(cvCandidateCertifications)).toEqual([]);
    expect(await factsOf()).toEqual([{ name: "BLS", origins: ["declared"], expiresAt: null }]);
  });

  it("refuse une date d’accord antérieure à la candidature ou à la création de la mission, le jour même accepté (RGPD-03)", async () => {
    const candidate = seedCandidate({ createdAt: "2026-10-15 08:00:00.000" });
    const latecomer = seedCandidate({ createdAt: "2026-10-21 09:00:00.000" });
    // Created at 00:30 on 19 October in Paris.
    const brief = seedBrief({ created_at: "2026-10-18 22:30:00.000" });
    const briefId = brief.id as number;
    for (const applicant of [candidate, latecomer]) await admin().admin.clientBriefs.associateCandidate({ briefId, applicationId: applicant.id as number, status: "shortlisted" });
    const consent = (applicationId: unknown, consentDate: string) => admin().admin.clientBriefs.setCandidateConsent({ briefId, applicationId: applicationId as number, consentDate });

    // Each refusal carries a stable reason the mission screen words in the admin's language.
    await expect(consent(candidate.id, "1900-01-01")).rejects.toMatchObject({ message: "La date de l’accord du candidat ne peut pas précéder la création de la mission, le 19/10/2026.", cause: { reason: "consent_before_mission" } });
    await expect(consent(candidate.id, "2026-10-18")).rejects.toMatchObject({ message: "La date de l’accord du candidat ne peut pas précéder la création de la mission, le 19/10/2026.", cause: { reason: "consent_before_mission" } });
    await expect(consent(latecomer.id, "2026-10-20")).rejects.toMatchObject({ message: "La date de l’accord du candidat ne peut pas précéder sa candidature, reçue le 21/10/2026.", cause: { reason: "consent_before_application" } });
    // The same day is accepted.
    await consent(candidate.id, "2026-10-19");
    await consent(latecomer.id, "2026-10-21");
    expect(memory.rows(clientBriefCandidates).map(row => row.candidate_consent_at)).toEqual(["2026-10-19 12:00:00.000", "2026-10-21 12:00:00.000"]);
    expect(memory.rows(recruitmentAuditLogs).map(row => JSON.parse(String(row.metadata)).consentDate)).toEqual(["2026-10-19", "2026-10-21"]);
  });

  it("note puis retire la date de l’accord du candidat pour une mission (RGPD-03)", async () => {
    const candidate = seedCandidate({ createdAt: "2026-10-01 08:00:00.000" });
    const outsider = seedCandidate();
    const brief = seedBrief({ created_at: "2026-10-02 08:00:00.000" });
    const briefId = brief.id as number;
    await admin().admin.clientBriefs.associateCandidate({ briefId, applicationId: candidate.id as number, status: "shortlisted" });

    await admin().admin.clientBriefs.setCandidateConsent({ briefId, applicationId: candidate.id as number, consentDate: "2026-10-20" });
    expect(memory.rows(clientBriefCandidates)[0]!.candidate_consent_at).toBe("2026-10-20 12:00:00.000");
    const listed = await admin().admin.clientBriefs.candidates({ briefId, shortlist: "shortlisted" });
    expect(listed).toMatchObject({ shortlistedCount: 1, consentedCount: 1 });
    expect(listed.candidates[0]!.association!.candidateConsentAt).toEqual(new Date("2026-10-20T12:00:00.000Z"));

    // Shortlisting again keeps the agreement.
    await admin().admin.clientBriefs.associateCandidate({ briefId, applicationId: candidate.id as number, status: "shortlisted" });
    expect(memory.rows(clientBriefCandidates)[0]!.candidate_consent_at).toBe("2026-10-20 12:00:00.000");

    await expect(admin().admin.clientBriefs.setCandidateConsent({ briefId, applicationId: candidate.id as number, consentDate: "2999-01-01" })).rejects.toMatchObject({ message: "La date de l’accord du candidat ne peut pas être dans le futur.", cause: { reason: "consent_date_future" } });
    await expect(admin().admin.clientBriefs.setCandidateConsent({ briefId, applicationId: candidate.id as number, consentDate: "2026-02-30" })).rejects.toMatchObject({ message: "Date de l’accord invalide.", cause: { reason: "consent_date_invalid" } });
    await expect(admin().admin.clientBriefs.setCandidateConsent({ briefId, applicationId: outsider.id as number, consentDate: "2026-10-20" })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Ce candidat n’est pas associé à cette mission : présélectionnez-le d’abord.", cause: { reason: "consent_not_associated" } });

    await admin().admin.clientBriefs.setCandidateConsent({ briefId, applicationId: candidate.id as number, consentDate: null });
    expect(memory.rows(clientBriefCandidates)[0]!.candidate_consent_at).toBeNull();
    await expect(admin().admin.clientBriefs.candidates({ briefId })).resolves.toMatchObject({ shortlistedCount: 1, consentedCount: 0 });
    expect(memory.rows(recruitmentAuditLogs).map(row => JSON.parse(String(row.metadata)))).toEqual([
      { event: "mission_consent", briefId, consentDate: "2026-10-20" },
      { event: "mission_consent", briefId, consentDate: null },
    ]);
  });

  it("n’exporte que les présélectionnés ayant donné leur accord, en clair, avec l’origine de leurs certifications et langues, et dit combien sont exclus (RGPD-03, IA-02)", async () => {
    const agreed = seedCandidate({ languages: '["Anglais"]', certifications: "BLS", target_countries: '["Émirats arabes unis","Qatar"]', years_experience: 8, availability: "Immédiate", mobility: "Golfe", status: "reviewing" });
    const waiting = seedCandidate();
    const brief = seedBrief();
    const briefId = brief.id as number;
    memory.seed(cvCandidateCertifications, [
      { application_id: agreed.id, name: "Licence DHA", source: "extracted", expires_at: "2099-05" },
      { application_id: agreed.id, name: "ACLS", source: "extracted", expires_at: "2023-05" },
    ]);
    memory.seed(cvCandidateLanguages, [{ application_id: agreed.id, language: "Arabe", source: "extracted" }]);
    memory.seed(clientBriefCandidates, [
      { brief_id: briefId, application_id: agreed.id, association_status: "shortlisted", candidate_consent_at: "2026-10-20 12:00:00.000" },
      { brief_id: briefId, application_id: waiting.id, association_status: "shortlisted" },
    ]);

    const exported = await admin().admin.recruitment.exportCsv({ type: "shortlist", briefId });
    expect(exported).toMatchObject({ count: 1, excludedWithoutConsent: 1 });
    const [header, ...rows] = exported.csv.split("\n");
    expect(header).toBe(["Prénom", "Nom", "Email", "Téléphone", "Spécialité", "Pays ciblés", "Langues (origine)", "Expérience (ans)", "Disponibilité", "Mobilité", "Certifications (origine)", "Accord du candidat", "Statut"].map(cell => `"${cell}"`).join(";"));
    // Every cell reads as written for the employer: the countries listed, each
    // certification's expiry, the status in words, no JSON nor internal code.
    expect(rows).toEqual([[
      "Prénom1", "Nom", "m1@test.local", "", "Pédiatrie", "Émirats arabes unis ; Qatar",
      "Anglais (déclarée par le candidat) ; Arabe (extraite du CV par l’IA)", "8", "Immédiate", "Golfe",
      "BLS (déclarée par le candidat) ; Licence DHA (extraite du CV par l’IA), expire en mai 2099 ; ACLS (extraite du CV par l’IA), expirée en mai 2023",
      "20/10/2026", "En revue",
    ].map(cell => `"${cell}"`).join(";")]);
    expect(exported.csv).not.toContain("m2@test.local");
    expect(memory.rows(recruitmentAuditLogs).filter(row => row.action === "export").map(row => row.application_id)).toEqual([agreed.id]);

    // Nobody agreed: refused with what to do, and nothing is logged as exported.
    memory.rows(clientBriefCandidates)[0]!.candidate_consent_at = null;
    await expect(admin().admin.recruitment.exportCsv({ type: "shortlist", briefId })).rejects.toThrow("Aucun des 2 candidat(s) de la shortlist n’a d’accord noté pour cette mission. Obtenez l’accord de chaque candidat et notez-en la date (« Accord du candidat reçu ») avant d’exporter.");
    expect(memory.rows(recruitmentAuditLogs).filter(row => row.action === "export")).toHaveLength(1);
  });
});
