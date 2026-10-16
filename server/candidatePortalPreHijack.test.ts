import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts, candidateSessions } from "../drizzle/schema";
import { createCandidateInvitationToken, hashCandidatePassword, hashCandidateToken } from "./candidateAuth";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { CandidateClient, TEST_PEPPER, accountByEmail, freshCandidateDb, linkParams, seedApplication, type CapturedCandidateEmail } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const state = vi.hoisted(() => ({ db: null as unknown, emails: [] as Array<{ to: string; kind: string; firstName: string; actionUrl: string }> }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined), candidateRequestIp: () => "203.0.113.1" }));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendCandidatePortalAccessEmail: vi.fn(async (input: { to: string; kind: string; firstName: string; actionUrl: string }) => {
    state.emails.push({ to: input.to, kind: input.kind, firstName: input.firstName, actionUrl: input.actionUrl });
    return { id: `email_${state.emails.length}` };
  }),
}));

const { candidatePortalRouter } = await import("./candidatePortalRouter");
type Api = ReturnType<typeof candidatePortalRouter.createCaller>;
const client = (ip: string) => new CandidateClient<Api>(ctx => candidatePortalRouter.createCaller(ctx as Parameters<typeof candidatePortalRouter.createCaller>[0]), ip);

const TURNSTILE = "turnstile-token-accepted-by-the-mock";
const victimEmail = "vera.victime@example.test";
const attackerPassword = "Attacker-Chosen-Password-2026";
const victimPassword = "Victim-Own-Strong-Password-2026";

function db() { return state.db as InMemoryDrizzle; }
function lastEmailTo(to: string): CapturedCandidateEmail {
  const email = [...state.emails].reverse().find(item => item.to === to);
  if (!email) throw new Error(`no email captured for ${to}`);
  return email;
}

beforeEach(() => {
  state.db = freshCandidateDb();
  state.emails.length = 0;
});

