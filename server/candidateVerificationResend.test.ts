import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { candidateAccounts, securityEvents } from "../drizzle/schema";
import { PublicErrorReason } from "./_core/trpc";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { CandidateClient, TEST_PEPPER, accountByEmail, freshCandidateDb } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// Nouveau lien d’activation demandé depuis l’espace candidat : même réponse
// quel que soit le compte, limites par adresse et IP, contrôle anti-bot, trace
// de sécurité, et retour au lien précédent seulement si Resend refuse
// clairement le nouveau message. Seul le transport Resend est simulé.

const state = vi.hoisted(() => ({
  db: null as unknown,
  turnstileAccepted: true,
  answers: [] as Array<"sent" | "refused" | "uncertain">,
  attempts: [] as Array<{ to: string; link: string }>,
  beforeAnswer: null as null | (() => Promise<void>),
}));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({
  verifyCandidateTurnstile: vi.fn(async () => { if (!state.turnstileAccepted) throw new Error("turnstile_rejected"); }),
  candidateRequestIp: () => "203.0.113.1",
}));
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: {
      send: vi.fn(async (payload: { to: string[]; html: string }) => {
        const link = /href="(https:\/\/[^"]+\/candidate\/verify\?[^"]+)"/.exec(payload.html)?.[1]?.replace(/&amp;/g, "&") ?? "";
        state.attempts.push({ to: payload.to[0]!, link });
        const before = state.beforeAnswer;
        state.beforeAnswer = null;
        await before?.();
        const answer = state.answers.shift() ?? "sent";
        if (answer === "uncertain") throw new Error("socket hang up");
        if (answer === "refused") return { data: null, error: { name: "validation_error", statusCode: 422, message: "Invalid `to` field" }, headers: {} };
        return { data: { id: `email_${state.attempts.length}` }, error: null, headers: {} };
      }),
    },
  })),
}));

const { candidatePortalRouter } = await import("./candidatePortalRouter");
type Api = ReturnType<typeof candidatePortalRouter.createCaller>;
const client = (ip: string) => new CandidateClient<Api>(ctx => candidatePortalRouter.createCaller(ctx as Parameters<typeof candidatePortalRouter.createCaller>[0]), ip);

const TURNSTILE = "turnstile-token-accepted-by-the-mock";
const PASSWORD = "Camille-Own-Strong-Password-2026";
let nextIp = 100;
const freshIp = () => `198.51.100.${nextIp++}`;

function db() { return state.db as InMemoryDrizzle; }
const register = (email: string) => client(freshIp()).api.register({ email, firstName: "Camille", lastName: "Martin", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });
const resend = (email: string, ip = freshIp()) => client(ip).api.resendVerification({ email, turnstileToken: TURNSTILE });
const linkOf = (attempt: { link: string }) => {
  const url = new URL(attempt.link);
  return { email: url.searchParams.get("email") ?? "", token: url.searchParams.get("token") ?? "" };
};
const activate = (link: { email: string; token: string }) => client(freshIp()).api.verifyEmail({ ...link, password: PASSWORD });
const events = (category: string) => db().rows(securityEvents).filter(event => event.category === category)
  .map(event => ({ outcome: event.outcome, actorReference: event.actorReference, metadata: event.metadata ? JSON.parse(String(event.metadata)) : undefined }));

async function reasonOf(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(TRPCError);
  const cause = (error as TRPCError).cause;
  return { code: (error as TRPCError).code, reason: cause instanceof PublicErrorReason ? cause.reason : null };
}

