import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { candidateAccounts, candidateSecurityRateLimits } from "../drizzle/schema";
import { hashCandidatePassword } from "./candidateAuth";
import type { InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { CandidateClient, TEST_PEPPER, accountByEmail, freshCandidateDb } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const state = vi.hoisted(() => ({ db: null as unknown, turnstile: vi.fn(async () => undefined) }));

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: state.turnstile, candidateRequestIp: () => "203.0.113.1" }));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendCandidatePortalAccessEmail: vi.fn(async () => ({ id: "email_test" })),
}));

const { candidatePortalRouter, CANDIDATE_LOGIN_POLICY } = await import("./candidatePortalRouter");
const { enforcePersistentRateLimit, recordPersistentRateLimitAttempt, hashSecurityValue } = await import("./candidateSecurity");
type Api = ReturnType<typeof candidatePortalRouter.createCaller>;
const client = (ip: string) => new CandidateClient<Api>(ctx => candidatePortalRouter.createCaller(ctx as Parameters<typeof candidatePortalRouter.createCaller>[0]), ip);

const email = "nadia.portal@example.test";
const password = "Nadia-Own-Strong-Password-2026";
const TURNSTILE = "turnstile-token-accepted-by-the-mock";
let storedHash = "";

function db() { return state.db as InMemoryDrizzle; }
function limiterRows(action: string) { return db().rows(candidateSecurityRateLimits).filter(row => row.action === action); }
async function outcome(promise: Promise<unknown>) {
  try { await promise; return "OK"; } catch (error) { return (error as { code?: string }).code ?? "ERROR"; }
}

beforeEach(async () => {
  state.db = freshCandidateDb();
  state.turnstile.mockReset();
  state.turnstile.mockResolvedValue(undefined);
  storedHash ||= await hashCandidatePassword(password);
  db().seed(candidateAccounts, { email, firstName: "Nadia", lastName: "Portal", passwordHash: storedHash, emailVerifiedAt: new Date(), termsAcceptedAt: new Date(), documentConsentAt: new Date() });
});
afterEach(() => { delete process.env.CANDIDATE_AUTH_RESPONSE_FLOOR_MS; });

describe("CAND-01 — compteurs de limitation atomiques", () => {
  it("ne perd aucune tentative sous 30 requêtes simultanées", async () => {
    const policy = { action: "test_parallel", subject: "203.0.113.5", maxAttempts: 5, windowMs: 60_000, blockMs: 60_000 };
    const results = await Promise.all(Array.from({ length: 30 }, () => outcome(enforcePersistentRateLimit(policy))));
    expect(results.filter(result => result === "OK")).toHaveLength(5);
    expect(limiterRows("test_parallel")).toHaveLength(1);
    expect(limiterRows("test_parallel")[0]).toMatchObject({ attemptCount: 6 });
  });

  it("lève un blocage créé sous un seuil plus strict quand la politique est assouplie", async () => {
    const strict = { action: "test_relaxed", subject: "subject", maxAttempts: 1, windowMs: 60_000, blockMs: 60_000 };
    await enforcePersistentRateLimit(strict);
    await expect(enforcePersistentRateLimit(strict)).rejects.toThrow("candidate_security_rate_limited");
    await expect(enforcePersistentRateLimit({ ...strict, maxAttempts: 10 })).resolves.toBeUndefined();
  });

  it("remet le compteur à zéro quand un blocage expiré est constaté (CAND-12)", async () => {
    db().seed(candidateSecurityRateLimits, { action: "test_expired", subjectHash: hashSecurityValue("subject"), windowStartedAt: new Date(Date.now() - 1000), attemptCount: 9, blockedUntil: new Date(Date.now() - 1), lastAttemptAt: new Date() });
    const state = await recordPersistentRateLimitAttempt({ action: "test_expired", subject: "subject", maxAttempts: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 });
    expect(state).toMatchObject({ attemptCount: 1, blocked: false, blockedUntil: null });
  });
});

