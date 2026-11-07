import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts, candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments } from "../drizzle/schema";
import { canRequestCandidateDocumentReanalysis } from "../shared/candidateDocumentReanalysis";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({ db: null as unknown, analyses: [] as number[] }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("./storage", () => ({ storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`) }));
vi.mock("./candidateDocumentAnalysis", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateDocumentAnalysis")>(),
  analyzeCandidateDocument: vi.fn(async (input: { attempt: number }) => {
    state.analyses.push(input.attempt);
    // Each await yields: a concurrent run gets its turn in the middle of the analysis.
    await new Promise(resolve => setTimeout(resolve, 5));
    return { model: "test-model", analysis: { documentKind: "Diplôme", summary: "Synthèse de test", issuingOrganization: null, issueDate: null, expiryDate: null, confidence: 80, flags: [], missingInformation: [] } };
  }),
}));
vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("%PDF-1.7 diplome"))));

const { processDueCandidateDocumentAnalysisJobs, recoverStaleCandidateDocumentJobs } = await import("./candidateDocumentProcessing");
const { analyzeCandidateDocument } = await import("./candidateDocumentAnalysis");
const { ProcessingDeadlineError, runWithProcessingDeadline } = await import("./processingDeadline");
const { runCandidateDocumentProcessingWorker } = await import("./scheduledJobs");
const { adminCandidateDocumentsRouter } = await import("./routers/admin/candidateDocuments");

const MINUTE = 60_000;
const worker = () => runCandidateDocumentProcessingWorker({ batchSize: 1, maxBatches: 6, budgetMs: 20_000 });

function db() { return state.db as InMemoryDrizzle; }

function seedDiploma(document: Record<string, unknown> = {}, job: Record<string, unknown> | null = {}) {
  const row = db().seed(candidateDocuments, {
    candidateId: 1, category: "diploma", originalName: "diplome.pdf", storageKey: "candidate-documents/quarantine/1/diplome.pdf",
    mimeType: "application/pdf", sizeBytes: 2048, checksum: "0".repeat(64), status: "uploaded", analysisStatus: "queued",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * MINUTE), ...document,
  });
  if (job) db().seed(candidateDocumentProcessingJobs, { documentId: row.id, status: "queued", maxAttempts: 3, scheduledFor: new Date(Date.now() - MINUTE), ...job });
  return row;
}

const jobs = () => db().rows(candidateDocumentProcessingJobs);

function admin() {
  return adminCandidateDocumentsRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}

beforeEach(() => {
  state.db = createInMemoryDrizzle();
  state.analyses.length = 0;
  vi.mocked(analyzeCandidateDocument).mockClear();
  db().seed(candidateAccounts, { email: "vera@example.test", firstName: "Vera", lastName: "Victime", passwordHash: "scrypt$unused" });
});

describe("EXPL-12 — document interrompu en cours d’analyse", () => {
  it("une tâche « running » depuis 2 jours repasse en file au passage suivant, et son document est analysé", async () => {
    const document = seedDiploma({ status: "analyzing", analysisStatus: "analyzing", analysisAttempts: 1 }, { status: "running", attempts: 1, startedAt: new Date(Date.now() - 2 * 24 * 60 * MINUTE) });

    await expect(worker()).resolves.toMatchObject({ jobsRecovered: 1, jobsExhausted: 0, processed: 1, completed: 1 });

    // The interrupted attempt counts: this run is the second.
    expect(state.analyses).toEqual([2]);
    expect(jobs()).toMatchObject([{ status: "completed", attempts: 2 }]);
    expect(document).toMatchObject({ status: "needs_review", analysisStatus: "completed", analysisAttempts: 2 });
  });

  it("une tâche encore récente est laissée au passage qui la traite", async () => {
    const document = seedDiploma({ status: "analyzing", analysisStatus: "analyzing" }, { status: "running", attempts: 1, startedAt: new Date(Date.now() - 5 * MINUTE) });

    await expect(recoverStaleCandidateDocumentJobs()).resolves.toEqual({ recovered: 0, exhausted: 0, closed: 0 });
    expect(jobs()).toMatchObject([{ status: "running", attempts: 1 }]);
    expect(document).toMatchObject({ analysisStatus: "analyzing" });
  });

  it("une tâche interrompue à sa dernière tentative passe le document en revue humaine, sans nouvel appel à l’IA", async () => {
    const document = seedDiploma({ status: "analyzing", analysisStatus: "analyzing", analysisAttempts: 3 }, { status: "running", attempts: 3, startedAt: new Date(Date.now() - 20 * MINUTE) });

    await expect(worker()).resolves.toMatchObject({ jobsRecovered: 0, jobsExhausted: 1, processed: 0 });

    expect(state.analyses).toEqual([]);
    expect(jobs()).toMatchObject([{ status: "completed", lastError: "worker_interrupted_attempts_exhausted" }]);
    expect(document).toMatchObject({ status: "needs_review", analysisStatus: "needs_review", analysisLastError: "worker_interrupted_attempts_exhausted", aiConfidence: 0 });
    expect(JSON.parse(String(document.aiFlags))).toEqual(["ai_analysis_unavailable", "worker_interrupted_attempts_exhausted"]);
    expect(db().rows(candidateDocumentAuditLogs)).toMatchObject([{ documentId: document.id, candidateId: 1, actorType: "system", action: "analysis_completed" }]);
  });

  it("ne rouvre pas l’analyse d’un document déjà terminée quand seule sa tâche est restée « running »", async () => {
    const document = seedDiploma({ status: "needs_review", analysisStatus: "completed", aiSummary: "Analyse gardée" }, { status: "running", attempts: 3, startedAt: new Date(Date.now() - 20 * MINUTE) });

    await expect(recoverStaleCandidateDocumentJobs()).resolves.toEqual({ recovered: 0, exhausted: 0, closed: 1 });

    expect(jobs()).toMatchObject([{ status: "completed", lastError: "worker_interrupted_document_settled" }]);
    expect(document).toMatchObject({ status: "needs_review", analysisStatus: "completed", aiSummary: "Analyse gardée" });
    expect(db().rows(candidateDocumentAuditLogs)).toHaveLength(0);
  });

  it("ne relance pas l’IA sur un document déjà analysé et approuvé dont la tâche est restée « running » avant sa dernière tentative", async () => {
    const document = seedDiploma({ status: "reviewed", analysisStatus: "completed", aiSummary: "Analyse gardée", reviewNotes: "Original vérifié" }, { status: "running", attempts: 1, startedAt: new Date(Date.now() - 2 * 24 * 60 * MINUTE) });

    await expect(worker()).resolves.toMatchObject({ jobsRecovered: 0, jobsExhausted: 0, jobsClosed: 1, processed: 0 });

    expect(state.analyses).toEqual([]);
    expect(jobs()).toMatchObject([{ status: "completed", attempts: 1, lastError: "worker_interrupted_document_settled" }]);
    expect(document).toMatchObject({ status: "reviewed", analysisStatus: "completed", aiSummary: "Analyse gardée", reviewNotes: "Original vérifié" });
  });

  it("garde la décision de l’admin sur un document resté « en cours » qu’il a refusé ou archivé pendant le blocage", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * MINUTE);
    const rejected = seedDiploma({ status: "rejected", analysisStatus: "analyzing", reviewNotes: "Document illisible" }, { status: "running", attempts: 1, startedAt: twoDaysAgo });
    const archived = seedDiploma({ status: "archived", analysisStatus: "analyzing", analysisAttempts: 3 }, { status: "running", attempts: 3, startedAt: twoDaysAgo });

    await expect(worker()).resolves.toMatchObject({ jobsRecovered: 0, jobsExhausted: 0, jobsClosed: 2, processed: 0 });

    expect(state.analyses).toEqual([]);
    expect(jobs()).toMatchObject([{ status: "completed", lastError: "worker_interrupted_document_settled" }, { status: "completed", lastError: "worker_interrupted_document_settled" }]);
    expect(rejected).toMatchObject({ status: "rejected", reviewNotes: "Document illisible" });
    expect(archived).toMatchObject({ status: "archived", analysisAttempts: 3, aiSummary: null });
    expect(db().rows(candidateDocumentAuditLogs)).toHaveLength(0);
  });

  it("deux passages simultanés ne prennent la tâche qu’une fois : le document est analysé une seule fois", async () => {
    const document = seedDiploma();

    const [first, second] = await Promise.all([processDueCandidateDocumentAnalysisJobs(1), processDueCandidateDocumentAnalysisJobs(1)]);

    expect(first.processed + second.processed).toBe(1);
    expect(first.completed + second.completed).toBe(1);
    expect(state.analyses).toEqual([1]);
    expect(jobs()).toMatchObject([{ status: "completed", attempts: 1 }]);
    expect(document).toMatchObject({ analysisStatus: "completed", analysisAttempts: 1 });
  });

  it("deux reprises simultanées ne remettent la tâche en file qu’une fois", async () => {
    seedDiploma({ status: "analyzing", analysisStatus: "analyzing" }, { status: "running", attempts: 1, startedAt: new Date(Date.now() - 20 * MINUTE) });

    const [first, second] = await Promise.all([recoverStaleCandidateDocumentJobs(), recoverStaleCandidateDocumentJobs()]);

    expect(first.recovered + second.recovered).toBe(1);
    expect(jobs()).toMatchObject([{ status: "retry", attempts: 1, startedAt: null, lastError: "worker_interrupted" }]);
  });

  it("une analyse que la fin de la fonction ne laisse pas commencer rend la tâche à la file sans compter de tentative", async () => {
    const document = seedDiploma({}, { status: "retry", attempts: 1 });
    const second = seedDiploma({ originalName: "licence.pdf" });
    vi.mocked(analyzeCandidateDocument).mockRejectedValueOnce(new ProcessingDeadlineError("llm"));

    const result = await runWithProcessingDeadline(Date.now() + 5_000, () => processDueCandidateDocumentAnalysisJobs(2));

    expect(result).toMatchObject({ processed: 1, completed: 0, retried: 0, needsReview: 0, released: 1 });
    expect(jobs()[0]).toMatchObject({ status: "retry", attempts: 1, startedAt: null });
    expect(document).toMatchObject({ status: "uploaded", analysisStatus: "queued", analysisAttempts: 1 });
    // No other analysis starts in this run.
    expect(jobs()[1]).toMatchObject({ status: "queued", attempts: 0 });
    expect(second).toMatchObject({ analysisStatus: "queued" });
  });

  it("chaque analyse du passage quotidien reçoit au plus le temps qui reste avant la fin de la fonction (50 s)", async () => {
    const { stepTimeoutMs } = await import("./processingDeadline");
    let granted = Number.POSITIVE_INFINITY;
    vi.mocked(analyzeCandidateDocument).mockImplementationOnce(async () => {
      granted = stepTimeoutMs("llm", 120_000, { minimumMs: 1 });
      throw new Error("candidate_document_ai_unavailable_test");
    });
    seedDiploma();

    await worker();

    expect(granted).toBeLessThanOrEqual(50_000);
    expect(granted).toBeGreaterThan(40_000);
  });
});

describe("DATA-06 — « Relancer l’analyse » d’un document resté sans tâche", () => {
  it("relance un document « en attente » qu’aucune tâche n’analysera, et refuse tant qu’une tâche est active", async () => {
    // Its job was refused after the document was stored.
    const stuck = seedDiploma({}, null);
    const queued = seedDiploma({ originalName: "licence.pdf" });

    const listed = await admin().list({});
    const card = (id: unknown) => listed.find(document => document.id === id)!;
    expect(card(stuck.id)).toMatchObject({ analysisStatus: "queued", hasActiveAnalysisJob: false });
    expect(card(queued.id)).toMatchObject({ analysisStatus: "queued", hasActiveAnalysisJob: true });
    // The dashboard's button follows the same rule.
    expect(canRequestCandidateDocumentReanalysis(card(stuck.id))).toBe(true);
    expect(canRequestCandidateDocumentReanalysis(card(queued.id))).toBe(false);

    await expect(admin().reanalyze({ id: Number(stuck.id) })).resolves.toEqual({ success: true, queued: true });
    expect(jobs().filter(job => job.documentId === stuck.id)).toMatchObject([{ status: "queued", attempts: 0 }]);
    await expect(admin().reanalyze({ id: Number(stuck.id) })).rejects.toMatchObject({ code: "CONFLICT", message: "Une analyse de ce document est déjà en cours." });
    await expect(admin().reanalyze({ id: Number(queued.id) })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("relance sans attendre le passage quotidien un document dont la tâche est restée « running » depuis plus de 15 min, une seule fois (EXPL-12)", async () => {
    const stuck = seedDiploma({ status: "analyzing", analysisStatus: "analyzing", analysisAttempts: 1 }, { status: "running", attempts: 1, startedAt: new Date(Date.now() - 2 * 24 * 60 * MINUTE) });
    const running = seedDiploma({ originalName: "licence.pdf", status: "analyzing", analysisStatus: "analyzing" }, { status: "running", attempts: 1, startedAt: new Date(Date.now() - 5 * MINUTE) });

    const listed = await admin().list({});
    expect(listed.find(document => document.id === stuck.id)).toMatchObject({ hasActiveAnalysisJob: false });
    expect(listed.find(document => document.id === running.id)).toMatchObject({ hasActiveAnalysisJob: true });
    await expect(admin().reanalyze({ id: Number(running.id) })).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(admin().reanalyze({ id: Number(stuck.id) })).resolves.toEqual({ success: true, queued: true });
    expect(jobs().filter(job => job.documentId === stuck.id)).toMatchObject([
      { status: "completed", lastError: "worker_interrupted_reanalysis_requested" },
      { status: "queued", attempts: 0 },
    ]);
    // The next run analyses it once: the interrupted job is not queued again.
    await expect(worker()).resolves.toMatchObject({ jobsRecovered: 0, processed: 1, completed: 1 });
    expect(state.analyses).toEqual([1]);
    expect(stuck).toMatchObject({ status: "needs_review", analysisStatus: "completed" });
  });

  it("relance un document resté « en cours » dont la tâche s’est terminée sans le mettre à jour", async () => {
    const document = seedDiploma({ status: "analyzing", analysisStatus: "analyzing" }, { status: "completed", attempts: 1, finishedAt: new Date() });

    await expect(admin().reanalyze({ id: Number(document.id) })).resolves.toEqual({ success: true, queued: true });
    expect(document).toMatchObject({ status: "validating", analysisStatus: "queued" });
  });
});
