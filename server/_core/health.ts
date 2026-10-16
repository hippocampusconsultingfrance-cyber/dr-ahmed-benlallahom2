import type { Express } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { getEnvironmentConfigurationStatus, type ProductionRequiredEnvironmentVariable } from "./env";

/**
 * GET /api/health : sonde de disponibilité pour un service de supervision externe
 * (UptimeRobot, Better Stack, Vercel Checks…). Public, sans authentification, et
 * sans aucun secret : il ne renvoie que l'état de la base (SELECT 1) et les NOMS des
 * variables critiques manquantes. Répond 200 si tout va bien, 503 sinon, pour qu'une
 * sonde déclenche une alerte sans analyser le corps.
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
  app.get(HEALTH_ROUTE, async (_req, res) => {
    const report = await buildHealthReport(dependencies);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(report.status === "ok" ? 200 : 503).json(report);
  });
}
