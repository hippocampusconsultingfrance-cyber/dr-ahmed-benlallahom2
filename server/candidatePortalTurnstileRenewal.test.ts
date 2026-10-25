import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccessCopy, candidateNotice } from "../client/src/pages/CandidateAccessPage";
import { CandidateClient, TEST_PEPPER, freshCandidateDb } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const state = vi.hoisted(() => ({ db: null as unknown, usedTokens: new Set<string>() }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
// Like Cloudflare siteverify: a token is accepted once, then refused (timeout-or-duplicate).
vi.mock("./candidateTurnstile", () => ({
  verifyCandidateTurnstile: vi.fn(async ({ token }: { token: string }) => {
    if (state.usedTokens.has(token)) throw new Error("candidate_turnstile_invalid");
    state.usedTokens.add(token);
  }),
  candidateRequestIp: () => "203.0.113.30",
}));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendCandidatePortalAccessEmail: vi.fn(async () => ({ id: "email_test" })),
}));

const { candidatePortalRouter } = await import("./candidatePortalRouter");
type Api = ReturnType<typeof candidatePortalRouter.createCaller>;
const client = () => new CandidateClient<Api>(ctx => candidatePortalRouter.createCaller(ctx as Parameters<typeof candidatePortalRouter.createCaller>[0]), "203.0.113.30");

const languages = ["fr", "en", "de", "zh"] as const;
let tokenCount = 0;
const freshToken = () => `turnstile-token-${String(++tokenCount).padStart(8, "0")}`;

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) { return error as { code: string; message: string }; }
  throw new Error("the call was expected to fail");
}

beforeEach(() => {
  state.db = freshCandidateDb();
  state.usedTokens.clear();
});

describe("REC-03 — espace candidat : jeton anti-robot à usage unique et vrai motif affiché", () => {
  it("un nouvel essai avec le jeton déjà consommé est refusé et le motif est traduit, pas générique", async () => {
    const api = client().api;
    const token = freshToken();
    const registration = { email: "lina.cand@example.test", firstName: "Lina", lastName: "Cand", termsAccepted: true, documentConsent: true };
    await api.register({ ...registration, turnstileToken: token });

    const errors = [
      await failure(api.register({ ...registration, turnstileToken: token })),
      await failure(api.resendVerification({ email: registration.email, turnstileToken: token })),
      await failure(api.requestPasswordReset({ email: registration.email, turnstileToken: token })),
    ];
    for (const error of errors) {
      expect(error.code).toBe("BAD_REQUEST");
      for (const language of languages) {
        const copy = candidateAccessCopy[language];
        expect(candidateNotice(error.message, copy, error.code), `${language}: ${error.message}`).toBe(copy.turnstileError);
      }
    }
    // A fresh challenge (what the page now renders after every attempt) is accepted.
    await expect(api.resendVerification({ email: registration.email, turnstileToken: freshToken() })).resolves.toBeTruthy();
  });

  it("annonce une limite de tentatives atteinte au lieu d’une erreur générique", async () => {
    const api = client().api;
    const email = "lina.limite@example.test";
    let error: { code: string; message: string } | null = null;
    for (let attempt = 0; attempt < 10 && !error; attempt++) {
      try { await api.resendVerification({ email, turnstileToken: freshToken() }); } catch (caught) { error = caught as { code: string; message: string }; }
    }
    expect(error?.code).toBe("TOO_MANY_REQUESTS");
    for (const language of languages) {
      const copy = candidateAccessCopy[language];
      expect(candidateNotice(error!.message, copy, error!.code), language).toBe(copy.tooManyRequests);
      expect(copy.tooManyRequests).not.toBe(copy.genericError);
    }
  });
});
