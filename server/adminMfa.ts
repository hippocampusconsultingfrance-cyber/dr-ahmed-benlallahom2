import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { adminMfaChallenges, adminMfaSessions } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { enforcePersistentRateLimit, logSecurityEvent, requestIpHash } from "./candidateSecurity";
import { sendAdminMfaCodeEmail } from "./_core/notifications";

export const ADMIN_MFA_COOKIE = "admin_mfa_session";
const MFA_MAX_AGE_SECONDS = 8 * 60 * 60;
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const ADMIN_MFA_MAX_ATTEMPTS_PER_CHALLENGE = 5;

/**
 * Persistent limits, counted per administrator account + client IP. A code
 * request sends an email, so it is capped more tightly than verification.
 */
export const ADMIN_MFA_RATE_LIMITS = {
  begin: { action: "admin_mfa_begin", maxAttempts: 5, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  verify: { action: "admin_mfa_verify", maxAttempts: 10, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
} as const;

export class AdminMfaRateLimitError extends Error {
  constructor(readonly kind: keyof typeof ADMIN_MFA_RATE_LIMITS) {
    super("admin_mfa_rate_limited");
  }
}

function mfaPepper() {
  const pepper = process.env.CANDIDATE_AUTH_PEPPER || process.env.JWT_SECRET;
  if (!pepper) throw new Error("admin_mfa_pepper_unavailable");
  return pepper;
}

function hashMfa(value: string, purpose: string) {
  return createHash("sha256").update(`${purpose}:${value}:${mfaPepper()}`).digest("hex");
}

export function secureMfaHashEquals(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function cookieValue(source: string | undefined, name: string) {
  return source?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

function isSecureRequest(req: { protocol?: string; headers: Record<string, unknown> }) {
  return req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
}

export function adminMfaCookieOptions(req: { protocol?: string; headers: Record<string, unknown> }) {
  return { httpOnly: true, secure: isSecureRequest(req), sameSite: "lax" as const, path: "/", maxAge: MFA_MAX_AGE_SECONDS * 1000 };
}

async function enforceAdminMfaRateLimit(kind: keyof typeof ADMIN_MFA_RATE_LIMITS, openId: string, headers: Record<string, unknown>) {
  const policy = ADMIN_MFA_RATE_LIMITS[kind];
  const ipHash = requestIpHash(headers);
  try {
    await enforcePersistentRateLimit({ ...policy, subject: `${openId}:${ipHash ?? "unknown"}` });
  } catch (error) {
    if (error instanceof Error && error.message === "candidate_security_rate_limited") {
      await logSecurityEvent({ actorKind: "admin", actorReference: openId, category: `${policy.action}_rate_limited`, outcome: "blocked", severity: "warning", ipHash }).catch(() => undefined);
      throw new AdminMfaRateLimitError(kind);
    }
    throw error;
  }
}

export async function isAdminMfaVerified(req: { headers: Record<string, unknown> }, openId: string) {
  const token = cookieValue(typeof req.headers.cookie === "string" ? req.headers.cookie : undefined, ADMIN_MFA_COOKIE);
  if (!token) return false;
  const db = await getDb();
  if (!db) return false;
  const active = await db.select({ id: adminMfaSessions.id }).from(adminMfaSessions).where(and(eq(adminMfaSessions.openId, openId), eq(adminMfaSessions.tokenHash, hashMfa(token, "session")), gt(adminMfaSessions.expiresAt, new Date()), isNull(adminMfaSessions.revokedAt))).limit(1);
  return Boolean(active[0]);
}

/**
 * Sends a new code. Only the most recent code is usable: once the email is
 * accepted, every older open challenge of this administrator is closed. If the
 * email cannot be sent, the new challenge is closed instead, so a code already
 * received keeps working.
 */
export async function issueAdminMfaChallenge(input: { openId: string; email: string; req: { headers: Record<string, unknown> } }) {
  const db = await getDb();
  if (!db) throw new Error("admin_mfa_database_unavailable");
  await enforceAdminMfaRateLimit("begin", input.openId, input.req.headers);
  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MFA_CHALLENGE_TTL_MS);
  const [created] = await db.insert(adminMfaChallenges).values({ openId: input.openId, codeHash: hashMfa(code, "code"), expiresAt }).returning({ id: adminMfaChallenges.id });
  if (!created) throw new Error("admin_mfa_challenge_not_created");
  try {
    await sendAdminMfaCodeEmail(input.email, code);
  } catch (error) {
    await db.update(adminMfaChallenges).set({ consumedAt: new Date() }).where(eq(adminMfaChallenges.id, created.id));
    await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_challenge_email_failed", outcome: "failed", severity: "warning", ipHash: requestIpHash(input.req.headers) });
    throw error;
  }
  await db.update(adminMfaChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(adminMfaChallenges.openId, input.openId), isNull(adminMfaChallenges.consumedAt), lt(adminMfaChallenges.id, created.id)));
  await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_challenge_issued", outcome: "allowed", ipHash: requestIpHash(input.req.headers) });
}

export async function verifyAdminMfaChallenge(input: { openId: string; code: string; req: { headers: Record<string, unknown> }; res: { cookie: Function } }) {
  const db = await getDb();
  if (!db) throw new Error("admin_mfa_database_unavailable");
  await enforceAdminMfaRateLimit("verify", input.openId, input.req.headers);
  // The newest open challenge that still has attempts left. A locked older
  // challenge must never shadow the code of the latest email.
  const challenge = (await db.select().from(adminMfaChallenges).where(and(
    eq(adminMfaChallenges.openId, input.openId),
    isNull(adminMfaChallenges.consumedAt),
    gt(adminMfaChallenges.expiresAt, new Date()),
    lt(adminMfaChallenges.attempts, ADMIN_MFA_MAX_ATTEMPTS_PER_CHALLENGE),
  )).orderBy(desc(adminMfaChallenges.createdAt), desc(adminMfaChallenges.id)).limit(1))[0];
  const failed = async () => {
    await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_verify", outcome: "failed", severity: "high", ipHash: requestIpHash(input.req.headers) });
    throw new Error("admin_mfa_code_invalid");
  };
  if (!challenge || !secureMfaHashEquals(challenge.codeHash, hashMfa(input.code, "code"))) {
    if (challenge) {
      await db.update(adminMfaChallenges)
        .set({ attempts: sql`${adminMfaChallenges.attempts} + 1` })
        .where(and(eq(adminMfaChallenges.id, challenge.id), lt(adminMfaChallenges.attempts, ADMIN_MFA_MAX_ATTEMPTS_PER_CHALLENGE), isNull(adminMfaChallenges.consumedAt)));
    }
    return failed();
  }
  const consumed = await db.update(adminMfaChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(adminMfaChallenges.id, challenge.id), lt(adminMfaChallenges.attempts, ADMIN_MFA_MAX_ATTEMPTS_PER_CHALLENGE), isNull(adminMfaChallenges.consumedAt)));
  // A concurrent request already used (or invalidated) this code.
  if (mutationRowCount(consumed) !== 1) return failed();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MFA_MAX_AGE_SECONDS * 1000);
  await db.insert(adminMfaSessions).values({ openId: input.openId, tokenHash: hashMfa(token, "session"), expiresAt });
  input.res.cookie(ADMIN_MFA_COOKIE, token, adminMfaCookieOptions(input.req));
  await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_verify", outcome: "allowed", ipHash: requestIpHash(input.req.headers) });
}

