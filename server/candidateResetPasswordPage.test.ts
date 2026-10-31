import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { candidateSessions } from "../drizzle/schema";
import { candidateAccountCopy, candidateAccountNotice } from "../client/src/pages/candidateAccountCopy";
import { PublicErrorReason } from "./_core/trpc";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { CandidateClient, TEST_PEPPER, accountByEmail, freshCandidateDb, linkParams, type CapturedCandidateEmail } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const BREACHED_PASSWORD = "Password-Found-In-A-Breach-2026";
const state = vi.hoisted(() => ({ db: null as unknown, emails: [] as Array<{ to: string; kind: string; firstName: string; actionUrl: string }> }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined), candidateRequestIp: () => "203.0.113.1" }));
// The breach check is answered locally (no request to the breach service).
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  isCompromisedPassword: vi.fn(async (password: string) => password === "Password-Found-In-A-Breach-2026"),
}));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendCandidatePortalAccessEmail: vi.fn(async (input: { to: string; kind: string; firstName: string; actionUrl: string }) => {
    state.emails.push({ to: input.to, kind: input.kind, firstName: input.firstName, actionUrl: input.actionUrl });
    return { id: `email_${state.emails.length}` };
  }),
}));

const { candidatePortalRouter } = await import("./candidatePortalRouter");
type Api = ReturnType<typeof candidatePortalRouter.createCaller>;
const client = () => new CandidateClient<Api>(ctx => candidatePortalRouter.createCaller(ctx as Parameters<typeof candidatePortalRouter.createCaller>[0]), "203.0.113.60");

const EMAIL = "reset.candidate@example.test";
const OLD_PASSWORD = "Reset-Candidate-Old-Password-2026";
const NEW_PASSWORD = "Reset-Candidate-New-Password-2026";
const TURNSTILE = "turnstile-token-accepted-by-the-mock";

function db() { return state.db as InMemoryDrizzle; }
const lastLink = () => linkParams(state.emails.at(-1)! as CapturedCandidateEmail);

async function reasonOf(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(TRPCError);
  const cause = (error as TRPCError).cause;
  return cause instanceof PublicErrorReason ? cause.reason : null;
}

/** A verified candidate, signed in on one device, who then asks for a reset link. */
async function candidateWithResetLink() {
  const device = client();
  await device.api.register({ email: EMAIL, firstName: "Rania", lastName: "Haddad", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });
  await device.api.verifyEmail({ ...lastLink(), password: OLD_PASSWORD });
  await client().api.requestPasswordReset({ email: EMAIL, turnstileToken: TURNSTILE });
  const { email, token } = lastLink();
  return { device, link: { email, token } };
}

beforeEach(() => {
  state.db = freshCandidateDb();
  state.emails.length = 0;
});

describe("parcours de réinitialisation candidat", () => {
  it("affiche la cause sûre retournée par le serveur au lieu d’un échec générique, traduite d’après son motif (EN-06)", () => {
    const compromised = { message: "Ce mot de passe a déjà été compromis. Choisissez-en un autre, long et unique.", data: { reason: "candidate_password_compromised" } };
    expect(candidateAccountNotice(compromised, candidateAccountCopy.en, "en")).toBe(candidateAccountCopy.en.passwordCompromised);
    expect(candidateAccountNotice(compromised, candidateAccountCopy.zh, "zh")).toBe(candidateAccountCopy.zh.passwordCompromised);
    expect(candidateAccountNotice({ message: "Ce lien de réinitialisation est invalide ou expiré.", data: { reason: "candidate_reset_link_invalid" } }, candidateAccountCopy.de, "de")).toBe(candidateAccountCopy.de.invalidDescription);
    // Without a known reason, the French page keeps the server's safe message; other languages never show French.
    expect(candidateAccountNotice({ message: "Le service candidat est temporairement indisponible.", data: null }, candidateAccountCopy.fr, "fr")).toBe("Le service candidat est temporairement indisponible.");
    expect(candidateAccountNotice({ message: "Le service candidat est temporairement indisponible.", data: null }, candidateAccountCopy.en, "en")).toBe(candidateAccountCopy.en.genericError);
    expect(candidateAccountNotice({ message: "" }, candidateAccountCopy.fr, "fr")).toBe(candidateAccountCopy.fr.genericError);
  });

  it("refuse un mot de passe compromis sans consommer le lien, puis change le mot de passe et ferme les autres sessions", async () => {
    const { device, link } = await candidateWithResetLink();

    await expect(reasonOf(client().api.resetPassword({ ...link, password: BREACHED_PASSWORD }))).resolves.toBe("candidate_password_compromised");
    await expect(reasonOf(client().api.resetPassword({ ...link, token: `${link.token.slice(0, -1)}x`, password: NEW_PASSWORD }))).resolves.toBe("candidate_reset_link_invalid");

    const resetter = client();
    await expect(resetter.api.resetPassword({ ...link, password: NEW_PASSWORD })).resolves.toEqual({ success: true });
    expect(resetter.cookie).toBeTruthy();
    // The link works once, and the device signed in before the reset is signed out.
    await expect(reasonOf(client().api.resetPassword({ ...link, password: `${NEW_PASSWORD}-again` }))).resolves.toBe("candidate_reset_link_invalid");
    await expect(device.api.sessions()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db().rows(candidateSessions).filter(row => !row.revokedAt)).toHaveLength(1);
    await expect(reasonOf(client().api.login({ email: EMAIL, password: OLD_PASSWORD }))).resolves.toBe("candidate_credentials_invalid");
    await expect(client().api.login({ email: EMAIL, password: NEW_PASSWORD })).resolves.toMatchObject({ success: true });
  });

  it("refuse un lien expiré", async () => {
    const { link } = await candidateWithResetLink();
    accountByEmail(db(), EMAIL)!.passwordResetExpiresAt = new Date(Date.now() - 1000);

    await expect(reasonOf(client().api.resetPassword({ ...link, password: NEW_PASSWORD }))).resolves.toBe("candidate_reset_link_invalid");
    await expect(client().api.login({ email: EMAIL, password: OLD_PASSWORD })).resolves.toMatchObject({ success: true });
  });

  it("refuse le lien d’un compte désactivé depuis la demande", async () => {
    const { link } = await candidateWithResetLink();
    accountByEmail(db(), EMAIL)!.status = "disabled";

    await expect(reasonOf(client().api.resetPassword({ ...link, password: NEW_PASSWORD }))).resolves.toBe("candidate_reset_link_invalid");
    expect(db().rows(candidateSessions).filter(row => !row.revokedAt)).toHaveLength(1);
  });
});
