import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { candidateSecurityRateLimits, cvApplications, cvGoogleDriveExportJobs, googleDriveConnections, recruitmentAuditLogs } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// DATA-01 — la copie d'un CV sur Google Drive est faite au-dehors : quand la
// base refuse sa ligne d'audit, la copie reste faite et enregistrée (jamais
// recommencée), l'échec est journalisé, et l'admin qui l'a relancée lit
// qu'elle est faite et que sa trace n'a pas pu être écrite, jamais « rien
// n'a été modifié ».

const state = vi.hoisted(() => {
  process.env.GOOGLE_DRIVE_CLIENT_ID ||= "client-id";
  process.env.GOOGLE_DRIVE_CLIENT_SECRET ||= "client-secret";
  process.env.GOOGLE_DRIVE_CV_FOLDER_ID ||= "folder-id";
  process.env.CANDIDATE_DOCUMENT_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  return { memory: null as null | { db: unknown }, uploads: [] as string[] };
});

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
  isAdminMfaVerified: vi.fn(async () => true),
}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./storage", () => ({ storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`) }));

const { encryptGoogleDriveRefreshToken, processDueCvGoogleDriveExports } = await import("./googleDriveExport");
const { appRouter } = await import("./routers");

let memory: MemoryPg;

function admin() {
  return appRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  }).admin;
}

function seedConnection() {
  const encrypted = encryptGoogleDriveRefreshToken("refresh-token");
  memory.seed(googleDriveConnections, [{
    connection_key: "recruitment_cv_export", authorized_by_open_id: "user_owner", folder_id: "folder-id",
    refresh_token_ciphertext: encrypted.ciphertext, refresh_token_iv: encrypted.iv, refresh_token_auth_tag: encrypted.authTag,
  }]);
}

function seedCopy(index: number, job: Record<string, unknown> = {}) {
  const [row] = memory.seed(cvApplications, [{
    tracking_id: `CVAUDIT${String(index).padStart(8, "0")}`, first_name: "Zoé", last_name: `Kowalska${index}`, email: `zoe${index}@test.local`, specialty: "Anesthésie",
    target_countries: "[]", cv_file_key: `recruitment/cv/${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, file_validation_status: "accepted",
  }]);
  memory.seed(cvGoogleDriveExportJobs, [{ application_id: row!.id, status: "queued", attempts: 0, max_attempts: 5, scheduled_for: new Date(Date.now() - 60_000), ...job }]);
  return row!.id as number;
}

const copyOf = (applicationId: number) => memory.rows(cvGoogleDriveExportJobs).find(row => row.application_id === applicationId)!;
const auditLines = () => memory.rows(recruitmentAuditLogs).map(row => JSON.parse(String(row.metadata)) as Record<string, unknown>);
const refuseAuditLines = (times: number) => memory.failNext(/^insert into "recruitment_audit_logs"/, times, "23514");
const doneNotTraced = { code: "INTERNAL_SERVER_ERROR", message: "L’action est faite. Sa trace n’a pas pu être écrite dans le journal d’audit.", cause: { reason: "audit_not_recorded" } };

beforeEach(() => {
  memory = createMemoryPg([cvApplications, cvGoogleDriveExportJobs, googleDriveConnections, recruitmentAuditLogs, candidateSecurityRateLimits]);
  state.memory = memory;
  state.uploads = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "access" }), { status: 200 });
    if (url.hostname === "blob.test") return new Response(Buffer.from("%PDF-1.7 cv"));
    if (url.pathname.startsWith("/upload/drive/v3/files") && init?.method === "POST") {
      state.uploads.push(String(init.body).match(/CVAUDIT\d+/)?.[0] ?? "?");
      return new Response(JSON.stringify({ id: `file-${state.uploads.length}`, webViewLink: `https://drive.google.com/file-${state.uploads.length}` }));
    }
    if (url.pathname === "/drive/v3/files") return new Response(JSON.stringify({ files: [] }));
    throw new Error(`unexpected request ${url}`);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DATA-01 — copie Google Drive faite, ligne d'audit refusée", () => {
  it("le cron garde la copie faite et enregistrée, journalise le refus, et ne la recommence pas", async () => {
    seedConnection();
    const id = seedCopy(1);
    refuseAuditLines(1);

    expect(await processDueCvGoogleDriveExports(3)).toMatchObject({ processed: 1, results: [{ completed: true, applicationId: id, driveFileId: "file-1" }] });
    expect(copyOf(id)).toMatchObject({ status: "completed", drive_file_id: "file-1", last_error: null });
    expect(memory.rows(googleDriveConnections)[0]!.last_used_at).not.toBeNull();
    expect(auditLines()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith("[Recruitment] Action done, its audit lines not recorded", expect.objectContaining({ actions: ["export"], count: 1, code: "23514" }));
    // The next pass has nothing left to copy.
    expect(await processDueCvGoogleDriveExports(3)).toMatchObject({ processed: 0 });
    expect(state.uploads).toEqual(["CVAUDIT00000001"]);
  });

  it("une mise à jour de la connexion refusée n'empêche pas la ligne d'audit de la copie", async () => {
    seedConnection();
    const id = seedCopy(2);
    memory.failNext(/^update "google_drive_connections"/, 1);

    expect(await processDueCvGoogleDriveExports(3)).toMatchObject({ processed: 1, results: [{ completed: true }] });
    expect(copyOf(id).status).toBe("completed");
    expect(auditLines()).toEqual([expect.objectContaining({ destination: "google_drive", driveFileId: "file-1", trackingId: "CVAUDIT00000002" })]);
  });

  it("« Relancer la copie » et « Relancer toutes les copies échouées » disent la copie relancée faite quand sa trace est refusée", async () => {
    seedConnection();
    const id = seedCopy(3, { status: "failed", attempts: 5, last_error: "google_drive_upload_500_Backend Error" });
    // The copy's line, then the admin's.
    refuseAuditLines(2);
    await expect(admin().recruitment.driveExport.retry({ id })).rejects.toMatchObject(doneNotTraced);
    expect(copyOf(id)).toMatchObject({ status: "completed", drive_file_id: "file-1" });
    expect(state.uploads).toEqual(["CVAUDIT00000003"]);

    const failed = [seedCopy(4, { status: "failed", attempts: 5, last_error: "google_drive_upload_500_Backend Error" }), seedCopy(5, { status: "failed", attempts: 5, last_error: "google_drive_upload_500_Backend Error" })];
    refuseAuditLines(1);
    await expect(admin().recruitment.driveExport.retryAllFailed()).rejects.toMatchObject(doneNotTraced);
    // Requeued, both: the next pass of the cron copies them.
    expect(failed.map(applicationId => copyOf(applicationId))).toEqual(failed.map(() => expect.objectContaining({ status: "queued", attempts: 0, last_error: null })));
    expect(auditLines()).toEqual([]);
    expect(await processDueCvGoogleDriveExports(3)).toMatchObject({ processed: 2 });
    expect(state.uploads).toEqual(["CVAUDIT00000003", "CVAUDIT00000004", "CVAUDIT00000005"]);
  });
});
