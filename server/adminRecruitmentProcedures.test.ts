import { beforeEach, describe, expect, it, vi } from "vitest";
import { cvApplications, recruitmentAuditLogs, recruitmentCampaignRecipients, recruitmentCampaigns, recruitmentEmailEvents } from "../drizzle/schema";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "./recruitmentAnalysis";
import { CV_ANALYSIS_DEFERRED_DAILY_VOLUME } from "./recruitmentProcessing";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// Procédures d’administration du recrutement appelées comme le tableau de bord :
// reprise d’un accusé de candidature, effacement RGPD, nouvelle analyse d’un CV
// et nouvelle copie Google Drive, chacune sur la bonne candidature et tracée.

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  confirmations: [] as Array<{ to: string; idempotencyKey: string }>,
  campaignEmails: [] as string[],
}));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("./candidateAuth", async importOriginal => ({ ...await importOriginal<typeof import("./candidateAuth")>(), createCandidateInvitationToken: () => "synthetic-invitation-token" }));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendCvApplicationConfirmationEmail: vi.fn(async (to: string, _firstName: string, _trackingId: string, _inviteUrl: string, idempotencyKey: string) => {
    state.confirmations.push({ to, idempotencyKey });
    return { status: "sent", providerEmailId: `email-${state.confirmations.length}`, failureCode: null };
  }),
  sendRecruitmentCampaignEmail: vi.fn(async (input: { candidateEmail: string }) => {
    state.campaignEmails.push(input.candidateEmail);
    return { id: `campaign-email-${state.campaignEmails.length}` };
  }),
}));
vi.mock("./recruitmentErasure", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentErasure")>(),
  eraseCandidateApplication: vi.fn(async () => ({ erased: true })),
}));
vi.mock("./recruitmentProcessing", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentProcessing")>(),
  enqueueCvAnalysis: vi.fn(async () => ({ queued: true, accelerated: false, alreadyRunning: false })),
  processDueCvAnalysisJobs: vi.fn(async (_limit: number, applicationIds?: number[]) => ({ processed: 1, results: [{ applicationId: applicationIds?.[0], completed: true }] })),
}));
vi.mock("./googleDriveExport", async importOriginal => ({
  ...await importOriginal<typeof import("./googleDriveExport")>(),
  retryCvGoogleDriveExport: vi.fn(async () => ({ requeued: true, alreadyCompleted: false, alreadyRunning: false })),
  processDueCvGoogleDriveExports: vi.fn(async () => ({ processed: 1, waitingForAuthorization: false, reconnectRequired: false, results: [{ completed: true }] })),
}));

const { appRouter } = await import("./routers");
const { retryCvConfirmationEmail } = await import("./recruitmentEmailTrace");
const { eraseCandidateApplication } = await import("./recruitmentErasure");
const { enqueueCvAnalysis, processDueCvAnalysisJobs } = await import("./recruitmentProcessing");
const { processDueCvGoogleDriveExports, retryCvGoogleDriveExport } = await import("./googleDriveExport");

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

