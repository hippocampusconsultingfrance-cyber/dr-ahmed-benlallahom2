import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gte, inArray, isNull, like, lt, lte, ne, notInArray, notLike, or, sql } from "drizzle-orm";
import { cvApplications, cvGoogleDriveExportJobs, googleDriveConnections } from "../drizzle/schema";
import { sendOwnerAlertOncePerWindow } from "./candidateSecurity";
import { getDb } from "./db";
import { logRecruitmentAction } from "./recruitmentAudit";
import { storageGetSignedUrl } from "./storage";
import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";

const CONNECTION_KEY = "recruitment_cv_export";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const CALLBACK_PATH = "/api/google-drive/oauth/callback";
const DRIVE_TRACKING_PROPERTY = "recruitmentTrackingId";
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 3;
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
/** Google refuses the stored refresh token: password changed, access revoked or authorization expired. */
const TOKEN_REVOKED_ERROR = "google_drive_token_invalid_grant";

/** The connection is « à renouveler »: only a new authorization from the admin can fix it (REC-09). */
export function isGoogleDriveReconnectionError(error: string | null | undefined) {
  return error === TOKEN_REVOKED_ERROR;
}

export function googleDriveMutationRowCount(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object") return 0;
  if ("rowCount" in header && typeof header.rowCount === "number") return header.rowCount;
  if ("affectedRows" in header && typeof header.affectedRows === "number") return header.affectedRows;
  return 0;
}

type DriveTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

function canonicalOrigin() {
  return "https://drahmedbenlallahom.com";
}

function redirectUri() {
  return `${canonicalOrigin()}${CALLBACK_PATH}`;
}

function encryptionKey(): Buffer {
  const encoded = process.env.CANDIDATE_DOCUMENT_ENCRYPTION_KEY;
  if (!encoded) throw new Error("google_drive_encryption_key_missing");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("google_drive_encryption_key_invalid");
  return key;
}

function stateKey(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("google_drive_state_key_missing");
  return secret;
}

function ensureGoogleConfig() {
  if (!ENV.googleDriveClientId || !ENV.googleDriveClientSecret || !ENV.googleDriveCvFolderId) {
    throw new Error("google_drive_configuration_missing");
  }
}

function signedState(nonce: string, expiresAt: number) {
  const payload = Buffer.from(JSON.stringify({ nonce, expiresAt }), "utf8").toString("base64url");
  const signature = createHmac("sha256", stateKey()).update(`google_drive_oauth:${payload}`, "utf8").digest("base64url");
  return `${payload}.${signature}`;
}

export function createGoogleDriveOAuthState() {
  return signedState(randomBytes(24).toString("base64url"), Date.now() + STATE_MAX_AGE_MS);
}

export function verifyGoogleDriveOAuthState(state: string): boolean {
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", stateKey()).update(`google_drive_oauth:${payload}`, "utf8").digest("base64url");
  const suppliedBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { expiresAt?: unknown };
    return typeof parsed.expiresAt === "number" && Number.isSafeInteger(parsed.expiresAt) && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export function buildGoogleDriveAuthorizationUrl(state: string) {
  ensureGoogleConfig();
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", ENV.googleDriveClientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export function encryptGoogleDriveRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from("hippocampus-google-drive-refresh-token:v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

function decryptGoogleDriveRefreshToken(input: { refreshTokenCiphertext: string; refreshTokenIv: string; refreshTokenAuthTag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(input.refreshTokenIv, "base64"));
  decipher.setAAD(Buffer.from("hippocampus-google-drive-refresh-token:v1", "utf8"));
  decipher.setAuthTag(Buffer.from(input.refreshTokenAuthTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(input.refreshTokenCiphertext, "base64")), decipher.final()]).toString("utf8");
}

async function requestToken(payload: URLSearchParams): Promise<DriveTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload,
  });
  const result = await response.json() as DriveTokenResponse;
  if (!response.ok) throw new Error(`google_drive_token_${result.error || response.status}`);
  return result;
}

export async function exchangeGoogleDriveAuthorizationCode(code: string) {
  ensureGoogleConfig();
  const response = await requestToken(new URLSearchParams({
    code,
    client_id: ENV.googleDriveClientId,
    client_secret: ENV.googleDriveClientSecret,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  }));
  if (!response.refresh_token) throw new Error("google_drive_refresh_token_missing");
  return response;
}

