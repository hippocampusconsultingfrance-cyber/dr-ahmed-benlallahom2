import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { candidateSecurityRateLimits, cvApplications, cvCandidateCertifications, cvCandidateExperiences, cvCandidateLanguages, cvProcessingJobs, recruitmentAuditLogs } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// REC-08 : quand l’AI Gateway refuse pour une raison de facturation (carte
// expirée, crédit épuisé), le dossier passe dans un statut distinct, le
// propriétaire est alerté au plus une fois par jour, et « Mettre à jour /
// reprendre l’IA » relance l’analyse une fois le crédit rétabli.

const BILLING_REFUSAL = "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
const CV_TEXT = "[PAGE 1]\nDr Zoé Kowalska, anesthésiste-réanimatrice. Expérience : CHU de Lyon, bloc opératoire et réanimation chirurgicale, 2015-2024. Langues : français, anglais.";

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  aiAvailable: false,
  aiCalls: 0,
  notifications: [] as Array<{ title: string; content: string }>,
}));

vi.mock("./db", () => ({
  getDb: async () => {
    if (!state.memory) return null;
    // drizzle's pg-proxy has no batch: run the statements in order, like neon-http does atomically.
    const db = state.memory.db as { batch?: unknown };
    db.batch ??= async (queries: Array<PromiseLike<unknown>>) => { const results = []; for (const query of queries) results.push(await query); return results; };
    return db;
  },
}));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
  isAdminMfaVerified: vi.fn(async () => true),
}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async (payload: { title: string; content: string }) => { state.notifications.push(payload); return true; }) }));
vi.mock("./storage", () => ({
  storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`),
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://blob.test/${key}` })),
}));
vi.mock("ai", async importOriginal => ({
  ...await importOriginal<typeof import("ai")>(),
  generateText: vi.fn(async () => {
    state.aiCalls += 1;
    if (!state.aiAvailable) throw new Error(BILLING_REFUSAL);
    return {
      output: {
        summary: "Anesthésiste-réanimatrice, CHU de Lyon.", professionalTitle: "", specialties: [], skills: [], languages: [], normalizedLanguages: [],
        certifications: [], countriesOfInterest: [], yearsExperience: null, normalizedExperiences: [], strengths: [], gaps: [], dataQualityWarnings: [],
        requiredFollowUps: [], fieldEvidence: [], contradictions: [], confidence: 80,
        scoreBreakdown: { specialtyMatch: 0, experienceEvidence: 0, skillsEvidence: 0, languageReadiness: 0, credentialReadiness: 0 },
        reasoning: "Lecture du CV.",
      },
      usage: { inputTokens: 100, outputTokens: 50 },
      finalStep: { model: { modelId: "openai/gpt-6-astra" } },
      response: { id: "generation-test" },
    };
  }),
}));
vi.mock("./recruitmentAnalysis", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentAnalysis")>(),
  extractCvDocument: vi.fn(async () => ({ text: CV_TEXT, method: "pdf_text", totalPages: 1, ocrConfidence: null, ocrModelVersion: null, warnings: [] })),
}));

const { processDueCvAnalysisJobs } = await import("./recruitmentProcessing");
const { MANUAL_REVIEW_FALLBACK_MODEL, RECRUITMENT_ANALYSIS_PROMPT_VERSION } = await import("./recruitmentAnalysis");
const { appRouter } = await import("./routers");

let memory: MemoryPg;
const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n"), Buffer.alloc(400, 65)]);

