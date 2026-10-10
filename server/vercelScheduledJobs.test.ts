import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAuthorizedVercelCronRequest } from "./_core/cronAuth";

const serverSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons: Array<{ path: string; schedule: string }> };

const MANUS_ONLY_JOBS = [
  "/api/scheduled/reminder",
  "/api/scheduled/recruitment-retention",
  "/api/scheduled/appointment-fulfillment",
  "/api/scheduled/appointment-hold-cleanup",
  "/api/scheduled/candidate-document-processing",
  "/api/scheduled/security-posture",
];

describe("tâches planifiées exécutées par Vercel Cron", () => {
  it("déclare un cron pour chaque tâche, y compris celles autrefois réservées à Manus", () => {
    const paths = config.crons.map(cron => cron.path);
    for (const path of [...MANUS_ONLY_JOBS, "/api/scheduled/recruitment-processing"]) expect(paths).toContain(path);
  });

  it("n’utilise que des planifications quotidiennes, échelonnées, compatibles avec le plan Hobby", () => {
    const slots = new Set<string>();
    for (const cron of config.crons) {
      const fields = cron.schedule.split(" ");
      expect(fields).toHaveLength(5);
      const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
      // A single fixed minute and hour: at most one run per day (Hobby deploys fail otherwise).
      expect(minute).toMatch(/^\d{1,2}$/);
      expect(hour).toMatch(/^\d{1,2}$/);
      expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
      expect(Number(minute)).not.toBe(0);
      slots.add(hour);
    }
    expect(slots.size).toBe(config.crons.length);
  });

  it("expose chaque tâche en GET protégé par CRON_SECRET et conserve le POST Heartbeat", () => {
    expect(serverSource).toContain("app.get(path, requireVercelCron, async");
    expect(serverSource).toContain("app.post(path, async (req, res) => {");
    expect(serverSource).toContain("sdkInstance.authenticateRequest(req)");
    expect(serverSource).toContain('if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });');
    for (const path of MANUS_ONLY_JOBS) expect(serverSource).toContain(`registerScheduledJob("${path}"`);
  });

  it("garde la fenêtre horaire 22–26 h pour le Heartbeat et une fenêtre quotidienne pour Vercel", () => {
    expect(serverSource).toContain('trigger.scheduler === "vercel-cron" ? DAILY_REMINDER_WINDOW : HOURLY_REMINDER_WINDOW');
  });
});

describe("authentification des appels Vercel Cron", () => {
  it("refuse tout appel quand CRON_SECRET n’est pas configuré", () => {
    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      expect(isAuthorizedVercelCronRequest("Bearer ")).toBe(false);
      expect(isAuthorizedVercelCronRequest("Bearer undefined")).toBe(false);
    } finally {
      if (previous !== undefined) process.env.CRON_SECRET = previous;
    }
    expect(isAuthorizedVercelCronRequest("Bearer ", "")).toBe(false);
    expect(isAuthorizedVercelCronRequest("Bearer ", "   ")).toBe(false);
  });

  it("n’accepte que l’en-tête Bearer exact", () => {
    const secret = "s3cret-value-for-cron";
    expect(isAuthorizedVercelCronRequest(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedVercelCronRequest(`Bearer ${secret}`, `  ${secret}  `)).toBe(true);
    expect(isAuthorizedVercelCronRequest(secret, secret)).toBe(false);
    expect(isAuthorizedVercelCronRequest(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedVercelCronRequest(`bearer ${secret}`, secret)).toBe(false);
    expect(isAuthorizedVercelCronRequest(undefined, secret)).toBe(false);
    expect(isAuthorizedVercelCronRequest([`Bearer ${secret}`], secret)).toBe(false);
  });
});
