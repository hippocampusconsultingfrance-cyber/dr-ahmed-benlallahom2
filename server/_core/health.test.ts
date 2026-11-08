import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clerkMiddleware } from "@clerk/express";
import {
  PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES,
  assertCriticalProductionEnvironment,
  clerkPublishableKey,
  getConfigurationWarnings,
  getEnvironmentConfigurationStatus,
  getMissingCriticalProductionEnvironment,
  reportCriticalProductionEnvironment,
} from "./env";
import { HEALTH_ROUTE, buildHealthReport, registerHealthRoute, resetHealthCacheForTests } from "./health";

const completeEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  ...Object.fromEntries(PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES.map(name => [name, `secret-value-of-${name}`])),
});

/** The keys a production deployment takes: live Stripe and Clerk, the site's Turnstile widget, the site's address. */
const liveKeys = (): NodeJS.ProcessEnv => ({
  STRIPE_SECRET_KEY: "sk_live_STRIPE-LIVE-VALUE",
  CLERK_SECRET_KEY: "sk_live_CLERK-LIVE-VALUE",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_CLERK-PUBLIC-LIVE-VALUE",
  TURNSTILE_SECRET_KEY: "0x4AAAAAAA-TURNSTILE-LIVE-VALUE",
  VITE_TURNSTILE_SITE_KEY: "0x4AAAAAAA-TURNSTILE-SITE-VALUE",
  PUBLIC_APP_ORIGIN: "https://drahmedbenlallahom.com",
});

/** The keys of a preproduction: test Stripe and Clerk, Cloudflare's always-pass Turnstile keys, the preview's own address. */
const testKeys = (): NodeJS.ProcessEnv => ({
  STRIPE_SECRET_KEY: "sk_test_STRIPE-TEST-VALUE",
  CLERK_SECRET_KEY: "sk_test_CLERK-TEST-VALUE",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_CLERK-PUBLIC-TEST-VALUE",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  PUBLIC_APP_ORIGIN: "https://site-git-main-equipe.vercel.app",
});

const deployment = (vercelEnv: string | undefined, keys: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...completeEnvironment(),
  ...keys,
  ...(vercelEnv === undefined ? {} : { VERCEL_ENV: vercelEnv }),
});

const ALL_PRODUCTION_WARNINGS = ["stripe_test_key_in_production", "clerk_test_key_in_production", "turnstile_test_key", "public_origin_mismatch"];

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
    expect(getEnvironmentConfigurationStatus({ NODE_ENV: "development" })).toEqual({ ok: true, missing: [], enforced: false, warnings: [] });
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
});

