import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientBriefs, cvApplications, recruitmentAuditLogs, recruitmentCampaignRecipients, recruitmentCampaigns, recruitmentFollowUpTasks } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  sentTo: [] as string[],
  failFor: new Set<string>(),
}));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
  isAdminMfaVerified: vi.fn(async () => true),
}));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendRecruitmentCampaignEmail: vi.fn(async (input: { candidateEmail: string }) => {
    if (state.failFor.has(input.candidateEmail)) throw new Error("resend_unavailable");
    state.sentTo.push(input.candidateEmail);
    return { id: `email-${state.sentTo.length}` };
  }),
}));

import { appRouter, driveRetryOutcome, reanalysisOutcome } from "./routers";
import { buildClientBriefOwnerNotification } from "./clientBriefNotification";

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

function seedCandidate(index: number, extra: Record<string, unknown> = {}) {
  return memory.seed(cvApplications, [{
    tracking_id: `CVACTIONS${String(index).padStart(5, "0")}`, first_name: `Prénom${index}`, last_name: "Nom", email: `c${index}@test.local`, specialty: "Anesthésie", target_countries: "[]",
    cv_file_key: `recruitment/cv/k${index}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, marketing_consent: 1, ...extra,
  }])[0]!;
}

describe("actions d’administration du recrutement", () => {
  beforeEach(() => {
    memory = createMemoryPg([cvApplications, recruitmentAuditLogs, clientBriefs, recruitmentCampaigns, recruitmentCampaignRecipients, recruitmentFollowUpTasks]);
    state.memory = memory;
    state.sentTo = [];
    state.failFor.clear();
  });

  it("changer le statut conserve la note interne (ADM-REC-01)", async () => {
    const candidate = seedCandidate(1, { admin_notes: "Très bon profil, rappeler lundi" });
    await admin().admin.recruitment.updateStatus({ id: candidate.id as number, status: "reviewing" });
    expect(memory.rows(cvApplications)[0]).toMatchObject({ status: "reviewing", admin_notes: "Très bon profil, rappeler lundi" });
    await admin().admin.recruitment.updateStatus({ id: candidate.id as number, status: "reviewing", adminNotes: "Note modifiée" });
    expect(memory.rows(cvApplications)[0]!.admin_notes).toBe("Note modifiée");
    await admin().admin.recruitment.updateStatus({ id: candidate.id as number, status: "shortlisted", adminNotes: "" });
    expect(memory.rows(cvApplications)[0]).toMatchObject({ status: "shortlisted", admin_notes: null });
  });

  it("date la qualification et l’envoi de la shortlist d’une mission, une seule fois (ADM-BRIEF-02)", async () => {
    const [brief] = memory.seed(clientBriefs, [{ brief_id: "BRIEF-TEST-01", organization_name: "Clinique", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie", country: "Suisse" }]);
    const id = brief!.id as number;
    await admin().admin.clientBriefs.updateStatus({ id, status: "reviewing" });
    const acknowledgedAt = memory.rows(clientBriefs)[0]!.acknowledged_at;
    expect(acknowledgedAt).not.toBeNull();
    expect(memory.rows(clientBriefs)[0]!.shortlist_sent_at).toBeNull();
    await admin().admin.clientBriefs.updateStatus({ id, status: "shortlist_sent" });
    const shortlistSentAt = memory.rows(clientBriefs)[0]!.shortlist_sent_at;
    expect(shortlistSentAt).not.toBeNull();
    await admin().admin.clientBriefs.updateStatus({ id, status: "contract_signed" });
    await admin().admin.clientBriefs.updateStatus({ id, status: "closed" });
    expect(memory.rows(clientBriefs)[0]).toMatchObject({ brief_status: "closed", acknowledged_at: acknowledgedAt, shortlist_sent_at: shortlistSentAt });
  });

  it("une campagne en échec n’est pas un succès, et la relance ne vise que les destinataires en échec (ADM-MAIL-02)", async () => {
    const served = seedCandidate(1);
    const failing = seedCandidate(2);
    const withdrawn = seedCandidate(3);
    const bounced = seedCandidate(4);
    state.failFor = new Set(["c2@test.local", "c3@test.local"]);
    const result = await admin().admin.recruitment.campaigns.send({ title: "Offre test", subject: "Offre Suisse", body: "Une mission à Genève, répondez par email.", language: "fr", mode: "selected", selectedIds: [served.id as number, failing.id as number, withdrawn.id as number], confirmed: true });
    expect(result).toMatchObject({ total: 3, sent: 1, failed: 2 });
    expect(memory.rows(recruitmentCampaigns)[0]!.status).toBe("partially_sent");
    const campaignId = result.campaignId;
    memory.seed(recruitmentCampaignRecipients, [{ campaign_id: campaignId, application_id: bounced.id, recipient_email: "c4@test.local", delivery_status: "bounced" }]);

    // c3 withdraws consent; c2's provider error is over.
    memory.rows(cvApplications).find(row => row.id === withdrawn.id)!.marketing_unsubscribed_at = "2026-10-16 10:00:00.000";
    state.failFor.clear();
    state.sentTo = [];
    const retry = await admin().admin.recruitment.campaigns.retryFailed({ campaignId, confirmed: true });
    expect(retry).toEqual({ campaignId, attempted: 2, sent: 1, failed: 0, skipped: 1 });
    expect(state.sentTo).toEqual(["c2@test.local"]);
    const statuses = Object.fromEntries(memory.rows(recruitmentCampaignRecipients).map(row => [row.recipient_email, row.delivery_status]));
    expect(statuses).toEqual({ "c1@test.local": "sent", "c2@test.local": "sent", "c3@test.local": "skipped", "c4@test.local": "bounced" });
    expect(memory.rows(recruitmentCampaigns)[0]!.status).toBe("partially_sent");

    // Nothing left to retry: no email is sent twice.
    state.sentTo = [];
    await expect(admin().admin.recruitment.campaigns.retryFailed({ campaignId, confirmed: true })).resolves.toMatchObject({ attempted: 0, sent: 0 });
    expect(state.sentTo).toEqual([]);
  });

  it("rapporte l’issue réelle d’une relance d’analyse ou de copie Drive (ADM-REC-02, ADM-DRIVE-01)", () => {
    expect(reanalysisOutcome({ alreadyRunning: false }, { processed: 1, results: [{ completed: true, needsReview: false }] })).toEqual({ outcome: "completed", error: null });
    expect(reanalysisOutcome({ alreadyRunning: false }, { processed: 1, results: [{ completed: false, retry: true, error: "Failed after 2 attempts. GatewayInternalServerError" }] })).toEqual({ outcome: "retry_scheduled", error: "Failed after 2 attempts. GatewayInternalServerError" });
    expect(reanalysisOutcome({ alreadyRunning: false }, { processed: 1, results: [{ completed: false, retry: false, error: "cv_validation_pdf_encrypted" }] }).outcome).toBe("failed");
    expect(reanalysisOutcome({ alreadyRunning: true }, { processed: 0, results: [] }).outcome).toBe("already_running");
    expect(driveRetryOutcome({ alreadyCompleted: false, alreadyRunning: false }, { processed: 1, results: [{ completed: false, retry: true, error: "google_drive_token_invalid_grant" }] })).toEqual({ outcome: "retry_scheduled", error: "google_drive_token_invalid_grant" });
    expect(driveRetryOutcome({ alreadyCompleted: false, alreadyRunning: false }, { processed: 0, waitingForAuthorization: true, results: [] }).outcome).toBe("not_connected");
    expect(driveRetryOutcome({ alreadyCompleted: false, alreadyRunning: false }, { processed: 1, results: [{ completed: true }] }).outcome).toBe("completed");
  });

  it("l’email propriétaire d’un brief contient tout pour qualifier et rappeler (ADM-BRIEF-01)", () => {
    const notification = buildClientBriefOwnerNotification({
      briefId: "BRIEF-ABC", organizationName: "Clinique du Lac", contactName: "Mme RH", email: "rh@clinique.test", phone: "+41 22 000 00 00",
      targetEnvironment: "Clinique", specialtyNeeded: "Anesthésie", country: "Suisse", requiredCertifications: "Diplôme reconnu MEBEKO", timeline: "Janvier 2027", notes: "Garde de nuit", adminUrl: "https://example.test/admin",
    });
    for (const expected of ["Mme RH", "rh@clinique.test", "+41 22 000 00 00", "Diplôme reconnu MEBEKO", "Janvier 2027", "Garde de nuit", "https://example.test/admin", "Reçu le"]) {
      expect(notification.content).toContain(expected);
    }
    expect(notification.title).toContain("BRIEF-ABC");
  });
});