function seedApplication(index: number, extra: Record<string, unknown> = {}) {
  return memory.seed(cvApplications, [{
    tracking_id: `CVPROC${String(index).padStart(6, "0")}`, first_name: `Prénom${index}`, last_name: "Nom", email: `c${index}@test.local`, specialty: "Anesthésie", target_countries: "[]",
    cv_file_key: `recruitment/cv/k${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, ...extra,
  }])[0]!;
}

function seedConfirmationFailure(applicationId: number, attempt: number) {
  memory.seed(recruitmentEmailEvents, [{
    provider_event_id: `local:failure-${applicationId}-${attempt}`, application_id: applicationId, event_type: "email.failed", recipient_email: `c${applicationId}@test.local`,
    payload: JSON.stringify({ kind: "application_confirmation", outcome: "failed", failureCode: "provider_rejected", trackingId: `CV${applicationId}`, attempt }),
    occurred_at: "2026-10-20 08:00:00.000",
  }]);
}

const audit = () => memory.rows(recruitmentAuditLogs).map(row => ({ applicationId: row.application_id, action: row.action, metadata: JSON.parse(String(row.metadata ?? "{}")) }));

beforeEach(() => {
  memory = createMemoryPg([cvApplications, recruitmentAuditLogs, recruitmentEmailEvents, recruitmentCampaigns, recruitmentCampaignRecipients]);
  state.memory = memory;
  state.confirmations = [];
  state.campaignEmails = [];
  vi.clearAllMocks();
});

describe("reprise de l’accusé de candidature", () => {
  it("laisse l’administrateur renvoyer un accusé jamais tracé, que la reprise automatique ne touche pas", async () => {
    const untracked = seedApplication(1);

    await expect(retryCvConfirmationEmail(untracked.id as number)).resolves.toMatchObject({ outcome: "untracked", attempted: false });
    expect(state.confirmations).toEqual([]);

    await expect(admin().admin.recruitment.confirmationEmail.retry({ id: untracked.id as number })).resolves.toMatchObject({ outcome: "sent", attempted: true });
    // An untracked submission reuses attempt 1, so that Resend deduplicates a request left unrecorded.
    expect(state.confirmations).toEqual([{ to: "c1@test.local", idempotencyKey: "cv-application-confirmation-CVPROC000001-attempt-1" }]);
    expect(audit()).toEqual([{ applicationId: untracked.id, action: "email", metadata: { template: "application_confirmation_retry", outcome: "sent" } }]);
  });

  it("numérote la reprise d’un accusé en échec après la dernière tentative", async () => {
    const failed = seedApplication(2);
    seedConfirmationFailure(failed.id as number, 1);

    await admin().admin.recruitment.confirmationEmail.retry({ id: failed.id as number });

    expect(state.confirmations).toEqual([{ to: "c2@test.local", idempotencyKey: "cv-application-confirmation-CVPROC000002-attempt-2" }]);
  });
});

describe("effacement RGPD d’une candidature", () => {
  it("passe par la routine d’effacement complète, au nom de l’administrateur, pour une demande RGPD", async () => {
    await expect(admin().admin.recruitment.erase({ id: 42 })).resolves.toEqual({ success: true, erased: true });
    expect(eraseCandidateApplication).toHaveBeenCalledWith({ applicationId: 42, actorOpenId: "user_owner", reason: "admin_gdpr_request" });
  });
});

describe("relance immédiate des analyses CV", () => {
  it("traite tout de suite le CV relancé, et lui seul", async () => {
    const application = seedApplication(3);

    await expect(admin().admin.recruitment.reanalyze({ id: application.id as number })).resolves.toMatchObject({ success: true, processed: 1, outcome: "completed" });

    expect(enqueueCvAnalysis).toHaveBeenCalledWith(application.id);
    expect(processDueCvAnalysisJobs).toHaveBeenCalledWith(1, [application.id]);
    expect(audit()).toEqual([{ applicationId: application.id, action: "reanalyze", metadata: expect.objectContaining({ processed: 1, outcome: "completed" }) }]);
  });

  it("reprend les dossiers en échec, en file, dégradés ou d’une ancienne version, et n’en analyse qu’un dans la requête", async () => {
    const current = { analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION };
    const failed = seedApplication(10, { analysis_status: "failed", ...current });
    const queued = seedApplication(11, { analysis_status: "queued", ...current });
    const degraded = seedApplication(12, { analysis_status: "degraded", ...current });
    const outdated = seedApplication(13, { analysis_status: "completed", analysis_prompt_version: "recruitment-v6-previous" });
    const neverVersioned = seedApplication(14, { analysis_status: "completed", analysis_prompt_version: null });
    seedApplication(15, { analysis_status: "completed", ...current });
    seedApplication(16, { analysis_status: "failed", status: "rejected", ...current });
    seedApplication(17, { analysis_status: "failed", status: "archived", ...current });
    seedApplication(18, { analysis_status: "queued", analysis_last_error: CV_ANALYSIS_DEFERRED_DAILY_VOLUME, ...current });

    await expect(admin().admin.recruitment.reanalyzeFailed({ limit: 25 })).resolves.toEqual({ success: true, queued: 5, processed: 1, aiUnavailable: false });

    expect(vi.mocked(enqueueCvAnalysis).mock.calls.map(([id]) => id).sort()).toEqual([failed.id, queued.id, degraded.id, outdated.id, neverVersioned.id].sort());
    // One analysis inside the admin request (60 s limit); the cron takes the others.
    expect(processDueCvAnalysisJobs).toHaveBeenCalledTimes(1);
  });
});

describe("audience d’une campagne filtrée par score", () => {
  it("ne retient que les scores de la version d’analyse en vigueur, à l’aperçu comme à l’envoi", async () => {
    const current = seedApplication(20, { ai_score: 90, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION, marketing_consent: 1 });
    seedApplication(21, { ai_score: 95, analysis_prompt_version: "recruitment-v6-previous", marketing_consent: 1 });
    seedApplication(22, { ai_score: 60, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION, marketing_consent: 1 });

    const audience = await admin().admin.recruitment.campaigns.previewAudience({ mode: "filtered", minimumScore: 80 });
    expect(audience.map(candidate => candidate.id)).toEqual([current.id]);

    await admin().admin.recruitment.campaigns.send({ title: "Offre test", subject: "Offre Suisse", body: "Une mission à Genève, répondez par email.", language: "fr", mode: "filtered", minimumScore: 80, confirmed: true });
    expect(state.campaignEmails).toEqual(["c20@test.local"]);
  });
});

describe("reprise traçable des exports Google Drive", () => {
  it("relance la copie de la candidature demandée seulement, et en garde une preuve d’audit", async () => {
    const application = seedApplication(4);

    await expect(admin().admin.recruitment.driveExport.retry({ id: application.id as number })).resolves.toMatchObject({ success: true, processed: 1, outcome: "completed" });

    expect(retryCvGoogleDriveExport).toHaveBeenCalledWith(application.id);
    expect(processDueCvGoogleDriveExports).toHaveBeenCalledWith(1, [application.id]);
    expect(audit()).toEqual([{ applicationId: application.id, action: "export", metadata: expect.objectContaining({ event: "google_drive_retry", processed: 1, outcome: "completed" }) }]);
  });
});
