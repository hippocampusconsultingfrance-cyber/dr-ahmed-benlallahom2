import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "./testSupport/candidateUploadApp";

// EXPL-03 : les vraies routes /api/scheduled/* signalent chaque passage au
// service de surveillance de la tâche, et seulement après authentification.

const CRON_SECRET = "synthetic-cron-secret-for-monitoring-tests";
const REMINDER_PING = "https://hc-ping.com/11111111-2222-4333-8444-555555555555";
const PROCESSING_PING = "https://hc-ping.com/66666666-7777-4888-9999-000000000000";
const POSTURE_PING = "https://uptime.betterstack.com/api/v1/heartbeat/posture-token";

const mocks = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return {
    sendDueAppointmentReminders: vi.fn(),
    runSecurityPostureReview: vi.fn(),
    runRecruitmentProcessingWorker: vi.fn(),
    authenticateRequest: vi.fn(),
  };
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
  sendDueAppointmentReminders: mocks.sendDueAppointmentReminders,
  runSecurityPostureReview: mocks.runSecurityPostureReview,
}));
vi.mock("./recruitmentProcessingWorker", () => ({ runRecruitmentProcessingWorker: mocks.runRecruitmentProcessingWorker }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));

const { createApp } = await import("./_core/index");

const realFetch = globalThis.fetch;
const pings: Array<{ url: string; method: string | undefined; body: unknown }> = [];
let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.HEALTHCHECK_URL_REMINDER = REMINDER_PING;
  process.env.HEALTHCHECK_URL_RECRUITMENT_PROCESSING = PROCESSING_PING;
  process.env.HEALTHCHECK_URL_SECURITY_POSTURE = POSTURE_PING;
  // Calls to the monitoring services are recorded; the test's own requests reach the app.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://")) {
      pings.push({ url, method: init?.method, body: init?.body });
      return new Response("OK");
    }
    return realFetch(input, init);
  });
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => {
  for (const name of ["CRON_SECRET", "HEALTHCHECK_URL_REMINDER", "HEALTHCHECK_URL_RECRUITMENT_PROCESSING", "HEALTHCHECK_URL_SECURITY_POSTURE"]) delete process.env[name];
  vi.restoreAllMocks();
  await close();
});

