import { createHash } from "node:crypto";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import superjson from "superjson";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { medicalQuestions, securityEvents } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { listen, validPdfBuffer } from "./testSupport/candidateUploadApp";

// CODE-10 — the anti-robot check and the rate limits of the public forms as a real server
// runs them: outside Vitest (NODE_ENV=production, VITEST=false, as appointments.bookingProtection
// does for the booking), with the real Turnstile check against a stand-in for Cloudflare and the
// persistent limits on an in-memory database, through the real HTTP routes. The contact and GDPR
// forms, the medical questions and /api/recruitment/apply: without a token, refused before
// anything is recorded; beyond the threshold, refused.

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { db: null as unknown, stored: [] as string[], nextId: 900 };
});

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notification")>(),
  notifyOwner: vi.fn(async () => true),
  // No acknowledgement leaves: the protections stand before it.
  getResendClient: () => undefined,
}));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://blob.test/${key}` })),
  storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`),
}));
vi.mock("./recruitmentProcessing", async importOriginal => ({ ...await importOriginal<typeof import("./recruitmentProcessing")>(), enqueueCvAnalysis: vi.fn(async () => undefined) }));
vi.mock("./googleDriveExport", async importOriginal => ({ ...await importOriginal<typeof import("./googleDriveExport")>(), enqueueCvGoogleDriveExport: vi.fn(async () => undefined) }));
vi.mock("./recruitmentProcessingWorker", async importOriginal => ({ ...await importOriginal<typeof import("./recruitmentProcessingWorker")>(), countWaitingCvAnalyses: vi.fn(async () => 0) }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async () => ({ data: { id: "email_1" }, error: null })) };
  },
}));

const { createApp } = await import("./_core/index");
const { PUBLIC_FORM_RATE_LIMITS } = await import("./routers");
const { PUBLIC_EMAIL_IP_RATE_LIMITS } = await import("./publicFormRateLimit");
const { notifyOwner } = await import("./_core/notification");
const { storagePut } = await import("./storage");
const { isCompromisedPassword } = await import("./candidateSecurity");
const { candidateAuthResponseFloorMs } = await import("./candidateAuth");

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const PWNED_RANGE = "https://api.pwnedpasswords.com/range/";
const TURNSTILE_SECRET = "turnstile-secret-for-the-protection-tests";
const ACCEPTED_TOKEN = "turnstile-token-cloudflare-accepts";
const REFUSED_TOKEN = "turnstile-token-cloudflare-refuses";

/** Cloudflare's siteverify and Have I Been Pwned, the only services these routes reach: stand-ins. */
const services = {
  siteverify: vi.fn(async (body: URLSearchParams) => Response.json(
    body.get("secret") === TURNSTILE_SECRET && body.get("response") === ACCEPTED_TOKEN
      ? { success: true, hostname: "drahmedbenlallahom.com" }
      : { success: false, "error-codes": ["invalid-input-response"] },
  )),
  pwnedRange: vi.fn(async (_prefix: string, _headers: Headers) => new Response("")),
};
const realFetch = globalThis.fetch;
/** Any other address these routes would reach, which no stand-in answers: each one fails its test. */
const unexpectedRequests: string[] = [];

const dialect = new PgDialect();
const db = () => state.db as InMemoryDrizzle;
const blocked = () => db().rows(securityEvents).filter(event => event.outcome === "blocked").map(event => event.category);

/** The contact, GDPR and application rows are written with a raw INSERT, which the in-memory stand-in does not parse: the table is recorded. */
function inMemoryDb() {
  return Object.assign(createInMemoryDrizzle(), {
    execute: vi.fn(async (query: SQL) => {
      state.stored.push(/INSERT INTO "?(\w+)/i.exec(dialect.sqlToQuery(query).sql)?.[1] ?? "unknown");
      return { rows: [{ id: (state.nextId += 1) }], rowCount: 1 };
    }),
  });
}

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });

beforeEach(() => {
  state.db = inMemoryDb();
  state.stored.length = 0;
  vi.clearAllMocks();
  // A real server: neither NODE_ENV=test nor Vitest's VITEST=true.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VITEST", "false");
  vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_SECRET);
  vi.stubEnv("RESEND_API_KEY", "re_test_public_forms_protection");
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === SITEVERIFY) return services.siteverify(init!.body as URLSearchParams);
    if (url.startsWith(PWNED_RANGE)) return services.pwnedRange(url.slice(PWNED_RANGE.length), new Headers(init?.headers));
    // Only the test's own requests to the app leave; any other outbound call fails the test.
    if (url.startsWith(`${baseUrl}/`)) return realFetch(input, init);
    unexpectedRequests.push(url);
    return Promise.reject(new Error(`unexpected outbound request: ${url}`));
  }));
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  expect(unexpectedRequests.splice(0), "unexpected outbound requests").toEqual([]);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type TrpcError = { message: string; data: { code: string; reason?: string } };

/** A tRPC mutation sent as the form sends it: one HTTP batch, superjson, from the visitor's connection. */
async function submit(procedure: string, input: Record<string, unknown>, ip: string) {
  const response = await fetch(`${baseUrl}/api/trpc/${procedure}?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ 0: superjson.serialize(input) }),
  });
  const [body] = await response.json() as Array<{ error?: { json: TrpcError } }>;
  return { status: response.status, error: body.error?.json ?? null };
}

