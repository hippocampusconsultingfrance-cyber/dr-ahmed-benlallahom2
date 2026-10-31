import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { candidateAccounts, cvApplications } from "../drizzle/schema";
import { createCandidateInvitationToken } from "./candidateAuth";
import { PublicErrorReason } from "./_core/trpc";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { CandidateClient, TEST_PEPPER, accountByEmail, freshCandidateDb, linkParams, seedApplication } from "./testSupport/candidatePortal";

// EN-02 — langue du compte candidat (recopiée de l’invitation, sinon celle de
// la page) et langue des emails d’accès (celle de la page qui les demande).
// EN-06 — refus de l’espace candidat accompagnés d’un motif stable.

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

type CapturedEmail = { to: string; kind: string; firstName: string; actionUrl: string; language?: string };
const state = vi.hoisted(() => ({ db: null as unknown, emails: [] as CapturedEmail[] }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined), candidateRequestIp: () => "203.0.113.1" }));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  isCompromisedPassword: vi.fn(async (password: string) => password === "Password-Found-In-A-Breach-2026"),
}));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendCandidatePortalAccessEmail: vi.fn(async (input: CapturedEmail) => {
    state.emails.push({ to: input.to, kind: input.kind, firstName: input.firstName, actionUrl: input.actionUrl, language: input.language });
    return { id: `email_${state.emails.length}` };
  }),
}));

const { candidatePortalRouter } = await import("./candidatePortalRouter");
type Api = ReturnType<typeof candidatePortalRouter.createCaller>;
const client = () => new CandidateClient<Api>(ctx => candidatePortalRouter.createCaller(ctx as Parameters<typeof candidatePortalRouter.createCaller>[0]), "203.0.113.30");
const TURNSTILE = "turnstile-token-accepted-by-the-mock";

function db() { return state.db as InMemoryDrizzle; }
function registration(email: string, extra: Record<string, unknown> = {}) {
  return { email, firstName: "Aisha", lastName: "Rahman", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE, ...extra } as Parameters<Api["register"]>[0];
}
function englishApplication(email: string) {
  const application = seedApplication(db(), { email, firstName: "Aisha", lastName: "Rahman" });
  db().rows(cvApplications).find(row => row.id === application.id)!.language = "en";
  return application;
}
async function reasonOf(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(TRPCError);
  const cause = (error as TRPCError).cause;
  return cause instanceof PublicErrorReason ? cause.reason : null;
}

beforeEach(() => {
  state.db = freshCandidateDb();
  state.emails.length = 0;
});

describe("langue du compte candidat et des emails d’accès (EN-02)", () => {
  it("recopie la langue de la candidature invitée et écrit l’activation dans la langue de la page", async () => {
    const application = englishApplication("aisha@example.test");
    const invitationToken = createCandidateInvitationToken(Number(application.id));

    await client().api.register(registration("aisha@example.test", { invitationToken, language: "en" }));
    expect(accountByEmail(db(), "aisha@example.test")?.language).toBe("en");
    expect(state.emails.at(-1)).toMatchObject({ kind: "verify", language: "en" });
  });

  it("garde la langue de l’invitation quand une ancienne page n’envoie pas de langue", async () => {
    const application = englishApplication("old-client@example.test");
    await client().api.register(registration("old-client@example.test", { invitationToken: createCandidateInvitationToken(Number(application.id)) }));
    expect(accountByEmail(db(), "old-client@example.test")?.language).toBe("en");
    expect(state.emails.at(-1)?.language).toBe("en");
  });

  it("sans invitation, enregistre la langue de la page ; le chinois et l’allemand reçoivent l’anglais", async () => {
    await client().api.register(registration("li@example.test", { language: "zh" }));
    expect(accountByEmail(db(), "li@example.test")?.language).toBe("zh");
    expect(state.emails.at(-1)?.language).toBe("en");

    await client().api.register(registration("camille@example.test"));
    expect(accountByEmail(db(), "camille@example.test")?.language).toBe("fr");
    expect(state.emails.at(-1)?.language).toBe("fr");
  });

  it("renvoi d’activation et réinitialisation : langue de la page, sinon celle du compte", async () => {
    await client().api.register(registration("pending@example.test", { language: "en" }));
    await client().api.resendVerification({ email: "pending@example.test", turnstileToken: TURNSTILE, language: "de" });
    expect(state.emails.at(-1)).toMatchObject({ kind: "verify", language: "en" });
    await client().api.resendVerification({ email: "pending@example.test", turnstileToken: TURNSTILE, language: "fr" });
    expect(state.emails.at(-1)?.language).toBe("fr");

    db().seed(candidateAccounts, { email: "verified@example.test", firstName: "Aisha", passwordHash: "unused", emailVerifiedAt: new Date(), language: "en" });
    await client().api.requestPasswordReset({ email: "verified@example.test", turnstileToken: TURNSTILE });
    expect(state.emails.at(-1)).toMatchObject({ kind: "reset", language: "en" });
    await client().api.requestPasswordReset({ email: "verified@example.test", turnstileToken: TURNSTILE, language: "fr" });
    expect(state.emails.at(-1)).toMatchObject({ kind: "reset", language: "fr" });
  });
});

describe("refus de l’espace candidat avec un motif stable (EN-06)", () => {
  it("motive le refus d’une invitation falsifiée ou destinée à une autre adresse", async () => {
    const application = englishApplication("owner@example.test");
    const token = createCandidateInvitationToken(Number(application.id));
    await expect(reasonOf(client().api.register(registration("owner@example.test", { invitationToken: `${token}x` })))).resolves.toBe("candidate_invitation_invalid");
    await expect(reasonOf(client().api.register(registration("someone-else@example.test", { invitationToken: token })))).resolves.toBe("candidate_invitation_email_mismatch");
  });

  it("motive les refus de mot de passe et de lien à l’activation, sans consommer le lien", async () => {
    await client().api.register(registration("activate@example.test"));
    const link = linkParams(state.emails.at(-1)! as Parameters<typeof linkParams>[0]);
    await expect(reasonOf(client().api.verifyEmail({ ...link, password: "too-short" }))).resolves.toBe("candidate_password_too_short");
    await expect(reasonOf(client().api.verifyEmail({ ...link, password: "Password-Found-In-A-Breach-2026" }))).resolves.toBe("candidate_password_compromised");
    await expect(reasonOf(client().api.verifyEmail({ ...link, token: "x".repeat(40), password: "A-Long-Unique-Password-2026" }))).resolves.toBe("candidate_activation_link_invalid");
    await expect(client().api.verifyEmail({ ...link, password: "A-Long-Unique-Password-2026" })).resolves.toEqual({ success: true });
  });

  it("motive un mauvais mot de passe à la connexion et un lien de réinitialisation invalide", async () => {
    await expect(reasonOf(client().api.login({ email: "nobody@example.test", password: "Some-Password-Long-2026" }))).resolves.toBe("candidate_credentials_invalid");
    await expect(reasonOf(client().api.resetPassword({ email: "nobody@example.test", token: "y".repeat(40), password: "A-Long-Unique-Password-2026" }))).resolves.toBe("candidate_reset_link_invalid");
  });
});