/**
 * Ends the MFA proof carried by this browser: the server row is revoked (so a
 * copied cookie stops working) and the cookie is cleared with the options it
 * was issued with. Safe to call without a cookie or without a database.
 */
export async function revokeCurrentAdminMfaSession(input: {
  req: { protocol?: string; headers: Record<string, unknown> };
  res: { clearCookie?: Function };
  openId?: string | null;
}) {
  const token = cookieValue(typeof input.req.headers.cookie === "string" ? input.req.headers.cookie : undefined, ADMIN_MFA_COOKIE);
  const { maxAge: _maxAge, ...cookieOptions } = adminMfaCookieOptions(input.req);
  input.res.clearCookie?.(ADMIN_MFA_COOKIE, cookieOptions);
  if (!token) return { revoked: 0 };
  const db = await getDb();
  if (!db) return { revoked: 0 };
  const result = await db.update(adminMfaSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminMfaSessions.tokenHash, hashMfa(token, "session")), isNull(adminMfaSessions.revokedAt)));
  const revoked = mutationRowCount(result);
  if (revoked > 0) {
    await logSecurityEvent({ actorKind: "admin", actorReference: input.openId ?? null, category: "admin_mfa_session_revoked", outcome: "allowed", ipHash: requestIpHash(input.req.headers), metadata: { reason: "logout" } }).catch(() => undefined);
  }
  return { revoked };
}
