import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lte } from "drizzle-orm";
import { cvApplications, cvGoogleDriveExportJobs, googleDriveConnections } from "../drizzle/schema";
import { getDb } from "./db";
import { logRecruitmentAction } from "./recruitmentAudit";
import { storageGetSignedUrl } from "./storage";
import { ENV } from "./_core/env";

const CONNECTION_KEY = "recruitment_cv_export";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const CALLBACK_PATH = "/api/google-drive/oauth/callback";
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 3;
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

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

async function downloadCvBuffer(storageKey: string) {
  const signedUrl = await storageGetSignedUrl(storageKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`google_drive_cv_download_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function uploadCvToGoogleDrive(input: {
  accessToken: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
}) {
  const boundary = `drive-export-${randomBytes(12).toString("hex")}`;
  const metadata = JSON.stringify({ name: input.fileName, parents: [input.folderId] });
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

export async function googleDriveExportStatus() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const connection = (await db.select({ connectedAt: googleDriveConnections.connectedAt, lastUsedAt: googleDriveConnections.lastUsedAt, lastError: googleDriveConnections.lastError, folderId: googleDriveConnections.folderId })
    .from(googleDriveConnections)
    .where(eq(googleDriveConnections.connectionKey, CONNECTION_KEY))
    .limit(1))[0];
  return connection ? { connected: true, ...connection } : { connected: false, connectedAt: null, lastUsedAt: null, lastError: null, folderId: null };
}

export async function enqueueCvGoogleDriveExport(applicationId: number, scheduledFor = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.insert(cvGoogleDriveExportJobs).values({ applicationId, status: "queued", attempts: 0, maxAttempts: MAX_ATTEMPTS, scheduledFor })
    .onConflictDoUpdate({
      target: cvGoogleDriveExportJobs.applicationId,
      set: { status: "queued", scheduledFor, lastError: null, finishedAt: null },
    });
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
    .where(and(
      inArray(cvApplications.status, ["new", "reviewing", "shortlisted", "placed"]),
      inArray(cvApplications.fileValidationStatus, ["quarantined", "accepted"]),
    ))
    .orderBy(cvApplications.createdAt)
    .limit(Math.min(Math.max(limit, 1), 100));

  let queued = 0;
  let accelerated = 0;
  for (const application of applications) {
    const [existingJob] = await db.select({ status: cvGoogleDriveExportJobs.status })
      .from(cvGoogleDriveExportJobs)
      .where(eq(cvGoogleDriveExportJobs.applicationId, application.id))
      .limit(1);
    if (existingJob && ["queued", "retry"].includes(existingJob.status)) {
      await db.update(cvGoogleDriveExportJobs).set({ scheduledFor: new Date() })
        .where(and(eq(cvGoogleDriveExportJobs.applicationId, application.id), inArray(cvGoogleDriveExportJobs.status, ["queued", "retry"])));
      accelerated += 1;
      continue;
    }
    if (existingJob) continue;
    const result = await db.insert(cvGoogleDriveExportJobs).values({
      applicationId: application.id,
      status: "queued",
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      scheduledFor: new Date(),
    }).onConflictDoNothing();
    const header = Array.isArray(result) ? result[0] : result;
    if (header && typeof header === "object" && "affectedRows" in header && header.affectedRows === 1) queued += 1;
  }

  return { inspected: applications.length, queued, accelerated };
}

/** Release export jobs left in `running` by an interrupted serverless worker. */
export async function recoverStaleCvGoogleDriveExportJobs(staleAfterMs = 15 * 60_000) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = new Date();
  const result = await db.update(cvGoogleDriveExportJobs).set({
    status: "retry",
    scheduledFor: now,
    startedAt: null,
    finishedAt: null,
    lastError: "worker_interrupted",
  }).where(and(
    eq(cvGoogleDriveExportJobs.status, "running"),
    lte(cvGoogleDriveExportJobs.startedAt, new Date(now.getTime() - staleAfterMs)),
  ));
  const header = Array.isArray(result) ? result[0] : result;
  return { recovered: header && typeof header === "object" && "affectedRows" in header && typeof header.affectedRows === "number" ? header.affectedRows : 0 };
}

async function processGoogleDriveExportJob(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const job = (await db.select().from(cvGoogleDriveExportJobs).where(eq(cvGoogleDriveExportJobs.id, jobId)).limit(1))[0];
  if (!job || job.status !== "running") return { skipped: true, reason: "not_claimed" as const };
  const application = (await db.select().from(cvApplications).where(eq(cvApplications.id, job.applicationId)).limit(1))[0];
  const connection = (await db.select().from(googleDriveConnections).where(eq(googleDriveConnections.connectionKey, CONNECTION_KEY)).limit(1))[0];
  if (!application || !connection) {
    await db.update(cvGoogleDriveExportJobs).set({ status: "queued", scheduledFor: new Date(Date.now() + 5 * 60_000), startedAt: null }).where(eq(cvGoogleDriveExportJobs.id, job.id));
    return { skipped: true, reason: application ? "connection_missing" as const : "application_missing" as const };
  }
  if (application.fileValidationStatus !== "accepted") {
    await db.update(cvGoogleDriveExportJobs).set({ status: "queued", scheduledFor: new Date(Date.now() + 60_000), startedAt: null }).where(eq(cvGoogleDriveExportJobs.id, job.id));
    return { skipped: true, reason: "cv_not_accepted" as const };
  }
  try {
    const accessToken = await getGoogleDriveAccessToken(connection);
    const content = await downloadCvBuffer(application.cvFileKey);
    const driveFile = await uploadCvToGoogleDrive({
      accessToken,
      folderId: connection.folderId,
      fileName: googleDriveCvFileName(application.trackingId, application.cvOriginalName),
      mimeType: application.cvMimeType,
      content,
    });
    const now = new Date();
    await db.update(cvGoogleDriveExportJobs).set({ status: "completed", driveFileId: driveFile.id, driveFileUrl: driveFile.webViewLink, lastError: null, finishedAt: now }).where(eq(cvGoogleDriveExportJobs.id, job.id));
    await db.update(googleDriveConnections).set({ lastUsedAt: now, lastError: null }).where(eq(googleDriveConnections.id, connection.id));
    await logRecruitmentAction({ applicationId: application.id, adminOpenId: connection.authorizedByOpenId, action: "export", metadata: { destination: "google_drive", driveFileId: driveFile.id, trackingId: application.trackingId } });
    return { completed: true, applicationId: application.id, driveFileId: driveFile.id };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "google_drive_export_unknown";
    const finalFailure = job.attempts >= job.maxAttempts;
    const now = new Date();
    await db.update(cvGoogleDriveExportJobs).set({
      status: finalFailure ? "failed" : "retry",
      lastError: message,
      scheduledFor: new Date(now.getTime() + googleDriveRetryDelayMs(job.attempts)),
      finishedAt: finalFailure ? now : null,
    }).where(eq(cvGoogleDriveExportJobs.id, job.id));
    await db.update(googleDriveConnections).set({ lastError: message }).where(eq(googleDriveConnections.id, connection.id));
    return { completed: false, applicationId: job.applicationId, retry: !finalFailure, error: message };
  }
}

export async function processDueCvGoogleDriveExports(limit = BATCH_SIZE) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const connection = (await db.select({ id: googleDriveConnections.id }).from(googleDriveConnections).where(eq(googleDriveConnections.connectionKey, CONNECTION_KEY)).limit(1))[0];
  if (!connection) return { processed: 0, waitingForAuthorization: true, results: [] as Array<Record<string, unknown>> };
  const now = new Date();
  const candidates = await db.select().from(cvGoogleDriveExportJobs).where(and(inArray(cvGoogleDriveExportJobs.status, ["queued", "retry"]), lte(cvGoogleDriveExportJobs.scheduledFor, now))).orderBy(cvGoogleDriveExportJobs.scheduledFor).limit(Math.min(Math.max(limit, 1), BATCH_SIZE));
  const results: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    const startedAt = new Date();
    const claimed = await db.update(cvGoogleDriveExportJobs).set({ status: "running", attempts: candidate.attempts + 1, startedAt, finishedAt: null }).where(and(eq(cvGoogleDriveExportJobs.id, candidate.id), inArray(cvGoogleDriveExportJobs.status, ["queued", "retry"])));
    const header = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!header || typeof header !== "object" || !("affectedRows" in header) || header.affectedRows !== 1) continue;
    results.push(await processGoogleDriveExportJob(candidate.id));
  }
  return { processed: results.length, waitingForAuthorization: false, results };
}
