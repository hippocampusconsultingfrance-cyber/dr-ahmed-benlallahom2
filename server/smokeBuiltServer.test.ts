import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getMissingCriticalProductionEnvironment } from "./_core/env";
import { BUILT_SERVERS, SMOKE_ENVIRONMENT, smokeBuiltServer } from "../scripts/smoke-built-server.mjs";

/**
 * scripts/smoke-built-server.mjs, lancé par la CI après `pnpm build` (CODE-14),
 * exercé ici sur de petits serveurs qui imitent les deux bundles.
 */
const directories: string[] = [];
function fixture(files: Record<string, string>) {
  const directory = mkdtempSync(path.join(tmpdir(), "smoke-built-server-"));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), content);
  }
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const vercelTarget = { name: "fonction de test", entry: "handler.mjs", vercel: true, checks: ["health", "api"] };
const nodeTarget = { name: "serveur de test", entry: "server.mjs", vercel: false, checks: ["health", "api", "spa"] };

// Comme le serveur réel sans base : 503, base en erreur, configuration complète.
const HANDLER = `
export default function handler(req, res) {
  const json = (status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
  const configured = process.env.NODE_ENV === "production" && process.env.VERCEL === "1" && process.env.DATABASE_URL === ${JSON.stringify(SMOKE_ENVIRONMENT.DATABASE_URL)};
  if (req.url === "/api/health") return json(503, { status: "error", timestamp: new Date().toISOString(), checks: { database: { status: "error", latencyMs: null }, configuration: { status: configured ? "ok" : "missing" } } });
  if (req.url === "/api/trpc/auth.me") return json(200, { result: { data: { json: null } } });
  json(404, { error: "not_found" });
}
`;

function nodeServer(health: { httpStatus: number; status: string; configuration: string }) {
  return `
import { createServer } from "node:http";
const server = createServer((req, res) => {
  if (req.url === "/api/health") {
    res.writeHead(${health.httpStatus}, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: ${JSON.stringify(health.status)}, checks: { database: { status: "ok", latencyMs: 3 }, configuration: { status: ${JSON.stringify(health.configuration)} } } }));
  }
  if (req.url === "/api/trpc/auth.me") return res.writeHead(200, { "Content-Type": "application/json" }).end('{"result":{"data":{"json":null}}}');
  res.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><div id="root"></div>');
});
const port = Number(process.env.PORT);
server.listen(port, () => console.log(\`Server running on http://localhost:\${port}/\`));
`;
}

// The routes that load modules on demand, answered like the real server without a database.
function routesServer(options: { stripeStatus?: number; cronTrace?: string; resendLog?: string; source?: string } = {}) {
  return `
import { createServer } from "node:http";
${options.source ?? ""}
const json = (res, status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
const server = createServer((req, res) => {
  const route = req.url.split("?")[0];
  if (route === "/api/health") return json(res, 200, { status: "ok", checks: { database: { status: "ok", latencyMs: 3 }, configuration: { status: "ok" } } });
  if (route === "/api/trpc/auth.me") return json(res, 200, { result: { data: { json: null } } });
  if (route === "/api/trpc/appointments.calculatePrice") return json(res, 200, { result: { data: { json: { basePrice: 100, finalPrice: 100, isNightRate: false } } } });
  if (route === "/api/stripe/webhook" && req.method === "POST") {
    const status = ${options.stripeStatus ?? 400};
    return json(res, status, { error: status === 400 ? "Invalid webhook" : "Webhook unavailable" });
  }
  if (route === "/api/webhooks/resend" && req.method === "POST") {
    ${options.resendLog ? `console.error(${JSON.stringify(options.resendLog)});` : ""}
    return res.writeHead(400).end("Invalid Resend webhook");
  }
  if (route === "/api/scheduled/recruitment-processing") {
    if (req.headers.authorization !== "Bearer ${SMOKE_ENVIRONMENT.CRON_SECRET}") return json(res, 403, { error: "cron-only" });
    console.error(${JSON.stringify(`[RecruitmentProcessing] Vercel cron error ref=abcd1234 ${options.cronTrace ?? "Error: Failed query: select 1"}`)});
    return json(res, 500, { error: "scheduled_job_failed", reference: "abcd1234" });
  }
  json(res, 404, { error: "not_found" });
});
const port = Number(process.env.PORT);
server.listen(port, () => console.log(\`Server running on http://localhost:\${port}/\`));
`;
}
const routesTarget = { name: "serveur de test", entry: "server.mjs", vercel: false, checks: BUILT_SERVERS[1]!.checks.filter(check => check !== "spa") };

