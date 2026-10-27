import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { devNull } from "node:os";
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
 * Aucun service réel, même lancé depuis un poste qui a les variables de la
 * production : chaque variable requise (dont les clés Stripe, Resend, Clerk,
 * Blob et Turnstile) reçoit une valeur factice, même si le shell en donne une
 * vraie ; celles qui mèneraient à un service réel sans être requises
 * (REAL_SERVICE_PREFIXES : moniteurs HEALTHCHECK_URL_* que la tâche planifiée
 * en échec appellerait, Google Drive, IA, autres clés et hôtes d'API de Clerk,
 * Resend et Blob, proxy) arrivent vides ; le .env du dépôt n'est pas lu
 * (dotenv/config lit un fichier vide). Un garde chargé avant le bundle refuse
 * en outre toute connexion vers une autre machine, sans requête DNS, et le test
 * échoue s'il en a refusé une. La base vise https://localhost/sql (pilote
 * neon-http), qui refuse la connexion. Sans base, /api/health répond 503
 * (database « error ») : on exige le rapport complet, une configuration « ok »
 * et un code cohérent (200 seulement si tout est « ok »), puis une requête tRPC
 * anonyme, qui traverse clerkMiddleware.
 *
 * Le bundle garde en import("…") à la demande des paquets (stripe, pdf-parse,
 * mammoth…) : un paquet absent n'y échoue qu'à la première requête qui le
 * charge. Chacun doit donc se résoudre depuis le bundle, et les routes
 * principales sont appelées : webhook Stripe mal signé (400 attendu, et non le
 * 500 d'un SDK introuvable), webhook Resend sans signature (400), tâche
 * planifiée avec le CRON_SECRET factice (403 sans lui ; avec lui, la tâche va
 * jusqu'à la base injoignable : 500 dont la trace, sous la même référence,
 * n'est pas une erreur de module), calcul public du prix d'une réservation
 * (200). Aucune sortie du serveur ne doit montrer d'erreur de module ni de
 * connexion refusée par le garde.
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

/**
 * Variables qu'un shell ou un .env de production fournirait et par lesquelles le
 * serveur construit, ou un SDK qu'il charge, joindrait un service réel :
 * l'enfant les reçoit vides (les valeurs factices de SMOKE_ENVIRONMENT passent
 * ensuite par-dessus).
 */
const REAL_SERVICE_PREFIXES = Object.freeze([
  "HEALTHCHECK_URL_", // moniteurs des tâches planifiées : une tâche en échec y envoie /fail
  "GOOGLE_DRIVE_", // export des CV vers Google Drive
  "AI_GATEWAY_", // analyse IA des CV
  "VERCEL_OIDC_", // jeton de l'AI Gateway et de Vercel Blob
  "BLOB_", // Vercel Blob : BLOB_STORE_ID, avec ce jeton
  "VERCEL_BLOB_", // Vercel Blob : hôte d'API
  "NEXT_PUBLIC_VERCEL_BLOB_",
  "BUILT_IN_FORGE_", // ancien proxy Manus : LLM et /manus-storage
  "CLERK_", // CLERK_API_URL, CLERK_MACHINE_SECRET_KEY…
  "RESEND_", // RESEND_BASE_URL : les e-mails, dont les alertes au propriétaire
  "DOTENV_", // un autre fichier, son coffre .env.vault, ou l'écrasement des valeurs factices
  // Avec HTTP(S)_PROXY, un proxy local relaierait vers l'extérieur ce que le garde laisse passer.
  "NODE_USE_ENV_PROXY",
  "GLOBAL_AGENT_",
]);
const PROXY_VARIABLE = /^(?:https?|all)_proxy$/i;

/** Environnement du serveur démarré : celui du shell, sans accès à un service réel. */
export function smokeChildEnvironment(target, port, environment = process.env) {
  const realServices = Object.keys(environment).filter(name => PROXY_VARIABLE.test(name) || REAL_SERVICE_PREFIXES.some(prefix => name.startsWith(prefix)));
  return {
    ...environment,
    // Vides plutôt qu'absentes : dotenv ne remplace pas une variable déjà définie.
    ...Object.fromEntries(realServices.map(name => [name, ""])),
    ...SMOKE_ENVIRONMENT,
    // dotenv/config lit ce fichier vide au lieu du .env du dépôt.
    DOTENV_CONFIG_PATH: devNull,
    VERCEL: target.vercel ? "1" : "",
    PORT: String(port),
  };
}

/**
 * Chargé avant le bundle (--import) : une connexion vers une autre machine
 * échoue aussitôt comme une connexion refusée, sans requête DNS, et s'écrit sur
 * la sortie du serveur, que le contrôle noOutboundConnections relit.
 */
function guardNetwork(net) {
  const connect = net.Socket.prototype.connect;
  const local = host => !host || /^(?:localhost|127(?:\.\d+){3}|::1|::ffff:127(?:\.\d+){3})$/i.test(host);
  net.Socket.prototype.connect = function (...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const options = first !== null && typeof first === "object" ? first : { port: first, host: typeof args[1] === "string" ? args[1] : undefined };
    // Un fichier de socket local, lu comme net le lit (https passe `path: null` pour une connexion TCP).
    const ipc = Boolean(options.path) || (typeof first === "string" && !/^\d+$/.test(first));
    if (ipc || local(options.host)) return connect.apply(this, args);
    const target = `${options.host}:${options.port}`;
    process.stderr.write(`[smoke] connexion sortante refusée vers ${target}\n`);
    const error = Object.assign(new Error(`connect ECONNREFUSED ${target} (test de fumée : réseau limité à cette machine)`), { code: "ECONNREFUSED", syscall: "connect" });
    process.nextTick(() => this.destroy(error));
    return this;
  };
}
const NETWORK_GUARD = `data:text/javascript,${encodeURIComponent(`import net from "node:net";\n(${guardNetwork})(net);\n`)}`;
const OUTBOUND_CONNECTION = /\[smoke\] connexion sortante refusée vers \S+/;

/** Contrôles des routes qui chargent les modules à la demande, communs aux deux bundles. */
const ROUTE_CHECKS = ["lazyPackages", "booking", "stripeWebhook", "resendWebhook", "scheduledJob", "noModuleErrors", "noOutboundConnections"];

export const BUILT_SERVERS = Object.freeze([
  { name: "fonction Vercel (api/index.js)", entry: "api/index.js", vercel: true, checks: ["health", "api", ...ROUTE_CHECKS] },
  { name: "serveur Node (dist/index.js, pnpm start)", entry: "dist/index.js", vercel: false, checks: ["health", "api", "spa", ...ROUTE_CHECKS] },
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

function request(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request(url, { method, headers, timeout: REQUEST_TIMEOUT_MS }, response => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: text }));
      response.on("error", reject);
    });
    outgoing.on("timeout", () => outgoing.destroy(new Error(`${new URL(url).pathname} : pas de réponse en ${REQUEST_TIMEOUT_MS / 1000} s`)));
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

const get = url => request(url);

/** Ce que Node écrit quand un import ne trouve pas son paquet ou son fichier. */
const MODULE_ERROR = /ERR_MODULE_NOT_FOUND|Cannot find (?:package|module) '/;

/** Paquets que le bundle n'importe qu'à la demande : import("x") dont x n'est pas un chemin. */
function lazyPackageImports(bundleSource) {
  const specifiers = Array.from(bundleSource.matchAll(/\bimport\(\s*["']([^"'.\/][^"']*)["']\s*\)/g), match => match[1]);
  return [...new Set(specifiers.filter(specifier => !specifier.startsWith("node:")))].sort();
}

/** Les paquets de `specifiers` que Node ne résout pas depuis le dossier du bundle, comme le ferait son import(). */
function unresolvedPackages(entry, specifiers) {
  const script = `for (const specifier of ${JSON.stringify(specifiers)}) { try { import.meta.resolve(specifier); } catch { console.log(specifier); } }`;
  const resolution = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { cwd: path.dirname(entry), encoding: "utf8" });
  if (resolution.status !== 0) throw new Error(`résolution des paquets impossible : ${resolution.stderr.slice(0, 200)}`);
  return resolution.stdout.split("\n").filter(Boolean);
}

const CONNECTION_ERRORS = new Set(["ECONNREFUSED", "ECONNRESET"]);

/** Réessaie tant que la connexion échoue (serveur qui finit de démarrer), jamais sur un code HTTP ni sur une route muette. */
async function getWithRetries(url, attempts = 5, delayMs = 500) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await get(url);
    } catch (error) {
      if (attempt >= attempts || !CONNECTION_ERRORS.has(error?.code)) throw error;
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
  async lazyPackages(_base, { entry }) {
    const specifiers = lazyPackageImports(await readFile(entry, "utf8"));
    const missing = unresolvedPackages(entry, specifiers);
    if (missing.length) throw new Error(`paquet(s) importé(s) à la demande introuvable(s) depuis ${path.basename(entry)} : ${missing.join(", ")}`);
    return `${specifiers.length} paquet(s) importé(s) à la demande résolu(s)`;
  },
  async booking(base) {
    const input = encodeURIComponent(JSON.stringify({ json: { appointmentDate: "2026-03-10T09:00:00.000Z" } }));
    const { status, body } = await getWithRetries(`${base}/api/trpc/appointments.calculatePrice?input=${input}`);
    const price = status === 200 ? parseJson(body, "appointments.calculatePrice")?.result?.data?.json : undefined;
    if (typeof price?.basePrice !== "number" || typeof price?.finalPrice !== "number") throw new Error(`/api/trpc/appointments.calculatePrice : HTTP ${status} ${body.slice(0, 200)}`);
    return `/api/trpc/appointments.calculatePrice ${status} (prix ${price.finalPrice})`;
  },
  async stripeWebhook(base) {
    const timestamp = Math.floor(Date.now() / 1000);
    const { status, body } = await request(`${base}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${"0".repeat(64)}` },
      body: JSON.stringify({ id: "evt_smoke", object: "event", type: "checkout.session.completed", data: { object: {} } }),
    });
    // 400 : le SDK Stripe s'est chargé et a refusé la signature ; 500 : il n'a pas pu se charger.
    if (status !== 400 || parseJson(body, "/api/stripe/webhook")?.error !== "Invalid webhook") throw new Error(`/api/stripe/webhook (signature invalide) : HTTP ${status} ${body.slice(0, 200)}`);
    return "/api/stripe/webhook 400 (signature refusée)";
  },
  async resendWebhook(base) {
    const { status, body } = await request(`${base}/api/webhooks/resend`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (status !== 400) throw new Error(`/api/webhooks/resend (sans signature) : HTTP ${status} ${body.slice(0, 200)}`);
    return "/api/webhooks/resend 400 (signature absente refusée)";
  },
  async scheduledJob(base, { output }) {
    const route = `${base}/api/scheduled/recruitment-processing`;
    const anonymous = await request(route);
    if (anonymous.status !== 403) throw new Error(`/api/scheduled/recruitment-processing sans CRON_SECRET : HTTP ${anonymous.status} (attendu 403)`);
    const { status, body } = await request(route, { headers: { authorization: `Bearer ${SMOKE_ENVIRONMENT.CRON_SECRET}` } });
    if (status === 200) return "/api/scheduled/recruitment-processing 200";
    const failure = status === 500 ? parseJson(body, "/api/scheduled/recruitment-processing") : undefined;
    if (failure?.error !== "scheduled_job_failed" || typeof failure.reference !== "string") throw new Error(`/api/scheduled/recruitment-processing : HTTP ${status} ${body.slice(0, 200)}`);
    // La base est injoignable : la tâche échoue, mais pas sur un module manquant. Sa trace,
    // écrite avant la réponse, peut arriver un peu après elle par la sortie du serveur.
    const traceOf = () => output().split("\n").find(line => line.includes(`ref=${failure.reference}`));
    for (let wait = 0; !traceOf() && wait < 20; wait++) await new Promise(resolve => setTimeout(resolve, 100));
    const trace = traceOf();
    if (!trace) throw new Error(`/api/scheduled/recruitment-processing : aucune trace pour la référence ${failure.reference}`);
    if (MODULE_ERROR.test(trace)) throw new Error(`/api/scheduled/recruitment-processing : erreur de module ${trace.slice(0, 300)}`);
    return "/api/scheduled/recruitment-processing 500 (base injoignable, modules chargés)";
  },
  async noModuleErrors(_base, { output }) {
    const line = output().split("\n").find(text => MODULE_ERROR.test(text));
    if (line) throw new Error(`erreur de module dans la sortie du serveur : ${line.slice(0, 300)}`);
    return "aucune erreur de module";
  },
  async noOutboundConnections(_base, { output }) {
    const refused = OUTBOUND_CONNECTION.exec(output());
    if (refused) throw new Error(`le serveur a tenté de joindre une autre machine : ${refused[0]}`);
    return "aucune connexion hors de cette machine";
  },
};

function lastLines(text, count = 40) {
  return text.trimEnd().split("\n").slice(-count).join("\n");
}

/** Arrête le serveur, puis attend (1 s au plus) la fin de sa sortie : la trace d'une erreur peut suivre « exit ». */
async function stop(child, closed) {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once("exit", resolve));
    child.kill("SIGTERM");
    const forced = setTimeout(() => child.kill("SIGKILL"), 5_000);
    await exited;
    clearTimeout(forced);
  }
  let grace;
  await Promise.race([closed, new Promise(resolve => { grace = setTimeout(resolve, 1_000); })]);
  clearTimeout(grace);
}

/**
 * Démarre un bundle, attend qu'il écoute, passe ses contrôles puis l'arrête,
 * qu'il ait réussi ou non. En cas d'échec, l'erreur reprend la fin de sa sortie.
 */
export async function smokeBuiltServer(target, { root = process.cwd(), startTimeoutMs = 30_000 } = {}) {
  const entry = path.resolve(root, target.entry);
  const args = ["--import", NETWORK_GUARD, ...target.vercel ? ["--input-type=module", "--eval", VERCEL_HOST, pathToFileURL(entry).href] : [entry]];
  const env = smokeChildEnvironment(target, await freePort());
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const closed = new Promise(resolve => child.once("close", resolve));
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
    for (const check of target.checks) results.push(await CHECKS[check](base, { entry, output: () => output }));
    return { port, results };
  } catch (error) {
    await stop(child, closed);
    throw new Error(`${target.name} : ${error instanceof Error ? error.message : error}\n--- sortie du serveur ---\n${lastLines(output)}`);
  } finally {
    await stop(child, closed);
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
