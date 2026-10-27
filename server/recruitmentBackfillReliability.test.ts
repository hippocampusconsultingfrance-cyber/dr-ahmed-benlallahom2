import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, cvGoogleDriveExportJobs, cvProcessingJobs, googleDriveConnections, recruitmentAuditLogs } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { seedApplication } from "./testSupport/candidatePortal";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";

// Rattrapage et reprise des traitements de candidature, exécutés sur une base
// en mémoire : les rattrapages (jointure gauche) sur le stand-in drizzle, les
// copies Drive et la reprise des analyses sur le proxy PostgreSQL en mémoire.
const state = vi.hoisted(() => {
  process.env.GOOGLE_DRIVE_CLIENT_ID ||= "client-id";
  process.env.GOOGLE_DRIVE_CLIENT_SECRET ||= "client-secret";
  process.env.GOOGLE_DRIVE_CV_FOLDER_ID ||= "folder-id";
  process.env.CANDIDATE_DOCUMENT_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  return { db: null as unknown, existingDriveFile: null as null | { id: string; webViewLink: string }, uploads: 0, driveRequests: 0 };
});

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./storage", () => ({ storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`) }));

const { backfillLegacyCvAnalysisJobs, processDueCvAnalysisJobs, recoverStaleCvAnalysisJobs } = await import("./recruitmentProcessing");
const { backfillCvGoogleDriveExportJobs, encryptGoogleDriveRefreshToken, enqueueCvGoogleDriveExport, googleDriveFileDisposition, googleDriveFileLookupQuery, processDueCvGoogleDriveExports } = await import("./googleDriveExport");

const MINUTE = 60_000;

beforeEach(() => {
  state.db = null;
  state.existingDriveFile = null;
  state.uploads = 0;
  state.driveRequests = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "access" }));
    state.driveRequests += 1;
    if (url.hostname === "blob.test") return new Response(Buffer.from("%PDF-1.7 cv"));
    if (url.pathname === "/drive/v3/files") return new Response(JSON.stringify({ files: state.existingDriveFile ? [state.existingDriveFile] : [] }));
    if (url.pathname.startsWith("/upload/drive/v3/files") && init?.method === "POST") {
      state.uploads += 1;
      return new Response(JSON.stringify({ id: `uploaded-${state.uploads}`, webViewLink: `https://drive.google.com/uploaded-${state.uploads}` }));
    }
    throw new Error(`unexpected request ${url}`);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rattrapage fiable des traitements de candidature", () => {
  function backfillDb() {
    const db = createInMemoryDrizzle();
    state.db = db;
    return db;
  }

  function application(db: InMemoryDrizzle, email: string, values: Record<string, unknown> = {}) {
    return Object.assign(seedApplication(db, { email }), values).id as number;
  }

  it("ne sélectionne que les CV sans tâche IA et conserve le délai des reprises", async () => {
    const db = backfillDb();
    const later = new Date(Date.now() + 10 * MINUTE);
    const withoutJob = application(db, "sans-tache@test.local");
    const waiting = application(db, "en-reprise@test.local");
    const failed = application(db, "en-echec@test.local");
    application(db, "refuse@test.local", { status: "rejected" });
    application(db, "accepte@test.local", { fileValidationStatus: "accepted" });
    db.seed(cvProcessingJobs, { applicationId: waiting, status: "retry", attempts: 1, scheduledFor: later, lastError: "ai_timeout" });
    db.seed(cvProcessingJobs, { applicationId: failed, status: "failed", attempts: 3, lastError: "ai_failed" });

    await expect(backfillLegacyCvAnalysisJobs()).resolves.toEqual({ inspected: 1, queued: 1, accelerated: 0 });

    expect(db.rows(cvProcessingJobs).map(job => [job.applicationId, job.status, job.attempts])).toEqual([
      [waiting, "retry", 1],
      [failed, "failed", 3],
      [withoutJob, "queued", 0],
    ]);
    // The retry keeps its backoff: it is not brought forward to now.
    expect(db.rows(cvProcessingJobs)[0]).toMatchObject({ scheduledFor: later, lastError: "ai_timeout" });
  });

  it("ne sélectionne que les CV sans tâche Drive et ne court-circuite pas le backoff", async () => {
    const db = backfillDb();
    const later = new Date(Date.now() + 10 * MINUTE);
    const accepted = application(db, "accepte@test.local", { fileValidationStatus: "accepted" });
    const quarantined = application(db, "quarantaine@test.local");
    application(db, "cv-refuse@test.local", { fileValidationStatus: "rejected" });
    application(db, "archive@test.local", { fileValidationStatus: "accepted", status: "archived" });
    const waiting = application(db, "en-reprise@test.local", { fileValidationStatus: "accepted" });
    const failed = application(db, "en-echec@test.local", { fileValidationStatus: "accepted" });
    db.seed(cvGoogleDriveExportJobs, { applicationId: waiting, status: "retry", attempts: 2, scheduledFor: later, lastError: "Backend Error" });
    db.seed(cvGoogleDriveExportJobs, { applicationId: failed, status: "failed", attempts: 5, lastError: "Backend Error" });

    await expect(backfillCvGoogleDriveExportJobs()).resolves.toEqual({ inspected: 2, queued: 2, accelerated: 0 });

    expect(db.rows(cvGoogleDriveExportJobs).map(job => [job.applicationId, job.status, job.attempts])).toEqual([
      [waiting, "retry", 2],
      [failed, "failed", 5],
      [accepted, "queued", 0],
      [quarantined, "queued", 0],
    ]);
    expect(db.rows(cvGoogleDriveExportJobs)[0]).toMatchObject({ scheduledFor: later, lastError: "Backend Error" });
  });
});