describe("incohérences de configuration selon VERCEL_ENV (EXPL-20)", () => {
  it("en production, signale une clé de test, la clé Turnstile de test et une autre adresse publique ; en préproduction, une clé live", () => {
    const matrix = [
      ["production", liveKeys(), []],
      ["production", testKeys(), ALL_PRODUCTION_WARNINGS],
      ["preview", testKeys(), []],
      ["preview", liveKeys(), ["live_key_in_preview"]],
      ["development", liveKeys(), []],
      ["development", testKeys(), []],
      // Outside Vercel nothing tells production apart (server/candidateTurnstile.ts reads it the same way).
      [undefined, liveKeys(), []],
      [undefined, testKeys(), []],
    ] as const;
    for (const [vercelEnv, keys, warnings] of matrix) {
      expect(getConfigurationWarnings(deployment(vercelEnv, keys)), `${vercelEnv} × ${keys.STRIPE_SECRET_KEY}`).toEqual(warnings);
    }
  });

  it("reconnaît chaque clé : clé restreinte Stripe, clé publique Clerk du serveur ou du navigateur, les clés Turnstile de test secrètes et de site", () => {
    const production = (keys: NodeJS.ProcessEnv) => getConfigurationWarnings(deployment("production", { ...liveKeys(), ...keys }));
    expect(production({ STRIPE_SECRET_KEY: "rk_test_RESTRICTED" })).toEqual(["stripe_test_key_in_production"]);
    expect(production({ CLERK_SECRET_KEY: " sk_test_CLERK " })).toEqual(["clerk_test_key_in_production"]);
    expect(production({ CLERK_PUBLISHABLE_KEY: "pk_test_SERVER" })).toEqual(["clerk_test_key_in_production"]);
    expect(production({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_BROWSER" })).toEqual(["clerk_test_key_in_production"]);
    for (const secret of ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"]) {
      expect(production({ TURNSTILE_SECRET_KEY: secret })).toEqual(["turnstile_test_key"]);
    }
    // A test site key with the site's real secret: its dummy token is refused, every public form with it.
    for (const siteKey of ["1x00000000000000000000AA", "2x00000000000000000000AB", "1x00000000000000000000BB", "2x00000000000000000000BB", " 3x00000000000000000000FF "]) {
      expect(production({ VITE_TURNSTILE_SITE_KEY: siteKey }), siteKey).toEqual(["turnstile_test_key"]);
    }
    expect(production({ TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA", VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" })).toEqual(["turnstile_test_key"]);

    const preview = (keys: NodeJS.ProcessEnv) => getConfigurationWarnings(deployment("preview", { ...testKeys(), ...keys }));
    expect(preview({ STRIPE_SECRET_KEY: "rk_live_RESTRICTED" })).toEqual(["live_key_in_preview"]);
    expect(preview({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_BROWSER" })).toEqual(["live_key_in_preview"]);
  });

  it("compare l’adresse publique telle que les liens envoyés la lisent : vide, l’adresse du site s’applique", () => {
    const production = (origin: string | undefined) => getConfigurationWarnings(deployment("production", { ...liveKeys(), PUBLIC_APP_ORIGIN: origin }));
    expect(production(undefined)).toEqual([]);
    expect(production("")).toEqual([]);
    for (const origin of ["https://drahmedbenlallahom.com/", "https://www.drahmedbenlallahom.com", "http://drahmedbenlallahom.com", "https://site-git-main-equipe.vercel.app"]) {
      expect(production(origin), origin).toEqual(["public_origin_mismatch"]);
    }
  });

  it("donne des codes sans jamais les valeurs, n’empêche pas le statut ok, et les journalise au démarrage", () => {
    const environment = deployment("production", testKeys());
    const status = getEnvironmentConfigurationStatus(environment);
    expect(status).toEqual({ ok: true, missing: [], enforced: true, warnings: ALL_PRODUCTION_WARNINGS });
    expect(JSON.stringify(status)).not.toMatch(/VALUE|1x0{10}|vercel\.app/);

    const log = vi.fn();
    expect(reportCriticalProductionEnvironment(environment, log).ok).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    const message = String(log.mock.calls[0][0]);
    expect(message).toBe("[Config] WARNING: configuration inconsistent with VERCEL_ENV=production: stripe_test_key_in_production, clerk_test_key_in_production, turnstile_test_key, public_origin_mismatch. The /admin banner says what to change.");

    const silent = vi.fn();
    reportCriticalProductionEnvironment(deployment("production", liveKeys()), silent);
    expect(silent).not.toHaveBeenCalled();
  });
});

describe("GET /api/health (sonde de disponibilité, M29 / OPS-05)", () => {
  it("répond ok quand la base répond à SELECT 1 et que la configuration est complète", async () => {
    const db = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const report = await buildHealthReport({ getDatabase: async () => db, environment: completeEnvironment() });

    expect(report.status).toBe("ok");
    expect(report.checks.database.status).toBe("ok");
    expect(report.checks.configuration).toEqual({ status: "ok", missing: [], warnings: [] });
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
    expect(report.checks.configuration).toEqual({ status: "missing", missing: ["CRON_SECRET", "CLERK_OWNER_USER_ID"], warnings: [] });
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

  const run = async (environment: NodeJS.ProcessEnv, authorization?: string) => {
    resetHealthCacheForTests();
    const app = express();
    registerHealthRoute(app, { getDatabase: healthyDb, environment });
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}${HEALTH_ROUTE}`, { headers: authorization ? { authorization } : {} });
      const text = await response.text();
      return { status: response.status, cache: response.headers.get("cache-control"), robots: response.headers.get("x-robots-tag"), text, body: JSON.parse(text) };
    } finally {
      server.close();
    }
  };

  it("répond en HTTP 200 / 503, sans cache ni indexation", async () => {
    const healthy = await run(completeEnvironment());
    expect(healthy).toMatchObject({ status: 200, cache: "no-store", robots: "noindex, nofollow", body: { status: "ok" } });

    const misconfigured = await run({ ...completeEnvironment(), CRON_SECRET: "" });
    expect(misconfigured.status).toBe(503);
    expect(misconfigured.body.checks.configuration).toEqual({ status: "missing" });
  });

  it("ne dit pas au public QUELLE variable manque ; le secret des tâches planifiées donne le détail", async () => {
    const environment: NodeJS.ProcessEnv = { ...completeEnvironment(), TURNSTILE_SECRET_KEY: "", RESEND_WEBHOOK_SECRET: "", CANDIDATE_DOCUMENT_ENCRYPTION_KEY: "" };
    const anonymous = await run(environment);
    expect(anonymous.status).toBe(503);
    expect(anonymous.body).toMatchObject({ status: "error", checks: { database: { status: "ok" }, configuration: { status: "missing" } } });
    for (const name of PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES) expect(anonymous.text).not.toContain(name);

    const wrongSecret = await run(environment, "Bearer not-the-cron-secret");
    expect(wrongSecret.text).not.toContain("TURNSTILE_SECRET_KEY");

    const owner = await run(environment, `Bearer ${environment.CRON_SECRET}`);
    expect(owner.status).toBe(503);
    expect(owner.body.checks.configuration).toEqual({ status: "missing", missing: ["TURNSTILE_SECRET_KEY", "CANDIDATE_DOCUMENT_ENCRYPTION_KEY", "RESEND_WEBHOOK_SECRET"], warnings: [] });
  });

  it("ne dit pas au public qu’une clé de test tourne en production ; le détail en donne le code, jamais la valeur (EXPL-20)", async () => {
    const environment = deployment("production", testKeys());
    const anonymous = await run(environment);
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.checks.configuration).toEqual({ status: "ok" });
    for (const code of ALL_PRODUCTION_WARNINGS) expect(anonymous.text).not.toContain(code);

    const owner = await run(environment, `Bearer ${environment.CRON_SECRET}`);
    expect(owner.status).toBe(200);
    expect(owner.body.checks.configuration).toEqual({ status: "ok", missing: [], warnings: ALL_PRODUCTION_WARNINGS });
    for (const response of [anonymous, owner]) {
      for (const value of Object.values(testKeys())) expect(response.text).not.toContain(value);
      expect(response.text).not.toContain("secret-value-of");
    }
  });

  it("répond encore quand la configuration Clerk fait échouer les autres routes, et la clé publique du navigateur suffit au serveur", async () => {
    vi.stubEnv("CLERK_TELEMETRY_DISABLED", "1");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_health_probe_only");
    vi.stubEnv("CLERK_PUBLISHABLE_KEY", "");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const probe = async (environment: NodeJS.ProcessEnv) => {
      resetHealthCacheForTests();
      const app = express();
      registerHealthRoute(app, { getDatabase: healthyDb, environment });
      app.use(clerkMiddleware({ publishableKey: clerkPublishableKey(environment) }));
      app.get("/api/other", (_req, res) => { res.json({ ok: true }); });
      const server = app.listen(0);
      try {
        const { port } = server.address() as AddressInfo;
        const health = await fetch(`http://127.0.0.1:${port}${HEALTH_ROUTE}`);
        const other = await fetch(`http://127.0.0.1:${port}/api/other`);
        return { health: health.status, healthType: health.headers.get("content-type"), other: other.status };
      } finally {
        server.close();
      }
    };
    try {
      const withoutKey = await probe({ ...completeEnvironment(), NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "" });
      expect(withoutKey.other).toBe(500);
      expect(withoutKey.health).toBe(503);
      expect(withoutKey.healthType).toContain("application/json");

      const browserKeyOnly = await probe({ ...completeEnvironment(), NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_aGVhbHRoLXByb2JlLmNsZXJrLmFjY291bnRzLmRldiQ" });
      expect(browserKeyOnly).toMatchObject({ health: 200, other: 200 });
    } finally {
      consoleError.mockRestore();
      vi.unstubAllEnvs();
    }
    expect(clerkPublishableKey({ CLERK_PUBLISHABLE_KEY: " pk_server ", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_browser" })).toBe("pk_server");
    expect(clerkPublishableKey({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_browser" })).toBe("pk_browser");
    expect(clerkPublishableKey({})).toBeUndefined();
  });
});