const withToken = (input: Record<string, unknown>, token?: string) => (token === undefined ? input : { ...input, turnstileToken: token });
const contact = (email: string, token?: string) => withToken({ name: "Jeanne Martin", email, message: "Bonjour, je souhaite une information sur la consultation.", gdprConsent: 1 }, token);
const gdpr = (email: string, token?: string) => withToken({ name: "Jeanne Martin", email, requestType: "access", description: "Je souhaite accéder à mes données." }, token);
const question = (email: string, token?: string) => withToken({
  firstName: "Jeanne", lastName: "Martin", email, phone: "+33 6 12 34 56 78", language: "fr",
  question: "Puis-je garder mes lunettes jusqu’au bloc opératoire avant une anesthésie générale ?",
  privacyConsent: true, urgencyAcknowledged: true,
}, token);

/** /api/recruitment/apply as the standard form posts it. */
async function apply(email: string, ip: string, token?: string) {
  const form = new FormData();
  for (const [name, value] of Object.entries({ firstName: "Camille", lastName: "Martin", email, specialty: "Anesthésie-réanimation", diplomaCountry: "France", targetCountries: JSON.stringify(["Canada"]), languages: JSON.stringify(["Français"]), gdprConsent: "1" })) form.set(name, value);
  if (token !== undefined) form.set("turnstileToken", token);
  form.set("cv", new Blob([new Uint8Array(validPdfBuffer())], { type: "application/pdf" }), "cv.pdf");
  const response = await fetch(`${baseUrl}/api/recruitment/apply`, { method: "POST", body: form, headers: { "x-forwarded-for": ip } });
  return { status: response.status, body: await response.json() as { code?: string; error?: string } };
}

