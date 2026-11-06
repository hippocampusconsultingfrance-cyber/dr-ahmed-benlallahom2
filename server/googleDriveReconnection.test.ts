import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { candidateSecurityRateLimits, cvApplications, cvGoogleDriveExportJobs, googleDriveConnections, recruitmentAuditLogs } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// REC-09 : Google Drive déconnecté (mot de passe changé, accès révoqué). Les
// copies attendent la reconnexion sans consommer de tentative, le propriétaire
// est prévenu une fois, la reconnexion les relance, et l’admin peut relancer
// toutes les copies échouées d’un clic.

const state = vi.hoisted(() => {
  process.env.GOOGLE_DRIVE_CLIENT_ID ||= "client-id";
  process.env.GOOGLE_DRIVE_CLIENT_SECRET ||= "client-secret";
  process.env.GOOGLE_DRIVE_CV_FOLDER_ID ||= "folder-id";
  process.env.CANDIDATE_DOCUMENT_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  return {
    memory: null as null | { db: unknown },
    tokenRevoked: false,
    uploadFails: false,
    tokenRequests: 0,
    uploads: [] as string[],
    // Delivered owner emails; while ownerEmailFails, notifyOwner reports a failed send (Resend down or out of quota).
    notifications: [] as Array<{ title: string; content: string }>,
    ownerEmailFails: false,
    ownerEmailAttempts: 0,
    // Idempotency key of each owner email, and the keys Resend keeps (an email
    // already taken under a kept key is not sent again). While
    // ownerEmailAnswerLost, Resend takes the email but its answer is lost (5xx, timeout).
    ownerEmailKeys: [] as Array<string | undefined>,
    keptKeys: new Set<string>(),
    ownerEmailAnswerLost: false,
  };
});

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
  isAdminMfaVerified: vi.fn(async () => true),
}));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async (payload: { title: string; content: string }, options: { idempotencyKey?: string } = {}) => {
    state.ownerEmailAttempts += 1;
    state.ownerEmailKeys.push(options.idempotencyKey);
    if (options.idempotencyKey && state.keptKeys.has(options.idempotencyKey)) return true;
    if (state.ownerEmailFails) return false;
    state.notifications.push(payload);
    if (options.idempotencyKey) state.keptKeys.add(options.idempotencyKey);
    return !state.ownerEmailAnswerLost;
  }),
}));
vi.mock("./storage", () => ({ storageGetSignedUrl: vi.fn(async (key: string) => `https://blob.test/${key}`) }));

const { deleteCvCopiesFromGoogleDrive, encryptGoogleDriveRefreshToken, googleDriveExportStatus, processDueCvGoogleDriveExports, requeueGoogleDriveExportsAfterReconnection, saveGoogleDriveConnection } = await import("./googleDriveExport");
const { appRouter } = await import("./routers");

let memory: MemoryPg;

