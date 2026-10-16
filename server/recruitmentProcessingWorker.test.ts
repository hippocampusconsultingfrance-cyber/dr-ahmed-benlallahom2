import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  now: 0,
  calls: [] as string[],
  queues: { emails: 0, drive: 0, analyses: 0, driveAwaitingValidation: 0 },
  analysisDurationMs: 10_000,
  driveWaitingForAuthorization: false,
  waiting: 0,
  notifications: [] as Array<{ title: string; content: string }>,
  alertSlots: new Map<string, number>(),
}));

function take(queue: "emails" | "drive" | "analyses" | "driveAwaitingValidation", max: number) {
  const processed = Math.min(state.queues[queue], max);
  state.queues[queue] -= processed;
  return processed;
}

vi.mock("./recruitmentProcessing", () => ({
  recoverStaleCvAnalysisJobs: vi.fn(async () => { state.calls.push("recoverAnalysis"); return { recovered: 0, exhausted: 0 }; }),
  backfillLegacyCvAnalysisJobs: vi.fn(async () => { state.calls.push("backfillAnalysis"); return { inspected: 0, queued: 0, accelerated: 0 }; }),
  processDueCvAnalysisJobs: vi.fn(async (limit: number) => {
    state.calls.push("analysis");
    const processed = take("analyses", limit);
    // The analysis validates a quarantined CV, which makes its Drive copy possible.
    const validated = take("driveAwaitingValidation", processed);
    state.queues.drive += validated;
    state.now += processed * state.analysisDurationMs;
    return { processed, results: [] };
  }),
}));
vi.mock("./googleDriveExport", () => ({
  recoverStaleCvGoogleDriveExportJobs: vi.fn(async () => { state.calls.push("recoverDrive"); return { recovered: 0, exhausted: 0 }; }),
  backfillCvGoogleDriveExportJobs: vi.fn(async () => { state.calls.push("backfillDrive"); return { inspected: 0, queued: 0, accelerated: 0 }; }),
  processDueCvGoogleDriveExports: vi.fn(async (limit: number, _ids?: number[], options?: { skipQuarantinedCvs?: boolean }) => {
    state.calls.push(options?.skipQuarantinedCvs ? "drive" : "drive-unfiltered");
    if (state.driveWaitingForAuthorization) return { processed: 0, waitingForAuthorization: true, results: [] };
    const processed = take("drive", limit);
    state.now += processed * 1_000;
    return { processed, waitingForAuthorization: false, results: [] };
  }),
}));
vi.mock("./recruitmentEmailTrace", () => ({
  retryDueFailedCvConfirmationEmails: vi.fn(async (limit: number) => {
    state.calls.push("emails");
    const processed = take("emails", limit);
    state.now += processed * 500;
    return { processed, failed: 0, exhausted: 0 };
  }),
}));
vi.mock("./recruitmentErasure", () => ({
  retryPendingGoogleDriveErasures: vi.fn(async () => { state.calls.push("driveErasures"); return { processed: 0, completed: 0, pending: 0 }; }),
}));
vi.mock("./db", () => ({
  getDb: async () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async (cap: number) => Array.from({ length: Math.min(state.waiting, cap) }, (_, id) => ({ id })) }) }) }),
  }),
}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async (payload: { title: string; content: string }) => { state.notifications.push(payload); return true; }) }));
vi.mock("./candidateSecurity", () => ({
  enforcePersistentRateLimit: vi.fn(async (policy: { action: string; subject: string; maxAttempts: number }) => {
    const key = `${policy.action}:${policy.subject}`;
    const count = (state.alertSlots.get(key) ?? 0) + 1;
    state.alertSlots.set(key, count);
    if (count > policy.maxAttempts) throw new Error("candidate_security_rate_limited");
  }),
}));

import { RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD, notifyOwnerOfAnalysisBacklog, runRecruitmentProcessingWorker } from "./recruitmentProcessingWorker";

const clock = () => state.now;

