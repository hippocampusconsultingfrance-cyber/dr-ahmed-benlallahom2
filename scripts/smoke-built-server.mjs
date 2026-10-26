import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Test de fumée du serveur construit (CODE-14). Après `pnpm build`, démarre
 * pour de vrai les deux bundles serveur et vérifie qu'ils répondent :
 *  - api/index.js, la fonction Vercel, servie par un petit hôte HTTP local
 *    (VERCEL=1, comme sur Vercel : pas de fichiers statiques) ;
 *  - dist/index.js, le serveur Express de `pnpm start`.
 * `node --check` (server/vercelBundle.test.ts) ne voit qu'une erreur de
 * syntaxe ; ici, un import manquant, une exception au chargement ou une route
 * démontée font échouer la CI.
 *
 * Aucun service externe : chaque variable de production requise reçoit une
 * valeur factice, même si le shell ou .env en donne une vraie, et la base vise
 * https://localhost/sql (pilote neon-http), qui refuse la connexion. Sans base,
 * /api/health répond donc 503 (database « error ») : on exige le rapport
 * complet, une configuration « ok » et un code cohérent (200 seulement si tout
 * est « ok »), puis une requête tRPC anonyme, qui traverse clerkMiddleware.
 */

/** PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES (server/_core/env.ts), toutes factices. */
export const SMOKE_ENVIRONMENT = Object.freeze({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://smoke:smoke@localhost/smoke",
  JWT_SECRET: "smoke_jwt_secret_for_the_built_server_check",
  STRIPE_SECRET_KEY: "sk_test_smoke",
  STRIPE_WEBHOOK_SECRET: "whsec_smoke",
  CLERK_SECRET_KEY: "sk_test_smoke",
  // Forme d'une clé publique Clerk (base64 de « clerk.example.com$ »), sans instance réelle.
  CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
  RESEND_API_KEY: "re_smoke",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_smoke_smoke",
  CANDIDATE_AUTH_PEPPER: "smoke_pepper_for_the_built_server_check",
  CANDIDATE_DOCUMENT_ENCRYPTION_KEY: "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
  CRON_SECRET: "smoke_cron_secret",
  CLERK_OWNER_USER_ID: "user_smoke",
  RESEND_WEBHOOK_SECRET: "whsec_smoke",
});

export const BUILT_SERVERS = Object.freeze([
  { name: "fonction Vercel (api/index.js)", entry: "api/index.js", vercel: true, checks: ["health", "api"] },
  { name: "serveur Node (dist/index.js, pnpm start)", entry: "dist/index.js", vercel: false, checks: ["health", "api", "spa"] },
]);

// Sur Vercel, api/index.js exporte le gestionnaire sans écouter de port : cet
// hôte le sert comme la plateforme, et annonce son port comme startServer().
const VERCEL_HOST = `
import { createServer } from "node:http";
const { default: handler } = await import(process.argv[1]);
const server = createServer((req, res) => handler(req, res));
server.listen(0, "127.0.0.1", () => console.log(\`Server running on http://localhost:\${server.address().port}/\`));
`;
const LISTENING = /Server running on http:\/\/localhost:(\d+)\//;
const REQUEST_TIMEOUT_MS = 8_000;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: REQUEST_TIMEOUT_MS }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error(`${url} : pas de réponse en ${REQUEST_TIMEOUT_MS / 1000} s`)));
    request.on("error", reject);
  });
}

/** Réessaie tant que la connexion échoue (serveur qui finit de démarrer), jamais sur un code HTTP. */
async function getWithRetries(url, attempts = 5, delayMs = 500) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await get(url);
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

function parseJson(body, what) {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${what} : réponse non JSON ${JSON.stringify(body.slice(0, 200))}`);
  }
}

const CHECKS = {
  async health(base) {
    const { status, body } = await getWithRetries(`${base}/api/health`);
    const report = parseJson(body, "/api/health");
    const configuration = report?.checks?.configuration?.status;
    const database = report?.checks?.database?.status;
    if (configuration !== "ok") throw new Error(`/api/health : configuration « ${configuration} » (une variable requise manque-t-elle à SMOKE_ENVIRONMENT ?)`);
    if (typeof database !== "string") throw new Error(`/api/health : rapport incomplet ${body.slice(0, 200)}`);
    const expected = report.status === "ok" ? 200 : 503;
    if (status !== expected) throw new Error(`/api/health : HTTP ${status} pour un rapport « ${report.status} » (attendu ${expected})`);
    return `/api/health ${status} (base ${database}, configuration ok)`;
  },
  async api(base) {
    const { status, body } = await getWithRetries(`${base}/api/trpc/auth.me`);
    const session = status === 200 ? parseJson(body, "/api/trpc/auth.me") : undefined;
    if (status !== 200 || session?.result?.data?.json !== null) throw new Error(`/api/trpc/auth.me : HTTP ${status} ${body.slice(0, 200)}`);
    return `/api/trpc/auth.me ${status} (session anonyme)`;
  },
  async spa(base) {
    const { status, headers, body } = await getWithRetries(`${base}/`);
    if (status !== 200 || !String(headers["content-type"]).startsWith("text/html") || !body.includes('<div id="root">')) {
      throw new Error(`/ : HTTP ${status} ${headers["content-type"]} sans <div id="root">`);
    }
    return `/ ${status} (page de l'application)`;
  },
};

function lastLines(text, count = 40) {
  return text.trimEnd().split("\n").slice(-count).join("\n");
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM");
  const forced = setTimeout(() => child.kill("SIGKILL"), 5_000);
  await exited;
  clearTimeout(forced);
}

/**
 * Démarre un bundle, attend qu'il écoute, passe ses contrôles puis l'arrête,
 * qu'il ait réussi ou non. En cas d'échec, l'erreur reprend la fin de sa sortie.
 */
export async function smokeBuiltServer(target, { root = process.cwd(), startTimeoutMs = 30_000 } = {}) {
  const entry = path.resolve(root, target.entry);
  const args = target.vercel ? ["--input-type=module", "--eval", VERCEL_HOST, pathToFileURL(entry).href] : [entry];
  // VERCEL vide plutôt qu'absente : dotenv ne la remplace pas par celle d'un .env.
  const env = { ...process.env, ...SMOKE_ENVIRONMENT, VERCEL: target.vercel ? "1" : "", PORT: String(await freePort()) };
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { output += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`aucun « Server running on » après ${startTimeoutMs / 1000} s`)), startTimeoutMs);
      const watch = () => {
        const listening = LISTENING.exec(output);
        if (listening) {
          clearTimeout(timer);
          resolve(Number(listening[1]));
        }
      };
      child.stdout.on("data", watch);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", (code, signal) => { clearTimeout(timer); reject(new Error(`arrêt au démarrage (${signal ?? `code ${code}`})`)); });
    });
    const base = `http://127.0.0.1:${port}`;
    const results = [];
    for (const check of target.checks) results.push(await CHECKS[check](base));
    return { port, results };
  } catch (error) {
    await stop(child);
    throw new Error(`${target.name} : ${error instanceof Error ? error.message : error}\n--- sortie du serveur ---\n${lastLines(output)}`);
  } finally {
    await stop(child);
  }
}

async function main() {
  for (const target of BUILT_SERVERS) {
    try {
      const { results } = await smokeBuiltServer(target);
      console.log(`Test de fumée, ${target.name} : ${results.join(", ")}`);
    } catch (error) {
      console.error(`Test de fumée en échec, ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
