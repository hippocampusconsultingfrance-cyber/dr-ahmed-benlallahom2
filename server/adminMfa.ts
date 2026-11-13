import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { adminMfaBackupCodes, adminMfaChallenges, adminMfaSessions } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { enforcePersistentRateLimit, logSecurityEvent, requestIpHash } from "./candidateSecurity";
import { sendAdminMfaCodeEmail } from "./_core/notifications";

export const ADMIN_MFA_COOKIE = "admin_mfa_session";
const MFA_MAX_AGE_SECONDS = 8 * 60 * 60;
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const ADMIN_MFA_MAX_ATTEMPTS_PER_CHALLENGE = 5;
/** ADM-14: backup codes made at a time, each usable once. */
export const ADMIN_MFA_BACKUP_CODE_COUNT = 10;
// No 0/O, 1/I/L or U: a code copied on paper is typed back as written.
const BACKUP_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const BACKUP_CODE_LENGTH = 10;

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
  await openAdminMfaSession(db, input);
  await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_verify", outcome: "allowed", ipHash: requestIpHash(input.req.headers) });
}

/** The MFA proof of this browser, for 8 hours: its hash in the database, the token in the cookie. */
async function openAdminMfaSession(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: { openId: string; req: { headers: Record<string, unknown> }; res: { cookie: Function } }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MFA_MAX_AGE_SECONDS * 1000);
  await db.insert(adminMfaSessions).values({ openId: input.openId, tokenHash: hashMfa(token, "session"), expiresAt });
  input.res.cookie(ADMIN_MFA_COOKIE, token, adminMfaCookieOptions(input.req));
}

/** "K7QM2-XH9TD": a backup code as shown, in two groups of five. */
function newBackupCode() {
  const characters = Array.from({ length: BACKUP_CODE_LENGTH }, () => BACKUP_CODE_ALPHABET[randomInt(BACKUP_CODE_ALPHABET.length)]).join("");
  return `${characters.slice(0, BACKUP_CODE_LENGTH / 2)}-${characters.slice(BACKUP_CODE_LENGTH / 2)}`;
}

/** A backup code as typed: neither case, spaces nor dashes count. */
function backupCodeHash(code: string) {
  return hashMfa(code.toUpperCase().replace(/[\s-]/g, ""), "backup");
}

/**
 * ADM-14: ten new backup codes for an administrator whose mailbox is lost,
 * returned once to be shown and never again: only their hash is kept, and
 * the earlier codes stop working.
 */
export async function regenerateAdminMfaBackupCodes(input: { openId: string; req: { headers: Record<string, unknown> } }) {
  const db = await getDb();
  if (!db) throw new Error("admin_mfa_database_unavailable");
  const codes = Array.from({ length: ADMIN_MFA_BACKUP_CODE_COUNT }, newBackupCode);
  await db.batch([
    db.delete(adminMfaBackupCodes).where(eq(adminMfaBackupCodes.openId, input.openId)),
    db.insert(adminMfaBackupCodes).values(codes.map(code => ({ openId: input.openId, codeHash: backupCodeHash(code) }))),
  ]);
  await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_backup_codes_regenerated", outcome: "allowed", severity: "warning", ipHash: requestIpHash(input.req.headers) });
  return codes;
}

/** How many of the administrator's backup codes are left, and when they were made (null: never). */
export async function adminMfaBackupCodesStatus(openId: string) {
  const db = await getDb();
  if (!db) throw new Error("admin_mfa_database_unavailable");
  const codes = await db.select({ usedAt: adminMfaBackupCodes.usedAt, createdAt: adminMfaBackupCodes.createdAt }).from(adminMfaBackupCodes).where(eq(adminMfaBackupCodes.openId, openId));
  return {
    remaining: codes.filter(code => !code.usedAt).length,
    generatedAt: codes.reduce<Date | null>((latest, code) => !latest || code.createdAt > latest ? code.createdAt : latest, null),
  };
}

/**
 * ADM-14: opens the administration with a backup code instead of the emailed
 * one. A code works once; its attempts count with those of the emailed codes,
 * and a wrong one raises the same alert to the owner.
 */
export async function verifyAdminMfaBackupCode(input: { openId: string; code: string; req: { headers: Record<string, unknown> }; res: { cookie: Function } }) {
  const db = await getDb();
  if (!db) throw new Error("admin_mfa_database_unavailable");
  await enforceAdminMfaRateLimit("verify", input.openId, input.req.headers);
  const used = await db.update(adminMfaBackupCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(adminMfaBackupCodes.openId, input.openId), eq(adminMfaBackupCodes.codeHash, backupCodeHash(input.code)), isNull(adminMfaBackupCodes.usedAt)));
  if (mutationRowCount(used) !== 1) {
    await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_backup_code", outcome: "failed", severity: "high", ipHash: requestIpHash(input.req.headers) });
    throw new Error("admin_mfa_code_invalid");
  }
  await openAdminMfaSession(db, input);
  const { remaining } = await adminMfaBackupCodesStatus(input.openId);
  await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_backup_code", outcome: "allowed", severity: "warning", ipHash: requestIpHash(input.req.headers), metadata: { remaining } });
  return { remaining };
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

/**
 * ADM-14: ends every MFA proof of this administrator but the one this browser
 * carries, with « Révoquer toutes les autres sessions »: a lost device signed
 * in again with the password still needs a new security code. Returns how
 * many were still valid; expired ones are left as they are.
 */
export async function revokeOtherAdminMfaSessions(input: { openId: string; req: { headers: Record<string, unknown> } }) {
  const db = await getDb();
  if (!db) throw new Error("admin_mfa_database_unavailable");
  const token = cookieValue(typeof input.req.headers.cookie === "string" ? input.req.headers.cookie : undefined, ADMIN_MFA_COOKIE);
  const result = await db.update(adminMfaSessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(adminMfaSessions.openId, input.openId),
      isNull(adminMfaSessions.revokedAt),
      gt(adminMfaSessions.expiresAt, new Date()),
      ...(token ? [ne(adminMfaSessions.tokenHash, hashMfa(token, "session"))] : []),
    ));
  return mutationRowCount(result);
}