function admin() {
  const ctx: TrpcContext = {
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

function seedDossier(index: number, extra: Record<string, unknown> = {}, job: Record<string, unknown> = { job_status: "queued", attempts: 0 }) {
  const [application] = memory.seed(cvApplications, [{
    tracking_id: `CVAIDOWN${String(index).padStart(8, "0")}`, first_name: "Zoé", last_name: `Kowalska${index}`, email: `zoe${index}@test.local`, specialty: "Anesthésie-réanimation",
    target_countries: "[]", cv_file_key: `recruitment/quarantine/cv${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: pdf.length, ...extra,
  }]);
  memory.seed(cvProcessingJobs, [{ application_id: application!.id, max_attempts: 3, scheduled_for: new Date(Date.now() - 60_000), ...job }]);
  return application!.id as number;
}

const dossier = (id: number) => memory.rows(cvApplications).find(row => row.id === id)!;
const jobsOf = (id: number) => memory.rows(cvProcessingJobs).filter(row => row.application_id === id);

beforeEach(() => {
  memory = createMemoryPg([cvApplications, cvProcessingJobs, cvCandidateCertifications, cvCandidateLanguages, cvCandidateExperiences, candidateSecurityRateLimits, recruitmentAuditLogs]);
  state.memory = memory;
  state.aiAvailable = false;
  state.aiCalls = 0;
  state.notifications = [];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(pdf)));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("analyse IA refusée pour facturation (REC-08)", () => {
  it("classe le dossier « degraded » avec un résultat de revue manuelle, sans score, et alerte le propriétaire une seule fois par jour", async () => {
    const first = seedDossier(1);
    const second = seedDossier(2);
    const run = await processDueCvAnalysisJobs(5);
    expect(run.processed).toBe(2);
    expect(run.results).toEqual([
      expect.objectContaining({ completed: true, applicationId: first, aiUnavailable: true, score: null }),
      expect.objectContaining({ completed: true, applicationId: second, aiUnavailable: true }),
    ]);
    for (const id of [first, second]) {
      expect(dossier(id)).toMatchObject({
        analysis_status: "degraded",
        analysis_last_error: "ai_gateway_billing_unavailable",
        analysis_model: MANUAL_REVIEW_FALLBACK_MODEL,
        ai_score: null,
      });
      expect(String(dossier(id).ai_summary)).toContain("examiné manuellement");
      // The job is closed (no blind automatic retry), with the reason kept.
      expect(jobsOf(id)).toEqual([expect.objectContaining({ job_status: "completed", last_error: "ai_gateway_billing_unavailable" })]);
    }
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]!.title).toContain("analyse IA des CV indisponible");
    expect(state.notifications[0]!.content).toContain("Mettre à jour / reprendre l’IA");
    // No candidate data in the alert.
    expect(state.notifications[0]!.content).not.toMatch(/Zoé|Kowalska|CVAIDOWN|zoe1@/);

    // Still refused the same day: no new email; the next day, one more.
    seedDossier(3);
    await processDueCvAnalysisJobs(5);
    expect(state.notifications).toHaveLength(1);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    seedDossier(4);
    await processDueCvAnalysisJobs(5);
    expect(state.notifications).toHaveLength(2);
  });

  it("« Mettre à jour / reprendre l’IA » relance les dossiers sans analyse IA, y compris ceux enregistrés avant ce statut", async () => {
    const completedJob = { job_status: "completed", attempts: 1 };
    const fallback = { analysis_model: MANUAL_REVIEW_FALLBACK_MODEL, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION, ai_summary: "Analyse IA complète temporairement indisponible." };
    const degraded = seedDossier(1, { ...fallback, analysis_status: "degraded", analysis_last_error: "ai_gateway_billing_unavailable", updatedAt: new Date(Date.now() - 2 * 60_000) }, completedJob);
    // Saved by the same fallback before the « degraded » status existed (dossier 2 of the audit).
    const legacy = seedDossier(2, { ...fallback, analysis_status: "needs_review", updatedAt: new Date(Date.now() - 60_000) }, completedJob);
    // Really analysed, a human review is pending: not an AI outage, left alone.
    const reviewed = seedDossier(3, { analysis_status: "needs_review", analysis_model: "openai/gpt-6-astra", analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION, ai_summary: "Synthèse." }, completedJob);

    state.aiAvailable = true;
    const resumed = await admin().admin.recruitment.reanalyzeFailed({ limit: 10 });
    expect(resumed).toEqual({ success: true, queued: 2, processed: 1, aiUnavailable: false });
    // One analysis inline, the other queued for the cron.
    expect(dossier(degraded)).toMatchObject({ analysis_model: "openai/gpt-6-astra", analysis_last_error: null });
    expect(dossier(degraded).analysis_status).not.toBe("degraded");
    expect(dossier(legacy).analysis_status).toBe("queued");
    await processDueCvAnalysisJobs(5);
    expect(dossier(legacy)).toMatchObject({ analysis_model: "openai/gpt-6-astra", analysis_last_error: null });
    expect(dossier(reviewed)).toMatchObject({ analysis_status: "needs_review", analysis_model: "openai/gpt-6-astra" });
    expect(jobsOf(reviewed)).toHaveLength(1);
    expect(state.aiCalls).toBe(2);
    expect(state.notifications).toEqual([]);
  });

  it("« Mettre à jour / reprendre l’IA » quand le crédit manque toujours : le dit, et laisse les autres dossiers tels quels", async () => {
    const completedJob = { job_status: "completed", attempts: 1 };
    const fallback = { analysis_model: MANUAL_REVIEW_FALLBACK_MODEL, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION, ai_summary: "Analyse IA complète temporairement indisponible." };
    const degraded = seedDossier(1, { ...fallback, analysis_status: "degraded", analysis_last_error: "ai_gateway_billing_unavailable", updatedAt: new Date(Date.now() - 3 * 60_000) }, completedJob);
    const legacy = seedDossier(2, { ...fallback, analysis_status: "needs_review", updatedAt: new Date(Date.now() - 2 * 60_000) }, completedJob);
    // Analysed under an older prompt: resumable, and its analysis must not be replaced by the fallback.
    const outdated = seedDossier(3, { analysis_status: "completed", analysis_model: "openai/gpt-5", analysis_prompt_version: "recruitment-v6", ai_summary: "Ancienne synthèse.", ai_score: 74, updatedAt: new Date(Date.now() - 60_000) }, completedJob);

    const result = await admin().admin.recruitment.reanalyzeFailed({ limit: 10 });
    expect(result).toEqual({ success: true, queued: 1, processed: 1, aiUnavailable: true });
    // One refused call; the next dossiers are not queued for the cron to be refused in turn.
    expect(state.aiCalls).toBe(1);
    expect(dossier(degraded)).toMatchObject({ analysis_status: "degraded", analysis_last_error: "ai_gateway_billing_unavailable" });
    expect(dossier(legacy)).toMatchObject({ analysis_status: "needs_review", analysis_model: MANUAL_REVIEW_FALLBACK_MODEL });
    expect(dossier(outdated)).toMatchObject({ analysis_status: "completed", ai_summary: "Ancienne synthèse.", ai_score: 74 });
    expect(jobsOf(legacy)).toEqual([expect.objectContaining({ job_status: "completed" })]);
    expect(jobsOf(outdated)).toEqual([expect.objectContaining({ job_status: "completed" })]);
  });

  it("« Relancer l’analyse » d’un dossier quand le crédit manque toujours répond « IA indisponible », pas « analyse actualisée »", async () => {
    const id = seedDossier(1, {}, { job_status: "completed", attempts: 1 });
    const result = await admin().admin.recruitment.reanalyze({ id });
    expect(result).toMatchObject({ outcome: "ai_unavailable", error: "ai_gateway_billing_unavailable", processed: 1 });
    expect(dossier(id).analysis_status).toBe("degraded");
  });

  it("ne traite, pour une relance ciblée, que les dossiers demandés", async () => {
    const waiting = seedDossier(1);
    const requested = seedDossier(2);

    const run = await processDueCvAnalysisJobs(5, [requested]);

    expect(run.results.map(result => result.applicationId)).toEqual([requested]);
    expect(jobsOf(waiting)).toEqual([expect.objectContaining({ job_status: "queued", attempts: 0 })]);
  });
});
