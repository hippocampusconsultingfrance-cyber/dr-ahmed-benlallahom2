import { beforeEach, describe, expect, it, vi } from "vitest";
import { securityEvents } from "../drizzle/schema";
import { hashCandidateToken } from "./candidateAuth";
import { buildCandidatePortalAccessIdempotencyKey } from "./_core/notifications";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { CandidateClient, TEST_PEPPER, freshCandidateDb } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// Emails d’activation et de réinitialisation du portail candidat, envoyés par le
// vrai module de notifications : seul le transport Resend est simulé, pour
// accepter, refuser ou laisser sans réponse claire chaque envoi.

type Answer = "sent" | "refused" | "uncertain";
type SentEmail = { to: string; link: string; idempotencyKey: string };
const state = vi.hoisted(() => ({
  db: null as unknown,
  answers: [] as Array<"sent" | "refused" | "uncertain">,
  attempts: [] as Array<{ to: string; link: string; idempotencyKey: string }>,
  beforeAnswer: null as null | (() => Promise<void>),
}));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined), candidateRequestIp: () => "203.0.113.1" }));
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: {
      send: vi.fn(async (payload: { to: string[]; html: string }, options: { idempotencyKey: string }) => {
        const link = /href="(https:\/\/[^"]+\/candidate\/(?:verify|reset-password)\?[^"]+)"/.exec(payload.html)?.[1]?.replace(/&amp;/g, "&") ?? "";
        state.attempts.push({ to: payload.to[0]!, link, idempotencyKey: options.idempotencyKey });
        const before = state.beforeAnswer;
        state.beforeAnswer = null;
        await before?.();
        const answer = state.answers.shift() ?? "sent";
        if (answer === "uncertain") throw new Error("socket hang up");
        if (answer === "refused") return { data: null, error: { name: "validation_error", statusCode: 422, message: `Invalid \`to\` field: ${payload.to[0]}` }, headers: {} };
        return { data: { id: `email_${state.attempts.length}` }, error: null, headers: {} };
      }),
    },
  })),
}));

const { candidatePortalRouter } = await import("./candidatePortalRouter");
type Api = ReturnType<typeof candidatePortalRouter.createCaller>;
const client = (ip: string) => new CandidateClient<Api>(ctx => candidatePortalRouter.createCaller(ctx as Parameters<typeof candidatePortalRouter.createCaller>[0]), ip);

const TURNSTILE = "turnstile-token-accepted-by-the-mock";
const EMAIL = "camille.candidate@example.test";
const PASSWORD = "Camille-Own-Strong-Password-2026";

function db() { return state.db as InMemoryDrizzle; }
const register = (ip = "203.0.113.20") => client(ip).api.register({ email: EMAIL, firstName: "Camille", lastName: "Martin", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });
const requestReset = (ip = "203.0.113.21") => client(ip).api.requestPasswordReset({ email: EMAIL, turnstileToken: TURNSTILE });
const params = (email: SentEmail) => {
  const url = new URL(email.link);
  return { email: url.searchParams.get("email") ?? "", token: url.searchParams.get("token") ?? "" };
};
const lastAttempt = () => state.attempts.at(-1)!;
const deliveries = () => db().rows(securityEvents)
  .filter(event => String(event.category).endsWith("_delivery"))
  .map(event => ({ category: event.category, outcome: event.outcome, metadata: event.metadata ? JSON.parse(String(event.metadata)) : undefined }));

async function verifiedCandidate() {
  await register();
  const verifier = client("203.0.113.22");
  await verifier.api.verifyEmail({ ...params(lastAttempt()), password: PASSWORD });
  return verifier;
}