function admin() {
  const ctx: TrpcContext = {
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

function seedConnection(lastError: string | null = null) {
  const encrypted = encryptGoogleDriveRefreshToken("refresh-token");
  memory.seed(googleDriveConnections, [{
    connection_key: "recruitment_cv_export", authorized_by_open_id: "user_owner", folder_id: "folder-id", last_error: lastError,
    refresh_token_ciphertext: encrypted.ciphertext, refresh_token_iv: encrypted.iv, refresh_token_auth_tag: encrypted.authTag,
  }]);
}

function seedCopy(index: number, job: Record<string, unknown> = {}, application: Record<string, unknown> = {}) {
  const [row] = memory.seed(cvApplications, [{
    tracking_id: `CVDRIVE${String(index).padStart(8, "0")}`, first_name: "Zoé", last_name: `Kowalska${index}`, email: `zoe${index}@test.local`, specialty: "Anesthésie",
    target_countries: "[]", cv_file_key: `recruitment/cv/${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    file_validation_status: "accepted", ...application,
  }]);
  memory.seed(cvGoogleDriveExportJobs, [{ application_id: row!.id, status: "queued", attempts: 0, max_attempts: 5, scheduled_for: new Date(Date.now() - 60_000), ...job }]);
  return row!.id as number;
}

const copyOf = (applicationId: number) => memory.rows(cvGoogleDriveExportJobs).find(row => row.application_id === applicationId)!;
const connection = () => memory.rows(googleDriveConnections)[0]!;

beforeEach(() => {
  memory = createMemoryPg([cvApplications, cvGoogleDriveExportJobs, googleDriveConnections, recruitmentAuditLogs, candidateSecurityRateLimits]);
  state.memory = memory;
  state.tokenRevoked = false;
  state.uploadFails = false;
  state.tokenRequests = 0;
  state.uploads = [];
  state.notifications = [];
  state.ownerEmailFails = false;
  state.ownerEmailAttempts = 0;
  state.ownerEmailKeys = [];
  state.keptKeys.clear();
  state.ownerEmailAnswerLost = false;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") {
      state.tokenRequests += 1;
      return state.tokenRevoked
        ? new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 400 })
        : new Response(JSON.stringify({ access_token: "access" }), { status: 200 });
    }
    if (url.hostname === "blob.test") return new Response(Buffer.from("%PDF-1.7 cv"));
    if (url.pathname.startsWith("/upload/drive/v3/files") && init?.method === "POST") {
      if (state.uploadFails) return new Response(JSON.stringify({ error: { message: "Backend Error" } }), { status: 500 });
      state.uploads.push(String(init.body).match(/CVDRIVE\d+/)?.[0] ?? "?");
      return new Response(JSON.stringify({ id: `file-${state.uploads.length}`, webViewLink: `https://drive.google.com/file-${state.uploads.length}` }));
    }
    if (url.pathname === "/drive/v3/files") return new Response(JSON.stringify({ files: [] }));
    if (init?.method === "DELETE") return new Response(JSON.stringify({ error: { message: "Backend Error" } }), { status: 500 });
    throw new Error(`unexpected request ${url}`);
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Google Drive déconnecté (REC-09)", () => {
  it("alerte non délivrée (Resend en panne au moment du refus) : renvoyée aux passages suivants du cron jusqu’à sa livraison, puis plus jamais pour cette autorisation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const DAY_MS = 24 * 60 * 60 * 1000;
    seedConnection();
    const id = seedCopy(1);
    state.tokenRevoked = true;
    state.ownerEmailFails = true;

    expect(await processDueCvGoogleDriveExports(3)).toMatchObject({ processed: 1, reconnectRequired: true });
    expect(connection().last_error).toBe("google_drive_token_invalid_grant");
    expect(state.notifications).toEqual([]);
    // Resend still down at the next daily pass: tried again, still nothing delivered.
    vi.setSystemTime(Date.now() + DAY_MS);
    expect(await processDueCvGoogleDriveExports(3)).toMatchObject({ processed: 0, reconnectRequired: true });
    expect(state.ownerEmailAttempts).toBe(2);
    expect(state.notifications).toEqual([]);

    // Resend back: the next pass delivers the alert, without calling Google again.
    state.ownerEmailFails = false;
    vi.setSystemTime(Date.now() + DAY_MS);
    await processDueCvGoogleDriveExports(3);
    expect(state.notifications.map(notification => notification.title)).toEqual(["Recrutement : Google Drive à reconnecter, copies des CV suspendues"]);
    for (let pass = 0; pass < 3; pass += 1) {
      vi.setSystemTime(Date.now() + DAY_MS);
      await processDueCvGoogleDriveExports(3);
    }
    expect(state.notifications).toHaveLength(1);
    expect(state.ownerEmailAttempts).toBe(3);
    expect(state.tokenRequests).toBe(1);
    expect(copyOf(id)).toMatchObject({ attempts: 0 });

    // A new authorization, refused in turn, is alerted once more.
    await saveGoogleDriveConnection({ authorizedByOpenId: "user_owner", refreshToken: "new-refresh-token" });
    await requeueGoogleDriveExportsAfterReconnection();
    await processDueCvGoogleDriveExports(3);
    await processDueCvGoogleDriveExports(3);
    expect(state.notifications).toHaveLength(2);
  });

  it("une clé d’idempotence stable pour l’autorisation : un envoi parti sans réponse claire n’est pas doublé par l’essai suivant ; une nouvelle autorisation a la sienne", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    seedConnection();
    seedCopy(1);
    state.tokenRevoked = true;
    state.ownerEmailAnswerLost = true;

    await processDueCvGoogleDriveExports(3);
    expect(state.notifications).toHaveLength(1);
    // The slot opens again a few minutes later: same key, Resend answers with the email already taken.
    state.ownerEmailAnswerLost = false;
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1_000);
    await processDueCvGoogleDriveExports(3);
    // Now settled as delivered: no further attempt for this authorization.
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
    await processDueCvGoogleDriveExports(3);
    expect(state.ownerEmailAttempts).toBe(2);
    expect(state.notifications).toHaveLength(1);
    const [firstKey, retryKey] = state.ownerEmailKeys;
    expect(firstKey).toMatch(/^google-drive-reconnection-[0-9a-f]{32}$/);
    expect(retryKey).toBe(firstKey);

    // A new authorization, refused in turn: its own key, and its own alert.
    await saveGoogleDriveConnection({ authorizedByOpenId: "user_owner", refreshToken: "new-refresh-token" });
    await requeueGoogleDriveExportsAfterReconnection();
    await processDueCvGoogleDriveExports(3);
    expect(state.notifications).toHaveLength(2);
    expect(state.ownerEmailKeys[2]).toMatch(/^google-drive-reconnection-[0-9a-f]{32}$/);
    expect(state.ownerEmailKeys[2]).not.toBe(firstKey);
  });

  it("pendant une panne de Resend, un passage rapproché ne relance pas l’alerte à chaque appel", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    seedConnection();
    seedCopy(1);
    state.tokenRevoked = true;
    state.ownerEmailFails = true;
    await processDueCvGoogleDriveExports(3);
    for (let pass = 0; pass < 5; pass += 1) await processDueCvGoogleDriveExports(3);
    expect(state.ownerEmailAttempts).toBe(1);
    state.ownerEmailFails = false;
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1_000);
    await processDueCvGoogleDriveExports(3);
    expect(state.notifications).toHaveLength(1);
  });

  it("invalid_grant : aucune tentative consommée, connexion « à renouveler », une seule alerte, plus aucun appel à Google", async () => {
    seedConnection();
    const copies = Array.from({ length: 6 }, (_, index) => seedCopy(index + 1));
    state.tokenRevoked = true;

    // The audit's reproduction: five cron passes while the access is revoked.
    // The first refusal stops the batch: the next copies stay queued, unclaimed.
    const first = await processDueCvGoogleDriveExports(3);
    expect(first).toMatchObject({ processed: 1, waitingForAuthorization: true, reconnectRequired: true });
    expect(first.results).toEqual([expect.objectContaining({ completed: false, reconnectRequired: true, error: "google_drive_token_invalid_grant" })]);
    for (let pass = 0; pass < 4; pass += 1) {
      expect(await processDueCvGoogleDriveExports(3)).toMatchObject({ processed: 0, waitingForAuthorization: true, reconnectRequired: true });
    }

    for (const id of copies) {
      expect(copyOf(id).status).not.toBe("failed");
      expect(copyOf(id).attempts).toBe(0);
    }
    expect(copyOf(copies[0]!)).toMatchObject({ status: "retry", last_error: "google_drive_token_invalid_grant" });
    expect(copies.slice(1).map(id => copyOf(id).status)).toEqual(Array.from({ length: 5 }, () => "queued"));
    expect(connection().last_error).toBe("google_drive_token_invalid_grant");
    expect(await googleDriveExportStatus()).toMatchObject({ connected: true, lastError: "google_drive_token_invalid_grant", failedExports: 0 });
    // One refusal, then nothing more is sent to Google until the reconnection.
    expect(state.tokenRequests).toBe(1);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]!.title).toContain("Google Drive à reconnecter");
    expect(state.notifications[0]!.content).toContain("Reconnexion Google Drive requise");
    expect(state.notifications[0]!.content).not.toMatch(/Zoé|Kowalska|CVDRIVE|zoe\d@/);
  });

  it("la reconnexion remet en file les copies arrêtées par une erreur de jeton, y compris celles déjà « échouées », et elles partent", async () => {
    seedConnection("google_drive_token_invalid_grant");
    const waiting = seedCopy(1, { status: "retry", last_error: "google_drive_token_invalid_grant", scheduled_for: new Date(Date.now() + 5 * 60_000) });
    // Exhausted before this fix (5/5 attempts, the state the audit observed).
    const exhausted = seedCopy(2, { status: "failed", attempts: 5, last_error: "google_drive_token_invalid_grant", finished_at: new Date() });
    const refused = seedCopy(3, { status: "failed", attempts: 1, last_error: "cv_rejected" }, { file_validation_status: "rejected" });
    const otherFailure = seedCopy(4, { status: "failed", attempts: 5, last_error: "google_drive_upload_500_Backend Error" });
    const done = seedCopy(5, { status: "completed", attempts: 1, drive_file_id: "kept" });

    // What the OAuth callback does with the new authorization.
    await saveGoogleDriveConnection({ authorizedByOpenId: "user_owner", refreshToken: "new-refresh-token" });
    expect(connection().last_error).toBeNull();
    expect(await requeueGoogleDriveExportsAfterReconnection()).toEqual({ requeued: 2 });
    for (const id of [waiting, exhausted]) expect(copyOf(id)).toMatchObject({ status: "queued", attempts: 0, last_error: null, finished_at: null });
    expect(copyOf(refused)).toMatchObject({ status: "failed", last_error: "cv_rejected" });
    expect(copyOf(otherFailure)).toMatchObject({ status: "failed", attempts: 5 });
    expect(copyOf(done)).toMatchObject({ status: "completed", drive_file_id: "kept" });

    await processDueCvGoogleDriveExports(3);
    expect(copyOf(waiting)).toMatchObject({ status: "completed", drive_file_id: expect.stringMatching(/^file-/) });
    expect(copyOf(exhausted)).toMatchObject({ status: "completed", drive_file_id: expect.stringMatching(/^file-/) });
    expect(state.notifications).toEqual([]);
  });

  it("« Relancer toutes les copies échouées » relance les échecs récupérables, quelques-unes tout de suite, le reste au prochain passage", async () => {
    seedConnection();
    const failed = Array.from({ length: 4 }, (_, index) => seedCopy(index + 1, { status: "failed", attempts: 5, last_error: "google_drive_upload_500_Backend Error" }));
    const refused = seedCopy(5, { status: "failed", attempts: 1, last_error: "cv_validation_failed" }, { file_validation_status: "validation_failed" });
    const running = seedCopy(6, { status: "running", attempts: 1, started_at: new Date() });

    expect(await admin().admin.recruitment.driveExport.status()).toMatchObject({ failedExports: 4 });
    const result = await admin().admin.recruitment.driveExport.retryAllFailed();
    expect(result).toEqual({ success: true, requeued: 4, processed: 3, copied: 3, failedAgain: 0, reconnectRequired: false, notConnected: false });
    expect(failed.map(id => copyOf(id).status).sort()).toEqual(["completed", "completed", "completed", "queued"]);
    expect(copyOf(refused)).toMatchObject({ status: "failed", last_error: "cv_validation_failed" });
    expect(copyOf(running).status).toBe("running");
    expect(await admin().admin.recruitment.driveExport.status()).toMatchObject({ failedExports: 0 });
    // Each requeued copy is traced in the recruitment audit log.
    expect(memory.rows(recruitmentAuditLogs).filter(row => String(row.metadata).includes('"batch":true'))).toHaveLength(4);

    expect(await admin().admin.recruitment.driveExport.retryAllFailed()).toMatchObject({ requeued: 0, processed: 0 });
  });

  it("« Relancer toutes les copies échouées » qui découvre le refus de Google : une seule requête, « connexion à renouveler », aucun échec compté", async () => {
    seedConnection();
    const failed = Array.from({ length: 4 }, (_, index) => seedCopy(index + 1, { status: "failed", attempts: 5, last_error: "google_drive_upload_500_Backend Error" }));
    state.tokenRevoked = true;

    const result = await admin().admin.recruitment.driveExport.retryAllFailed();
    expect(result).toEqual({ success: true, requeued: 4, processed: 1, copied: 0, failedAgain: 0, reconnectRequired: true, notConnected: false });
    expect(state.tokenRequests).toBe(1);
    // All four wait for the reconnection, none spent an attempt.
    expect(failed.map(id => copyOf(id))).toEqual(failed.map(() => expect.objectContaining({ attempts: 0, status: expect.stringMatching(/^(queued|retry)$/) })));
    expect(connection().last_error).toBe("google_drive_token_invalid_grant");
    expect(state.notifications).toHaveLength(1);
  });

  it("une reconnexion enregistrée pendant une copie : le refus de l’ancien jeton ne marque pas la nouvelle connexion", async () => {
    seedConnection();
    const id = seedCopy(1);
    state.tokenRevoked = true;
    const fetchGoogle = vi.mocked(globalThis.fetch).getMockImplementation()!;
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      // The owner reconnects Drive while Google is refusing the old token.
      if (new URL(String(input)).hostname === "oauth2.googleapis.com") await saveGoogleDriveConnection({ authorizedByOpenId: "user_owner", refreshToken: "new-refresh-token" });
      return fetchGoogle(input, init);
    });

    expect(await processDueCvGoogleDriveExports(3)).toMatchObject({ processed: 1, reconnectRequired: true });
    expect(connection().last_error).toBeNull();
    expect(state.notifications).toEqual([]);
    // The copy waits a few minutes without spending its attempt, then the cron uses the new token.
    expect(copyOf(id)).toMatchObject({ status: "retry", attempts: 0 });
    vi.mocked(globalThis.fetch).mockImplementation(fetchGoogle);
    state.tokenRevoked = false;
    await memory.db.update(cvGoogleDriveExportJobs).set({ scheduledFor: new Date(Date.now() - 1_000) }).where(eq(cvGoogleDriveExportJobs.applicationId, id));
    await processDueCvGoogleDriveExports(3);
    expect(copyOf(id)).toMatchObject({ status: "completed", drive_file_id: expect.stringMatching(/^file-/) });
  });

  it("connexion à renouveler : la relance groupée ou unitaire remet en file sans appeler Google et le dit", async () => {
    seedConnection("google_drive_token_invalid_grant");
    const first = seedCopy(1, { status: "failed", attempts: 5, last_error: "google_drive_upload_500_Backend Error" });
    const second = seedCopy(2, { status: "failed", attempts: 2, last_error: "google_drive_lookup_503" });

    expect(await admin().admin.recruitment.driveExport.retryAllFailed()).toMatchObject({ requeued: 2, processed: 0, reconnectRequired: true, notConnected: false });
    expect(copyOf(first)).toMatchObject({ status: "queued", attempts: 0 });
    expect(await admin().admin.recruitment.driveExport.retry({ id: second })).toMatchObject({ outcome: "reconnect_required" });
    expect(state.tokenRequests).toBe(0);
  });

  it("« Relancer toutes les copies échouées » sans copie à relancer donne quand même l’état réel de la connexion", async () => {
    seedConnection("google_drive_token_invalid_grant");
    seedCopy(1);
    expect(await admin().admin.recruitment.driveExport.retryAllFailed()).toEqual({ success: true, requeued: 0, processed: 0, copied: 0, failedAgain: 0, reconnectRequired: true, notConnected: false });
    expect(state.tokenRequests).toBe(0);

    // Reconnected: connected again.
    await saveGoogleDriveConnection({ authorizedByOpenId: "user_owner", refreshToken: "new-refresh-token" });
    expect(await admin().admin.recruitment.driveExport.retryAllFailed()).toMatchObject({ requeued: 0, reconnectRequired: false, notConnected: false });
  });

  it("« Relancer toutes les copies échouées » sans copie ni autorisation : « non connecté »", async () => {
    expect(await admin().admin.recruitment.driveExport.retryAllFailed()).toEqual({ success: true, requeued: 0, processed: 0, copied: 0, failedAgain: 0, reconnectRequired: false, notConnected: true });
  });

  it("un refus inline lors d’une relance unitaire le dit aussi, et n’alerte qu’une fois", async () => {
    seedConnection();
    const id = seedCopy(1, { status: "failed", attempts: 5, last_error: "google_drive_upload_500_Backend Error" });
    state.tokenRevoked = true;
    expect(await admin().admin.recruitment.driveExport.retry({ id })).toMatchObject({ outcome: "reconnect_required", error: "google_drive_token_invalid_grant" });
    expect(copyOf(id)).toMatchObject({ status: "retry", attempts: 0 });
    expect(await admin().admin.recruitment.driveExport.retry({ id })).toMatchObject({ outcome: "reconnect_required" });
    expect(state.notifications).toHaveLength(1);
  });

  it("une autre panne de Drive compte toujours une tentative, sans alerte", async () => {
    seedConnection();
    const id = seedCopy(1);
    state.uploadFails = true;
    await processDueCvGoogleDriveExports(3);
    expect(copyOf(id)).toMatchObject({ status: "retry", attempts: 1, last_error: "google_drive_upload_500_Backend Error" });
    expect(connection().last_error).toBe("google_drive_upload_500_Backend Error");
    expect(state.notifications).toEqual([]);
  });

  it("seule la reconnexion (ou une copie réussie) lève la marque « à renouveler » ; un refus à l’effacement RGPD alerte aussi, une fois", async () => {
    seedConnection();
    state.tokenRevoked = true;
    await deleteCvCopiesFromGoogleDrive({ trackingId: "CVDRIVE00000001", knownFileIds: ["known"] });
    expect(connection().last_error).toBe("google_drive_token_invalid_grant");
    expect(state.notifications).toHaveLength(1);
    // Another error afterwards does not hide the mark (and the export path does not alert again).
    state.tokenRevoked = false;
    await deleteCvCopiesFromGoogleDrive({ trackingId: "CVDRIVE00000001", knownFileIds: ["known"] });
    expect(connection().last_error).toBe("google_drive_token_invalid_grant");
    const id = seedCopy(1, { status: "failed", attempts: 5, last_error: "google_drive_upload_500_Backend Error" });
    state.tokenRevoked = true;
    expect(await admin().admin.recruitment.driveExport.retry({ id })).toMatchObject({ outcome: "reconnect_required" });
    expect(state.notifications).toHaveLength(1);
  });

  it("une copie relancée pour un dossier ne fait partir que lui, et chaque étape date la tâche", async () => {
    seedConnection();
    const waiting = seedCopy(1);
    const requested = seedCopy(2, { updated_at: new Date("2026-10-01T08:00:00.000Z") });
    let whileUploading: Record<string, unknown> | null = null;
    const fetchGoogle = vi.mocked(globalThis.fetch).getMockImplementation()!;
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (new URL(String(input)).pathname.startsWith("/upload/drive/v3/files")) whileUploading = { ...copyOf(requested) };
      return fetchGoogle(input, init);
    });

    expect(await processDueCvGoogleDriveExports(3, [requested])).toMatchObject({ processed: 1 });

    expect(state.uploads).toEqual(["CVDRIVE00000002"]);
    expect(copyOf(waiting)).toMatchObject({ status: "queued", attempts: 0 });
    // Claimed: running, dated from the start of this run.
    expect(whileUploading).toMatchObject({ status: "running", attempts: 1 });
    expect(whileUploading!.updated_at).toBe(whileUploading!.started_at);
    expect(copyOf(requested)).toMatchObject({ status: "completed", updated_at: copyOf(requested).finished_at });
  });
});
