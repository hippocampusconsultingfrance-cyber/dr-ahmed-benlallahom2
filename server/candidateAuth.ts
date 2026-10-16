import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

export const CANDIDATE_SESSION_COOKIE = "candidate_portal_session";
export const CANDIDATE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
/** Lifetime of activation and password-reset links (single use). */
export const CANDIDATE_TOKEN_MAX_AGE_MS = 1000 * 60 * 30;
/** Lifetime of the "create my candidate space" invitation link (owner decision: 7 days, CAND-11). */
export const CANDIDATE_INVITATION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
/**
 * After expiry, an authentic invitation may still prefill the normal sign-up
 * form (email and name) for this long; it never links the application by itself.
 */
export const CANDIDATE_INVITATION_PREFILL_GRACE_MS = 1000 * 60 * 60 * 24 * 90;

/** French wording of a link lifetime for emails ("30 minutes", "7 jours"). */
export function formatCandidateLinkValidity(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 120) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} heures`;
  return `${Math.round(hours / 24)} jours`;
}
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 3;
const SCRYPT_KEY_LENGTH = 64;

function candidateAuthPepper(): string {
  const pepper = process.env.CANDIDATE_AUTH_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("candidate_auth_pepper_invalid");
  return pepper;
}

export function normalizeCandidateEmail(value: string): string {
  return value.trim().toLowerCase();
}

function passwordMaterial(password: string): Buffer {
  return createHmac("sha256", candidateAuthPepper()).update(password, "utf8").digest();
}

function deriveCandidateKey(password: Buffer, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, SCRYPT_KEY_LENGTH, { N, r, p, maxmem: 128 * 1024 * 1024 }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export function validateCandidatePassword(password: string): string | null {
  if (password.length < 15) return "candidate_password_too_short";
  if (password.length > 128) return "candidate_password_too_long";
  return null;
}

export async function hashCandidatePassword(password: string): Promise<string> {
  const validation = validateCandidatePassword(password);
  if (validation) throw new Error(validation);
  const salt = randomBytes(16);
  const hash = await deriveCandidateKey(passwordMaterial(password), salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyCandidatePassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, n, r, p, saltText, hashText] = storedHash.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltText || !hashText) return false;
  const numericN = Number(n);
  const numericR = Number(r);
  const numericP = Number(p);
  if (![numericN, numericR, numericP].every(Number.isSafeInteger)) return false;
  const expected = Buffer.from(hashText, "base64url");
  if (expected.length !== SCRYPT_KEY_LENGTH) return false;
  const actual = await deriveCandidateKey(passwordMaterial(password), Buffer.from(saltText, "base64url"), numericN, numericR, numericP);
  return timingSafeEqual(actual, expected);
}

/**
 * Prefix of the value stored in password_hash while an account has not yet
 * proven ownership of its email address. It is never a valid scrypt record, so
 * verifyCandidatePassword always rejects it: the only way to obtain a usable
 * password is the activation step reached from the emailed link (SEC-02).
 */
const CANDIDATE_PASSWORD_NOT_SET_PREFIX = "unset$";

export function createUnsetCandidatePasswordHash(): string {
  return `${CANDIDATE_PASSWORD_NOT_SET_PREFIX}${randomBytes(18).toString("base64url")}`;
}

export function isCandidatePasswordSet(storedHash: string | null | undefined): boolean {
  return typeof storedHash === "string" && storedHash.startsWith("scrypt$");
}

export function createCandidateToken(): string {
  return randomBytes(32).toString("base64url");
}

export type CandidateInvitationTokenPayload = {
  applicationId: number;
  expiresAt: number;
};

export type CandidateInvitationTokenCheck = CandidateInvitationTokenPayload & { expired: boolean };

/**
 * Issues a signed bearer token for the candidate-portal enrollment flow, valid
 * CANDIDATE_INVITATION_MAX_AGE_MS by default. The token contains no email
 * address; the server resolves the application only after checking its
 * signature and expiry. It never grants access by itself: activation by email
 * remains mandatory.
 */
export function createCandidateInvitationToken(
  applicationId: number,
  expiresAt = Date.now() + CANDIDATE_INVITATION_MAX_AGE_MS,
): string {
  if (!Number.isSafeInteger(applicationId) || applicationId < 1) throw new Error("candidate_invitation_application_invalid");
  if (!Number.isSafeInteger(expiresAt)) throw new Error("candidate_invitation_expiry_invalid");
  const payload = Buffer.from(JSON.stringify({ applicationId, expiresAt }), "utf8").toString("base64url");
  const signature = createHmac("sha256", candidateAuthPepper()).update(`candidate_invitation:${payload}`, "utf8").digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyCandidateInvitationToken(token: string): CandidateInvitationTokenPayload | null {
  const checked = inspectCandidateInvitationToken(token);
  return checked && !checked.expired ? { applicationId: checked.applicationId, expiresAt: checked.expiresAt } : null;
}

/**
 * Checks the signature of an invitation and reports whether it has expired.
 * An authentic invitation expired for less than the prefill grace period is
 * returned with expired=true (used only to prefill the normal sign-up form);
 * anything older, forged or malformed returns null.
 */
export function inspectCandidateInvitationToken(token: string, now = Date.now()): CandidateInvitationTokenCheck | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", candidateAuthPepper()).update(`candidate_invitation:${payload}`, "utf8").digest("base64url");
  const suppliedBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<CandidateInvitationTokenPayload>;
    const applicationId = parsed.applicationId;
    const expiresAt = parsed.expiresAt;
    if (typeof applicationId !== "number" || !Number.isSafeInteger(applicationId) || applicationId < 1) return null;
    if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt)) return null;
    if (expiresAt + CANDIDATE_INVITATION_PREFILL_GRACE_MS <= now) return null;
    return { applicationId, expiresAt, expired: expiresAt <= now };
  } catch {
    return null;
  }
}

export function hashCandidateToken(token: string, purpose: "session" | "verification" | "reset"): string {
  return createHash("sha256")
    .update(`${purpose}:${token}:${candidateAuthPepper()}`, "utf8")
    .digest("hex");
}

export function candidateSessionCookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: CANDIDATE_SESSION_MAX_AGE_SECONDS * 1000,
  };
}
