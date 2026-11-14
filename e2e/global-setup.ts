import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { devNull } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { startDoubles } from "./support/doubles";
import { E2E_ENVIRONMENT, e2eSettings } from "./support/settings";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Before the scenarios (CODE-22): an empty database migrated by drizzle/pg, the doubles,
 * then the built server (`pnpm build` first), as `pnpm start` runs it, with
 * e2e/support/egress.mjs loaded before it. Returns what stops them.
 */
export default async function globalSetup() {
  const settings = e2eSettings();
  for (const built of ["dist/index.js", "dist/public/index.html"]) {
    if (!existsSync(path.join(root, built)))
      throw new Error(
        `e2e: ${built} is missing; run \`VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm build\` first`
      );
  }

  // A fresh schema, as drizzle/pg describes it, then opening hours on every day.
  const pool = new pg.Pool({ connectionString: settings.databaseUrl, max: 2 });
  // As Neon's: the server normalises Unicode in its queries, which PostgreSQL refuses in another encoding.
  const {
    rows: [{ server_encoding: encoding }],
  } = await pool.query("SHOW server_encoding");
  if (encoding !== "UTF8")
    throw new Error(
      `e2e: the database is in ${encoding}; create it in UTF8 (CREATE DATABASE … ENCODING 'UTF8' TEMPLATE template0)`
    );
  await pool.query(
    "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;"
  );
  await migrate(drizzle(pool), {
    migrationsFolder: path.join(root, "drizzle/pg"),
  });
  await pool.query(
    "INSERT INTO availability_slots (day_of_week, start_time, end_time, is_active) SELECT day, '08:00', '20:00', 1 FROM generate_series(0, 6) AS day"
  );
  await pool.end();

  const stripeWebhookSecret = `whsec_e2e_${randomBytes(16).toString("hex")}`;
  const doubles = await startDoubles({
    port: settings.doublesPort,
    appOrigin: settings.appOrigin,
    stripeWebhookSecret,
  });

  // Admin sessions: tokens signed with this key, checked by the server without Clerk (CLERK_JWT_KEY).
  const clerkKeys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  mkdirSync(path.dirname(settings.serverLog), { recursive: true });
  const log = createWriteStream(settings.serverLog);
  // Only this machine: neither the shell's proxy nor a .env reaches the server.
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !/^(?:https?|all|no)_proxy$/i.test(name) &&
        name !== "NODE_USE_ENV_PROXY" &&
        !name.startsWith("DOTENV_")
    )
  );
  const server = spawn(
    process.execPath,
    ["--import", "./e2e/support/egress.mjs", "dist/index.js"],
    {
      cwd: root,
      env: {
        ...inherited,
        ...E2E_ENVIRONMENT,
        PORT: String(settings.appPort),
        PUBLIC_APP_ORIGIN: settings.appOrigin,
        DATABASE_URL: settings.databaseUrl,
        E2E_DOUBLES_ORIGIN: doubles.origin,
        RESEND_BASE_URL: doubles.origin,
        VERCEL_BLOB_API_URL: `${doubles.origin}/blob`,
        CLERK_API_URL: `${doubles.origin}/api.clerk.com`,
        CLERK_JWT_KEY: clerkKeys.publicKey,
        STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
        DOTENV_CONFIG_PATH: devNull,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `e2e: the built server did not start within 30 s:\n${output}`
          )
        ),
      30_000
    );
    const listen = (chunk: Buffer) => {
      output += chunk.toString();
      if (
        output.includes(
          `Server running on http://localhost:${settings.appPort}/`
        )
      ) {
        clearTimeout(timer);
        resolve();
      } else if (/Server running on|Port \d+ is busy/.test(output)) {
        clearTimeout(timer);
        reject(
          new Error(
            `e2e: port ${settings.appPort} is taken (E2E_APP_PORT):\n${output}`
          )
        );
      }
    };
    server.stdout.on("data", listen);
    server.stderr.on("data", listen);
    server.once("exit", code =>
      reject(new Error(`e2e: the built server stopped (${code}):\n${output}`))
    );
  });

  process.env.E2E_DOUBLES_ORIGIN = doubles.origin;
  process.env.E2E_CLERK_SIGNING_KEY = clerkKeys.privateKey;

  return async () => {
    server.kill();
    await new Promise(resolve => server.once("exit", resolve));
    log.end();
    await doubles.close();
  };
}