beforeEach(() => {
  mocks.sendDueAppointmentReminders.mockReset();
  mocks.runSecurityPostureReview.mockReset();
  mocks.runRecruitmentProcessingWorker.mockReset();
  mocks.authenticateRequest.mockReset();
  pings.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

async function call(path: string, init: { method?: "GET" | "POST"; authorization?: string } = {}) {
  const response = await realFetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: init.authorization ? { authorization: init.authorization } : {},
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const cron = { authorization: `Bearer ${CRON_SECRET}` };

describe("surveillance externe des tâches planifiées (EXPL-03)", () => {
  it("un rappel réussi signale son passage, avant de répondre, par un GET sans donnée", async () => {
    mocks.sendDueAppointmentReminders.mockResolvedValueOnce({ reminded: 3 });
    // A slow monitor: the ping is recorded when it completes, so a response sent
    // before it (and lost when the serverless function is frozen) would fail here.
    vi.mocked(globalThis.fetch).mockImplementationOnce(async (input, init) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      pings.push({ url: String(input), method: init?.method, body: init?.body });
      return new Response("OK");
    });
    const result = await call("/api/scheduled/reminder", cron);
    expect(result).toMatchObject({ status: 200, body: { ok: true, reminded: 3 } });
    expect(pings).toEqual([{ url: REMINDER_PING, method: "GET", body: undefined }]);
  });

  it("un rappel en échec signale /fail et garde sa réponse générique", async () => {
    mocks.sendDueAppointmentReminders.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const result = await call("/api/scheduled/reminder", cron);
    expect(result).toMatchObject({ status: 500, body: { error: "scheduled_job_failed" } });
    expect(pings.map(ping => ping.url)).toEqual([`${REMINDER_PING}/fail`]);
  });

  it("un appel non authentifié n’envoie aucun signal, ni succès ni échec", async () => {
    expect((await call("/api/scheduled/reminder", { authorization: "Bearer wrong-secret" })).status).toBe(403);
    mocks.authenticateRequest.mockRejectedValueOnce(new Error("Invalid session cookie"));
    expect((await call("/api/scheduled/reminder", { method: "POST" })).status).toBe(500);
    mocks.authenticateRequest.mockResolvedValueOnce({ isCron: false, taskUid: null });
    expect((await call("/api/scheduled/reminder", { method: "POST" })).status).toBe(403);
    expect(mocks.sendDueAppointmentReminders).not.toHaveBeenCalled();
    expect(pings).toEqual([]);
  });

  it("le Heartbeat authentifié signale aussi son passage", async () => {
    mocks.authenticateRequest.mockResolvedValueOnce({ isCron: true, taskUid: "task-synthetic" });
    mocks.sendDueAppointmentReminders.mockResolvedValueOnce({ reminded: 0 });
    expect((await call("/api/scheduled/reminder", { method: "POST" })).status).toBe(200);
    expect(pings.map(ping => ping.url)).toEqual([REMINDER_PING]);
  });

  it("une revue de sécurité sans base de données (503) signale un échec", async () => {
    mocks.runSecurityPostureReview.mockResolvedValueOnce({ available: false, highSeverityEvents24h: 0 });
    expect(await call("/api/scheduled/security-posture", cron)).toMatchObject({ status: 503, body: { error: "security_database_unavailable" } });
    expect(pings.map(ping => ping.url)).toEqual([`${POSTURE_PING}/fail`]);
  });

  it("le traitement des candidatures signale son succès ou son échec", async () => {
    mocks.runRecruitmentProcessingWorker.mockResolvedValueOnce({ elapsedMs: 10, confirmationEmails: { processed: 0 }, driveExports: { processed: 0 }, analysis: { processed: 1 } });
    expect((await call("/api/scheduled/recruitment-processing", cron)).status).toBe(200);
    mocks.runRecruitmentProcessingWorker.mockRejectedValueOnce(new Error("Database connection failed"));
    expect((await call("/api/scheduled/recruitment-processing", cron)).status).toBe(500);
    expect(pings.map(ping => ping.url)).toEqual([PROCESSING_PING, `${PROCESSING_PING}/fail`]);
  });

  it("le traitement des candidatures, dont les analyses peuvent durer 55 s, n’attend son service de surveillance que 1,5 s", async () => {
    mocks.runRecruitmentProcessingWorker.mockResolvedValueOnce({ elapsedMs: 54_000, confirmationEmails: { processed: 0 }, driveExports: { processed: 0 }, analysis: { processed: 1 } });
    // A monitor that never answers: the ping is abandoned when its timeout aborts it.
    let abortedAfterMs = -1;
    vi.mocked(globalThis.fetch).mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
      const startedAt = Date.now();
      init?.signal?.addEventListener("abort", () => {
        abortedAfterMs = Date.now() - startedAt;
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await call("/api/scheduled/recruitment-processing", cron)).status).toBe(200);
    expect(abortedAfterMs).toBeGreaterThanOrEqual(1_400);
    expect(abortedAfterMs).toBeLessThan(2_500);
    expect(warn).toHaveBeenCalledWith("[ScheduledJobMonitor] HEALTHCHECK_URL_RECRUITMENT_PROCESSING ping failed:", "AbortError");
  });

  it("une tâche sans URL configurée ne contacte aucun service", async () => {
    await call("/api/scheduled/appointment-hold-cleanup", cron);
    expect(pings).toEqual([]);
  });

  it("un service de surveillance en panne ne change pas la réponse de la tâche", async () => {
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () => { throw new TypeError("fetch failed"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.sendDueAppointmentReminders.mockResolvedValueOnce({ reminded: 1 });
    expect(await call("/api/scheduled/reminder", cron)).toMatchObject({ status: 200, body: { ok: true, reminded: 1 } });
    expect(warn).toHaveBeenCalledWith("[ScheduledJobMonitor] HEALTHCHECK_URL_REMINDER ping failed:", "TypeError");
  });
});