describe("SEC-02 / CAND-16 — pré-détournement d’un espace candidat", () => {
  it("rejoue le scénario exact de l’audit (prehijack2.mjs / t17-prehijack.mjs) : l’attaquant ne peut plus se connecter", async () => {
    // Written against the procedure shapes of both the vulnerable and the fixed
    // router (extra fields are dropped by zod), so it fails on the vulnerable
    // code at the attacker-login step and passes once the fix is in place.
    const application = seedApplication(db(), { email: victimEmail });
    const invitation = createCandidateInvitationToken(Number(application.id));
    await client("198.51.100.66").api.register({ email: victimEmail, password: attackerPassword, firstName: "Mallory", lastName: "Attaquant", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE } as never);
    const victim = client("203.0.113.51");
    await victim.api.register({ email: victimEmail, password: victimPassword, firstName: "Vera", lastName: "Victime", termsAccepted: true, documentConsent: true, invitationToken: invitation, turnstileToken: TURNSTILE } as never);
    const link = linkParams(lastEmailTo(victimEmail));
    await victim.api.verifyEmail({ email: link.email, token: link.token, password: victimPassword } as never);
    expect((await victim.api.me())?.linkedApplicationId).toBe(application.id);

    const attacker = client("198.51.100.67");
    await expect(attacker.api.login({ email: victimEmail, password: attackerPassword })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await attacker.api.me()).toBeNull();
    await expect(client("203.0.113.52").api.login({ email: victimEmail, password: victimPassword })).resolves.toEqual({ success: true });
  });

  it("rejoue l’attaque : le mot de passe d’un tiers inscrit avant la victime ne survit jamais à l’activation", async () => {
    const application = seedApplication(db(), { email: victimEmail });
    const invitation = createCandidateInvitationToken(Number(application.id));

    // 1. The attacker only knows the address and pre-registers it with his own password.
    const attacker = client("198.51.100.66");
    await attacker.api.register({ email: victimEmail, password: attackerPassword, firstName: "Mallory", lastName: "Attaquant", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE } as never);
    const attackerLink = linkParams(lastEmailTo(victimEmail));
    expect(accountByEmail(db(), victimEmail)?.passwordHash.startsWith("scrypt$")).toBe(false);
    await expect(client("198.51.100.70").api.login({ email: victimEmail, password: attackerPassword })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    // 2. The real candidate registers with her invitation.
    const victim = client("203.0.113.51");
    await victim.api.register({ email: victimEmail, firstName: "Vera", lastName: "Victime", termsAccepted: true, documentConsent: true, invitationToken: invitation, turnstileToken: TURNSTILE });
    const victimMail = lastEmailTo(victimEmail);
    expect(victimMail.firstName).toBe("Vera");
    const victimLink = linkParams(victimMail);

    // 2b. The older activation link is dead once a newer registration replaced it.
    await expect(client("198.51.100.71").api.verifyEmail({ email: attackerLink.email, token: attackerLink.token, password: attackerPassword })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // 3. The candidate proves ownership of the mailbox and chooses her password in the same step.
    await victim.api.verifyEmail({ email: victimLink.email, token: victimLink.token, password: victimPassword });
    expect((await victim.api.me())?.email).toBe(victimEmail);
    expect(accountByEmail(db(), victimEmail)?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(accountByEmail(db(), victimEmail)?.linkedApplicationId).toBe(application.id);

    // 4. Her own password works; the attacker's password does not.
    await expect(client("203.0.113.52").api.login({ email: victimEmail, password: victimPassword })).resolves.toEqual({ success: true });
    await expect(client("198.51.100.67").api.login({ email: victimEmail, password: attackerPassword })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await attacker.api.me()).toBeNull();

    // 5. The activation link is single use.
    await expect(client("198.51.100.72").api.verifyEmail({ email: victimLink.email, token: victimLink.token, password: attackerPassword })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(client("198.51.100.73").api.login({ email: victimEmail, password: attackerPassword })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("neutralise un compte en attente créé avant le correctif avec un mot de passe et une session inconnus", async () => {
    // Legacy row: an unverified account whose password was chosen by whoever registered first.
    const legacy = db().seed(candidateAccounts, {
      email: victimEmail,
      firstName: "Mallory",
      lastName: "Attaquant",
      passwordHash: await hashCandidatePassword(attackerPassword),
      termsAcceptedAt: new Date(),
      documentConsentAt: new Date(),
    });
    const legacyToken = "legacy-session-token-for-an-unverified-account";
    db().seed(candidateSessions, { candidateId: legacy.id, tokenHash: hashCandidateToken(legacyToken, "session"), expiresAt: new Date(Date.now() + 3_600_000) });
    const legacyClient = client("198.51.100.80");
    legacyClient.cookie = legacyToken;
    // A session attached to an account whose email was never verified never authenticates.
    expect(await legacyClient.api.me()).toBeNull();

    const victim = client("203.0.113.60");
    await victim.api.register({ email: victimEmail, firstName: "Vera", lastName: "Victime", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });
    const account = accountByEmail(db(), victimEmail)!;
    expect(account.passwordHash.startsWith("scrypt$")).toBe(false);
    expect(account.firstName).toBe("Vera");
    expect(db().rows(candidateSessions).every(session => session.revokedAt instanceof Date)).toBe(true);

    const link = linkParams(lastEmailTo(victimEmail));
    await victim.api.verifyEmail({ email: link.email, token: link.token, password: victimPassword });
    await expect(client("198.51.100.81").api.login({ email: victimEmail, password: attackerPassword })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(client("203.0.113.61").api.login({ email: victimEmail, password: victimPassword })).resolves.toEqual({ success: true });
    expect(await legacyClient.api.me()).toBeNull();
  });

  it("révoque à l’activation toute session existante du compte", async () => {
    const victim = client("203.0.113.70");
    await victim.api.register({ email: victimEmail, firstName: "Vera", lastName: "Victime", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });
    const account = accountByEmail(db(), victimEmail)!;
    db().seed(candidateSessions, { candidateId: account.id, tokenHash: hashCandidateToken("pre-existing-session-token-value", "session"), expiresAt: new Date(Date.now() + 3_600_000) });
    const link = linkParams(lastEmailTo(victimEmail));
    await victim.api.verifyEmail({ email: link.email, token: link.token, password: victimPassword });
    const sessions = db().rows(candidateSessions);
    expect(sessions.filter(session => session.revokedAt === null)).toHaveLength(1);
    expect(sessions.find(session => session.tokenHash === hashCandidateToken("pre-existing-session-token-value", "session"))?.revokedAt).toBeInstanceOf(Date);
  });

  it("refuse un mot de passe trop court à l’activation sans consommer le lien", async () => {
    const victim = client("203.0.113.75");
    await victim.api.register({ email: victimEmail, firstName: "Vera", lastName: "Victime", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });
    const link = linkParams(lastEmailTo(victimEmail));
    await expect(victim.api.verifyEmail({ email: link.email, token: link.token, password: "trop-court" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(victim.api.activationDetails({ email: link.email, token: link.token })).resolves.toMatchObject({ firstName: "Vera", lastName: "Victime" });
    await victim.api.verifyEmail({ email: link.email, token: link.token, password: victimPassword });
    await expect(victim.api.activationDetails({ email: link.email, token: link.token })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("ne modifie jamais un compte déjà activé lors d’une nouvelle inscription", async () => {
    const victim = client("203.0.113.80");
    await victim.api.register({ email: victimEmail, firstName: "Vera", lastName: "Victime", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });
    const link = linkParams(lastEmailTo(victimEmail));
    await victim.api.verifyEmail({ email: link.email, token: link.token, password: victimPassword });
    const before = { ...accountByEmail(db(), victimEmail)! };
    const emailsBefore = state.emails.length;

    await client("198.51.100.90").api.register({ email: victimEmail, firstName: "Mallory", lastName: "Attaquant", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });
    expect(accountByEmail(db(), victimEmail)).toEqual(before);
    expect(state.emails.length).toBe(emailsBefore);
  });
});
