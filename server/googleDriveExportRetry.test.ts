import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, cvGoogleDriveExportJobs, googleDriveConnections } from "../drizzle/schema";
import { encryptGoogleDriveRefreshToken, processDueCvGoogleDriveExports, retryCvGoogleDriveExport } from "./googleDriveExport";

const database = vi.hoisted(() => ({ getDb: vi.fn() }));
const storage = vi.hoisted(() => ({ storageGetSignedUrl: vi.fn() }));
const audit = vi.hoisted(() => ({ logRecruitmentAction: vi.fn() }));

vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./storage", () => ({ storageGetSignedUrl: storage.storageGetSignedUrl }));
vi.mock("./recruitmentAudit", () => ({ logRecruitmentAction: audit.logRecruitmentAction }));
vi.mock("./_core/env", () => ({ ENV: {
  googleDriveClientId: "test-client", googleDriveClientSecret: "test-secret", googleDriveCvFolderId: "test-folder",
} }));

type JobSnapshot = {
  id: number;
  applicationId: number;
  status: "queued" | "running" | "retry" | "completed" | "failed";
  attempts: number;
  maxAttempts: number;
  scheduledFor: Date;
};

const dialect = new PgDialect();

function whereSql(where: SQL) {
  return dialect.sqlToQuery(where);
}

function expectRetryCompareAndSet(where: SQL, job: JobSnapshot) {
  const { sql, params } = whereSql(where);
  expect(sql).toMatch(/"id"\s*=\s*\$\d+/);
  expect(sql).toMatch(/"status"\s*=\s*\$\d+/);
  expect(sql).toMatch(/"attempts"\s*=\s*\$\d+/);
  expect(params).toEqual(expect.arrayContaining([job.id, job.status, job.attempts]));
}

function retryDatabase(reads: JobSnapshot[], update: (values: Record<string, unknown>, where: SQL) => unknown) {
  let readIndex = 0;
  const db = {
    select: vi.fn(() => ({
      from: (table: unknown) => {
        expect(table).toBe(cvGoogleDriveExportJobs);
        return {
          where: () => ({
            limit: async () => {
              const row = reads[readIndex++];
              return row ? [{ ...row }] : [];
            },
          }),
        };
      },
    })),
    update: vi.fn((table: unknown) => {
      expect(table).toBe(cvGoogleDriveExportJobs);
      return { set: (values: Record<string, unknown>) => ({ where: (where: SQL) => update(values, where) }) };
    }),
    insert: vi.fn(() => { throw new Error("unexpected insert"); }),
  };
  database.getDb.mockResolvedValue(db);
  return db;
}

function stubDriveFetch(failToken = false) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      if (failToken) throw new Error("token unavailable");
      return { ok: true, json: async () => ({ access_token: "test-access-token" }) };
    }
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      return { ok: true, json: async () => ({ files: [{ id: "existing-drive-file", webViewLink: "https://drive.google.com/test-file" }] }) };
    }
    throw new Error(`unexpected network request: ${url}`);
  }));
}

function expectCurrentClaim(where: SQL, job: JobSnapshot & { startedAt: Date | null }) {
  const { sql, params } = whereSql(where);
  expect(sql).toMatch(/"id"\s*=\s*\$\d+/);
  expect(sql).toMatch(/"status"\s*=\s*\$\d+/);
  expect(sql).toMatch(/"attempts"\s*=\s*\$\d+/);
  expect(sql).toMatch(/"started_at"\s*=\s*\$\d+/);
  expect(params).toEqual(expect.arrayContaining([job.id, "running", job.attempts, job.startedAt?.toISOString()]));
}

