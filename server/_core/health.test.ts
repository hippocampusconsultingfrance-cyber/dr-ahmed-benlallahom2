import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES,
  assertCriticalProductionEnvironment,
  getEnvironmentConfigurationStatus,
  getMissingCriticalProductionEnvironment,
  reportCriticalProductionEnvironment,
} from "./env";
import { HEALTH_ROUTE, buildHealthReport, registerHealthRoute, resetHealthCacheForTests } from "./health";

const completeEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  ...Object.fromEntries(PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES.map(name => [name, `secret-value-of-${name}`])),
});

const healthyDb = () => Promise.resolve({ execute: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }) });

afterEach(() => resetHealthCacheForTests());

describe("variables critiques de production (M27 / OPS-01)", () => {
  it("couvre CRON_SECRET, CLERK_OWNER_USER_ID et RESEND_WEBHOOK_SECRET", () => {
    for (const name of ["CRON_SECRET", "CLERK_OWNER_USER_ID", "RESEND_WEBHOOK_SECRET"]) {
      expect(PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES).toContain(name);
      expect(getMissingCriticalProductionEnvironment({ ...completeEnvironment(), [name]: " " })).toEqual([name]);
    }
  });

  it("accepte l'ancien OWNER_OPEN_ID à la place de CLERK_OWNER_USER_ID", () => {
    const environment = { ...completeEnvironment(), CLERK_OWNER_USER_ID: "", OWNER_OPEN_ID: "user_owner" };
    expect(getMissingCriticalProductionEnvironment(environment)).toEqual([]);
  });

  it("ne contrôle qu'en production", () => {
    expect(getEnvironmentConfigurationStatus({ NODE_ENV: "development" })).toEqual({ ok: true, missing: [], enforced: false });
    expect(getEnvironmentConfigurationStatus({ NODE_ENV: "production" }).missing).toHaveLength(PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES.length);
  });

  it("sur Vercel : journalise bruyamment les NOMS manquants sans jamais lever d'exception", () => {
    const log = vi.fn();
    const environment = { ...completeEnvironment(), CRON_SECRET: "", RESEND_WEBHOOK_SECRET: "" };

    expect(() => reportCriticalProductionEnvironment(environment, log)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    const message = String(log.mock.calls[0][0]);
    expect(message).toMatch(/^\[Config\] CRITICAL: 2 production environment variable\(s\) missing: CRON_SECRET, RESEND_WEBHOOK_SECRET/);
    expect(message).not.toContain("secret-value-of");

    const silent = vi.fn();
    expect(reportCriticalProductionEnvironment(completeEnvironment(), silent).ok).toBe(true);
    expect(silent).not.toHaveBeenCalled();
    // Le serveur Express hors Vercel garde son refus de démarrer.
    expect(() => assertCriticalProductionEnvironment(environment)).toThrow(/CRON_SECRET, RESEND_WEBHOOK_SECRET/);
  });

  it("le point d'entrée Vercel exécute le contrôle non bloquant au démarrage à froid", () => {
    const entry = readFileSync(path.join(process.cwd(), "server/vercelEntry.ts"), "utf8");
    expect(entry).toContain("reportCriticalProductionEnvironment();");
    expect(entry).not.toMatch(/assertCriticalProductionEnvironment\(\)/);
  });
});

describe("GET /api/health (sonde de disponibilité, M29 / OPS-05)", () => {
  it("répond ok quand la base répond à SELECT 1 et que la configuration est complète", async () => {
    const db = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const report = await buildHealthReport({ getDatabase: async () => db, environment: completeEnvironment() });

    expect(report.status).toBe("ok");
    expect(report.checks.database.status).toBe("ok");
    expect(report.checks.configuration).toEqual({ status: "ok", missing: [] });
    expect(db.execute).toHaveBeenCalledTimes(1);
    const query = db.execute.mock.calls[0][0] as { queryChunks?: Array<{ value?: string[] }> };
    expect(JSON.stringify(query.queryChunks)).toContain("select 1");
  });

  it("signale une base en erreur sans divulguer le message d'erreur", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const report = await buildHealthReport({
      getDatabase: async () => ({ execute: () => Promise.reject(new Error("password authentication failed for postgres://user:pw@host/db")) }),
      environment: completeEnvironment(),
    });
    consoleError.mockRestore();

    expect(report.status).toBe("error");
    expect(report.checks.database).toEqual({ status: "error", latencyMs: null });
    expect(JSON.stringify(report)).not.toMatch(/password|postgres:\/\//);
  });

  it("borne l'attente d'une base qui ne répond pas", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const report = await buildHealthReport({
      getDatabase: async () => ({ execute: () => new Promise(() => undefined) }),
      environment: completeEnvironment(),
      timeoutMs: 20,
    });
    consoleError.mockRestore();
    expect(report.checks.database.status).toBe("error");
  });

  it("liste les noms des variables manquantes, jamais leurs valeurs", async () => {
    const environment = { ...completeEnvironment(), CRON_SECRET: "", CLERK_OWNER_USER_ID: "" };
    const report = await buildHealthReport({ getDatabase: healthyDb, environment });

    expect(report.status).toBe("error");
    expect(report.checks.configuration).toEqual({ status: "missing", missing: ["CRON_SECRET", "CLERK_OWNER_USER_ID"] });
    expect(JSON.stringify(report)).not.toContain("secret-value-of");
  });

  it("n'interroge la base qu'une fois par fenêtre de 10 s", async () => {
    const db = { execute: vi.fn().mockResolvedValue({}) };
    let now = 1_000_000;
    const dependencies = { getDatabase: async () => db, environment: completeEnvironment(), now: () => now };
    await buildHealthReport(dependencies);
    now += 5_000;
    await buildHealthReport(dependencies);
    expect(db.execute).toHaveBeenCalledTimes(1);
    now += 6_000;
    await buildHealthReport(dependencies);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("répond en HTTP 200 / 503, sans cache ni indexation", async () => {
    const run = async (environment: NodeJS.ProcessEnv) => {
      resetHealthCacheForTests();
      const app = express();
      registerHealthRoute(app, { getDatabase: healthyDb, environment });
      const server = app.listen(0);
      try {
        const { port } = server.address() as AddressInfo;
        const response = await fetch(`http://127.0.0.1:${port}${HEALTH_ROUTE}`);
        return { status: response.status, cache: response.headers.get("cache-control"), robots: response.headers.get("x-robots-tag"), body: await response.json() };
      } finally {
        server.close();
      }
    };

    const healthy = await run(completeEnvironment());
    expect(healthy).toMatchObject({ status: 200, cache: "no-store", robots: "noindex, nofollow", body: { status: "ok" } });

    const misconfigured = await run({ ...completeEnvironment(), CRON_SECRET: "" });
    expect(misconfigured.status).toBe(503);
    expect(misconfigured.body.checks.configuration.missing).toEqual(["CRON_SECRET"]);
  });

  it("est monté dans createApp (donc aussi dans la fonction Vercel)", () => {
    const index = readFileSync(path.join(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(index).toContain("registerHealthRoute(app);");
    expect(index.indexOf("registerHealthRoute(app);")).toBeLessThan(index.indexOf('app.post("/api/stripe/webhook"'));
  });
});

describe("bandeau admin de configuration", () => {
  it("expose les noms manquants via une procédure réservée à l'admin", () => {
    const systemRouter = readFileSync(path.join(process.cwd(), "server/_core/systemRouter.ts"), "utf8");
    const banner = readFileSync(path.join(process.cwd(), "client/src/components/AdminConfigurationBanner.tsx"), "utf8");
    const dashboard = readFileSync(path.join(process.cwd(), "client/src/pages/AdminDashboard.tsx"), "utf8");

    expect(systemRouter).toContain("configurationStatus: adminProcedure.query(() => getEnvironmentConfigurationStatus())");
    expect(banner).toContain("trpc.system.configurationStatus.useQuery");
    expect(banner).toContain('role="alert"');
    expect(dashboard).toContain("<AdminConfigurationBanner />");
  });
});
