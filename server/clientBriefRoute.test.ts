import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "./testSupport/candidateUploadApp";

type SentEmail = { to: string[]; replyTo: string; subject: string; html: string; text: string };

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return {
    insertedParams: [] as unknown[][],
    notifications: [] as Array<{ title: string; content: string; replyTo?: string }>,
    databaseAvailable: true,
    // Emails handed to Resend, which the tests never reach: a stand-in client answers.
    send: vi.fn(async (_message: SentEmail, _options?: { idempotencyKey?: string }): Promise<{ data: { id: string } | null; error: { name: string; message: string; statusCode: number } | null }> => ({ data: { id: "email_1" }, error: null })),
  };
});

// The route inserts with db.execute(sql`...`): keep the bound values to check what would be stored.
vi.mock("./db", async () => {
  const { PgDialect: Dialect } = await import("drizzle-orm/pg-core");
  const dialect = new Dialect();
  return {
    getDb: async () => state.databaseAvailable ? ({
      execute: async (query: SQL) => {
        state.insertedParams.push(dialect.sqlToQuery(query).params);
        return { rows: [] };
      },
    }) : null,
  };
});
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: vi.fn(async () => undefined),
  // Daily cap of the acknowledgements: under it unless a test says otherwise.
  recordPersistentRateLimitAttempt: vi.fn(async () => ({ attemptCount: 1, blockedUntil: null, blocked: false, newlyBlocked: false })),
  logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async (notification: { title: string; content: string; replyTo?: string }) => {
    state.notifications.push(notification);
    return true;
  }),
  getResendClient: () => ({ emails: { send: state.send } }),
}));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));

const { createApp } = await import("./_core/index");
const { enforcePersistentRateLimit, recordPersistentRateLimitAttempt } = await import("./candidateSecurity");

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const app = await createApp();
  const listening = await listen(app as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => {
  state.insertedParams.length = 0;
  state.notifications.length = 0;
  state.databaseAvailable = true;
  state.send.mockClear();
});

const brief = {
  organizationName: "Clinique Saint-Étienne",
  contactName: "Zoé Müller",
  email: "zoe.muller@example.test",
  targetEnvironment: "Bloc opératoire",
  specialtyNeeded: "Anesthésie-réanimation",
  country: "Côte d’Ivoire",
  notes: "Prise de poste « dès que possible » — 日本語 inclus.",
};

async function postBrief(body: string, contentType: string) {
  const response = await fetch(`${baseUrl}/api/client-briefs`, { method: "POST", headers: { "content-type": contentType }, body });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { json = { raw: text }; }
  return { status: response.status, body: json };
}

describe("POST /api/client-briefs — lecture des corps JSON et formulaire (body-parser, qs)", () => {
  it("enregistre un brief envoyé en JSON sans altérer les caractères accentués", async () => {
    const result = await postBrief(JSON.stringify(brief), "application/json; charset=utf-8");
    expect(result).toEqual({ status: 200, body: { success: true, briefId: expect.stringMatching(/^BRIEF/) } });
    expect(state.insertedParams).toHaveLength(1);
    expect(state.insertedParams[0]).toEqual(expect.arrayContaining(Object.values(brief)));
    expect(state.notifications).toEqual([expect.objectContaining({ title: expect.stringContaining("Clinique Saint-Étienne") })]);
    expect(state.notifications[0].content).toContain("Contact : Zoé Müller");
  });

  it("accepte le même brief envoyé en formulaire urlencoded", async () => {
    const result = await postBrief(new URLSearchParams(brief).toString(), "application/x-www-form-urlencoded");
    expect(result).toEqual({ status: 200, body: { success: true, briefId: expect.stringMatching(/^BRIEF/) } });
    expect(state.insertedParams[0]).toEqual(expect.arrayContaining(Object.values(brief)));
  });

  it("refuse un JSON mal formé et un corps de plus de 1 Mo sans rien enregistrer", async () => {
    expect((await postBrief("{\"organizationName\": ", "application/json")).status).toBe(400);
    const oversized = JSON.stringify({ ...brief, notes: "é".repeat(600 * 1024) });
    expect(Buffer.byteLength(oversized)).toBeGreaterThan(1024 * 1024);
    expect((await postBrief(oversized, "application/json")).status).toBe(413);
    const oversizedForm = new URLSearchParams({ ...brief, notes: "é".repeat(600 * 1024) }).toString();
    expect(Buffer.byteLength(oversizedForm)).toBeGreaterThan(1024 * 1024);
    expect((await postBrief(oversizedForm, "application/x-www-form-urlencoded")).status).toBe(413);
    expect(state.insertedParams).toEqual([]);
    expect(state.notifications).toEqual([]);
  });
});

