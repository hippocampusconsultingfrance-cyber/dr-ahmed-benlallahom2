import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "./testSupport/candidateUploadApp";

// Chaque tâche de vercel.json est une route GET de createApp, refusée sans le
// secret CRON_SECRET (comparé en temps constant), qui lance la bonne tâche.

const CRON_SECRET = "synthetic-cron-secret-for-scheduled-routes";

const jobs = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return {
    sendDueAppointmentReminders: vi.fn(async (_window: unknown) => ({ reminded: 0 })),
    runRecruitmentRetentionCleanup: vi.fn(async (_trigger: string) => ({ erased: 0 })),
    runRecruitmentProcessingWorker: vi.fn(async () => ({
      elapsedMs: 1,
      analysisRecovery: { recovered: 0 },
      driveRecovery: { recovered: 0 },
      driveErasures: { processed: 0 },
      confirmationEmails: { processed: 0 },
      driveExports: { processed: 0 },
      analysis: { processed: 0 },
      analysesWaiting: 0,
    })),
    runAppointmentFulfillmentWorker: vi.fn(async (_options: unknown) => ({ processed: 0 })),
    releaseExpiredAppointmentHolds: vi.fn(async (_stripe: unknown) => ({ released: 0 })),
    runCandidateDocumentProcessingWorker: vi.fn(async (_options: unknown) => ({ processed: 0 })),
    runSecurityPostureReview: vi.fn(async () => ({ available: true, highSeverityEvents24h: 0 })),
    runPersonalDataRetention: vi.fn(async () => ({ erased: 0 })),
  };
});
const crypto = vi.hoisted(() => ({ timingSafeEqual: null as null | ReturnType<typeof vi.fn> }));

vi.mock("node:crypto", async importOriginal => {
  const original = await importOriginal<typeof import("node:crypto")>();
  crypto.timingSafeEqual = vi.fn(original.timingSafeEqual);
  return { ...original, default: original, timingSafeEqual: crypto.timingSafeEqual };
});
vi.mock("./db", () => ({ getDb: async () => null }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./scheduledJobs", async importOriginal => ({
  ...await importOriginal<typeof import("./scheduledJobs")>(),
  sendDueAppointmentReminders: jobs.sendDueAppointmentReminders,
  runAppointmentFulfillmentWorker: jobs.runAppointmentFulfillmentWorker,
  runCandidateDocumentProcessingWorker: jobs.runCandidateDocumentProcessingWorker,
  runSecurityPostureReview: jobs.runSecurityPostureReview,
}));
vi.mock("./recruitmentRetention", () => ({ runRecruitmentRetentionCleanup: jobs.runRecruitmentRetentionCleanup }));
vi.mock("./recruitmentProcessingWorker", () => ({ runRecruitmentProcessingWorker: jobs.runRecruitmentProcessingWorker }));
vi.mock("./appointmentHolds", async importOriginal => ({ ...await importOriginal<typeof import("./appointmentHolds")>(), releaseExpiredAppointmentHolds: jobs.releaseExpiredAppointmentHolds }));
vi.mock("./personalDataRetention", () => ({ runPersonalDataRetention: jobs.runPersonalDataRetention }));

const { createApp } = await import("./_core/index");
const { DAILY_REMINDER_WINDOW } = await import("./scheduledJobs");

const crons = (JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons: Array<{ path: string }> }).crons;

/** The job each scheduled path must start (the security review also runs the retention periods). */
const jobOf: Record<string, ReturnType<typeof vi.fn>> = {
  "/api/scheduled/reminder": jobs.sendDueAppointmentReminders,
  "/api/scheduled/recruitment-retention": jobs.runRecruitmentRetentionCleanup,
  "/api/scheduled/recruitment-processing": jobs.runRecruitmentProcessingWorker,
  "/api/scheduled/appointment-fulfillment": jobs.runAppointmentFulfillmentWorker,
  "/api/scheduled/appointment-hold-cleanup": jobs.releaseExpiredAppointmentHolds,
  "/api/scheduled/candidate-document-processing": jobs.runCandidateDocumentProcessingWorker,
  "/api/scheduled/security-posture": jobs.runPersonalDataRetention,
};

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
});

async function call(path: string, authorization?: string) {
  const response = await fetch(`${baseUrl}${path}`, { headers: authorization ? { authorization } : {} });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("tâches planifiées exécutées par Vercel Cron", () => {
  it("expose chaque tâche de vercel.json en GET, refusée sans le secret exact", async () => {
    expect(crons.map(cron => cron.path).sort()).toEqual(Object.keys(jobOf).sort());
    for (const { path } of crons) {
      for (const authorization of [undefined, "Bearer wrong-secret", CRON_SECRET, `bearer ${CRON_SECRET}`]) {
        expect(await call(path, authorization), `${path} ${authorization}`).toEqual({ status: 403, body: { error: "cron-only" } });
      }
      expect(jobOf[path], path).not.toHaveBeenCalled();

      const allowed = await call(path, `Bearer ${CRON_SECRET}`);
      expect(allowed.status, path).toBe(200);
      expect(allowed.body, path).toMatchObject({ ok: true, scheduler: "vercel-cron" });
      expect(jobOf[path], path).toHaveBeenCalledTimes(1);
    }
  });

  it("refuse tout appel quand CRON_SECRET n’est pas configuré, et le signale au journal", async () => {
    vi.stubEnv("CRON_SECRET", " ");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await call("/api/scheduled/reminder", "Bearer ")).toEqual({ status: 403, body: { error: "cron-only" } });
      expect(await call("/api/scheduled/recruitment-processing", "Bearer  ")).toEqual({ status: 403, body: { error: "cron-only" } });
      expect(consoleError).toHaveBeenCalledWith("[Cron] CRON_SECRET is not configured; scheduled job refused");
    } finally {
      consoleError.mockRestore();
    }
    expect(jobs.sendDueAppointmentReminders).not.toHaveBeenCalled();
    expect(jobs.runRecruitmentProcessingWorker).not.toHaveBeenCalled();
  });

  it("compare le secret en temps constant", async () => {
    crypto.timingSafeEqual!.mockClear();
    expect((await call("/api/scheduled/reminder", "Bearer wrong-secret-of-another-length")).status).toBe(403);
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
  });

  it("envoie les rappels sur la fenêtre quotidienne, pour qu’aucun rendez-vous ne tombe entre deux passages", async () => {
    await call("/api/scheduled/reminder", `Bearer ${CRON_SECRET}`);
    expect(jobs.sendDueAppointmentReminders).toHaveBeenCalledWith(DAILY_REMINDER_WINDOW);
  });

  it("vide toutes les files du recrutement par le worker borné dans le temps", async () => {
    const response = await call("/api/scheduled/recruitment-processing", `Bearer ${CRON_SECRET}`);
    expect(response.body).toMatchObject({ ok: true, scheduler: "vercel-cron", analysesWaiting: 0, confirmationEmails: { processed: 0 } });
    expect(jobs.runRecruitmentProcessingWorker).toHaveBeenCalledTimes(1);
  });
});
