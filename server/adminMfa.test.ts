import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminMfaChallenges, adminMfaSessions } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  sentCodes: [] as string[],
  failNextEmail: false,
  securityEvents: [] as Array<Record<string, unknown>>,
  limits: new Map<string, { windowStartedAt: number; count: number; blockedUntil: number }>(),
}));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
// The limiter and the security journal have their own tests; a faithful JS
// stand-in keeps these MFA tests independent of their SQL implementation.
vi.mock("./candidateSecurity", () => ({
  requestIpHash: (headers: Record<string, unknown>) => typeof headers["x-forwarded-for"] === "string" ? `ip:${headers["x-forwarded-for"]}` : null,
  logSecurityEvent: vi.fn(async (event: Record<string, unknown>) => { state.securityEvents.push(event); }),
  enforcePersistentRateLimit: vi.fn(async (policy: { action: string; subject: string; maxAttempts: number; windowMs: number; blockMs: number }) => {
    const key = `${policy.action}:${policy.subject}`;
    const now = Date.now();
    const entry = state.limits.get(key);
    if (entry?.blockedUntil && entry.blockedUntil > now) throw new Error("candidate_security_rate_limited");
    const sameWindow = entry && now - entry.windowStartedAt < policy.windowMs;
    const next = { windowStartedAt: sameWindow ? entry!.windowStartedAt : now, count: sameWindow ? entry!.count + 1 : 1, blockedUntil: 0 };
    if (next.count > policy.maxAttempts) next.blockedUntil = now + policy.blockMs;
    state.limits.set(key, next);
    if (next.blockedUntil) throw new Error("candidate_security_rate_limited");
  }),
}));
vi.mock("./_core/notifications", () => ({
  sendAdminMfaCodeEmail: vi.fn(async (_email: string, code: string) => {
    if (state.failNextEmail) {
      state.failNextEmail = false;
      throw new Error("admin_mfa_email_failed:resend_down");
    }
    state.sentCodes.push(code);
  }),
}));

import { ADMIN_MFA_COOKIE, ADMIN_MFA_RATE_LIMITS, AdminMfaRateLimitError, isAdminMfaVerified, issueAdminMfaChallenge, revokeCurrentAdminMfaSession, verifyAdminMfaChallenge } from "./adminMfa";

const OPEN_ID = "user_owner";
let memory: MemoryPg;
let ipCounter = 0;

