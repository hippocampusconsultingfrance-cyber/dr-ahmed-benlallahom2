import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientBriefCandidates, clientBriefs, cvApplications, cvCandidateCertifications, cvCandidateLanguages, recruitmentAuditLogs, recruitmentCampaignRecipients, recruitmentCampaigns, recruitmentFollowUpTasks } from "../drizzle/schema";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "./recruitmentAnalysis";
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
// The candidate agreed to be presented for the mission (RGPD-03).
const consentAt = "2026-10-20 12:00:00.000";

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
    memory = createMemoryPg([cvApplications, cvCandidateCertifications, cvCandidateLanguages, recruitmentAuditLogs, clientBriefs, clientBriefCandidates, recruitmentCampaigns, recruitmentCampaignRecipients, recruitmentFollowUpTasks]);
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

  it("la shortlist exportée pour un employeur ne contient pas le score IA ; l’export interne du vivier le garde (LEGAL-22)", async () => {
    const shortlisted = seedCandidate(1, { ai_score: 91, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION });
    seedCandidate(2, { ai_score: 40, analysis_prompt_version: RECRUITMENT_ANALYSIS_PROMPT_VERSION });
    const [brief] = memory.seed(clientBriefs, [{ brief_id: "BRIEF-EXPORT-1", organization_name: "Clinique", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie", country: "Suisse" }]);
    memory.seed(clientBriefCandidates, [{ brief_id: brief!.id, application_id: shortlisted.id, association_status: "shortlisted", candidate_consent_at: consentAt }]);
    const shortlist = await admin().admin.recruitment.exportCsv({ type: "shortlist", briefId: brief!.id as number });
    const [shortlistHeader, ...shortlistRows] = shortlist.csv.split("\n");
    expect(shortlist.count).toBe(1);
    expect(shortlistHeader).not.toContain("Score IA");
    expect(shortlistRows[0]).toContain("c1@test.local");
    expect(shortlistRows[0]).not.toContain("91");
    const pool = await admin().admin.recruitment.exportCsv({ type: "pool", candidateIds: [shortlisted.id as number] });
    expect(pool.csv.split("\n")[0]).toContain("Score IA");
    expect(pool.csv).toContain("\"91\"");
  });

  it("refuse un export du vivier dont plus aucun candidat sélectionné n’est exportable, au lieu d’un fichier vide (REC-01)", async () => {
    const refused = seedCandidate(1, { status: "rejected" });
    await expect(admin().admin.recruitment.exportCsv({ type: "pool", candidateIds: [refused.id as number] }))
      .rejects.toThrow("Aucun des candidats sélectionnés ne peut plus être exporté (refusé, archivé ou désinscrit).");
  });

  it("une shortlist n’exporte que les présélectionnés de sa mission, et une shortlist vide est refusée (REC-01)", async () => {
    const shortlisted = seedCandidate(1);
    const suggested = seedCandidate(2);
    const otherMission = seedCandidate(3);
    const rejected = seedCandidate(4, { status: "rejected" });
    seedCandidate(5);
    const [brief, other, empty] = memory.seed(clientBriefs, ["BRIEF-REC01-A", "BRIEF-REC01-B", "BRIEF-REC01-C"].map(briefId => ({ brief_id: briefId, organization_name: "Clinique", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie", country: "Suisse" })));
    const briefId = brief!.id as number;
    // Every one of them agreed to be presented (RGPD-03): only the mission and the status filter here.
    memory.seed(clientBriefCandidates, [
      { brief_id: briefId, application_id: shortlisted.id, association_status: "shortlisted", candidate_consent_at: consentAt },
      { brief_id: briefId, application_id: suggested.id, association_status: "suggested", candidate_consent_at: consentAt },
      { brief_id: briefId, application_id: rejected.id, association_status: "shortlisted", candidate_consent_at: consentAt },
      { brief_id: other!.id, application_id: otherMission.id, association_status: "shortlisted", candidate_consent_at: consentAt },
    ]);
    const exportedEmails = (csv: string) => csv.split("\n").slice(1).map(row => row.split(";")[2]);

    const shortlist = await admin().admin.recruitment.exportCsv({ type: "shortlist", briefId });
    expect(shortlist).toMatchObject({ count: 1 });
    expect(exportedEmails(shortlist.csv)).toEqual(["\"c1@test.local\""]);
    await expect(admin().admin.clientBriefs.candidates({ briefId })).resolves.toMatchObject({ shortlistedCount: 1 });

    // Ids sent by the client for a shortlist are ignored, never added.
    const forged = await admin().admin.recruitment.exportCsv({ type: "shortlist", briefId, candidateIds: [suggested.id as number, otherMission.id as number, rejected.id as number] });
    expect(exportedEmails(forged.csv)).toEqual(["\"c1@test.local\""]);

    // A mission nobody is shortlisted for exports nothing, whatever ids come with it.
    await expect(admin().admin.recruitment.exportCsv({ type: "shortlist", briefId: empty!.id as number })).rejects.toThrow("Aucun candidat présélectionné pour cette mission.");
    await expect(admin().admin.recruitment.exportCsv({ type: "shortlist", briefId: empty!.id as number, candidateIds: [shortlisted.id as number, suggested.id as number] })).rejects.toThrow("Aucun candidat présélectionné pour cette mission.");
    await expect(admin().admin.clientBriefs.candidates({ briefId: empty!.id as number })).resolves.toMatchObject({ shortlistedCount: 0 });

    // Removing the last shortlisted candidate empties the shortlist again.
    await admin().admin.clientBriefs.associateCandidate({ briefId, applicationId: shortlisted.id as number, status: "declined" });
    await expect(admin().admin.recruitment.exportCsv({ type: "shortlist", briefId })).rejects.toThrow("Aucun candidat présélectionné pour cette mission.");
    await expect(admin().admin.clientBriefs.candidates({ briefId })).resolves.toMatchObject({ shortlistedCount: 0 });
    expect(memory.rows(recruitmentAuditLogs).filter(row => row.action === "export").map(row => row.application_id)).toEqual([shortlisted.id, shortlisted.id]);
  });

  it("une shortlist au-delà de la limite par export est refusée, jamais tronquée (REC-01)", async () => {
    const [brief] = memory.seed(clientBriefs, [{ brief_id: "BRIEF-REC01-MAX", organization_name: "Clinique", contact_name: "RH", email: "rh@test.local", target_environment: "Hôpital", specialty_needed: "Anesthésie", country: "Suisse" }]);
    const briefId = brief!.id as number;
    const candidates = Array.from({ length: 201 }, (_, index) => seedCandidate(index + 1));
    memory.seed(clientBriefCandidates, candidates.slice(0, 200).map(candidate => ({ brief_id: briefId, application_id: candidate.id, association_status: "shortlisted", candidate_consent_at: consentAt })));
    const exportedRows = (csv: string) => csv.split("\n").length - 1;

    // Exactly at the limit: every shortlisted candidate is in the file.
    const full = await admin().admin.recruitment.exportCsv({ type: "shortlist", briefId });
    expect(full.count).toBe(200);
    expect(exportedRows(full.csv)).toBe(200);
    await expect(admin().admin.clientBriefs.candidates({ briefId })).resolves.toMatchObject({ shortlistedCount: 200 });

    // One more: the export is refused with the limit rather than cut to 200.
    memory.seed(clientBriefCandidates, [{ brief_id: briefId, application_id: candidates[200]!.id, association_status: "shortlisted", candidate_consent_at: consentAt }]);
    await expect(admin().admin.clientBriefs.candidates({ briefId })).resolves.toMatchObject({ shortlistedCount: 201, consentedCount: 201 });
    const auditRowsBefore = memory.rows(recruitmentAuditLogs).length;
    await expect(admin().admin.recruitment.exportCsv({ type: "shortlist", briefId })).rejects.toThrow("La shortlist compte 201 candidats avec accord ; 200 au maximum par export. Retirez des candidats de la shortlist avant de l’exporter.");
    expect(memory.rows(recruitmentAuditLogs)).toHaveLength(auditRowsBefore);
  });

  it("un export du vivier sans sélection est refusé au lieu d’exporter tout le vivier (REC-01)", async () => {
    const selected = seedCandidate(1);
    seedCandidate(2);
    const withoutConsent = seedCandidate(3, { marketing_consent: 0 });
    await expect(admin().admin.recruitment.exportCsv({ type: "pool" })).rejects.toThrow("Sélectionnez au moins un candidat à exporter.");
    await expect(admin().admin.recruitment.exportCsv({ type: "pool", candidateIds: [] })).rejects.toThrow("Sélectionnez au moins un candidat à exporter.");
    // A selected id does not bypass the pool's consent filter.
    const pool = await admin().admin.recruitment.exportCsv({ type: "pool", candidateIds: [selected.id as number, withoutConsent.id as number] });
    expect(pool.count).toBe(1);
    expect(pool.csv).toContain("c1@test.local");
    expect(pool.csv).not.toContain("c2@test.local");
    expect(pool.csv).not.toContain("c3@test.local");
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