describe("hors de Vitest, sans jeton anti-robot ou avec un jeton que Cloudflare refuse, rien n’est enregistré (CODE-10)", () => {
  it.each([
    ["contact.submit", contact, "contact_messages", "public_contact_submit_turnstile"],
    ["gdpr.submit", gdpr, "gdpr_requests", "public_gdpr_submit_turnstile"],
  ] as const)("%s : refus 400 sans jeton, sans même joindre Cloudflare, puis pour un jeton refusé ; le jeton accepté passe", async (procedure, form, table, category) => {
    const ip = procedure === "contact.submit" ? "198.51.100.11" : "198.51.100.12";

    const withoutToken = await submit(procedure, form("visiteur@test.local"), ip);
    expect(withoutToken).toMatchObject({ status: 400, error: { data: { code: "BAD_REQUEST", reason: "security_check_failed" } } });
    expect(services.siteverify).not.toHaveBeenCalled();

    const refused = await submit(procedure, form("visiteur@test.local", REFUSED_TOKEN), ip);
    expect(refused).toMatchObject({ status: 400, error: { data: { code: "BAD_REQUEST", reason: "security_check_failed" } } });
    expect(services.siteverify).toHaveBeenCalledTimes(1);
    expect(state.stored).toEqual([]);
    expect(notifyOwner).not.toHaveBeenCalled();
    expect(blocked()).toEqual([category, category]);

    await expect(submit(procedure, form("visiteur@test.local", ACCEPTED_TOKEN), ip)).resolves.toEqual({ status: 200, error: null });
    expect(state.stored).toEqual([table]);
  });

  it("medicalQuestions.submit : refus sans jeton, puis pour un jeton refusé, sans enregistrer la question ; le jeton accepté passe", async () => {
    const ip = "198.51.100.13";

    const withoutToken = await submit("medicalQuestions.submit", question("patient@test.local"), ip);
    expect(withoutToken).toMatchObject({ status: 400, error: { data: { code: "BAD_REQUEST" } } });
    expect(services.siteverify).not.toHaveBeenCalled();

    const refused = await submit("medicalQuestions.submit", question("patient@test.local", REFUSED_TOKEN), ip);
    expect(refused).toMatchObject({ status: 400, error: { message: "La vérification de sécurité doit être renouvelée avant l’envoi.", data: { code: "BAD_REQUEST" } } });
    expect(services.siteverify).toHaveBeenCalledTimes(1);
    expect(db().rows(medicalQuestions)).toHaveLength(0);
    expect(notifyOwner).not.toHaveBeenCalled();

    await expect(submit("medicalQuestions.submit", question("patient@test.local", ACCEPTED_TOKEN), ip)).resolves.toEqual({ status: 200, error: null });
    expect(db().rows(medicalQuestions)).toHaveLength(1);
  });

  it("/api/recruitment/apply : refus sans jeton, puis pour un jeton refusé, sans déposer le CV ; le jeton accepté passe", async () => {
    const ip = "198.51.100.14";

    expect(await apply("camille@test.local", ip)).toMatchObject({ status: 400, body: { code: "recruitment_application_invalid" } });
    expect(services.siteverify).not.toHaveBeenCalled();

    expect(await apply("camille@test.local", ip, REFUSED_TOKEN)).toMatchObject({ status: 400, body: { code: "recruitment_security_check_required" } });
    expect(services.siteverify).toHaveBeenCalledTimes(1);
    expect(storagePut).not.toHaveBeenCalled();
    expect(state.stored).toEqual([]);

    expect((await apply("camille@test.local", ip, ACCEPTED_TOKEN)).status).toBe(201);
    expect(state.stored).toEqual(["cv_applications"]);
  });
});