describe("cron recruitment-processing : vidage par lots dans un budget de temps", () => {
  beforeEach(() => {
    state.now = 0;
    state.calls = [];
    state.queues = { emails: 0, drive: 0, analyses: 0, driveAwaitingValidation: 0 };
    state.analysisDurationMs = 10_000;
    state.driveWaitingForAuthorization = false;
    state.waiting = 0;
    state.notifications = [];
    state.alertSlots.clear();
  });

  it("traite d’abord les relances d’email et les copies Drive, puis les analyses, en vidant plusieurs lots", async () => {
    state.queues = { emails: 7, drive: 8, analyses: 2, driveAwaitingValidation: 2 };
    const summary = await runRecruitmentProcessingWorker({}, clock);
    expect(summary.confirmationEmails.processed).toBe(7);
    // 8 copies of validated CVs first, then the 2 CVs validated by this run's analyses.
    expect(summary.driveExports).toMatchObject({ processed: 10, afterAnalyses: 2 });
    expect(summary.analysis.processed).toBe(2);
    const firstAnalysis = state.calls.indexOf("analysis");
    expect(state.calls.lastIndexOf("emails")).toBeLessThan(firstAnalysis);
    expect(state.calls.indexOf("drive")).toBeLessThan(firstAnalysis);
    expect(state.calls.slice(0, firstAnalysis).filter(call => call === "drive").length).toBeGreaterThanOrEqual(3);
    expect(state.calls).not.toContain("drive-unfiltered");
    expect(state.calls.indexOf("recoverAnalysis")).toBeLessThan(state.calls.indexOf("emails"));
    expect(state.calls.indexOf("driveErasures")).toBeLessThan(state.calls.indexOf("emails"));
  });

  it("ne démarre plus d’analyse après 25 s (la dernière se termine dans la limite de 60 s)", async () => {
    state.queues = { emails: 0, drive: 0, analyses: 20, driveAwaitingValidation: 0 };
    state.analysisDurationMs = 10_000;
    const summary = await runRecruitmentProcessingWorker({}, clock);
    // Started at 0 s, 10 s and 20 s; at 30 s no new analysis is started.
    expect(summary.analysis.processed).toBe(3);
    expect(state.queues.analyses).toBe(17);
    expect(summary.elapsedMs).toBeLessThan(60_000);
  });

  it("une file d’emails et de copies Drive longue ne dépasse pas le budget de 35 s", async () => {
    state.queues = { emails: 6, drive: 200, analyses: 5, driveAwaitingValidation: 0 };
    const summary = await runRecruitmentProcessingWorker({}, clock);
    // Drive batches of 3 copies (3 s each) stop once 35 s are spent; no analysis starts after 25 s.
    expect(summary.elapsedMs).toBeLessThanOrEqual(38_000);
    expect(summary.driveExports.processed).toBeGreaterThan(20);
    expect(summary.analysis.processed).toBe(0);
  });

  it("s’arrête proprement quand Google Drive n’est pas connecté", async () => {
    state.driveWaitingForAuthorization = true;
    state.queues = { emails: 0, drive: 5, analyses: 1, driveAwaitingValidation: 0 };
    const summary = await runRecruitmentProcessingWorker({}, clock);
    expect(summary.driveExports).toMatchObject({ processed: 0, waitingForAuthorization: true, batches: 1 });
    expect(summary.analysis.processed).toBe(1);
  });

  it("alerte le propriétaire au plus une fois par jour quand les analyses s’accumulent", async () => {
    state.waiting = RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD + 10;
    const summary = await runRecruitmentProcessingWorker({}, clock);
    expect(summary.backlogAlertSent).toBe(true);
    expect(state.notifications[0]!.title).toBe(`Recrutement : ${RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD + 10} analyse(s) de CV en attente`);
    expect(state.notifications[0]!.content).toContain("Les candidatures continuent d’être acceptées");
    await expect(notifyOwnerOfAnalysisBacklog(500)).resolves.toBe(false);
    await expect(notifyOwnerOfAnalysisBacklog(3)).resolves.toBe(false);
    expect(state.notifications).toHaveLength(1);
  });

  it("présente un décompte plafonné (vérification au dépôt) comme un minimum", async () => {
    await expect(notifyOwnerOfAnalysisBacklog(RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD, { atLeast: true })).resolves.toBe(true);
    expect(state.notifications[0]!.title).toBe(`Recrutement : au moins ${RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD} analyse(s) de CV en attente`);
    expect(state.notifications[0]!.content).toContain(`Au moins ${RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD} analyse(s) de CV attendent`);
  });
});

describe("formulaire de candidature : jamais refusé pour une file d’analyse longue", () => {
  it("n’a plus de refus 503 « volume élevé » et alerte le propriétaire à la place", () => {
    const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    expect(source).not.toContain("reçoit actuellement un volume élevé");
    expect(source).not.toContain("public_recruitment_apply_queue_backpressure");
    expect(source).toContain("notifyOwnerOfAnalysisBacklog(waitingAnalyses, { atLeast: true })");
    const cron = source.slice(source.indexOf('app.get("/api/scheduled/recruitment-processing"'), source.indexOf('app.post("/api/scheduled/recruitment-processing"'));
    expect(cron).toContain("runRecruitmentProcessingWorker()");
  });
});
