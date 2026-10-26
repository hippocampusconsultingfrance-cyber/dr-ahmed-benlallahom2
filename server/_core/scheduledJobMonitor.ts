/**
 * Dead man's switch for the scheduled jobs (EXPL-03). Vercel does not retry a
 * failed cron and keeps its logs about an hour: after each run, the job pings
 * an external monitor (healthchecks.io, or Better Stack heartbeats), which
 * alerts the owner when a ping is missing beyond the period plus grace time,
 * independently of Resend and of the Vercel logs.
 *
 * One URL per job, in `HEALTHCHECK_URL_<JOB>`: the path after /api/scheduled/,
 * upper case, dashes turned into underscores (/api/scheduled/recruitment-retention
 * → HEALTHCHECK_URL_RECRUITMENT_RETENTION). A job without its variable sends
 * nothing. The ping is a bare GET with no body or query string, so no personal
 * data ever leaves; a failed run pings the same URL followed by /fail (both
 * services accept it), so the alert comes at once instead of after the grace time.
 * Bounded to 3 s by default (a job can ask for less), and its own failure is
 * ignored: monitoring never fails a job.
 */
export const SCHEDULED_JOB_MONITOR_TIMEOUT_MS = 3_000;

export type ScheduledJobOutcome = "success" | "fail";

export function scheduledJobMonitorVariable(path: string) {
  const job = path.replace(/^\/api\/scheduled\//, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `HEALTHCHECK_URL_${job.toUpperCase()}`;
}

/** The URL to ping, or null when the job is not monitored (or its variable is not an https URL). */
export function scheduledJobMonitorUrl(path: string, outcome: ScheduledJobOutcome, environment: NodeJS.ProcessEnv = process.env): URL | null {
  const configured = environment[scheduledJobMonitorVariable(path)]?.trim();
  if (!configured) return null;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (outcome === "fail") url.pathname = `${url.pathname.replace(/\/+$/, "")}/fail`;
  return url;
}

/** Pings the job's monitor; resolves to whether the monitor acknowledged it, never throws. */
export async function pingScheduledJobMonitor(
  path: string,
  outcome: ScheduledJobOutcome,
  options: { environment?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean> {
  const url = scheduledJobMonitorUrl(path, outcome, options.environment);
  if (!url) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? SCHEDULED_JOB_MONITOR_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, { method: "GET", signal: controller.signal });
    if (!response.ok) console.warn(`[ScheduledJobMonitor] ${scheduledJobMonitorVariable(path)} ping refused: HTTP ${response.status}`);
    return response.ok;
  } catch (error) {
    // The URL holds the check's secret: only the variable name is logged.
    console.warn(`[ScheduledJobMonitor] ${scheduledJobMonitorVariable(path)} ping failed:`, error instanceof Error ? error.name : "UnknownError");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** A job answering an error status (e.g. 503, database unavailable) did not do its work. */
export function scheduledJobOutcome(result: unknown): ScheduledJobOutcome {
  const httpStatus = result && typeof result === "object" ? (result as { httpStatus?: unknown }).httpStatus : undefined;
  return typeof httpStatus === "number" && httpStatus >= 400 ? "fail" : "success";
}

/**
 * Runs one scheduled job, then pings its monitor with the outcome before the
 * caller answers (a serverless function may be frozen once it has responded).
 * The job's error is rethrown unchanged.
 */
export async function runMonitoredScheduledJob<T>(path: string, run: () => Promise<T>, options: Parameters<typeof pingScheduledJobMonitor>[2] = {}): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (error) {
    await pingScheduledJobMonitor(path, "fail", options);
    throw error;
  }
  await pingScheduledJobMonitor(path, scheduledJobOutcome(result), options);
  return result;
}