describe("hors de Vitest, au-delà du seuil, la demande est refusée (CODE-10)", () => {
  it.each([
    ["contact.submit", contact, "198.51.100.21"],
    ["gdpr.submit", gdpr, "198.51.100.22"],
  ] as const)("%s : au-delà de la limite IP + email, refus 429 avec le motif rate_limited", async (procedure, form, ip) => {
    const { maxAttempts, action } = PUBLIC_FORM_RATE_LIMITS[procedure === "contact.submit" ? "contact" : "gdpr"];
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await expect(submit(procedure, form("meme-adresse@test.local", ACCEPTED_TOKEN), ip), `envoi ${attempt}`).resolves.toEqual({ status: 200, error: null });
    }

    const refused = await submit(procedure, form("meme-adresse@test.local", ACCEPTED_TOKEN), ip);

    expect(refused).toMatchObject({ status: 429, error: { data: { code: "TOO_MANY_REQUESTS", reason: "rate_limited" } } });
    expect(state.stored).toHaveLength(maxAttempts);
    expect(blocked()).toEqual([`${action}_rate_limit`]);
  });

  it("medicalQuestions.submit : au-delà de trois questions par jour pour la même adresse et la même connexion, refus", async () => {
    const ip = "198.51.100.23";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(submit("medicalQuestions.submit", question("patient@test.local", ACCEPTED_TOKEN), ip), `question ${attempt}`).resolves.toEqual({ status: 200, error: null });
    }

    const refused = await submit("medicalQuestions.submit", question("patient@test.local", ACCEPTED_TOKEN), ip);

    expect(refused).toMatchObject({ status: 400, error: { data: { code: "BAD_REQUEST" } } });
    // The limit stands before the anti-robot check: the fourth question is refused without reaching Cloudflare.
    expect(services.siteverify).toHaveBeenCalledTimes(3);
    expect(db().rows(medicalQuestions)).toHaveLength(3);
    expect(blocked()).toEqual(["public_medical_question_protection"]);
  });

  it("medicalQuestions.submit : au-delà de la limite par IP, refus 429 même en changeant d’adresse", async () => {
    const ip = "198.51.100.25";
    const { maxAttempts } = PUBLIC_EMAIL_IP_RATE_LIMITS.medicalQuestion;
    for (let index = 1; index <= maxAttempts; index += 1) {
      await expect(submit("medicalQuestions.submit", question(`patient${index}@test.local`, ACCEPTED_TOKEN), ip), `question ${index}`).resolves.toEqual({ status: 200, error: null });
    }

    const refused = await submit("medicalQuestions.submit", question("encore@test.local", ACCEPTED_TOKEN), ip);

    expect(refused).toMatchObject({ status: 429, error: { data: { code: "TOO_MANY_REQUESTS" } } });
    expect(db().rows(medicalQuestions)).toHaveLength(maxAttempts);
    expect(blocked()).toEqual(["public_medical_question_protection"]);
  });

  it("/api/recruitment/apply : au-delà de la limite par IP, refus avec le code recruitment_rate_limited, même en changeant d’adresse", async () => {
    const ip = "198.51.100.24";
    const { maxAttempts } = PUBLIC_EMAIL_IP_RATE_LIMITS.recruitmentApply;
    for (let index = 1; index <= maxAttempts; index += 1) {
      expect((await apply(`candidat${index}@test.local`, ip, ACCEPTED_TOKEN)).status, `candidature ${index}`).toBe(201);
    }

    expect(await apply("encore@test.local", ip, ACCEPTED_TOKEN)).toMatchObject({ status: 400, body: { code: "recruitment_rate_limited" } });
    expect(state.stored).toHaveLength(maxAttempts);
  });
});

describe("un NODE_ENV=test posé par erreur sur un serveur réel ne coupe aucune protection (CODE-10)", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "test"));

  it("la limite IP + email du contact reste appliquée", async () => {
    const { maxAttempts } = PUBLIC_FORM_RATE_LIMITS.contact;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) await submit("contact.submit", contact("meme-adresse@test.local", ACCEPTED_TOKEN), "198.51.100.31");

    await expect(submit("contact.submit", contact("meme-adresse@test.local", ACCEPTED_TOKEN), "198.51.100.31")).resolves.toMatchObject({ status: 429, error: { data: { reason: "rate_limited" } } });
  });

  it("le mot de passe d’un compte candidat est encore cherché parmi les mots de passe divulgués, et le délai minimal des réponses tenu", async () => {
    const password = "Mot-de-passe-divulgue-CODE-10";
    const digest = createHash("sha1").update(password).digest("hex").toUpperCase();
    services.pwnedRange.mockResolvedValueOnce(new Response(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${digest.slice(5)}:42\r\n`));

    await expect(isCompromisedPassword(password)).resolves.toBe(true);
    expect(services.pwnedRange).toHaveBeenCalledTimes(1);
    const [prefix, headers] = services.pwnedRange.mock.calls[0]!;
    // Only the first five characters of the digest leave, with the padding that hides the answer's size.
    expect(prefix).toBe(digest.slice(0, 5));
    expect(headers.get("add-padding")).toBe("true");
    expect(candidateAuthResponseFloorMs()).toBe(1200);
  });

  it("seul Vitest, qui pose VITEST=true, les coupe", async () => {
    vi.stubEnv("VITEST", "true");

    await expect(isCompromisedPassword("Mot-de-passe-sous-Vitest-CODE-10")).resolves.toBe(false);
    expect(services.pwnedRange).not.toHaveBeenCalled();
    expect(candidateAuthResponseFloorMs()).toBe(0);
  });
});
