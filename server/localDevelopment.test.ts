import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { Resend } from "resend";
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./_core/index";
import { listen } from "./testSupport/candidateUploadApp";

// CODE-15 — mode local : base PostgreSQL de la machine, Clerk facultatif hors /admin,
// emails et paiements écrits dans la console ; aucun de ces raccourcis en production.

// server/_core/index est importé ici, avant tout vi.stubEnv, sans démarrer le serveur
// (startServer ne tourne pas avec VERCEL=1) ; chaque test pose ensuite son propre
// environnement, que createApp et getDb relisent à chaque appel.
vi.hoisted(() => {
  process.env.VERCEL = "1";
});

/** Fake node-postgres pool: records what each client runs and answers like PostgreSQL. */
const pg = vi.hoisted(() => {
  const state = { pools: [] as string[], statements: [] as Array<{ text: string; values?: unknown[]; rowMode?: string }>, failOn: null as RegExp | null };
  class DatabaseError extends Error {
    code: string;
    constraint?: string;
    constructor(message: string, code: string, constraint?: string) {
      super(message);
      this.code = code;
      this.constraint = constraint;
    }
  }
  class Pool {
    constructor({ connectionString }: { connectionString: string }) {
      state.pools.push(connectionString);
    }
    async connect() {
      return {
        release: () => undefined,
        query: async (query: string | { text: string; values?: unknown[]; rowMode?: string }) => {
          const statement = typeof query === "string" ? { text: query } : query;
          state.statements.push(statement);
          if (state.failOn?.test(statement.text)) throw new DatabaseError("duplicate key value violates unique constraint \"appointments_active_slot_unique\"", "23505", "appointments_active_slot_unique");
          return { fields: [{ name: "one", dataTypeID: 23 }], rows: [["1"]], command: "SELECT", rowCount: 1 };
        },
      };
    }
  }
  return { state, module: { default: { Pool, DatabaseError } } };
});
vi.mock("pg", () => pg.module);
// Vite's middleware, which createApp loads in development, is not what is tested here.
vi.mock("./_core/vite", () => ({ setupVite: async () => undefined }));

const LOCAL_URL = "postgresql://postgres:postgres@localhost:5432/drahmed";
const NEON_URL = "postgresql://owner:secret@ep-quiet-sea-123456.eu-central-1.aws.neon.tech/neondb";

/** Environment of a developer's machine: nothing set but the local database. */
function stubDevelopment(extra: Record<string, string> = {}) {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NODE_ENV", "development");
  for (const name of ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "RESEND_API_KEY", "STRIPE_SECRET_KEY"]) vi.stubEnv(name, "");
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  for (const [name, value] of Object.entries(extra)) vi.stubEnv(name, value);
}

afterEach(async () => {
  vi.unstubAllEnvs();
  pg.state.pools.length = 0;
  pg.state.statements.length = 0;
  pg.state.failOn = null;
  const { neonConfig } = await import("@neondatabase/serverless");
  neonConfig.fetchFunction = undefined;
  neonConfig.fetchEndpoint = (host: string) => `https://${host.replace(/^[^.]+\./, "api.")}/sql`;
  (await import("./db")).resetDbForTests();
});