async function getGoogleDriveAccessToken(connection: typeof googleDriveConnections.$inferSelect) {
  ensureGoogleConfig();
  const refreshToken = decryptGoogleDriveRefreshToken(connection);
  const response = await requestToken(new URLSearchParams({
    refresh_token: refreshToken,
    client_id: ENV.googleDriveClientId,
    client_secret: ENV.googleDriveClientSecret,
    grant_type: "refresh_token",
  }));
  if (!response.access_token) throw new Error("google_drive_access_token_missing");
  return response.access_token;
}

export function googleDriveRetryDelayMs(attempt: number) {
  return Math.min(60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempt - 1));
}

export function googleDriveCvFileName(trackingId: string, originalName: string) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/_+/g, "_").slice(-180) || "cv";
  return `${trackingId}-${safeName}`;
}

function escapeGoogleDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function googleDriveFileLookupQuery(folderId: string, trackingId: string) {
  return `'${escapeGoogleDriveQueryValue(folderId)}' in parents and trashed = false and appProperties has { key='${DRIVE_TRACKING_PROPERTY}' and value='${escapeGoogleDriveQueryValue(trackingId)}' }`;
}

type GoogleDriveExportJobStatus = typeof cvGoogleDriveExportJobs.$inferSelect["status"];
type CvFileValidationStatus = typeof cvApplications.$inferSelect["fileValidationStatus"];

export function googleDriveFileDisposition(status: CvFileValidationStatus) {
  if (status === "accepted") return "ready" as const;
  if (status === "quarantined") return "waiting" as const;
  return "terminal_failure" as const;
}

export function googleDriveExportRetryDisposition(status: GoogleDriveExportJobStatus | null) {
  if (status === "completed") return "already_completed" as const;
  if (status === "running") return "already_running" as const;
  if (status === "queued" || status === "retry") return "accelerate" as const;
  if (status === "failed") return "reset_failed" as const;
  return "create" as const;
}

async function downloadCvBuffer(storageKey: string) {
  const signedUrl = await storageGetSignedUrl(storageKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`google_drive_cv_download_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function uploadCvToGoogleDrive(input: {
  accessToken: string;
  folderId: string;
  trackingId: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
}) {
  const boundary = `drive-export-${randomBytes(12).toString("hex")}`;
  const metadata = JSON.stringify({
    name: input.fileName,
    parents: [input.folderId],
    appProperties: { [DRIVE_TRACKING_PROPERTY]: input.trackingId },
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`, "utf8"),
    Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`, "utf8"),
    input.content,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
  const url = new URL(GOOGLE_UPLOAD_URL);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("fields", "id,name,mimeType,webViewLink");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });
  const result = await response.json() as { id?: string; webViewLink?: string; error?: { message?: string } };
  if (!response.ok || !result.id) throw new Error(`google_drive_upload_${response.status}${result.error?.message ? `_${result.error.message.slice(0, 120)}` : ""}`);
  return { id: result.id, webViewLink: result.webViewLink ?? null };
}

async function findCvInGoogleDrive(input: { accessToken: string; folderId: string; trackingId: string }) {
  const url = new URL(GOOGLE_FILES_URL);
  url.searchParams.set("q", googleDriveFileLookupQuery(input.folderId, input.trackingId));
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("fields", "files(id,webViewLink)");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${input.accessToken}` } });
  const result = await response.json() as { files?: Array<{ id?: string; webViewLink?: string }>; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(`google_drive_lookup_${response.status}${result.error?.message ? `_${result.error.message.slice(0, 120)}` : ""}`);
  }
  const file = result.files?.find(candidate => typeof candidate.id === "string" && candidate.id.length > 0);
  return file?.id ? { id: file.id, webViewLink: file.webViewLink ?? null } : null;
}

