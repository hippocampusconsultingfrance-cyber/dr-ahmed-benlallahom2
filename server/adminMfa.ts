import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { adminMfaChallenges, adminMfaSessions } from "../drizzle/schema";
import { getDb } from "./db";
import { logSecurityEvent, requestIpHash } from "./candidateSecurity";
import { sendAdminMfaCodeEmail } from "./_core/notifications";

export const ADMIN_MFA_COOKIE = "admin_mfa_session";
const MFA_MAX_AGE_SECONDS = 8 * 60 * 60;

function mfaPepper() {
  const pepper = process.env.CANDIDATE_AUTH_PEPPER || process.env.JWT_SECRET;
  if (!pepper) throw new Error("admin_mfa_pepper_unavailable");
  return pepper;
}

function hashMfa(value: string, purpose: string) {
  return createHash("sha256").update(`${purpose}:${value}:${mfaPepper()}`).digest("hex");
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

export async function isAdminMfaVerified(req: { headers: Record<string, unknown> }, openId: string) {
  const token = cookieValue(typeof req.headers.cookie === "string" ? req.headers.cookie : undefined, ADMIN_MFA_COOKIE);
  if (!token) return false;
  const db = await getDb();
  if (!db) return false;
  const active = await db.select({ id: adminMfaSessions.id }).from(adminMfaSessions).where(and(eq(adminMfaSessions.openId, openId), eq(adminMfaSessions.tokenHash, hashMfa(token, "session")), gt(adminMfaSessions.expiresAt, new Date()), isNull(adminMfaSessions.revokedAt))).limit(1);
  return Boolean(active[0]);
}

export async function issueAdminMfaChallenge(input: { openId: string; email: string; req: { headers: Record<string, unknown> } }) {
  const db = await getDb();
  if (!db) throw new Error("admin_mfa_database_unavailable");
  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  await db.insert(adminMfaChallenges).values({ openId: input.openId, codeHash: hashMfa(code, "code"), expiresAt });
  await sendAdminMfaCodeEmail(input.email, code);
  await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_challenge_issued", outcome: "allowed", ipHash: requestIpHash(input.req.headers) });
}

export async function verifyAdminMfaChallenge(input: { openId: string; code: string; req: { headers: Record<string, unknown> }; res: { cookie: Function } }) {
  const db = await getDb();
  if (!db) throw new Error("admin_mfa_database_unavailable");
  const challenge = (await db.select().from(adminMfaChallenges).where(and(eq(adminMfaChallenges.openId, input.openId), isNull(adminMfaChallenges.consumedAt), gt(adminMfaChallenges.expiresAt, new Date()))).limit(1))[0];
  if (!challenge || challenge.attempts >= 5 || challenge.codeHash !== hashMfa(input.code, "code")) {
    if (challenge) await db.update(adminMfaChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(adminMfaChallenges.id, challenge.id));
    await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_verify", outcome: "failed", severity: "high", ipHash: requestIpHash(input.req.headers) });
    throw new Error("admin_mfa_code_invalid");
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MFA_MAX_AGE_SECONDS * 1000);
  await db.update(adminMfaChallenges).set({ consumedAt: new Date() }).where(eq(adminMfaChallenges.id, challenge.id));
  await db.insert(adminMfaSessions).values({ openId: input.openId, tokenHash: hashMfa(token, "session"), expiresAt });
  input.res.cookie(ADMIN_MFA_COOKIE, token, adminMfaCookieOptions(input.req));
  await logSecurityEvent({ actorKind: "admin", actorReference: input.openId, category: "admin_mfa_verify", outcome: "allowed", ipHash: requestIpHash(input.req.headers) });
}