function request(ip: string, cookie?: string) {
  return { protocol: "https", headers: { "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) } as Record<string, unknown> };
}

function response() {
  const cookies = new Map<string, { value: string; options: Record<string, unknown> }>();
  const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
  return {
    cookies,
    cleared,
    cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.set(name, { value, options }),
    clearCookie: (name: string, options: Record<string, unknown>) => cleared.push({ name, options }),
  };
}

async function begin(ip: string) {
  await issueAdminMfaChallenge({ openId: OPEN_ID, email: "owner@test.local", req: request(ip) });
  return state.sentCodes.at(-1)!;
}

async function verify(code: string, ip: string) {
  const res = response();
  await verifyAdminMfaChallenge({ openId: OPEN_ID, code, req: request(ip), res });
  return res;
}

function wrongCode(code: string) {
  return code === "111111" ? "222222" : "111111";
}

describe("double authentification administrateur", () => {
  beforeEach(() => {
    memory = createMemoryPg([adminMfaChallenges, adminMfaSessions]);
    state.memory = memory;
    state.sentCodes = [];
    state.failNextEmail = false;
    state.securityEvents = [];
    state.limits.clear();
    ipCounter += 1;
  });

  it("deux envois : seul le code du dernier email fonctionne", async () => {
    const ip = `198.51.100.${ipCounter}`;
    const first = await begin(ip);
    const second = await begin(ip);
    if (first !== second) await expect(verify(first, ip)).rejects.toThrow("admin_mfa_code_invalid");
    const res = await verify(second, ip);
    expect(res.cookies.get(ADMIN_MFA_COOKIE)?.value).toBeTruthy();
    expect(memory.rows(adminMfaChallenges).filter(row => row.consumed_at === null)).toHaveLength(0);
  });

  it("après 5 erreurs, un nouveau code envoyé est accepté (le défi verrouillé ne masque plus le dernier)", async () => {
    const ip = `198.51.100.${ipCounter}`;
    const locked = await begin(ip);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(verify(wrongCode(locked), ip)).rejects.toThrow("admin_mfa_code_invalid");
    }
    expect(memory.rows(adminMfaChallenges)[0]!.attempts).toBe(5);
    await expect(verify(locked, ip)).rejects.toThrow("admin_mfa_code_invalid");

    const fresh = await begin(`203.0.113.${ipCounter}`);
    const res = await verify(fresh, `203.0.113.${ipCounter}`);
    expect(res.cookies.get(ADMIN_MFA_COOKIE)).toBeDefined();
  });

  it("un email non envoyé n’invalide pas le code déjà reçu", async () => {
    const ip = `198.51.100.${ipCounter}`;
    const received = await begin(ip);
    state.failNextEmail = true;
    await expect(begin(ip)).rejects.toThrow("admin_mfa_email_failed");
    const res = await verify(received, ip);
    expect(res.cookies.get(ADMIN_MFA_COOKIE)).toBeDefined();
  });

  it("un code ne peut ouvrir qu’une seule session", async () => {
    const ip = `198.51.100.${ipCounter}`;
    const code = await begin(ip);
    await verify(code, ip);
    await expect(verify(code, ip)).rejects.toThrow("admin_mfa_code_invalid");
    expect(memory.rows(adminMfaSessions)).toHaveLength(1);
  });

  it("limite l’envoi de codes à 5 par 15 minutes pour un compte et une IP", async () => {
    const ip = `198.51.100.${ipCounter}`;
    for (let index = 0; index < ADMIN_MFA_RATE_LIMITS.begin.maxAttempts; index += 1) await begin(ip);
    const sentBefore = state.sentCodes.length;
    await expect(issueAdminMfaChallenge({ openId: OPEN_ID, email: "owner@test.local", req: request(ip) })).rejects.toBeInstanceOf(AdminMfaRateLimitError);
    expect(state.sentCodes.length).toBe(sentBefore);
    expect(state.securityEvents.some(event => event.category === "admin_mfa_begin_rate_limited")).toBe(true);
  });

  it("limite les vérifications par compte et IP, même avec de nouveaux codes", async () => {
    const ip = `198.51.100.${ipCounter}`;
    let code = await begin(ip);
    for (let attempt = 0; attempt < ADMIN_MFA_RATE_LIMITS.verify.maxAttempts; attempt += 1) {
      if (attempt === 4) code = await begin(ip);
      await expect(verify(wrongCode(code), ip)).rejects.toThrow("admin_mfa_code_invalid");
    }
    await expect(verify(code, ip)).rejects.toBeInstanceOf(AdminMfaRateLimitError);
  });

  it("la déconnexion révoque la session MFA serveur et efface le cookie", async () => {
    const ip = `198.51.100.${ipCounter}`;
    const code = await begin(ip);
    const res = await verify(code, ip);
    const token = res.cookies.get(ADMIN_MFA_COOKIE)!.value;
    const cookie = `${ADMIN_MFA_COOKIE}=${token}`;
    expect(await isAdminMfaVerified(request(ip, cookie), OPEN_ID)).toBe(true);

    const logoutResponse = response();
    await expect(revokeCurrentAdminMfaSession({ req: request(ip, cookie), res: logoutResponse, openId: OPEN_ID })).resolves.toEqual({ revoked: 1 });
    expect(logoutResponse.cleared).toEqual([{ name: ADMIN_MFA_COOKIE, options: expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", path: "/" }) }]);
    expect(await isAdminMfaVerified(request(ip, cookie), OPEN_ID)).toBe(false);
    expect(memory.rows(adminMfaSessions)[0]!.revoked_at).not.toBeNull();
  });

  it("la déconnexion sans cookie efface quand même le cookie et ne touche pas la base", async () => {
    const res = response();
    await expect(revokeCurrentAdminMfaSession({ req: request("192.0.2.1"), res })).resolves.toEqual({ revoked: 0 });
    expect(res.cleared).toHaveLength(1);
    expect(memory.statements).toHaveLength(0);
  });
});