describe("CAND-01 / SEC-06 / CAND-12 — connexion candidate", () => {
  it("ne vérifie que 5 mots de passe sous une salve parallèle depuis un même réseau, sans perdre d’échec", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => outcome(client("198.51.100.10").api.login({ email, password: "Wrong-Password-Attempt-0000" }))));
    expect(results.filter(result => result === "UNAUTHORIZED")).toHaveLength(5);
    expect(results.filter(result => result === "TOO_MANY_REQUESTS")).toHaveLength(25);
    expect(accountByEmail(db(), email)?.failedLoginCount).toBe(5);
  }, 30_000);

  it("un tiers ne bloque que son propre réseau : le candidat se connecte aussitôt depuis le sien", async () => {
    const attacker = client("198.51.100.20");
    for (let attempt = 0; attempt < 5; attempt += 1) await expect(attacker.api.login({ email, password: "Wrong-Password-Attempt-0000" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(attacker.api.login({ email, password })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(client("203.0.113.30").api.login({ email, password })).resolves.toEqual({ success: true });
    expect(accountByEmail(db(), email)).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
  }, 30_000);

  it("une seule erreur après l’expiration d’une pause ne la reconduit pas (CAND-12)", async () => {
    const device = client("203.0.113.40");
    for (let attempt = 0; attempt < 5; attempt += 1) await outcome(device.api.login({ email, password: "Wrong-Password-Attempt-0000" }));
    await expect(device.api.login({ email, password })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    for (const row of limiterRows(CANDIDATE_LOGIN_POLICY.emailNetwork.action)) row.blockedUntil = new Date(Date.now() - 1000);
    await expect(device.api.login({ email, password: "Wrong-Password-Attempt-0000" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(device.api.login({ email, password })).resolves.toEqual({ success: true });
  }, 30_000);

  it("après de nombreux échecs depuis plusieurs réseaux, exige la vérification anti-bot au lieu de verrouiller", async () => {
    for (let attempt = 0; attempt < CANDIDATE_LOGIN_POLICY.email.maxAttempts; attempt += 1) {
      await expect(client(`198.51.100.${100 + attempt}`).api.login({ email, password: "Wrong-Password-Attempt-0000" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    const candidate = client("203.0.113.50");
    await expect(candidate.api.login({ email, password })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    state.turnstile.mockRejectedValueOnce(new Error("candidate_turnstile_failed"));
    await expect(candidate.api.login({ email, password, turnstileToken: "invalid-turnstile-token-0000" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(candidate.api.login({ email, password, turnstileToken: TURNSTILE })).resolves.toEqual({ success: true });
    // The successful sign-in clears the email-wide counter.
    await expect(client("203.0.113.51").api.login({ email, password })).resolves.toEqual({ success: true });
  }, 60_000);

  it("répond de la même façon et en un temps comparable pour un email inconnu (SEC-05 / CAND-13)", async () => {
    const timed = async (target: string) => {
      const started = performance.now();
      const result = await outcome(client(`192.0.2.${Math.floor(Math.random() * 200) + 1}`).api.login({ email: target, password: "Wrong-Password-Attempt-0000" }));
      return { result, ms: performance.now() - started };
    };
    await timed("warm-up@example.test");
    const known = [await timed(email), await timed(email), await timed(email)];
    const unknown = [await timed("nobody@example.test"), await timed("nobody2@example.test"), await timed("nobody3@example.test")];
    expect(new Set([...known, ...unknown].map(item => item.result))).toEqual(new Set(["UNAUTHORIZED"]));
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[1];
    expect(median(unknown.map(item => item.ms))).toBeGreaterThan(median(known.map(item => item.ms)) * 0.5);
  }, 60_000);

  it("garde une durée minimale identique pour l’inscription d’un email déjà actif (SEC-05)", async () => {
    process.env.CANDIDATE_AUTH_RESPONSE_FLOOR_MS = "250";
    const started = performance.now();
    await client("203.0.113.60").api.register({ email, firstName: "Nadia", lastName: "Portal", termsAccepted: true, documentConsent: true, turnstileToken: TURNSTILE });
    expect(performance.now() - started).toBeGreaterThanOrEqual(245);
  });
});
