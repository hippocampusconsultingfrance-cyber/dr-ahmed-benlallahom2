import { readFileSync } from "node:fs";
import { DrizzleQueryError } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "./testSupport/candidateUploadApp";

// Une tâche planifiée qui échoue répond 500 avec un message générique et une
// référence courte ; le détail (requête SQL) reste dans le journal serveur.

const CRON_SECRET = "synthetic-cron-secret-for-scheduled-job-tests";

const mocks = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return {
    sendDueAppointmentReminders: vi.fn(),
    runRecruitmentProcessingWorker: vi.fn(),
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
}));
vi.mock("./recruitmentProcessingWorker", () => ({ runRecruitmentProcessingWorker: mocks.runRecruitmentProcessingWorker }));

const { createApp } = await import("./_core/index");

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET;
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => {
  delete process.env.CRON_SECRET;
  await close();
});

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

/** The error Drizzle throws when the lock is not obtained: SQL and parameters in its message. */
function failedReminderQuery() {
  const lockTimeout = Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
  return new DrizzleQueryError(
    'select "id", "tracking_id", "customer_name", "customer_email" from "appointments" where "appointments"."appointment_date" between $1 and $2',
    ["2026-10-27T01:00:00.000Z", "patient.synthetique@example.test"],
    lockTimeout,
  );
}

const VERCEL_ID = "cdg1::iad1::synthetic-request";

async function call(path: string, init: { authorization?: string; vercelId?: string } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { ...init.authorization ? { authorization: init.authorization } : {}, ...init.vercelId ? { "x-vercel-id": init.vercelId } : {} },
  });
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text) as Record<string, unknown> };
}

function expectGenericFailure(result: Awaited<ReturnType<typeof call>>, label: string) {
  expect(result.status).toBe(500);
  expect(result.body).toEqual({ error: "scheduled_job_failed", reference: expect.stringMatching(/^[0-9a-f]{8}$/), timestamp: expect.any(String) });
  // Nothing of the query reaches the caller.
  expect(result.text).not.toMatch(/select|appointments|tracking_id|patient\.synthetique|Failed query/);
  // The server log keeps it on one JSON line (logError), under the same
  // reference and the request's x-vercel-id, without the parameters.
  expect(consoleError).toHaveBeenCalledTimes(1);
  const [line, ...rest] = consoleError.mock.calls[0] as [string];
  expect(rest).toEqual([]);
  expect(line).not.toContain("\n");
  const logged = JSON.parse(line) as Record<string, string>;
  expect(logged).toMatchObject({ label, ref: result.body.reference, vercelId: VERCEL_ID });
  expect(line).not.toMatch(/patient\.synthetique|2026-10-27T01|params:/);
  return logged;
}

describe("tâches planifiées en échec : réponse générique, détail au journal", () => {
  it("Vercel Cron : 500 avec une référence, la requête SQL et son code au journal seulement", async () => {
    mocks.sendDueAppointmentReminders.mockRejectedValueOnce(failedReminderQuery());
    const result = await call("/api/scheduled/reminder", { authorization: `Bearer ${CRON_SECRET}`, vercelId: VERCEL_ID });
    const logged = expectGenericFailure(result, "[Reminder] Vercel cron error");
    expect(logged.message).toBe('Failed query: select "id", "tracking_id", "customer_name", "customer_email" from "appointments" where "appointments"."appointment_date" between $1 and $2');
    expect(logged.cause).toBe("Error: canceling statement due to lock timeout");
    expect(logged.code).toBe("55P03");
  });

  it("garde les réponses d’une tâche réussie et le refus d’un appel non authentifié", async () => {
    mocks.sendDueAppointmentReminders.mockResolvedValueOnce({ reminded: 0 });
    expect(await call("/api/scheduled/reminder", { authorization: `Bearer ${CRON_SECRET}` }))
      .toMatchObject({ status: 200, body: { ok: true, scheduler: "vercel-cron", reminded: 0 } });
    expect(await call("/api/scheduled/reminder", { authorization: "Bearer wrong-secret" }))
      .toMatchObject({ status: 403, body: { error: "cron-only" } });
    expect(mocks.sendDueAppointmentReminders).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("expose chaque cron de vercel.json en GET réservé à CRON_SECRET, et plus en POST, l’ancien rappel Heartbeat de Manus (CODE-05)", async () => {
    const { crons } = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons: Array<{ path: string }> };
    expect(crons.length).toBeGreaterThan(0);
    for (const { path } of crons) {
      expect(await call(path), path).toMatchObject({ status: 403, body: { error: "cron-only" } });
      const legacyHeartbeat = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { authorization: `Bearer ${CRON_SECRET}` } });
      expect(legacyHeartbeat.status, path).toBe(404);
    }
    expect(mocks.sendDueAppointmentReminders).not.toHaveBeenCalled();
    expect(mocks.runRecruitmentProcessingWorker).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("traitement des candidatures : même réponse générique", async () => {
    mocks.runRecruitmentProcessingWorker.mockRejectedValueOnce(failedReminderQuery());
    const result = await call("/api/scheduled/recruitment-processing", { authorization: `Bearer ${CRON_SECRET}`, vercelId: VERCEL_ID });
    expect(expectGenericFailure(result, "[RecruitmentProcessing] Vercel cron error").code).toBe("55P03");
  });
});