beforeEach(() => {
  state.db = freshCandidateDb();
  state.answers = [];
  state.attempts = [];
  state.beforeAnswer = null;
  vi.stubEnv("RESEND_API_KEY", "re_test_candidate_email_reliability");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("fiabilité des e-mails du portail candidat", () => {
  it("trace séparément les livraisons d’activation et de réinitialisation, avec l’identifiant Resend", async () => {
    await verifiedCandidate();
    await requestReset();
    state.answers = ["refused"];
    await requestReset();

    expect(deliveries()).toEqual([
      { category: "candidate_verification_delivery", outcome: "allowed", metadata: { providerMessageId: "email_1" } },
      { category: "candidate_password_reset_delivery", outcome: "allowed", metadata: { providerMessageId: "email_2" } },
      { category: "candidate_password_reset_delivery", outcome: "failed", metadata: undefined },
    ]);
  });

  it("ne journalise jamais l’objet d’erreur potentiellement sensible", async () => {
    state.answers = ["refused"];
    await register();
    await verifiedCandidateAfterRefusal();
    state.answers = ["refused"];
    await requestReset();

    const errors = vi.mocked(console.error).mock.calls;
    expect(errors).toEqual(expect.arrayContaining([
      ["candidate_verification_email_failed", "CandidatePortalAccessEmailError"],
      ["candidate_reset_email_failed", "CandidatePortalAccessEmailError"],
    ]));
    expect(JSON.stringify(errors)).not.toContain(EMAIL);
  });

  it("restaure le dernier lien d’activation valable uniquement après un refus explicite", async () => {
    await register();
    const first = params(lastAttempt());

    // Refused by Resend: the new link never left, the one already received keeps working.
    state.answers = ["refused"];
    await register();
    await expect(client("203.0.113.30").api.verifyEmail({ ...first, password: PASSWORD })).resolves.toEqual({ success: true });
  });

  it("garde le nouveau lien d’activation quand l’envoi reste incertain", async () => {
    await register();
    const first = params(lastAttempt());

    // No clear answer (twice): the email may have arrived, so its link is the valid one.
    state.answers = ["uncertain", "uncertain"];
    await register();
    const uncertain = params(lastAttempt());
    await expect(client("203.0.113.31").api.verifyEmail({ ...first, password: PASSWORD })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(client("203.0.113.32").api.verifyEmail({ ...uncertain, password: PASSWORD })).resolves.toEqual({ success: true });
  });

  it("ne remet pas un ancien lien d’activation à la place d’un lien plus récent", async () => {
    await register();
    // While Resend refuses the second link, a third registration sends its own
    // (its answer comes first: it is sent while the second one waits).
    state.answers = ["sent", "refused"];
    state.beforeAnswer = async () => { await register("203.0.113.33"); };
    await register();
    const newest = params(lastAttempt());

    await expect(client("203.0.113.34").api.verifyEmail({ ...newest, password: PASSWORD })).resolves.toEqual({ success: true });
  });

  it("restaure le lien de réinitialisation précédent uniquement après un refus explicite", async () => {
    await verifiedCandidate();
    await requestReset();
    const first = params(lastAttempt());
    state.answers = ["refused"];
    await requestReset();
    await expect(client("203.0.113.35").api.resetPassword({ ...first, password: `${PASSWORD}-new` })).resolves.toEqual({ success: true });

    await requestReset();
    const second = params(lastAttempt());
    state.answers = ["uncertain", "uncertain"];
    await requestReset();
    const uncertain = params(lastAttempt());
    await expect(client("203.0.113.36").api.resetPassword({ ...second, password: `${PASSWORD}-other` })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(client("203.0.113.37").api.resetPassword({ ...uncertain, password: `${PASSWORD}-other` })).resolves.toEqual({ success: true });
  });

  it("ne remet pas un ancien lien de réinitialisation à la place d’un lien plus récent", async () => {
    await verifiedCandidate();
    await requestReset();
    state.answers = ["sent", "refused"];
    state.beforeAnswer = async () => { await requestReset("203.0.113.38"); };
    await requestReset();
    const newest = params(lastAttempt());

    await expect(client("203.0.113.39").api.resetPassword({ ...newest, password: `${PASSWORD}-new` })).resolves.toEqual({ success: true });
  });

  it("utilise une clé d’idempotence liée au jeton pour les activations, les renvois et les réinitialisations", async () => {
    await register();
    const activation = lastAttempt();
    await client("203.0.113.40").api.resendVerification({ email: EMAIL, turnstileToken: TURNSTILE });
    const resent = lastAttempt();
    await client("203.0.113.41").api.verifyEmail({ ...params(resent), password: PASSWORD });
    await requestReset();
    const reset = lastAttempt();

    expect(activation.idempotencyKey).toBe(buildCandidatePortalAccessIdempotencyKey("verify", hashCandidateToken(params(activation).token, "verification")));
    expect(resent.idempotencyKey).toBe(buildCandidatePortalAccessIdempotencyKey("verify", hashCandidateToken(params(resent).token, "verification")));
    expect(reset.idempotencyKey).toBe(buildCandidatePortalAccessIdempotencyKey("reset", hashCandidateToken(params(reset).token, "reset")));
    expect(new Set([activation.idempotencyKey, resent.idempotencyKey, reset.idempotencyKey]).size).toBe(3);
  });
});

/** An activation whose first email was refused: the candidate asks again, and activates with the new link. */
async function verifiedCandidateAfterRefusal() {
  await client("203.0.113.23").api.resendVerification({ email: EMAIL, turnstileToken: TURNSTILE });
  await client("203.0.113.24").api.verifyEmail({ ...params(lastAttempt()), password: PASSWORD });
}