function workerDatabase(options: { outcomeRowCount: 0 | 1; telemetryFails?: boolean }) {
  const candidate: JobSnapshot = {
    id: 84, applicationId: 208, status: "queued", attempts: 1, maxAttempts: 5,
    scheduledFor: new Date("2026-09-01T10:00:00Z"),
  };
  const runningJob: JobSnapshot & { startedAt: Date | null } = { ...candidate, startedAt: null };
  const application = {
    id: candidate.applicationId, trackingId: "CV208", fileValidationStatus: "accepted",
    cvFileKey: "never-read", cvOriginalName: "cv.pdf", cvMimeType: "application/pdf",
  };
  const encrypted = encryptGoogleDriveRefreshToken("test-refresh-token");
  const connection = {
    id: 1, authorizedByOpenId: "test-admin", folderId: "test-folder",
    refreshTokenCiphertext: encrypted.ciphertext,
    refreshTokenIv: encrypted.iv,
    refreshTokenAuthTag: encrypted.authTag,
  };
  const reads: Array<{ table: unknown; rows: () => unknown[] }> = [
    { table: googleDriveConnections, rows: () => [{ id: connection.id }] },
    { table: cvGoogleDriveExportJobs, rows: () => [candidate] },
    { table: cvGoogleDriveExportJobs, rows: () => [{ ...runningJob }] },
    { table: cvApplications, rows: () => [application] },
    { table: googleDriveConnections, rows: () => [connection] },
  ];
  let readIndex = 0;
  const jobWrites: Array<Record<string, unknown>> = [];
  const telemetryWrites: Array<Record<string, unknown>> = [];
  const db = {
    select: vi.fn(() => ({
      from: (table: unknown) => {
        const read = reads[readIndex++];
        expect(table).toBe(read?.table);
        const result = () => read.rows();
        return { where: () => ({ limit: async () => result(), orderBy: () => ({ limit: async () => result() }) }) };
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (where: SQL) => {
          if (table === googleDriveConnections) {
            telemetryWrites.push(values);
            if (options.telemetryFails) throw new Error("telemetry unavailable");
            return { rowCount: 1 };
          }
          expect(table).toBe(cvGoogleDriveExportJobs);
          jobWrites.push(values);
          if (values.status === "running") {
            runningJob.status = "running";
            runningJob.attempts = values.attempts as number;
            runningJob.startedAt = values.startedAt as Date;
            return { rowCount: 1 };
          }
          expectCurrentClaim(where, runningJob);
          if (options.outcomeRowCount === 1) runningJob.status = values.status as JobSnapshot["status"];
          return { rowCount: options.outcomeRowCount };
        },
      }),
    })),
  };
  database.getDb.mockResolvedValue(db);
  return { db, candidate, runningJob, jobWrites, telemetryWrites };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CANDIDATE_DOCUMENT_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("unexpected network request"); }));
  storage.storageGetSignedUrl.mockImplementation(() => { throw new Error("unexpected storage access"); });
  audit.logRecruitmentAction.mockImplementation(() => { throw new Error("unexpected audit write"); });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("reprise traçable des exports Google Drive", () => {
  it.each(["running", "completed"] as const)(
    "ne rouvre pas une copie passée à l’état %s pendant la reprise",
    async status => {
      const original: JobSnapshot = {
        id: 81, applicationId: 205, status: "retry", attempts: 1, maxAttempts: 5,
        scheduledFor: new Date("2026-09-01T10:00:00Z"),
      };
      const changed: JobSnapshot = { ...original, status, attempts: 2 };
      const db = retryDatabase([original, changed], (values, where) => {
        expectRetryCompareAndSet(where, original);
        expect(values.status).toBe("queued");
        return { rowCount: 0 }; // The worker won the compare-and-set race.
      });

      const result = await retryCvGoogleDriveExport(original.applicationId, new Date("2026-09-01T10:01:00Z"));

      expect(result).toMatchObject({ queued: false, alreadyRunning: status === "running", alreadyCompleted: status === "completed" });
      expect(db.update).toHaveBeenCalledTimes(1);
      expect(db.select).toHaveBeenCalledTimes(2);
      expect(db.insert).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it.each(["queued", "retry"] as const)("réarme le budget épuisé d’un export %s", async status => {
    const original: JobSnapshot = {
      id: 82, applicationId: 206, status, attempts: 5, maxAttempts: 5,
      scheduledFor: new Date("2026-09-01T10:00:00Z"),
    };
    const requestedAt = new Date("2026-09-01T10:01:00Z");
    const db = retryDatabase([original], (values, where) => {
      expectRetryCompareAndSet(where, original);
      expect(values).toMatchObject({ status: "queued", attempts: 0, scheduledFor: requestedAt, lastError: null, updatedAt: requestedAt });
      return { rowCount: 1 };
    });

    await expect(retryCvGoogleDriveExport(original.applicationId, requestedAt)).resolves.toMatchObject({
      queued: true, accelerated: true, reset: true, alreadyRunning: false, alreadyCompleted: false,
    });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuse une prise en charge devenue périmée avant le claim", async () => {
    const scheduledFor = new Date("2026-09-01T10:00:00Z");
    const candidate: JobSnapshot = {
      id: 83, applicationId: 207, status: "queued", attempts: 1, maxAttempts: 5, scheduledFor,
    };
    const db = {
      select: vi.fn(() => ({
        from: (table: unknown) => {
          if (table === googleDriveConnections) {
            return { where: () => ({ limit: async () => [{ id: 1 }] }) };
          }
          expect(table).toBe(cvGoogleDriveExportJobs);
          return { where: (where: SQL) => {
            const { sql } = whereSql(where);
            expect(sql).toContain('"scheduled_for" <=');
            expect(sql).toContain('"attempts" <');
            return { orderBy: () => ({ limit: async () => [candidate] }) };
          } };
        },
      })),
      update: vi.fn((table: unknown) => {
        expect(table).toBe(cvGoogleDriveExportJobs);
        return { set: (values: Record<string, unknown>) => ({
          where: async (where: SQL) => {
            const { sql, params } = whereSql(where);
            expect(values).toMatchObject({ status: "running", attempts: 2 });
            expect(sql).toMatch(/"id"\s*=\s*\$\d+/);
            expect(sql).toMatch(/"status"\s*=\s*\$\d+/);
            expect(sql).toMatch(/"scheduled_for"\s*=\s*\$\d+/);
            expect(sql).toMatch(/"scheduled_for"\s*<=\s*\$\d+/);
            expect(sql).toMatch(/"attempts"\s*=\s*\$\d+/);
            expect(sql).toMatch(/"attempts"\s*<\s*"cv_google_drive_export_jobs"\."max_attempts"/);
            expect(params).toEqual(expect.arrayContaining([candidate.id, candidate.status, scheduledFor.toISOString(), candidate.attempts]));
            return { rowCount: 0 }; // A rival worker rescheduled or claimed this row.
          },
        }) };
      }),
    };
    database.getDb.mockResolvedValue(db);

    await expect(processDueCvGoogleDriveExports(1, [candidate.applicationId])).resolves.toMatchObject({
      processed: 0, waitingForAuthorization: false, results: [],
    });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(storage.storageGetSignedUrl).not.toHaveBeenCalled();
    expect(audit.logRecruitmentAction).not.toHaveBeenCalled();
  });

  it.each(["completed", "retry"] as const)(
    "ignore un résultat %s lorsque le worker a perdu son claim",
    async outcome => {
      const { db, candidate, jobWrites, telemetryWrites } = workerDatabase({ outcomeRowCount: 0 });
      stubDriveFetch(outcome === "retry");

      const result = await processDueCvGoogleDriveExports(1, [candidate.applicationId]);

      expect(result).toMatchObject({ processed: 1, waitingForAuthorization: false, results: [{ skipped: true, reason: "claim_lost" }] });
      expect(jobWrites.map(write => write.status)).toEqual(["running", outcome]);
      expect(telemetryWrites).toEqual([]);
      expect(db.update).toHaveBeenCalledTimes(2);
      expect(audit.logRecruitmentAction).not.toHaveBeenCalled();
      expect(storage.storageGetSignedUrl).not.toHaveBeenCalled();
    },
  );

  it.each(["telemetry", "audit"] as const)(
    "garde le CV terminé si %s échoue après le commit",
    async failingStep => {
      const { candidate, runningJob, jobWrites, telemetryWrites } = workerDatabase({
        outcomeRowCount: 1, telemetryFails: failingStep === "telemetry",
      });
      stubDriveFetch();
      audit.logRecruitmentAction.mockImplementation(async () => {
        if (failingStep === "audit") throw new Error("audit unavailable");
      });
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await processDueCvGoogleDriveExports(1, [candidate.applicationId]);

      expect(result).toMatchObject({
        processed: 1, waitingForAuthorization: false,
        results: [{ completed: true, applicationId: candidate.applicationId, driveFileId: "existing-drive-file" }],
      });
      expect(runningJob.status).toBe("completed");
      expect(jobWrites.map(write => write.status)).toEqual(["running", "completed"]);
      expect(telemetryWrites).toHaveLength(1);
      expect(audit.logRecruitmentAction).toHaveBeenCalledTimes(failingStep === "audit" ? 1 : 0);
      expect(consoleError).toHaveBeenCalledWith("google_drive_export_post_commit_failed", { applicationId: candidate.applicationId });
      expect(storage.storageGetSignedUrl).not.toHaveBeenCalled();
    },
  );
});
