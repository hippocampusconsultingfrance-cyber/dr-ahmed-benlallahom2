import type { Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { isAuthorizedVercelCronRequest } from "./cronAuth";
import { getEnvironmentConfigurationStatus, type ProductionRequiredEnvironmentVariable } from "./env";

/**
 * GET /api/health : sonde de disponibilité pour un service de supervision externe
 * (UptimeRobot, Better Stack, Vercel Checks…). Publique et sans aucun secret : elle
 * ne renvoie que l'état de la base (SELECT 1) et l'état « ok / incomplet » de la
 * configuration. Les NOMS des variables critiques manquantes diraient à n'importe
 * quel visiteur quelle protection est hors service : ils ne sont donnés qu'avec
 * `Authorization: Bearer <CRON_SECRET>`, dans le bandeau de /admin et dans les
 * journaux. Répond 200 si tout va bien, 503 sinon, pour qu'une sonde déclenche une
 * alerte sans analyser le corps. Montée avant clerkMiddleware : elle répond même
 * quand la configuration Clerk fait échouer toutes les autres routes /api.
 */
export const HEALTH_ROUTE = "/api/health";

type DatabaseCheckStatus = "ok" | "error" | "unconfigured";

export type HealthReport = {
  status: "ok" | "error";
  timestamp: string;
  checks: {
    database: { status: DatabaseCheckStatus; latencyMs: number | null };
    configuration: { status: "ok" | "missing"; missing: ProductionRequiredEnvironmentVariable[] };
  };
};

/** What an anonymous visitor sees: the statuses, never the names of missing variables. */
export type PublicHealthReport = Omit<HealthReport, "checks"> & {
  checks: { database: HealthReport["checks"]["database"]; configuration: { status: HealthReport["checks"]["configuration"]["status"] } };
};

export function publicHealthReport(report: HealthReport): PublicHealthReport {
  return { ...report, checks: { database: report.checks.database, configuration: { status: report.checks.configuration.status } } };
}

type QueryableDatabase = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

export type HealthDependencies = {
  getDatabase?: () => Promise<QueryableDatabase | null>;
  environment?: NodeJS.ProcessEnv;
  now?: () => number;
  timeoutMs?: number;
};

const DATABASE_TIMEOUT_MS = 4_000;
/** Évite qu'une rafale d'appels publics ne se traduise par autant de requêtes SQL. */
const DATABASE_RESULT_TTL_MS = 10_000;
let cachedDatabaseCheck: { at: number; value: HealthReport["checks"]["database"] } | null = null;

export function resetHealthCacheForTests() {
  cachedDatabaseCheck = null;
}

async function checkDatabase({ getDatabase = getDb as () => Promise<QueryableDatabase | null>, now = Date.now, timeoutMs = DATABASE_TIMEOUT_MS }: HealthDependencies) {
  const startedAt = now();
  if (cachedDatabaseCheck && startedAt - cachedDatabaseCheck.at < DATABASE_RESULT_TTL_MS) return cachedDatabaseCheck.value;

  let value: HealthReport["checks"]["database"];
  try {
    const db = await getDatabase();
    if (!db) {
      value = { status: "unconfigured", latencyMs: null };
    } else {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("database health check timed out")), timeoutMs);
      });
      try {
        await Promise.race([db.execute(sql`select 1`), timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      value = { status: "ok", latencyMs: Math.max(0, now() - startedAt) };
    }
  } catch (error) {
    // Jamais de détail d'erreur dans la réponse publique (chaîne de connexion, hôte…).
    console.error("[Health] Database check failed:", error instanceof Error ? error.name : "unknown error");
    value = { status: "error", latencyMs: null };
  }
  cachedDatabaseCheck = { at: startedAt, value };
  return value;
}

export async function buildHealthReport(dependencies: HealthDependencies = {}): Promise<HealthReport> {
  const environment = dependencies.environment ?? process.env;
  const configuration = getEnvironmentConfigurationStatus(environment);
  const database = await checkDatabase(dependencies);
  const healthy = database.status === "ok" && configuration.ok;
  return {
    status: healthy ? "ok" : "error",
    timestamp: new Date((dependencies.now ?? Date.now)()).toISOString(),
    checks: {
      database,
      configuration: { status: configuration.ok ? "ok" : "missing", missing: configuration.missing },
    },
  };
}

export function registerHealthRoute(app: Express, dependencies: HealthDependencies = {}) {
  app.get(HEALTH_ROUTE, async (req, res) => {
    const report = await buildHealthReport(dependencies);
    const detailed = isAuthorizedVercelCronRequest(req.headers.authorization, (dependencies.environment ?? process.env).CRON_SECRET);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(report.status === "ok" ? 200 : 503).json(detailed ? report : publicHealthReport(report));
  });
}
