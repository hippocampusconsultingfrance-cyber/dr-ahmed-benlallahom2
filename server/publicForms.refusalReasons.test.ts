import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import superjson from "superjson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { securityEvents } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";

// ABUS-01 — un message de contact ou une demande RGPD refusé porte un motif
// stable jusqu'au navigateur : la limite par connexion atteinte (429), un
// anti-robot refusé (400, et non plus une erreur interne 500), ou que
// Cloudflare n'a pas pu juger (503). Le formulaire affiche alors son propre
// texte traduit au lieu du message d'échec générique.

const state = vi.hoisted(() => ({ db: null as unknown, stored: [] as string[] }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined) }));

const { appRouter, PUBLIC_FORM_RATE_LIMITS, PUBLIC_FORM_SECURITY_CHECK_FAILED_MESSAGE, PUBLIC_FORM_SECURITY_CHECK_UNAVAILABLE_MESSAGE } = await import("./routers");
const { PUBLIC_EMAIL_IP_RATE_LIMITS } = await import("./publicFormRateLimit");
const { verifyCandidateTurnstile } = await import("./candidateTurnstile");
const { notifyOwner } = await import("./_core/notification");

const dialect = new PgDialect();
const TURNSTILE_TOKEN = "turnstile-token-checked-by-the-mock";

/** Contact and GDPR rows are written with a raw INSERT, which the in-memory stand-in does not parse: record the table. */
function inMemoryDbWithRawInserts() {
  return Object.assign(createInMemoryDrizzle(), {
    execute: vi.fn(async (query: SQL) => {
      state.stored.push(/INSERT INTO (\w+)/.exec(dialect.sqlToQuery(query).sql)?.[1] ?? "unknown");
      return { rows: [], rowCount: 1 };
    }),
  });
}

const forms = {
  contact: (email: string) => ({ name: "Jeanne Martin", email, message: "Bonjour, je souhaite une information sur la consultation.", gdprConsent: 1, turnstileToken: TURNSTILE_TOKEN }),
  gdpr: (email: string) => ({ name: "Jeanne Martin", email, requestType: "access", description: "Je souhaite accéder à mes données.", turnstileToken: TURNSTILE_TOKEN }),
} as const;
type FormKind = keyof typeof forms;

type ErrorBody = { message: string; data: { code: string; httpStatus: number; reason?: string } };