async function deleteGoogleDriveFile(accessToken: string, fileId: string): Promise<"deleted" | "missing"> {
  const response = await fetch(`${GOOGLE_FILES_URL}/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return "missing";
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`google_drive_delete_${response.status}${result.error?.message ? `_${result.error.message.slice(0, 120)}` : ""}`);
  }
  return "deleted";
}

/** Longer than any authorization stays refused: in practice one alert per authorization. */
const RECONNECTION_ALERT_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * One alert per refused authorization (REC-09), kept as sent only once
 * delivered: while the connection stays « à renouveler », each pass of the
 * copies tries again an alert that could not leave (Resend down or out of
 * quota at the refusal), then never again for that authorization.
 */
async function notifyOwnerOfGoogleDriveReconnection(connection: { id: number; refreshTokenCiphertext: string }) {
  await sendOwnerAlertOncePerWindow({
    action: "google_drive_reconnection_alert",
    subject: `${connection.id}:${connection.refreshTokenCiphertext}`,
    windowMs: RECONNECTION_ALERT_WINDOW_MS,
    blockMs: RECONNECTION_ALERT_WINDOW_MS,
  }, () => notifyOwner({
    title: "Recrutement : Google Drive à reconnecter, copies des CV suspendues",
    content: [
      "Google a refusé l’autorisation utilisée pour copier les CV dans Google Drive (invalid_grant) : mot de passe Google changé, accès de l’application révoqué ou autorisation expirée.",
      "Les copies sont suspendues sans consommer de tentative ; les CV restent disponibles dans le stockage privé du site et dans l’administration.",
      "Pour reprendre : onglet Candidatures, bouton « Reconnexion Google Drive requise ». Les copies arrêtées par ce refus repartiront automatiquement après la reconnexion.",
      "Cette alerte n’est envoyée qu’une fois jusqu’à la reconnexion.",
    ].join("\n\n"),
  })).catch((error: unknown) => console.error("google_drive_reconnection_alert_failed", error instanceof Error ? error.name : "UnknownError"));
}

/**
 * Notes a Drive failure on the connection. A revoked token marks it « à
 * renouveler » until the next connection or successful copy: the first
 * refusal alone alerts the owner, and no other error overwrites that mark.
 * Only on the authorization the failing call used: a reconnection saved
 * meanwhile (new refresh token) is not marked by the old token's refusal.
 */
async function recordGoogleDriveConnectionError(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  connection: { id: number; refreshTokenCiphertext: string },
  message: string,
) {
  const notMarkedYet = or(isNull(googleDriveConnections.lastError), ne(googleDriveConnections.lastError, TOKEN_REVOKED_ERROR));
  const updated = await db.update(googleDriveConnections).set({ lastError: message, updatedAt: new Date() })
    .where(and(eq(googleDriveConnections.id, connection.id), eq(googleDriveConnections.refreshTokenCiphertext, connection.refreshTokenCiphertext), notMarkedYet));
  if (isGoogleDriveReconnectionError(message) && googleDriveMutationRowCount(updated) === 1) await notifyOwnerOfGoogleDriveReconnection(connection);
}

export type GoogleDriveCopyDeletion = {
  status: "deleted" | "none" | "failed" | "not_connected";
  deleted: number;
  error: string | null;
};

/**
 * Permanently deletes the Google Drive copies of one CV (GDPR erasure,
 * retention): the file recorded by the export job, then any other file of the
 * export folder tagged with the dossier tracking id. A missing file counts as
 * already deleted. Failures are returned, never thrown, so the caller can
 * record the deletion for a later retry.
 */
export async function deleteCvCopiesFromGoogleDrive(input: { trackingId: string; knownFileIds: string[] }): Promise<GoogleDriveCopyDeletion> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const knownFileIds = Array.from(new Set(input.knownFileIds.filter(id => id.trim().length > 0)));
  const connection = (await db.select().from(googleDriveConnections).where(eq(googleDriveConnections.connectionKey, CONNECTION_KEY)).limit(1))[0];
  if (!connection) {
    return knownFileIds.length > 0
      ? { status: "not_connected", deleted: 0, error: "google_drive_not_connected" }
      : { status: "none", deleted: 0, error: null };
  }
  let deleted = 0;
  try {
    const accessToken = await getGoogleDriveAccessToken(connection);
    for (const fileId of knownFileIds) {
      if (await deleteGoogleDriveFile(accessToken, fileId) === "deleted") deleted += 1;
    }
    // Copies the job does not reference (e.g. an upload that finished after a
    // lost claim) are found through the tracking id stored on the file.
    for (let lookup = 0; lookup < 10; lookup += 1) {
      const orphan = await findCvInGoogleDrive({ accessToken, folderId: connection.folderId, trackingId: input.trackingId });
      if (!orphan) break;
      if (await deleteGoogleDriveFile(accessToken, orphan.id) === "missing") break;
      deleted += 1;
    }
    return { status: deleted > 0 ? "deleted" : "none", deleted, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "google_drive_delete_unknown";
    await recordGoogleDriveConnectionError(db, connection, message).catch(() => undefined);
    return { status: "failed", deleted, error: message };
  }
}

export async function saveGoogleDriveConnection(input: { authorizedByOpenId: string; refreshToken: string; grantedScopes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  ensureGoogleConfig();
  const encrypted = encryptGoogleDriveRefreshToken(input.refreshToken);
  await db.insert(googleDriveConnections).values({
    connectionKey: CONNECTION_KEY,
    authorizedByOpenId: input.authorizedByOpenId,
    folderId: ENV.googleDriveCvFolderId,
    refreshTokenCiphertext: encrypted.ciphertext,
    refreshTokenIv: encrypted.iv,
    refreshTokenAuthTag: encrypted.authTag,
    grantedScopes: input.grantedScopes ?? null,
    connectedAt: new Date(),
    lastError: null,
  }).onConflictDoUpdate({
    target: googleDriveConnections.connectionKey,
    set: {
      authorizedByOpenId: input.authorizedByOpenId,
      folderId: ENV.googleDriveCvFolderId,
      refreshTokenCiphertext: encrypted.ciphertext,
      refreshTokenIv: encrypted.iv,
      refreshTokenAuthTag: encrypted.authTag,
      grantedScopes: input.grantedScopes ?? null,
      connectedAt: new Date(),
      lastError: null,
    },
  });
}

/**
 * Failed copies a new attempt can fix: not those of a CV refused by the
 * security check (`cv_rejected`, `cv_validation_failed`) or of an erased dossier.
 */
function retryableFailedGoogleDriveExport() {
  return and(
    eq(cvGoogleDriveExportJobs.status, "failed"),
    or(isNull(cvGoogleDriveExportJobs.lastError), and(notLike(cvGoogleDriveExportJobs.lastError, "cv_%"), ne(cvGoogleDriveExportJobs.lastError, "application_missing"))),
  );
}

export async function googleDriveExportStatus() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const connection = (await db.select({ connectedAt: googleDriveConnections.connectedAt, lastUsedAt: googleDriveConnections.lastUsedAt, lastError: googleDriveConnections.lastError, folderId: googleDriveConnections.folderId })
    .from(googleDriveConnections)
    .where(eq(googleDriveConnections.connectionKey, CONNECTION_KEY))
    .limit(1))[0];
  // Feeds the « Relancer toutes les copies échouées » button (REC-09).
  const [failed] = await db.select({ count: sql<number>`count(*)` }).from(cvGoogleDriveExportJobs).where(retryableFailedGoogleDriveExport());
  const failedExports = Number(failed?.count ?? 0);
  return connection ? { connected: true, ...connection, failedExports } : { connected: false, connectedAt: null, lastUsedAt: null, lastError: null, folderId: null, failedExports };
}

/**
 * The connection is « à renouveler » (REC-09): the daily security review
 * reports it every day until the reconnection, whatever became of its alert.
 */
export async function googleDriveReconnectionRequired(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [connection] = await db.select({ lastError: googleDriveConnections.lastError }).from(googleDriveConnections)
    .where(eq(googleDriveConnections.connectionKey, CONNECTION_KEY)).limit(1);
  return isGoogleDriveReconnectionError(connection?.lastError);
}

export async function enqueueCvGoogleDriveExport(applicationId: number, scheduledFor = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.insert(cvGoogleDriveExportJobs).values({ applicationId, status: "queued", attempts: 0, maxAttempts: MAX_ATTEMPTS, scheduledFor })
    .onConflictDoNothing();
}

/**
 * Retry one Drive export without ever duplicating an export already completed.
 * Active work is reused, while a terminal failure receives a fresh attempt budget.
 */
export async function retryCvGoogleDriveExport(applicationId: number, requestedAt = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  // A worker may claim the row between our read and write. Re-read after a
  // failed compare-and-set instead of reopening a running or completed export.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [existingJob] = await db.select({
      id: cvGoogleDriveExportJobs.id,
      status: cvGoogleDriveExportJobs.status,
      attempts: cvGoogleDriveExportJobs.attempts,
      maxAttempts: cvGoogleDriveExportJobs.maxAttempts,
    }).from(cvGoogleDriveExportJobs)
      .where(eq(cvGoogleDriveExportJobs.applicationId, applicationId))
      .limit(1);
    const disposition = googleDriveExportRetryDisposition(existingJob?.status ?? null);

    if (disposition === "already_completed") {
      return { queued: false, accelerated: false, reset: false, alreadyRunning: false, alreadyCompleted: true };
    }
    if (disposition === "already_running") {
      return { queued: false, accelerated: false, reset: false, alreadyRunning: true, alreadyCompleted: false };
    }
    if (!existingJob) {
      const created = await db.insert(cvGoogleDriveExportJobs).values({
        applicationId, status: "queued", attempts: 0, maxAttempts: MAX_ATTEMPTS, scheduledFor: requestedAt,
      }).onConflictDoNothing();
      if (googleDriveMutationRowCount(created) === 1) {
        return { queued: true, accelerated: false, reset: false, alreadyRunning: false, alreadyCompleted: false };
      }
      continue;
    }

    // Older queued/retry rows can already have exhausted their budget. A
    // manual retry must grant a fresh budget or it would remain unclaimable.
    const resetBudget = disposition === "reset_failed" || existingJob.attempts >= existingJob.maxAttempts;
    const updated = await db.update(cvGoogleDriveExportJobs).set({
      status: "queued",
      ...(resetBudget ? { attempts: 0 } : {}),
      scheduledFor: requestedAt,
      startedAt: null,
      finishedAt: null,
      lastError: null,
      updatedAt: requestedAt,
    }).where(and(
      eq(cvGoogleDriveExportJobs.id, existingJob.id),
      eq(cvGoogleDriveExportJobs.status, existingJob.status),
      eq(cvGoogleDriveExportJobs.attempts, existingJob.attempts),
    ));
    if (googleDriveMutationRowCount(updated) === 1) {
      return {
        queued: true,
        accelerated: disposition === "accelerate",
        reset: resetBudget,
        alreadyRunning: false,
        alreadyCompleted: false,
      };
    }
  }
  throw new Error("google_drive_retry_concurrent_state_change");
}

/**
 * « Relancer toutes les copies échouées » (REC-09): each retryable failed copy
 * goes back to the queue with a fresh budget. Compare-and-set on the failed
 * status, so a copy reopened meanwhile is left as it is.
 */
export async function retryAllFailedCvGoogleDriveExports(limit = 100, requestedAt = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const failed = await db.select({ id: cvGoogleDriveExportJobs.id })
    .from(cvGoogleDriveExportJobs)
    .where(retryableFailedGoogleDriveExport())
    .orderBy(cvGoogleDriveExportJobs.id)
    .limit(Math.min(Math.max(limit, 1), 100));
  if (failed.length === 0) return { requeued: 0, applicationIds: [] as number[] };
  const requeued = await db.update(cvGoogleDriveExportJobs).set({
    status: "queued", attempts: 0, scheduledFor: requestedAt, startedAt: null, finishedAt: null, lastError: null, updatedAt: requestedAt,
  }).where(and(inArray(cvGoogleDriveExportJobs.id, failed.map(job => job.id)), eq(cvGoogleDriveExportJobs.status, "failed")))
    .returning({ applicationId: cvGoogleDriveExportJobs.applicationId });
  return { requeued: requeued.length, applicationIds: requeued.map(job => job.applicationId) };
}

/**
 * After a new Drive authorization: the copies stopped by a token error (failed
 * after exhausting their attempts, or waiting) go back to the queue with a
 * fresh budget, due at once (REC-09). Running and completed copies are not touched.
 */
export async function requeueGoogleDriveExportsAfterReconnection(requestedAt = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const tokenError = or(
    like(cvGoogleDriveExportJobs.lastError, "google_drive_token_%"),
    eq(cvGoogleDriveExportJobs.lastError, "google_drive_access_token_missing"),
  );
  const requeued = await db.update(cvGoogleDriveExportJobs).set({
    status: "queued", attempts: 0, scheduledFor: requestedAt, startedAt: null, finishedAt: null, lastError: null, updatedAt: requestedAt,
  }).where(and(inArray(cvGoogleDriveExportJobs.status, ["queued", "retry", "failed"]), tokenError));
  return { requeued: googleDriveMutationRowCount(requeued) };
}

/**
 * Creates missing export jobs for applications submitted before Google Drive
 * was connected. The unique application id keeps this operation idempotent.
 */
export async function backfillCvGoogleDriveExportJobs(limit = 25) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const applications = await db.select({ id: cvApplications.id })
    .from(cvApplications)
    .leftJoin(cvGoogleDriveExportJobs, eq(cvGoogleDriveExportJobs.applicationId, cvApplications.id))
    .where(and(
      inArray(cvApplications.status, ["new", "reviewing", "shortlisted", "placed"]),
      inArray(cvApplications.fileValidationStatus, ["quarantined", "accepted"]),
      isNull(cvGoogleDriveExportJobs.id),
    ))
    .orderBy(cvApplications.createdAt)
    .limit(Math.min(Math.max(limit, 1), 100));

  let queued = 0;
  for (const application of applications) {
    const result = await db.insert(cvGoogleDriveExportJobs).values({
      applicationId: application.id,
      status: "queued",
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      scheduledFor: new Date(),
    }).onConflictDoNothing();
    if (googleDriveMutationRowCount(result) === 1) queued += 1;
  }

  return { inspected: applications.length, queued, accelerated: 0 };
}

/** Release export jobs left in `running` by an interrupted serverless worker. */
export async function recoverStaleCvGoogleDriveExportJobs(staleAfterMs = 15 * 60_000) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = new Date();
  const staleBefore = new Date(now.getTime() - staleAfterMs);
  const candidates = await db.select({
    id: cvGoogleDriveExportJobs.id,
    status: cvGoogleDriveExportJobs.status,
    attempts: cvGoogleDriveExportJobs.attempts,
    maxAttempts: cvGoogleDriveExportJobs.maxAttempts,
  }).from(cvGoogleDriveExportJobs).where(or(
    and(eq(cvGoogleDriveExportJobs.status, "running"), lte(cvGoogleDriveExportJobs.startedAt, staleBefore)),
    and(inArray(cvGoogleDriveExportJobs.status, ["queued", "retry"]), gte(cvGoogleDriveExportJobs.attempts, cvGoogleDriveExportJobs.maxAttempts)),
  )).orderBy(cvGoogleDriveExportJobs.id).limit(25);

  let recovered = 0;
  let exhausted = 0;
  for (const candidate of candidates) {
    const terminal = candidate.attempts >= candidate.maxAttempts;
    const result = await db.update(cvGoogleDriveExportJobs).set({
      status: terminal ? "failed" : "retry",
      scheduledFor: now,
      startedAt: null,
      finishedAt: terminal ? now : null,
      lastError: terminal ? "worker_interrupted_attempts_exhausted" : "worker_interrupted",
      updatedAt: now,
    }).where(and(
      eq(cvGoogleDriveExportJobs.id, candidate.id),
      eq(cvGoogleDriveExportJobs.status, candidate.status),
      eq(cvGoogleDriveExportJobs.attempts, candidate.attempts),
      ...(candidate.status === "running" ? [lte(cvGoogleDriveExportJobs.startedAt, staleBefore)] : []),
    ));
    if (googleDriveMutationRowCount(result) !== 1) continue;
    if (terminal) exhausted += 1;
    else recovered += 1;
  }
  return { recovered, exhausted };
}

function currentGoogleDriveClaim(job: typeof cvGoogleDriveExportJobs.$inferSelect) {
  return and(
    eq(cvGoogleDriveExportJobs.id, job.id),
    eq(cvGoogleDriveExportJobs.status, "running"),
    eq(cvGoogleDriveExportJobs.attempts, job.attempts),
    job.startedAt ? eq(cvGoogleDriveExportJobs.startedAt, job.startedAt) : isNull(cvGoogleDriveExportJobs.startedAt),
  );
}

async function processGoogleDriveExportJob(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const job = (await db.select().from(cvGoogleDriveExportJobs).where(eq(cvGoogleDriveExportJobs.id, jobId)).limit(1))[0];
  if (!job || job.status !== "running") return { skipped: true, reason: "not_claimed" as const };
  const application = (await db.select().from(cvApplications).where(eq(cvApplications.id, job.applicationId)).limit(1))[0];
  const connection = (await db.select().from(googleDriveConnections).where(eq(googleDriveConnections.connectionKey, CONNECTION_KEY)).limit(1))[0];
  if (!application || !connection) {
    const updatedAt = new Date();
    if (!application) {
      const updated = await db.update(cvGoogleDriveExportJobs).set({ status: "failed", startedAt: null, finishedAt: updatedAt, lastError: "application_missing", updatedAt }).where(currentGoogleDriveClaim(job));
      if (googleDriveMutationRowCount(updated) !== 1) return { skipped: true, reason: "claim_lost" as const };
      return { skipped: true, retry: false, reason: "application_missing" as const };
    }
    const updated = await db.update(cvGoogleDriveExportJobs).set({
      status: "queued",
      attempts: Math.max(0, job.attempts - 1),
      scheduledFor: new Date(updatedAt.getTime() + 5 * 60_000),
      startedAt: null,
      updatedAt,
    }).where(currentGoogleDriveClaim(job));
    if (googleDriveMutationRowCount(updated) !== 1) return { skipped: true, reason: "claim_lost" as const };
    return { skipped: true, retry: true, reason: "connection_missing" as const };
  }
  const fileDisposition = googleDriveFileDisposition(application.fileValidationStatus);
  if (fileDisposition === "terminal_failure") {
    const updatedAt = new Date();
    const reason = `cv_${application.fileValidationStatus}`;
    const updated = await db.update(cvGoogleDriveExportJobs).set({
      status: "failed",
      startedAt: null,
      finishedAt: updatedAt,
      lastError: reason,
      updatedAt,
    }).where(currentGoogleDriveClaim(job));
    if (googleDriveMutationRowCount(updated) !== 1) return { skipped: true, reason: "claim_lost" as const };
    return { skipped: true, retry: false, reason };
  }
  if (fileDisposition === "waiting") {
    const updatedAt = new Date();
    const updated = await db.update(cvGoogleDriveExportJobs).set({
      status: "queued",
      attempts: Math.max(0, job.attempts - 1),
      scheduledFor: new Date(updatedAt.getTime() + 60_000),
      startedAt: null,
      updatedAt,
    }).where(currentGoogleDriveClaim(job));
    if (googleDriveMutationRowCount(updated) !== 1) return { skipped: true, reason: "claim_lost" as const };
    return { skipped: true, retry: true, reason: "cv_not_accepted" as const };
  }
  try {
    const accessToken = await getGoogleDriveAccessToken(connection);
    const existingDriveFile = await findCvInGoogleDrive({
      accessToken,
      folderId: connection.folderId,
      trackingId: application.trackingId,
    });
    const driveFile = existingDriveFile || await (async () => {
      const content = await downloadCvBuffer(application.cvFileKey);
      return uploadCvToGoogleDrive({
        accessToken,
        folderId: connection.folderId,
        trackingId: application.trackingId,
        fileName: googleDriveCvFileName(application.trackingId, application.cvOriginalName),
        mimeType: application.cvMimeType,
        content,
      });
    })();
    const now = new Date();
    const completed = await db.update(cvGoogleDriveExportJobs).set({ status: "completed", driveFileId: driveFile.id, driveFileUrl: driveFile.webViewLink, lastError: null, finishedAt: now, updatedAt: now }).where(currentGoogleDriveClaim(job));
    if (googleDriveMutationRowCount(completed) !== 1) return { skipped: true, reason: "claim_lost" as const };
    // Telemetry and audit must not reopen a successfully copied CV on failure.
    try {
      await db.update(googleDriveConnections).set({ lastUsedAt: now, lastError: null }).where(eq(googleDriveConnections.id, connection.id));
      await logRecruitmentAction({ applicationId: application.id, adminOpenId: connection.authorizedByOpenId, action: "export", metadata: { destination: "google_drive", driveFileId: driveFile.id, trackingId: application.trackingId, reusedExistingFile: Boolean(existingDriveFile) } });
    } catch {
      console.error("google_drive_export_post_commit_failed", { applicationId: application.id });
    }
    return { completed: true, applicationId: application.id, driveFileId: driveFile.id, reusedExistingFile: Boolean(existingDriveFile) };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "google_drive_export_unknown";
    const now = new Date();
    if (isGoogleDriveReconnectionError(message)) {
      // Not the CV's fault: the attempt is given back, and the copy waits for
      // the reconnection, which requeues it (REC-09).
      const waiting = await db.update(cvGoogleDriveExportJobs).set({
        status: "retry",
        attempts: Math.max(0, job.attempts - 1),
        lastError: message,
        scheduledFor: new Date(now.getTime() + 5 * 60_000),
        startedAt: null,
        finishedAt: null,
        updatedAt: now,
      }).where(currentGoogleDriveClaim(job));
      if (googleDriveMutationRowCount(waiting) !== 1) return { skipped: true, reason: "claim_lost" as const };
      await recordGoogleDriveConnectionError(db, connection, message);
      return { completed: false, applicationId: job.applicationId, retry: true, reconnectRequired: true, error: message };
    }
    const finalFailure = job.attempts >= job.maxAttempts;
    const updated = await db.update(cvGoogleDriveExportJobs).set({
      status: finalFailure ? "failed" : "retry",
      lastError: message,
      scheduledFor: new Date(now.getTime() + googleDriveRetryDelayMs(job.attempts)),
      startedAt: null,
      finishedAt: finalFailure ? now : null,
      updatedAt: now,
    }).where(currentGoogleDriveClaim(job));
    if (googleDriveMutationRowCount(updated) !== 1) return { skipped: true, reason: "claim_lost" as const };
    await recordGoogleDriveConnectionError(db, connection, message);
    return { completed: false, applicationId: job.applicationId, retry: !finalFailure, error: message };
  }
}

/**
 * `skipQuarantinedCvs` leaves aside the jobs whose CV still awaits validation:
 * the cron runs Drive copies before the analyses (which validate quarantined
 * CVs) and must not push those jobs back while they wait for it.
 */
export async function processDueCvGoogleDriveExports(limit = BATCH_SIZE, applicationIds?: number[], options: { skipQuarantinedCvs?: boolean } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const connection = (await db.select({ id: googleDriveConnections.id, lastError: googleDriveConnections.lastError, refreshTokenCiphertext: googleDriveConnections.refreshTokenCiphertext }).from(googleDriveConnections).where(eq(googleDriveConnections.connectionKey, CONNECTION_KEY)).limit(1))[0];
  if (!connection) return { processed: 0, waitingForAuthorization: true, reconnectRequired: false, results: [] as Array<Record<string, unknown>> };
  // Revoked authorization: no copy is attempted (each would be refused) until
  // the admin reconnects Drive, which requeues them (REC-09). Its alert is sent
  // again here as long as it has not been delivered.
  if (isGoogleDriveReconnectionError(connection.lastError)) {
    await notifyOwnerOfGoogleDriveReconnection(connection);
    return { processed: 0, waitingForAuthorization: true, reconnectRequired: true, results: [] as Array<Record<string, unknown>> };
  }
  const now = new Date();
  const dueJobs = and(
    inArray(cvGoogleDriveExportJobs.status, ["queued", "retry"]),
    lte(cvGoogleDriveExportJobs.scheduledFor, now),
    lt(cvGoogleDriveExportJobs.attempts, cvGoogleDriveExportJobs.maxAttempts),
    ...(applicationIds?.length ? [inArray(cvGoogleDriveExportJobs.applicationId, applicationIds)] : []),
    ...(options.skipQuarantinedCvs
      ? [notInArray(cvGoogleDriveExportJobs.applicationId, db.select({ id: cvApplications.id }).from(cvApplications).where(eq(cvApplications.fileValidationStatus, "quarantined")))]
      : []),
  );
  const candidates = await db.select().from(cvGoogleDriveExportJobs).where(dueJobs).orderBy(cvGoogleDriveExportJobs.scheduledFor).limit(Math.min(Math.max(limit, 1), BATCH_SIZE));
  const results: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    const startedAt = new Date();
    const claimed = await db.update(cvGoogleDriveExportJobs).set({ status: "running", attempts: candidate.attempts + 1, startedAt, finishedAt: null, updatedAt: startedAt }).where(and(
      eq(cvGoogleDriveExportJobs.id, candidate.id),
      eq(cvGoogleDriveExportJobs.status, candidate.status),
      eq(cvGoogleDriveExportJobs.scheduledFor, candidate.scheduledFor),
      lte(cvGoogleDriveExportJobs.scheduledFor, startedAt),
      eq(cvGoogleDriveExportJobs.attempts, candidate.attempts),
      lt(cvGoogleDriveExportJobs.attempts, cvGoogleDriveExportJobs.maxAttempts),
    ));
    if (googleDriveMutationRowCount(claimed) !== 1) continue;
    const result = await processGoogleDriveExportJob(candidate.id);
    results.push(result);
    // Google has just revoked the authorization: the next copies would be
    // refused too, so they stay queued, unclaimed, until the reconnection (REC-09).
    if ("reconnectRequired" in result && result.reconnectRequired) return { processed: results.length, waitingForAuthorization: true, reconnectRequired: true, results };
  }
  return { processed: results.length, waitingForAuthorization: false, reconnectRequired: false, results };
}