beforeEach(() => {
  state.db = freshCandidateDb();
  state.turnstileAccepted = true;
  state.answers = [];
  state.attempts = [];
  state.beforeAnswer = null;
  vi.stubEnv("RESEND_API_KEY", "re_test_candidate_verification_resend");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("reprise de l’activation du compte candidat", () => {
  it("répond pareil pour tous et n’envoie un lien qu’à un compte actif non vérifié", async () => {
    await register("pending@example.test");
    await register("verified@example.test");
    await activate(linkOf(state.attempts.at(-1)!));
    await register("disabled@example.test");
    accountByEmail(db(), "disabled@example.test")!.status = "disabled";
    state.attempts = [];

    const answers = [
      await resend("nobody@example.test"),
      await resend("verified@example.test"),
      await resend("disabled@example.test"),
      await resend("Pending@Example.test"),
    ];

    expect(new Set(answers.map(answer => JSON.stringify(answer))).size).toBe(1);
    expect(answers[0]).toEqual({ message: expect.any(String) });
    expect(state.attempts.map(attempt => attempt.to)).toEqual(["pending@example.test"]);
    await expect(activate(linkOf(state.attempts[0]!))).resolves.toEqual({ success: true });
  });

  it("construit les liens d’activation sur l’origine publique du site, jamais sur l’hôte de la requête", async () => {
    vi.stubEnv("PUBLIC_APP_ORIGIN", "");
    const forged = () => candidatePortalRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: { host: "evil.example", origin: "https://evil.example", "x-forwarded-host": "evil.example", "x-forwarded-for": freshIp() } },
      res: { cookie: () => undefined, clearCookie: () => undefined },
    } as never);

    await forged().register({ email: "pending@example.test", firstName: "Camille", lastName: "Martin", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });
    await forged().resendVerification({ email: "pending@example.test", turnstileToken: TURNSTILE });

    expect(state.attempts.map(attempt => new URL(attempt.link).origin)).toEqual(["https://drahmedbenlallahom.com", "https://drahmedbenlallahom.com"]);
  });

  it("garde une trace de sécurité de chaque nouveau lien envoyé", async () => {
    await register("pending@example.test");
    await resend("pending@example.test");

    expect(events("candidate_verification_resent")).toEqual([
      { outcome: "allowed", actorReference: String(accountByEmail(db(), "pending@example.test")!.id), metadata: undefined },
    ]);
  });

  it("limite les demandes par adresse et IP, puis par IP", async () => {
    await register("pending@example.test");
    const ip = "198.51.100.10";
    for (let attempt = 0; attempt < 4; attempt += 1) await resend("pending@example.test", ip);

    await expect(reasonOf(resend("pending@example.test", ip))).resolves.toEqual({ code: "TOO_MANY_REQUESTS", reason: "candidate_rate_limited" });
    expect(events("candidate_verification_resend_rate_limited").map(event => event.outcome)).toEqual(["blocked"]);
    // The same address from another network is not blocked by this pair.
    await expect(resend("pending@example.test")).resolves.toEqual({ message: expect.any(String) });

    // MAIL-01: five requests per IP and per hour, whatever the addresses.
    const sharedIp = "198.51.100.11";
    for (let index = 0; index < 5; index += 1) await resend(`someone${index}@example.test`, sharedIp);
    await expect(reasonOf(resend("someone-else@example.test", sharedIp))).resolves.toEqual({ code: "TOO_MANY_REQUESTS", reason: "candidate_rate_limited" });
  });

  it("exige une vérification anti-bot valide avant tout envoi", async () => {
    await register("pending@example.test");
    const first = linkOf(state.attempts.at(-1)!);
    state.attempts = [];
    state.turnstileAccepted = false;

    await expect(reasonOf(resend("pending@example.test"))).resolves.toEqual({ code: "BAD_REQUEST", reason: "candidate_security_check_required" });

    expect(state.attempts).toEqual([]);
    expect(events("candidate_verification_resend_turnstile").map(event => event.outcome)).toEqual(["blocked"]);
    await expect(activate(first)).resolves.toEqual({ success: true });
  });

  it("restaure le lien précédent uniquement si Resend refuse explicitement le nouveau message", async () => {
    await register("pending@example.test");
    const first = linkOf(state.attempts.at(-1)!);

    state.answers = ["refused"];
    await expect(resend("pending@example.test")).resolves.toEqual({ message: expect.any(String) });

    expect(events("candidate_verification_resent")).toEqual([expect.objectContaining({ outcome: "failed" })]);
    await expect(activate(first)).resolves.toEqual({ success: true });
  });

  it("garde le nouveau lien quand l’envoi reste incertain", async () => {
    await register("pending@example.test");
    const first = linkOf(state.attempts.at(-1)!);

    // No clear answer (the send is tried twice): the email may have arrived.
    state.answers = ["uncertain", "uncertain"];
    await resend("pending@example.test");
    const uncertain = linkOf(state.attempts.at(-1)!);

    expect(events("candidate_verification_resent")).toEqual([expect.objectContaining({ outcome: "allowed", metadata: { deliveryStatus: "unknown" } })]);
    await expect(activate(first)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(activate(uncertain)).resolves.toEqual({ success: true });
  });

  it("ne remet pas un ancien lien à la place d’un lien plus récent", async () => {
    await register("pending@example.test");
    // While Resend refuses this request's link, a second request sends its own.
    state.answers = ["sent", "refused"];
    state.beforeAnswer = async () => { await resend("pending@example.test"); };
    await resend("pending@example.test");
    const newest = linkOf(state.attempts.at(-1)!);

    expect(accountByEmail(db(), "pending@example.test")!.verificationTokenHash).not.toBeNull();
    await expect(activate(newest)).resolves.toEqual({ success: true });
    expect(db().rows(candidateAccounts).filter(row => row.emailVerifiedAt)).toHaveLength(1);
  });
});