describe("copies Drive et reprise des analyses", () => {
  let memory: MemoryPg;

  beforeEach(() => {
    memory = createMemoryPg([cvApplications, cvGoogleDriveExportJobs, cvProcessingJobs, googleDriveConnections, recruitmentAuditLogs]);
    state.db = memory.db;
  });

  function seedConnection() {
    const encrypted = encryptGoogleDriveRefreshToken("refresh-token");
    memory.seed(googleDriveConnections, [{
      connection_key: "recruitment_cv_export", authorized_by_open_id: "user_owner", folder_id: "folder-id",
      refresh_token_ciphertext: encrypted.ciphertext, refresh_token_iv: encrypted.iv, refresh_token_auth_tag: encrypted.authTag,
    }]);
  }

  function seedApplicationRow(index: number, values: Record<string, unknown> = {}) {
    const [row] = memory.seed(cvApplications, [{
      tracking_id: `CVBACK${String(index).padStart(8, "0")}`, first_name: "Zoé", last_name: `Kowalska${index}`, email: `zoe${index}@test.local`, specialty: "Anesthésie",
      target_countries: "[]", cv_file_key: `recruitment/cv/${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
      file_validation_status: "accepted", ...values,
    }]);
    return row!.id as number;
  }

  function seedDriveJob(applicationId: number, values: Record<string, unknown> = {}) {
    memory.seed(cvGoogleDriveExportJobs, [{ application_id: applicationId, status: "queued", attempts: 0, max_attempts: 5, scheduled_for: new Date(Date.now() - MINUTE), ...values }]);
  }

  const driveJobOf = (applicationId: number) => memory.rows(cvGoogleDriveExportJobs).find(row => row.application_id === applicationId)!;

  it("retrouve une copie Drive existante avant un nouvel upload", async () => {
    expect(googleDriveFileLookupQuery("folder'\\id", "CV'\\42")).toBe(
      "'folder\\'\\\\id' in parents and trashed = false and appProperties has { key='recruitmentTrackingId' and value='CV\\'\\\\42' }",
    );
    seedConnection();
    const alreadyCopied = seedApplicationRow(1);
    seedDriveJob(alreadyCopied);
    state.existingDriveFile = { id: "drive-existing", webViewLink: "https://drive.google.com/drive-existing" };

    await processDueCvGoogleDriveExports();

    expect(state.uploads).toBe(0);
    expect(driveJobOf(alreadyCopied)).toMatchObject({ status: "completed", drive_file_id: "drive-existing" });
    const [audit] = memory.rows(recruitmentAuditLogs);
    expect(JSON.parse(String(audit!.metadata))).toMatchObject({ driveFileId: "drive-existing", reusedExistingFile: true });

    // Not found in the folder: uploaded, once.
    state.existingDriveFile = null;
    const notCopied = seedApplicationRow(2);
    seedDriveJob(notCopied);
    await processDueCvGoogleDriveExports();
    expect(state.uploads).toBe(1);
    expect(driveJobOf(notCopied)).toMatchObject({ status: "completed", drive_file_id: "uploaded-1" });
  });

  it("ne rouvre pas automatiquement une tâche Drive déjà terminale", async () => {
    const failed = seedApplicationRow(1);
    const completed = seedApplicationRow(2);
    seedDriveJob(failed, { status: "failed", attempts: 5, last_error: "Backend Error" });
    seedDriveJob(completed, { status: "completed", attempts: 1, drive_file_id: "drive-1" });
    const before = memory.rows(cvGoogleDriveExportJobs).map(row => ({ ...row }));

    await enqueueCvGoogleDriveExport(failed);
    await enqueueCvGoogleDriveExport(completed);

    expect(memory.rows(cvGoogleDriveExportJobs)).toEqual(before);
  });

  it("n’épuise pas les tentatives Drive en attendant la validation du CV", async () => {
    expect(googleDriveFileDisposition("accepted")).toBe("ready");
    expect(googleDriveFileDisposition("quarantined")).toBe("waiting");
    expect(googleDriveFileDisposition("rejected")).toBe("terminal_failure");
    expect(googleDriveFileDisposition("validation_failed")).toBe("terminal_failure");
    seedConnection();
    const quarantined = seedApplicationRow(1, { file_validation_status: "quarantined" });
    const rejected = seedApplicationRow(2, { file_validation_status: "rejected" });
    seedDriveJob(quarantined, { attempts: 2 });
    seedDriveJob(rejected, { attempts: 1 });
    const startedAt = Date.now();

    await processDueCvGoogleDriveExports();

    // Waiting for its validation: the claimed attempt is given back and the copy is tried again a minute later.
    const waiting = driveJobOf(quarantined);
    expect(waiting).toMatchObject({ status: "queued", attempts: 2, started_at: null });
    expect(new Date(`${waiting.scheduled_for}Z`).getTime()).toBeGreaterThanOrEqual(startedAt + MINUTE - 1_000);
    // A refused CV is never copied: the copy ends, with the reason.
    expect(driveJobOf(rejected)).toMatchObject({ status: "failed", attempts: 2, last_error: "cv_rejected" });
    expect(state.driveRequests).toBe(0);
  });

  it("ne relance pas un job IA dont le budget de tentatives est épuisé", async () => {
    const now = Date.now();
    const exhausted = seedApplicationRow(1, { analysis_status: "queued" });
    const interrupted = seedApplicationRow(2, { analysis_status: "analyzing" });
    const recent = seedApplicationRow(3, { analysis_status: "analyzing" });
    memory.seed(cvProcessingJobs, [
      { application_id: exhausted, job_status: "queued", attempts: 3, max_attempts: 3, scheduled_for: new Date(now - MINUTE) },
      { application_id: interrupted, job_status: "running", attempts: 3, max_attempts: 3, started_at: new Date(now - 20 * MINUTE) },
      { application_id: recent, job_status: "running", attempts: 1, max_attempts: 3, started_at: new Date(now - MINUTE) },
    ]);

    await expect(recoverStaleCvAnalysisJobs()).resolves.toEqual({ recovered: 0, exhausted: 2 });

    const jobs = memory.rows(cvProcessingJobs);
    expect(jobs.map(job => [job.application_id, job.job_status, job.last_error])).toEqual([
      [exhausted, "failed", "worker_interrupted_attempts_exhausted"],
      [interrupted, "failed", "worker_interrupted_attempts_exhausted"],
      [recent, "running", null],
    ]);
    const applications = memory.rows(cvApplications);
    expect(applications.map(row => [row.id, row.analysis_status])).toEqual([[exhausted, "failed"], [interrupted, "failed"], [recent, "analyzing"]]);

    // The worker claims neither a job whose attempts are spent nor one whose retry is not due yet.
    const spent = seedApplicationRow(4);
    const notDue = seedApplicationRow(5);
    memory.seed(cvProcessingJobs, [
      { application_id: spent, job_status: "retry", attempts: 3, max_attempts: 3, scheduled_for: new Date(now - MINUTE) },
      { application_id: notDue, job_status: "retry", attempts: 1, max_attempts: 3, scheduled_for: new Date(now + 10 * MINUTE) },
    ]);
    const before = memory.rows(cvProcessingJobs).map(row => ({ ...row }));
    await expect(processDueCvAnalysisJobs()).resolves.toEqual({ processed: 0, results: [] });
    expect(memory.rows(cvProcessingJobs)).toEqual(before);
  });
});