describe("POST /api/client-briefs — accusé à l’employeur et refus traduisibles (REC-12, PUB-09)", () => {
  const sent = () => state.send.mock.calls.map(([message, options]) => ({ message, options }));

  it("fait répondre le cabinet à l’employeur et lui envoie un seul accusé, avec la référence, sans rien recopier de ce qu’il a écrit", async () => {
    const result = await postBrief(JSON.stringify({ ...brief, language: "en" }), "application/json");
    const briefId = String(result.body.briefId);

    expect(result.status).toBe(200);
    expect(state.notifications).toEqual([expect.objectContaining({ replyTo: brief.email })]);
    expect(sent()).toHaveLength(1);
    const [{ message, options }] = sent();
    expect(options).toEqual({ idempotencyKey: `ack-${briefId}` });
    expect(message.to).toEqual([brief.email]);
    expect(message.subject).toBe(`Your mission brief has been received — ${briefId}`);
    expect(message.text).toContain(`Reference: ${briefId}`);
    expect(message.text).toContain("Next steps");
    for (const part of [message.subject, message.html, message.text]) {
      for (const typed of [brief.organizationName, brief.contactName, brief.notes, brief.specialtyNeeded, "Zoé"]) expect(part).not.toContain(typed);
    }
  });

  it("écrit l’accusé en français sans langue indiquée ou pour une page en français", async () => {
    await postBrief(JSON.stringify(brief), "application/json");
    await postBrief(JSON.stringify({ ...brief, language: "fr" }), "application/json");
    expect(sent().map(({ message }) => message.subject.split(" — ")[0])).toEqual(["Votre brief de mission a bien été reçu", "Votre brief de mission a bien été reçu"]);
  });

  it("garde le brief et prévient le cabinet sans accusé au-delà du plafond quotidien des accusés", async () => {
    vi.mocked(recordPersistentRateLimitAttempt).mockResolvedValueOnce({ attemptCount: 51, blockedUntil: new Date(Date.now() + 60_000), blocked: true, newlyBlocked: true });
    const result = await postBrief(JSON.stringify(brief), "application/json");

    expect(result.status).toBe(200);
    expect(state.insertedParams).toHaveLength(1);
    expect(state.notifications).toHaveLength(1);
    expect(state.send).not.toHaveBeenCalled();
    expect(vi.mocked(recordPersistentRateLimitAttempt).mock.lastCall?.[0]).toMatchObject({ subject: "global", maxAttempts: 50 });
  });

  it("enregistre le brief même quand Resend refuse l’accusé ou ne répond pas", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.send.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "Invalid `to` field", statusCode: 422 } });
    expect((await postBrief(JSON.stringify(brief), "application/json")).status).toBe(200);
    state.send.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await postBrief(JSON.stringify(brief), "application/json")).status).toBe(200);

    expect(state.insertedParams).toHaveLength(2);
    expect(warn.mock.calls.flat().join(" ")).not.toContain(brief.email);
    warn.mockRestore();
  });

  it("renvoie un code stable pour la limite atteinte (429) et un service indisponible (503), sans rien enregistrer ni envoyer", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(enforcePersistentRateLimit).mockRejectedValueOnce(new Error("candidate_security_rate_limited"));
    expect(await postBrief(JSON.stringify(brief), "application/json")).toEqual({ status: 429, body: { error: expect.any(String), code: "rate_limited" } });
    vi.mocked(enforcePersistentRateLimit).mockRejectedValueOnce(new Error("relation does not exist"));
    expect(await postBrief(JSON.stringify(brief), "application/json")).toEqual({ status: 503, body: { error: expect.any(String), code: "service_unavailable" } });
    state.databaseAvailable = false;
    expect(await postBrief(JSON.stringify(brief), "application/json")).toEqual({ status: 503, body: { error: expect.any(String), code: "service_unavailable" } });

    expect(state.insertedParams).toEqual([]);
    expect(state.notifications).toEqual([]);
    expect(state.send).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
