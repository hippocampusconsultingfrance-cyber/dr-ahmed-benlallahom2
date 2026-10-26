import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(directory, name), content);
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

  it("abandonne et arrête un serveur qui n'annonce jamais son port", async () => {
    const root = fixture({ "server.mjs": 'import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("./pid", import.meta.url), String(process.pid));\nsetInterval(() => {}, 1000);\n' });
    await expect(smokeBuiltServer(nodeTarget, { root, startTimeoutMs: 3_000 })).rejects.toThrow(/aucun « Server running on » après 3 s/);
    const pid = Number(readFileSync(path.join(root, "pid"), "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