function connects(port: number) {
  return new Promise<boolean>(resolve => {
    http.get(`http://127.0.0.1:${port}/api/health`, response => { response.resume(); resolve(true); }).on("error", () => resolve(false));
  });
}

// Chaque test lance de vrais processus Node : marge pour une machine de CI chargée.
describe("test de fumée du serveur construit (CODE-14)", { timeout: 20_000 }, () => {
  it("donne à chaque variable de production requise une valeur factice, et une base locale injoignable", () => {
    expect(getMissingCriticalProductionEnvironment({ ...SMOKE_ENVIRONMENT })).toEqual([]);
    expect(new URL(SMOKE_ENVIRONMENT.DATABASE_URL).hostname).toBe("localhost");
    expect(SMOKE_ENVIRONMENT.NODE_ENV).toBe("production");
  });

  it("démarre les deux bundles que produit pnpm build", () => {
    const scripts = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")).scripts;
    expect(BUILT_SERVERS.map(target => target.entry)).toEqual(["api/index.js", "dist/index.js"]);
    const routeChecks = ["lazyPackages", "booking", "stripeWebhook", "resendWebhook", "scheduledJob", "noModuleErrors"];
    for (const target of BUILT_SERVERS) expect(target.checks, target.name).toEqual(expect.arrayContaining(["health", "api", ...routeChecks]));
    expect(scripts.build).toContain("--outfile=api/index.js");
    expect(scripts.start).toContain("node dist/index.js");
  });

  it("sert la fonction Vercel par un hôte local, accepte /api/health 503 quand seule la base manque, puis l'arrête", async () => {
    const root = fixture({ "handler.mjs": HANDLER });
    const { port, results } = await smokeBuiltServer(vercelTarget, { root });
    expect(results).toEqual(["/api/health 503 (base error, configuration ok)", "/api/trpc/auth.me 200 (session anonyme)"]);
    expect(await connects(port)).toBe(false);
  });

  it("démarre le serveur Node sur le port donné et contrôle aussi la page de l'application", async () => {
    const root = fixture({ "server.mjs": nodeServer({ httpStatus: 200, status: "ok", configuration: "ok" }) });
    const { results } = await smokeBuiltServer(nodeTarget, { root });
    expect(results).toEqual(["/api/health 200 (base ok, configuration ok)", "/api/trpc/auth.me 200 (session anonyme)", "/ 200 (page de l'application)"]);
  });

  it("échoue, avec la sortie du serveur, quand le bundle ne se charge pas (régression corrigée par 99f7869)", async () => {
    const root = fixture({ "handler.mjs": 'import { createRequire } from "node:module";\nconst createRequire = 1;\nexport default () => createRequire;\n' });
    await expect(smokeBuiltServer(vercelTarget, { root })).rejects.toThrow(/arrêt au démarrage \(code 1\)[\s\S]*SyntaxError: Identifier 'createRequire' has already been declared/);
  });

  it("échoue quand la configuration est incomplète ou que le code HTTP contredit le rapport", async () => {
    const missing = fixture({ "server.mjs": nodeServer({ httpStatus: 503, status: "error", configuration: "missing" }) });
    await expect(smokeBuiltServer(nodeTarget, { root: missing })).rejects.toThrow(/configuration « missing »/);
    const contradictory = fixture({ "server.mjs": nodeServer({ httpStatus: 200, status: "error", configuration: "ok" }) });
    await expect(smokeBuiltServer(nodeTarget, { root: contradictory })).rejects.toThrow(/HTTP 200 pour un rapport « error » \(attendu 503\)/);
  });

  it("ne réessaie pas une route qui ne répond pas : un seul délai d'attente, pas cinq", async () => {
    const root = fixture({ "handler.mjs": "export default function handler() {}\n" });
    const started = Date.now();
    await expect(smokeBuiltServer(vercelTarget, { root })).rejects.toThrow(/\/api\/health : pas de réponse en 8 s/);
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it("appelle les routes qui chargent des modules à la demande : réservation, webhooks Stripe et Resend, tâche planifiée", async () => {
    // Paths, node: modules and installed packages are not reported; an import that is never run is still resolved.
    const root = fixture({
      "server.mjs": routesServer({ source: 'if (process.env.SMOKE_NEVER) { await import("./absent.js"); await import("node:zlib"); await import("smoke-installed"); }' }),
      "node_modules/smoke-installed/package.json": JSON.stringify({ name: "smoke-installed", type: "module", exports: "./index.js" }),
      "node_modules/smoke-installed/index.js": "export default 1;\n",
    });
    const { results } = await smokeBuiltServer(routesTarget, { root });
    expect(results).toEqual([
      "/api/health 200 (base ok, configuration ok)",
      "/api/trpc/auth.me 200 (session anonyme)",
      "1 paquet(s) importé(s) à la demande résolu(s)",
      "/api/trpc/appointments.calculatePrice 200 (prix 100)",
      "/api/stripe/webhook 400 (signature refusée)",
      "/api/webhooks/resend 400 (signature absente refusée)",
      "/api/scheduled/recruitment-processing 500 (base injoignable, modules chargés)",
      "aucune erreur de module",
    ]);
  });

  it("échoue sur un paquet importé à la demande introuvable, même dans une branche que les requêtes n'atteignent pas", async () => {
    const root = fixture({ "server.mjs": routesServer({ source: 'if (process.env.SMOKE_NEVER) await import("tests5-smoke-missing-package");' }) });
    await expect(smokeBuiltServer(routesTarget, { root })).rejects.toThrow(/paquet\(s\) importé\(s\) à la demande introuvable\(s\) depuis server\.mjs : tests5-smoke-missing-package/);
  });

  it("échoue quand le webhook Stripe répond 500 (SDK introuvable) au lieu de refuser la signature", async () => {
    const root = fixture({ "server.mjs": routesServer({ stripeStatus: 500 }) });
    await expect(smokeBuiltServer(routesTarget, { root })).rejects.toThrow(/\/api\/stripe\/webhook \(signature invalide\) : HTTP 500 \{"error":"Webhook unavailable"\}/);
  });

  it("échoue quand la tâche planifiée tombe sur une erreur de module, ou qu'une autre route en écrit une", async () => {
    const cron = fixture({ "server.mjs": routesServer({ cronTrace: "Error: Cannot find package 'pdf-parse' imported from /var/task/api/index.js" }) });
    await expect(smokeBuiltServer(routesTarget, { root: cron })).rejects.toThrow(/\/api\/scheduled\/recruitment-processing : erreur de module .*Cannot find package 'pdf-parse'/);
    const resend = fixture({ "server.mjs": routesServer({ resendLog: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server/resendWebhookEvents.js'" }) });
    await expect(smokeBuiltServer(routesTarget, { root: resend })).rejects.toThrow(/erreur de module dans la sortie du serveur : Error \[ERR_MODULE_NOT_FOUND\]/);
  });

  it("abandonne et arrête un serveur qui n'annonce jamais son port", async () => {
    const root = fixture({ "server.mjs": 'import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("./pid", import.meta.url), String(process.pid));\nsetInterval(() => {}, 1000);\n' });
    await expect(smokeBuiltServer(nodeTarget, { root, startTimeoutMs: 3_000 })).rejects.toThrow(/aucun « Server running on » après 3 s/);
    const pid = Number(readFileSync(path.join(root, "pid"), "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