describe("mode local : garde-fou de production", () => {
  it("n'active aucun raccourci en production, sur Vercel, en préproduction ni sous test, même sans aucune clé et avec une base locale", async () => {
    const { localDevelopmentShortcuts, localStripeApiOptions } = await import("./_core/env");
    const bare = { DATABASE_URL: LOCAL_URL, LOCAL_STRIPE_API_URL: "http://127.0.0.1:4010" };
    for (const environment of [
      { ...bare, NODE_ENV: "production" },
      { ...bare, NODE_ENV: "development", VERCEL: "1" },
      { ...bare, NODE_ENV: "development", VERCEL_ENV: "preview" },
      { ...bare, NODE_ENV: "development", VERCEL_ENV: "production" },
      { ...bare, NODE_ENV: "test" },
      bare,
    ]) {
      expect(localDevelopmentShortcuts(environment), JSON.stringify(environment)).toEqual([]);
      expect(localStripeApiOptions(environment), JSON.stringify(environment)).toBeUndefined();
    }
  });

  it("en développement, n'active que les raccourcis dont la clé manque, et la base locale seulement sur cette machine", async () => {
    const { localDevelopmentShortcuts, localStripeApiOptions } = await import("./_core/env");
    expect(localDevelopmentShortcuts({ NODE_ENV: "development", DATABASE_URL: LOCAL_URL })).toEqual(["local_database", "clerk_optional", "console_emails", "console_payments"]);
    expect(localDevelopmentShortcuts({
      NODE_ENV: "development", DATABASE_URL: NEON_URL, CLERK_SECRET_KEY: "sk_test_x", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x", RESEND_API_KEY: "re_x", STRIPE_SECRET_KEY: "sk_test_x",
    })).toEqual([]);
    // A publishable key without its secret key still leaves Clerk out.
    expect(localDevelopmentShortcuts({ NODE_ENV: "development", DATABASE_URL: NEON_URL, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x", RESEND_API_KEY: "re_x", STRIPE_SECRET_KEY: "sk_test_x" })).toEqual(["clerk_optional"]);
    for (const url of ["postgresql://u:p@127.0.0.1:55432/db", "postgres://u:p@[::1]/db", "postgresql://u:p@LOCALHOST/db"]) {
      expect(localDevelopmentShortcuts({ NODE_ENV: "development", DATABASE_URL: url }), url).toContain("local_database");
    }
    for (const url of [NEON_URL, "postgresql://u:p@localhost.example.com/db", "postgresql://u:p@127.0.0.1.nip.io/db", "not a url", ""]) {
      expect(localDevelopmentShortcuts({ NODE_ENV: "development", DATABASE_URL: url }), url).not.toContain("local_database");
    }
    expect(localStripeApiOptions({ NODE_ENV: "development", LOCAL_STRIPE_API_URL: "http://127.0.0.1:4010" })).toEqual({ host: "127.0.0.1", port: 4010, protocol: "http" });
    for (const url of ["https://api.stripe.com", "http://stripe.example.com:4010", "http://127.0.0.1"]) {
      expect(localStripeApiOptions({ NODE_ENV: "development", LOCAL_STRIPE_API_URL: url }), url).toBeUndefined();
    }
  });
});

describe("mode local : base PostgreSQL de la machine (node-postgres)", () => {
  it("passe les requêtes du pilote Neon à node-postgres, une à une ou par lot dans une transaction, et rend les erreurs PostgreSQL comme Neon", async () => {
    stubDevelopment();
    const { getDb } = await import("./db");
    const db = (await getDb())!;
    expect(pg.state.pools).toEqual([LOCAL_URL]);

    const result = await db.execute(sql`select ${1}::int as one`);
    expect(result.rows).toEqual([{ one: 1 }]);
    expect(pg.state.statements).toEqual([{ text: "select $1::int as one", values: ["1"], rowMode: "array", types: expect.anything() }]);

    pg.state.statements.length = 0;
    await db.batch([db.execute(sql`select 1`), db.execute(sql`select 2`)]);
    expect(pg.state.statements.map(statement => statement.text)).toEqual(["BEGIN", "select 1", "select 2", "COMMIT"]);

    pg.state.statements.length = 0;
    pg.state.failOn = /insert/;
    const failure = await db.batch([db.execute(sql`select 1`), db.execute(sql`insert into appointments default values`)]).catch(error => error);
    expect(pg.state.statements.map(statement => statement.text)).toEqual(["BEGIN", "select 1", "insert into appointments default values", "ROLLBACK"]);
    // The code and the constraint reach the application, which tells a taken slot by them.
    const { postgresErrorCode } = await import("./languageColumns");
    expect(postgresErrorCode(failure)).toBe("23505");
  });

  it("garde le pilote Neon en production, même avec une DATABASE_URL locale", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", LOCAL_URL);
    const { neonConfig } = await import("@neondatabase/serverless");
    const { getDb } = await import("./db");
    expect(await getDb()).not.toBeNull();
    expect(pg.state.pools).toEqual([]);
    expect(neonConfig.fetchFunction).toBeUndefined();
  });
});

describe("mode local : Clerk facultatif hors de /admin", () => {
  const priceQuery = `/api/trpc/appointments.calculatePrice?input=${encodeURIComponent(JSON.stringify({ json: { appointmentDate: "2026-12-01T09:00:00.000Z" } }))}`;

  async function app() {
    return listen((await createApp()) as never);
  }

  it("sert le site public sans clés Clerk en développement, et personne n'y est administrateur", async () => {
    stubDevelopment({ DATABASE_URL: "" });
    const { server, baseUrl } = await app();
    try {
      const price = await fetch(`${baseUrl}${priceQuery}`);
      expect(price.status).toBe(200);
      expect((await price.json()).result.data.json).toMatchObject({ finalPrice: 100 });
      const admin = await fetch(`${baseUrl}/api/trpc/admin.appointments.list`);
      // Refused as to any visitor who is not the administrator.
      expect([401, 403]).toContain(admin.status);
    } finally {
      server.close();
    }
  });

  it("garde clerkMiddleware en production sans clés Clerk : le site refuse plutôt que de s'en passer", async () => {
    stubDevelopment({ NODE_ENV: "production", DATABASE_URL: "" });
    const { server, baseUrl } = await app();
    try {
      expect((await fetch(`${baseUrl}${priceQuery}`)).status).toBe(500);
    } finally {
      server.close();
    }
  });
});

describe("mode local : emails et paiements dans la console", () => {
  /** A stand-in for the site: records the Stripe events it receives, verified as the webhook route verifies them. */
  async function fakeSite(secret: string) {
    const stripe = new Stripe("sk_test_local_console");
    const events: Stripe.Event[] = [];
    const server: Server = createServer((req, res) => {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        events.push(stripe.webhooks.constructEvent(body, String(req.headers["stripe-signature"]), secret));
        res.writeHead(200).end("{}");
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    return { events, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
  }

  it("écrit chaque email dans la console, envoyé seul ou par lot avec le SDK Resend", async () => {
    const { startLocalServices, printLocalServiceEvent } = await import("./_core/localServices");
    const lines: string[] = [];
    const local = await startLocalServices({ appOrigin: "http://127.0.0.1:9", onEvent: event => printLocalServiceEvent(event, line => lines.push(line)) });
    try {
      const resend = new Resend("re_local_console", { baseUrl: local.origin });
      const single = await resend.emails.send({ from: "Site <site@example.com>", to: "camille@example.com", subject: "Confirmation", text: "Bonjour Camille,\n\nVotre rendez-vous est confirmé.", attachments: [{ filename: "facture.pdf", content: Buffer.from("%PDF") }] });
      const batch = await resend.batch.send([{ from: "a@example.com", to: ["b@example.com", "c@example.com"], subject: "Lot", html: "<p>Une <strong>campagne</strong></p>" }]);
      expect(single.error).toBeNull();
      expect(single.data?.id).toMatch(/^local_email_/);
      expect(batch.data?.data).toHaveLength(1);
      expect(lines).toEqual([
        "[Email local] À : camille@example.com — Objet : Confirmation — Pièces jointes : facture.pdf\n  Bonjour Camille,\n  Votre rendez-vous est confirmé.",
        "[Email local] À : b@example.com, c@example.com — Objet : Lot\n  Une campagne",
      ]);
    } finally {
      await local.close();
    }
  });

  it("remplace Stripe Checkout : session créée par le SDK, page « Payer » qui envoie au site l'évènement signé puis revient sur l'adresse de succès", async () => {
    const { localServicesHandler, printLocalServiceEvent } = await import("./_core/localServices");
    const secret = "whsec_local_console_test";
    const site = await fakeSite(secret);
    const lines: string[] = [];
    const doubles = createServer();
    await new Promise<void>(resolve => doubles.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(doubles.address() as AddressInfo).port}`;
    const handle = localServicesHandler({ origin, appOrigin: site.origin, stripeWebhookSecret: secret, onEvent: event => printLocalServiceEvent(event, line => lines.push(line)) });
    doubles.on("request", (req, res) => void handle(req, res).then(handled => handled || res.writeHead(404).end()));
    try {
      const { port } = doubles.address() as AddressInfo;
      const stripe = new Stripe("sk_test_local_console", { host: "127.0.0.1", port, protocol: "http" });
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price_data: { currency: "eur", product_data: { name: "Consultation" }, unit_amount: 10000 }, quantity: 1 }],
        customer_email: "camille@example.com",
        metadata: { trackingId: "APTLOCAL0001" },
        success_url: "http://localhost:3000/booking/confirmation?status=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "http://localhost:3000/booking/confirmation?status=canceled",
      });
      expect(session).toMatchObject({ status: "open", payment_status: "unpaid", amount_total: 10000, metadata: { trackingId: "APTLOCAL0001" }, url: `${origin}/checkout/${session.id}` });
      expect((await stripe.checkout.sessions.retrieve(session.id)).id).toBe(session.id);

      const page = await fetch(session.url!);
      expect(await page.text()).toContain("Paiement de test local");
      const paid = await fetch(`${session.url}/pay`, { method: "POST", redirect: "manual" });
      expect(paid.status).toBe(303);
      expect(paid.headers.get("location")).toBe(`http://localhost:3000/booking/confirmation?status=success&session_id=${session.id}`);
      expect(site.events.map(event => [event.type, (event.data.object as Stripe.Checkout.Session).payment_status, (event.data.object as Stripe.Checkout.Session).metadata?.trackingId])).toEqual([["checkout.session.completed", "paid", "APTLOCAL0001"]]);
      expect((await stripe.checkout.sessions.retrieve(session.id)).payment_status).toBe("paid");
      await expect(stripe.checkout.sessions.expire(session.id)).rejects.toThrow(/open/);
      await expect(stripe.refunds.create({ payment_intent: "pi_x" })).rejects.toThrow(/not simulated locally/);
      expect(lines.filter(line => line.startsWith("[Paiement local]"))).toEqual([
        `[Paiement local] 100,00 EUR pour camille@example.com (APTLOCAL0001) : payer ou annuler sur ${session.url}`,
        "[Paiement local] APTLOCAL0001 payé ; évènement checkout.session.completed envoyé au site (réponse 200)",
      ]);
    } finally {
      doubles.close();
      site.close();
    }
  });
});