/** Vraie requête tRPC (batch HTTP, superjson, errorFormatter), comme celle du formulaire. */
async function post(kind: FormKind, input: Record<string, unknown>, req: { headers: Record<string, string>; ip: string }) {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req: new Request(`http://localhost/api/trpc/${kind}.submit?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 0: superjson.serialize(input) }),
    }),
    createContext: (): TrpcContext => ({
      user: null,
      req: { protocol: "https", ...req } as unknown as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    }),
  });
  const [body] = await response.json() as Array<{ error?: { json: ErrorBody }; result?: unknown }>;
  return { status: response.status, error: body.error?.json ?? null };
}

const submit = (kind: FormKind, email: string, ip: string) => post(kind, forms[kind](email), { headers: { "x-forwarded-for": ip }, ip });

const db = () => state.db as InMemoryDrizzle;
const blockedCategories = () => db().rows(securityEvents).filter(event => event.outcome === "blocked").map(event => event.category);
const failedCategories = () => db().rows(securityEvents).filter(event => event.outcome === "failed").map(event => event.category);

/** The real Turnstile check, against a stubbed Cloudflare siteverify. */
async function realTurnstileCheck(siteverify: () => Promise<Response>) {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret-for-tests");
  vi.stubGlobal("fetch", vi.fn(siteverify));
  const actual = await vi.importActual<typeof import("./candidateTurnstile")>("./candidateTurnstile");
  vi.mocked(verifyCandidateTurnstile).mockImplementation(actual.verifyCandidateTurnstile);
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.db = inMemoryDbWithRawInserts();
  state.stored.length = 0;
  vi.mocked(notifyOwner).mockClear();
  vi.mocked(verifyCandidateTurnstile).mockReset().mockResolvedValue(undefined);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
});

describe("contact et RGPD — motif de la limite par connexion (ABUS-01)", () => {
  it.each([
    ["contact", "198.51.100.81", "public_contact_submit_ip_rate_limit"],
    ["gdpr", "198.51.100.82", "public_gdpr_submit_ip_rate_limit"],
  ] as const)("%s : au-delà de la limite par IP, renvoie 429 avec le motif rate_limited", async (kind, ip, category) => {
    const { maxAttempts } = PUBLIC_EMAIL_IP_RATE_LIMITS[kind];
    for (let index = 1; index <= maxAttempts; index += 1) {
      await expect(submit(kind, `visiteur${index}@test.local`, ip)).resolves.toEqual({ status: 200, error: null });
    }

    const refused = await submit(kind, "encore@test.local", ip);

    expect(refused.status).toBe(429);
    expect(refused.error).toMatchObject({ message: "Veuillez patienter avant de soumettre une nouvelle demande.", data: { code: "TOO_MANY_REQUESTS", reason: "rate_limited" } });
    expect(state.stored).toHaveLength(maxAttempts);
    expect(blockedCategories()).toEqual([category]);
  });

  it.each(["contact", "gdpr"] as const)("%s : la limite IP + email, active hors tests, porte le même motif", async kind => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");
    const { maxAttempts } = PUBLIC_FORM_RATE_LIMITS[kind];
    for (let index = 1; index <= maxAttempts; index += 1) {
      await expect(submit(kind, "meme-adresse@test.local", "198.51.100.83")).resolves.toEqual({ status: 200, error: null });
    }

    const refused = await submit(kind, "meme-adresse@test.local", "198.51.100.83");

    expect(refused.status).toBe(429);
    expect(refused.error?.data).toMatchObject({ code: "TOO_MANY_REQUESTS", reason: "rate_limited" });
    expect(blockedCategories()).toEqual([`${PUBLIC_FORM_RATE_LIMITS[kind].action}_rate_limit`]);
  });
});

describe("contact et RGPD — anti-robot refusé (ABUS-01)", () => {
  it.each([
    ["contact", "public_contact_submit_turnstile"],
    ["gdpr", "public_gdpr_submit_turnstile"],
  ] as const)("%s : renvoie 400 avec le motif security_check_failed, sans rien enregistrer ni prévenir le cabinet", async (kind, category) => {
    vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(new Error("candidate_turnstile_invalid"));

    const refused = await submit(kind, "robot@test.local", "198.51.100.84");

    expect(refused.status).toBe(400);
    expect(refused.error).toMatchObject({ message: PUBLIC_FORM_SECURITY_CHECK_FAILED_MESSAGE, data: { code: "BAD_REQUEST", reason: "security_check_failed" } });
    expect(refused.error?.message).not.toContain("réf.");
    expect(state.stored).toEqual([]);
    expect(notifyOwner).not.toHaveBeenCalled();
    expect(blockedCategories()).toEqual([category]);
    // Not an unexpected error: nothing is logged as an internal error with a reference.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["contact", "198.51.100.85"],
    ["gdpr", "198.51.100.86"],
  ] as const)("%s : des jetons refusés n’entament pas le budget de la limite par IP", async (kind, ip) => {
    const { maxAttempts } = PUBLIC_EMAIL_IP_RATE_LIMITS[kind];
    for (let index = 1; index <= maxAttempts + 2; index += 1) {
      vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(new Error("candidate_turnstile_invalid"));
      await expect(submit(kind, `robot${index}@test.local`, ip)).resolves.toMatchObject({ status: 400, error: { data: { reason: "security_check_failed" } } });
    }

    for (let index = 1; index <= maxAttempts; index += 1) {
      await expect(submit(kind, `visiteur${index}@test.local`, ip)).resolves.toEqual({ status: 200, error: null });
    }
    await expect(submit(kind, "encore@test.local", ip)).resolves.toMatchObject({ status: 429, error: { data: { reason: "rate_limited" } } });
  });

  it("refuse aussi une demande sans jeton, avec le même motif", async () => {
    vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(new Error("candidate_turnstile_required"));
    const { turnstileToken: _omitted, ...withoutToken } = forms.contact("sans-jeton@test.local");

    const refused = await post("contact", withoutToken, { headers: {}, ip: "198.51.100.87" });

    expect(refused.status).toBe(400);
    expect(refused.error?.data).toMatchObject({ code: "BAD_REQUEST", reason: "security_check_failed" });
    expect(verifyCandidateTurnstile).toHaveBeenCalledWith({ token: "", remoteIp: "198.51.100.87" });
  });
});

describe("contact et RGPD — anti-robot indisponible chez Cloudflare (ABUS-01)", () => {
  it.each([
    ["contact", "siteverify injoignable", () => Promise.reject(new TypeError("fetch failed"))],
    ["gdpr", "siteverify injoignable", () => Promise.reject(new TypeError("fetch failed"))],
    ["contact", "siteverify en erreur HTTP", async () => new Response("Service Unavailable", { status: 503 })],
    ["gdpr", "erreur interne de Cloudflare", async () => Response.json({ success: false, "error-codes": ["internal-error"] })],
  ] as const)("%s, %s : renvoie 503 avec le motif security_check_unavailable, sans rien enregistrer ni prévenir le cabinet", async (kind, _case, siteverify) => {
    await realTurnstileCheck(siteverify);

    const refused = await submit(kind, "visiteur@test.local", "198.51.100.88");

    expect(refused.status).toBe(503);
    expect(refused.error).toMatchObject({ message: PUBLIC_FORM_SECURITY_CHECK_UNAVAILABLE_MESSAGE, data: { code: "SERVICE_UNAVAILABLE", reason: "security_check_unavailable" } });
    expect(refused.error?.message).not.toContain("Rechargez");
    expect(state.stored).toEqual([]);
    expect(notifyOwner).not.toHaveBeenCalled();
    // Logged apart from refused tokens, as a failure rather than a block.
    expect(failedCategories()).toEqual([`${PUBLIC_FORM_RATE_LIMITS[kind].action}_turnstile_unavailable`]);
    expect(blockedCategories()).toEqual([]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("un secret Turnstile absent côté serveur n’est pas imputé au visiteur", async () => {
    await realTurnstileCheck(async () => Response.json({ success: true }));
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");

    await expect(submit("contact", "visiteur@test.local", "198.51.100.89")).resolves.toMatchObject({ status: 503, error: { data: { reason: "security_check_unavailable" } } });
  });

  it("un jeton que Cloudflare juge invalide reste un refus 400 qui demande de recharger la page", async () => {
    await realTurnstileCheck(async () => Response.json({ success: false, "error-codes": ["invalid-input-response"] }));

    await expect(submit("gdpr", "robot@test.local", "198.51.100.90")).resolves.toMatchObject({ status: 400, error: { message: PUBLIC_FORM_SECURITY_CHECK_FAILED_MESSAGE, data: { reason: "security_check_failed" } } });
    expect(blockedCategories()).toEqual(["public_gdpr_submit_turnstile"]);
  });

  it("Cloudflare de retour, l’envoi passe", async () => {
    await realTurnstileCheck(async () => Response.json({ success: true, hostname: "drahmedbenlallahom.com" }));

    await expect(submit("contact", "visiteur@test.local", "198.51.100.91")).resolves.toEqual({ status: 200, error: null });
    expect(state.stored).toEqual(["contact_messages"]);
  });

  it("sur une préproduction Vercel, l’envoi passe une fois son hôte déclaré dans TURNSTILE_EXTRA_HOSTNAMES (SECU-02)", async () => {
    await realTurnstileCheck(async () => Response.json({ success: true, hostname: "dr-ahmed-git-main-equipe.vercel.app" }));
    // Whatever the machine running the tests has in VERCEL_ENV.
    vi.stubEnv("VERCEL_ENV", "preview");

    await expect(submit("contact", "testeur@test.local", "198.51.100.94")).resolves.toMatchObject({ status: 400, error: { data: { reason: "security_check_failed" } } });
    vi.stubEnv("TURNSTILE_EXTRA_HOSTNAMES", "dr-ahmed-git-main-equipe.vercel.app");
    await expect(submit("contact", "testeur@test.local", "198.51.100.94")).resolves.toEqual({ status: 200, error: null });
    await expect(submit("gdpr", "testeur@test.local", "198.51.100.94")).resolves.toEqual({ status: 200, error: null });
    expect(state.stored).toEqual(["contact_messages", "gdpr_requests"]);
  });

  it("en production Vercel, le même hôte déclaré par erreur dans TURNSTILE_EXTRA_HOSTNAMES reste refusé (SECU-02)", async () => {
    await realTurnstileCheck(async () => Response.json({ success: true, hostname: "dr-ahmed-git-main-equipe.vercel.app" }));
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("TURNSTILE_EXTRA_HOSTNAMES", "dr-ahmed-git-main-equipe.vercel.app");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(submit("contact", "testeur@test.local", "198.51.100.95")).resolves.toMatchObject({ status: 400, error: { message: PUBLIC_FORM_SECURITY_CHECK_FAILED_MESSAGE, data: { reason: "security_check_failed" } } });
    await expect(submit("gdpr", "testeur@test.local", "198.51.100.95")).resolves.toMatchObject({ status: 400, error: { message: PUBLIC_FORM_SECURITY_CHECK_FAILED_MESSAGE, data: { reason: "security_check_failed" } } });
    warn.mockRestore();
    expect(state.stored).toEqual([]);
    expect(notifyOwner).not.toHaveBeenCalled();
    expect(blockedCategories()).toEqual(["public_contact_submit_turnstile", "public_gdpr_submit_turnstile"]);
  });
});

describe("contact et RGPD — limite IP + email comptée après l’anti-robot (ABUS-01)", () => {
  it.each([
    ["contact", "198.51.100.92"],
    ["gdpr", "198.51.100.93"],
  ] as const)("%s : des jetons refusés ou que Cloudflare n’a pas pu juger n’entament pas la limite IP + email", async (kind, ip) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");
    const { maxAttempts } = PUBLIC_FORM_RATE_LIMITS[kind];
    for (let index = 1; index <= maxAttempts + 2; index += 1) {
      vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(new Error("candidate_turnstile_invalid"));
      await expect(submit(kind, "meme-adresse@test.local", ip)).resolves.toMatchObject({ status: 400, error: { data: { reason: "security_check_failed" } } });
      vi.mocked(verifyCandidateTurnstile).mockRejectedValueOnce(new Error("candidate_turnstile_unavailable"));
      await expect(submit(kind, "meme-adresse@test.local", ip)).resolves.toMatchObject({ status: 503, error: { data: { reason: "security_check_unavailable" } } });
    }

    // The visitor's own messages still get their whole budget.
    for (let index = 1; index <= maxAttempts; index += 1) {
      await expect(submit(kind, "meme-adresse@test.local", ip)).resolves.toEqual({ status: 200, error: null });
    }
    await expect(submit(kind, "meme-adresse@test.local", ip)).resolves.toMatchObject({ status: 429, error: { data: { reason: "rate_limited" } } });
    expect(state.stored).toHaveLength(maxAttempts);
  });
});
