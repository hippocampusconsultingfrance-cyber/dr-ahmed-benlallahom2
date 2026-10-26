import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCHEDULED_JOB_MONITOR_TIMEOUT_MS,
  pingScheduledJobMonitor,
  runMonitoredScheduledJob,
  scheduledJobMonitorUrl,
  scheduledJobMonitorVariable,
} from "./scheduledJobMonitor";

// EXPL-03 : chaque tâche planifiée signale son passage à un service de
// surveillance externe (healthchecks.io, Better Stack), sans jamais échouer à cause de lui.

const PING_URL = "https://hc-ping.com/0f6c2c3e-9a51-4b8e-8c0e-2f5d1c7a9b10";
const environment = { HEALTHCHECK_URL_RECRUITMENT_RETENTION: PING_URL } as NodeJS.ProcessEnv;

function recordingFetch(response: () => Promise<Response> = async () => new Response("OK")) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return response();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("URL de surveillance d’une tâche planifiée", () => {
  it("lit une variable par tâche, nommée d’après son chemin", () => {
    expect(scheduledJobMonitorVariable("/api/scheduled/reminder")).toBe("HEALTHCHECK_URL_REMINDER");
    expect(scheduledJobMonitorVariable("/api/scheduled/recruitment-processing")).toBe("HEALTHCHECK_URL_RECRUITMENT_PROCESSING");
    expect(scheduledJobMonitorVariable("/api/scheduled/candidate-document-processing")).toBe("HEALTHCHECK_URL_CANDIDATE_DOCUMENT_PROCESSING");
  });

  it("ajoute /fail pour un échec, et ignore une tâche non configurée ou une URL non https", () => {
    expect(scheduledJobMonitorUrl("/api/scheduled/recruitment-retention", "success", environment)?.toString()).toBe(PING_URL);
    expect(scheduledJobMonitorUrl("/api/scheduled/recruitment-retention", "fail", environment)?.toString()).toBe(`${PING_URL}/fail`);
    expect(scheduledJobMonitorUrl("/api/scheduled/recruitment-retention", "fail", { HEALTHCHECK_URL_RECRUITMENT_RETENTION: "https://uptime.betterstack.com/api/v1/heartbeat/abc/" } as NodeJS.ProcessEnv)?.toString())
      .toBe("https://uptime.betterstack.com/api/v1/heartbeat/abc/fail");
    expect(scheduledJobMonitorUrl("/api/scheduled/reminder", "success", environment)).toBeNull();
    expect(scheduledJobMonitorUrl("/api/scheduled/reminder", "success", { HEALTHCHECK_URL_REMINDER: "  " } as NodeJS.ProcessEnv)).toBeNull();
    expect(scheduledJobMonitorUrl("/api/scheduled/reminder", "success", { HEALTHCHECK_URL_REMINDER: "http://hc-ping.com/x" } as NodeJS.ProcessEnv)).toBeNull();
    expect(scheduledJobMonitorUrl("/api/scheduled/reminder", "success", { HEALTHCHECK_URL_REMINDER: "pas une url" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("ping de surveillance", () => {
  it("envoie un GET nu, sans corps ni paramètre, à l’URL de la tâche", async () => {
    const { calls, fetchImpl } = recordingFetch();
    await expect(pingScheduledJobMonitor("/api/scheduled/recruitment-retention", "success", { environment, fetchImpl })).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(PING_URL);
    expect(calls[0]!.init).toMatchObject({ method: "GET" });
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(calls[0]!.init?.headers).toBeUndefined();
  });

  it("n’appelle rien quand la tâche n’a pas d’URL", async () => {
    const { calls, fetchImpl } = recordingFetch();
    await expect(pingScheduledJobMonitor("/api/scheduled/reminder", "fail", { environment, fetchImpl })).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  it("abandonne le ping au bout de 3 s et ne lève jamais d’exception", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); });
    })) as unknown as typeof fetch;
    const ping = pingScheduledJobMonitor("/api/scheduled/recruitment-retention", "success", { environment, fetchImpl });
    await vi.advanceTimersByTimeAsync(SCHEDULED_JOB_MONITOR_TIMEOUT_MS - 1);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(ping).resolves.toBe(false);
    expect(aborted).toBe(true);
    expect(SCHEDULED_JOB_MONITOR_TIMEOUT_MS).toBe(3_000);
  });

  it("ignore une panne ou un refus du service, sans écrire l’URL secrète dans le journal", async () => {
    const refused = recordingFetch(async () => new Response("rate limited", { status: 429 }));
    await expect(pingScheduledJobMonitor("/api/scheduled/recruitment-retention", "success", { environment, fetchImpl: refused.fetchImpl })).resolves.toBe(false);
    const down = recordingFetch(async () => { throw new TypeError("fetch failed"); });
    await expect(pingScheduledJobMonitor("/api/scheduled/recruitment-retention", "fail", { environment, fetchImpl: down.fetchImpl })).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("0f6c2c3e");
    expect(JSON.stringify(warn.mock.calls)).toContain("HEALTHCHECK_URL_RECRUITMENT_RETENTION");
  });
});

describe("tâche surveillée", () => {
  it("signale le succès après la tâche et rend son résultat", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const order: string[] = [];
    const result = await runMonitoredScheduledJob("/api/scheduled/recruitment-retention", async () => { order.push("job"); return { erased: 2 }; }, { environment, fetchImpl: ((...args: Parameters<typeof fetch>) => { order.push("ping"); return fetchImpl(...args); }) as typeof fetch });
    expect(result).toEqual({ erased: 2 });
    expect(order).toEqual(["job", "ping"]);
    expect(calls.map(call => call.url)).toEqual([PING_URL]);
  });

  it("signale /fail et relance l’erreur de la tâche, même si le service ne répond pas", async () => {
    const { calls, fetchImpl } = recordingFetch(async () => { throw new TypeError("fetch failed"); });
    const failure = new Error("database unavailable");
    await expect(runMonitoredScheduledJob("/api/scheduled/recruitment-retention", async () => { throw failure; }, { environment, fetchImpl })).rejects.toBe(failure);
    expect(calls.map(call => call.url)).toEqual([`${PING_URL}/fail`]);
  });

  it("une tâche qui répond par un statut d’erreur compte comme un échec", async () => {
    const { calls, fetchImpl } = recordingFetch();
    await runMonitoredScheduledJob("/api/scheduled/recruitment-retention", async () => ({ httpStatus: 503, error: "security_database_unavailable" }), { environment, fetchImpl });
    await runMonitoredScheduledJob("/api/scheduled/recruitment-retention", async () => ({ httpStatus: 202 }), { environment, fetchImpl });
    expect(calls.map(call => call.url)).toEqual([`${PING_URL}/fail`, PING_URL]);
  });
});
