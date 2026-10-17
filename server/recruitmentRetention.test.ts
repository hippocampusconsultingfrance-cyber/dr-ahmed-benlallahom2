import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  candidateAccounts,
  candidateDocumentAuditLogs,
  candidateDocumentProcessingJobs,
  candidateDocuments,
  candidateSessions,
  clientBriefCandidates,
  cvApplications,
  cvCandidateCertifications,
  cvCandidateExperiences,
  cvCandidateLanguages,
  cvGoogleDriveExportJobs,
  cvProcessingJobs,
  recruitmentAuditLogs,
  recruitmentCampaignRecipients,
  recruitmentEmailEvents,
  recruitmentFollowUpTasks,
  securityEvents,
} from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown }, notifications: [] as Array<{ title: string; content: string }> }));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async (payload: { title: string; content: string }) => { state.notifications.push(payload); return true; }) }));

import type { CandidateErasureDependencies } from "./recruitmentErasure";
import { runRecruitmentRetentionCleanup } from "./recruitmentRetention";

const TABLES = [candidateAccounts, candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments, candidateSessions, clientBriefCandidates, cvApplications, cvCandidateCertifications, cvCandidateExperiences, cvCandidateLanguages, cvGoogleDriveExportJobs, cvProcessingJobs, recruitmentAuditLogs, recruitmentCampaignRecipients, recruitmentEmailEvents, recruitmentFollowUpTasks, securityEvents];
const NOW = new Date("2026-10-16T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let memory: MemoryPg;
let blobs: Set<string>;
let storageDown: boolean;

const dependencies: CandidateErasureDependencies = {
  storageListKeys: async prefix => Array.from(blobs).filter(key => key.startsWith(prefix)),
  storageDelete: async keys => {
    if (storageDown) throw new Error("BlobServiceNotAvailable");
    keys.forEach(key => blobs.delete(key));
    return keys.length;
  },
  deleteDriveCopies: async () => ({ status: "none", deleted: 0, error: null }),
};

function seedApplication(index: number, retentionUntil: Date | null) {
  const trackingId = `CVRETENTION${String(index).padStart(4, "0")}`;
  const key = `recruitment/cv/${trackingId}-cv_00000000.pdf`;
  blobs.add(key);
  const [row] = memory.seed(cvApplications, [{
    tracking_id: trackingId, first_name: `Prénom${index}`, last_name: "Nom", email: `candidat${index}@test.local`, specialty: "Anesthésie", target_countries: "[]",
    cv_file_key: key, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, retention_until: retentionUntil,
  }]);
  memory.seed(cvCandidateLanguages, [{ application_id: row!.id, language: "Français" }]);
  return { id: row!.id as number, trackingId };
}

describe("rétention des candidatures : effacement réel à l’échéance", () => {
  beforeEach(() => {
    process.env.CANDIDATE_AUTH_PEPPER ||= "test-pepper-for-retention-tests-0123456789";
    memory = createMemoryPg(TABLES, { now: () => NOW });
    state.memory = memory;
    state.notifications = [];
    blobs = new Set();
    storageDown = false;
  });

  it("n’efface que les dossiers échus, au plus N par passage, les plus anciens d’abord, et envoie un bilan", async () => {
    const expired = Array.from({ length: 4 }, (_, index) => seedApplication(index, new Date(NOW.getTime() - (10 - index) * DAY)));
    const kept = seedApplication(10, new Date(NOW.getTime() + DAY));
    const noDate = seedApplication(11, null);

    const first = await runRecruitmentRetentionCleanup("vercel-cron", { now: NOW, limit: 3, dependencies });
    expect(first).toMatchObject({ erased: 3, failed: 0, moreRemaining: true, storageObjectsDeleted: 3 });
    const remainingIds = memory.rows(cvApplications).map(row => row.id);
    expect(remainingIds).toEqual([expired[3]!.id, kept.id, noDate.id]);
    expect(memory.rows(cvCandidateLanguages).map(row => row.application_id)).toEqual([expired[3]!.id, kept.id, noDate.id]);
    expect(Array.from(blobs).sort()).toEqual([`recruitment/cv/${expired[3]!.trackingId}-cv_00000000.pdf`, `recruitment/cv/${kept.trackingId}-cv_00000000.pdf`, `recruitment/cv/${noDate.trackingId}-cv_00000000.pdf`].sort());
    const proofs = memory.rows(recruitmentAuditLogs).filter(row => row.action === "erase");
    expect(proofs).toHaveLength(3);
    expect(proofs.every(row => JSON.parse(String(row.metadata)).erasureMode === "retention_expired" && row.admin_open_id === "vercel-cron")).toBe(true);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]!.title).toBe("Rétention recrutement : 3 dossier(s) effacé(s)");
    expect(state.notifications[0]!.content).toContain("D’autres dossiers échus restent à effacer");
    expect(state.notifications[0]!.content).not.toContain("candidat0@test.local");

    const second = await runRecruitmentRetentionCleanup("vercel-cron", { now: NOW, limit: 3, dependencies });
    expect(second).toMatchObject({ erased: 1, moreRemaining: false });
    expect(memory.rows(cvApplications).map(row => row.id)).toEqual([kept.id, noDate.id]);

    state.notifications = [];
    await expect(runRecruitmentRetentionCleanup("vercel-cron", { now: NOW, limit: 3, dependencies })).resolves.toMatchObject({ erased: 0, expiredFound: 0 });
    expect(state.notifications).toHaveLength(0);
  });

  it("supprime aussi l’espace candidat lié et les documents du coffre échus", async () => {
    const dossier = seedApplication(1, new Date(NOW.getTime() - DAY));
    const active = seedApplication(2, new Date(NOW.getTime() + 300 * DAY));
    const longAgo = new Date(NOW.getTime() - 3 * 365 * DAY);
    const [account] = memory.seed(candidateAccounts, [{ email: "candidat1@test.local", password_hash: "x", linked_application_id: dossier.id, created_at: longAgo, updated_at: longAgo, last_login_at: longAgo }]);
    const [otherAccount] = memory.seed(candidateAccounts, [{ email: "candidat2@test.local", password_hash: "x", linked_application_id: active.id }]);
    const documents = memory.seed(candidateDocuments, [
      { candidate_id: account!.id, category: "diploma", original_name: "a.pdf", storage_key: `candidate-documents/quarantine/${account!.id}/a.pdf.enc`, mime_type: "application/pdf", size_bytes: 1, checksum: "c", retention_until: new Date(NOW.getTime() - 10 * DAY) },
      { candidate_id: otherAccount!.id, category: "diploma", original_name: "old.pdf", storage_key: `candidate-documents/quarantine/${otherAccount!.id}/old.pdf.enc`, mime_type: "application/pdf", size_bytes: 1, checksum: "c", retention_until: new Date(NOW.getTime() - DAY) },
      { candidate_id: otherAccount!.id, category: "diploma", original_name: "new.pdf", storage_key: `candidate-documents/quarantine/${otherAccount!.id}/new.pdf.enc`, mime_type: "application/pdf", size_bytes: 1, checksum: "c", retention_until: new Date(NOW.getTime() + DAY) },
    ]);
    documents.forEach(document => blobs.add(String(document.storage_key)));

    const result = await runRecruitmentRetentionCleanup("vercel-cron", { now: NOW, dependencies });
    expect(result).toMatchObject({ erased: 1, candidateAccountsErased: 1, candidateDocumentsDeleted: 2 });
    expect(memory.rows(candidateAccounts).map(row => row.id)).toEqual([otherAccount!.id]);
    expect(memory.rows(candidateDocuments).map(row => row.original_name)).toEqual(["new.pdf"]);
    expect(Array.from(blobs).filter(key => key.startsWith("candidate-documents/"))).toEqual([`candidate-documents/quarantine/${otherAccount!.id}/new.pdf.enc`]);
    expect(memory.rows(candidateDocumentAuditLogs).some(row => row.action === "erased" && row.candidate_id === otherAccount!.id)).toBe(true);
  });

  it("n’efface jamais un candidat encore actif : la conservation court 2 ans après sa dernière activité", async () => {
    const longAgo = new Date(NOW.getTime() - 3 * 365 * DAY);
    // Each dossier's submission date is past, but the person is still active.
    const withUpload = seedApplication(1, new Date(NOW.getTime() - DAY));
    const [uploader] = memory.seed(candidateAccounts, [{ email: "candidat1@test.local", password_hash: "x", linked_application_id: withUpload.id, created_at: longAgo, updated_at: longAgo, last_login_at: longAgo }]);
    const freshRetention = new Date(NOW.getTime() + 2 * 365 * DAY);
    const [diploma] = memory.seed(candidateDocuments, [{ candidate_id: uploader!.id, application_id: withUpload.id, category: "diploma", original_name: "diplome.pdf", storage_key: `candidate-documents/quarantine/${uploader!.id}/diplome.pdf.enc`, mime_type: "application/pdf", size_bytes: 1, checksum: "c", retention_until: freshRetention }]);
    blobs.add(String(diploma!.storage_key));
    const withLogin = seedApplication(2, new Date(NOW.getTime() - DAY));
    memory.seed(candidateAccounts, [{ email: "candidat2@test.local", password_hash: "x", created_at: longAgo, updated_at: longAgo, last_login_at: new Date(NOW.getTime() - 30 * DAY) }]);
    const withNewApplication = seedApplication(3, new Date(NOW.getTime() - DAY));
    memory.seed(cvApplications, [{
      tracking_id: "CVRETENTIONNEWER03", first_name: "Prénom3", last_name: "Nom", email: "Candidat3@Test.Local", specialty: "Anesthésie", target_countries: "[]",
      cv_file_key: "recruitment/cv/CVRETENTIONNEWER03-cv.pdf", cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, retention_until: new Date(NOW.getTime() + 400 * DAY),
    }]);
    const withRecruiter = seedApplication(4, new Date(NOW.getTime() - DAY));
    memory.seed(recruitmentAuditLogs, [{ application_id: withRecruiter.id, admin_open_id: "user_owner", action: "status_update", metadata: "{\"status\":\"shortlisted\"}", created_at: new Date(NOW.getTime() - 20 * DAY) }]);
    const withContact = seedApplication(5, new Date(NOW.getTime() - DAY));
    for (const row of memory.rows(cvApplications)) if (row.id === withContact.id) row.last_contacted_at = "2026-09-01 08:00:00";
    const inactive = seedApplication(6, new Date(NOW.getTime() - DAY));

    const result = await runRecruitmentRetentionCleanup("vercel-cron", { now: NOW, dependencies });
    expect(result).toMatchObject({ erased: 1, extendedForActivity: 5, candidateAccountsErased: 0, candidateDocumentsDeleted: 0 });
    expect(memory.rows(cvApplications).map(row => row.id)).not.toContain(inactive.id);
    expect(memory.rows(candidateAccounts)).toHaveLength(2);
    expect(memory.rows(candidateDocuments).map(row => row.original_name)).toEqual(["diplome.pdf"]);
    expect(blobs.has(String(diploma!.storage_key))).toBe(true);
    const retentionOf = (id: number) => new Date(`${memory.rows(cvApplications).find(row => row.id === id)!.retention_until}Z`).getTime();
    expect(retentionOf(withUpload.id)).toBe(freshRetention.getTime());
    expect(retentionOf(withLogin.id)).toBeGreaterThan(NOW.getTime() + 600 * DAY);
    expect(retentionOf(withNewApplication.id)).toBe(NOW.getTime() + 400 * DAY);
    expect(retentionOf(withRecruiter.id)).toBeGreaterThan(NOW.getTime() + 700 * DAY);
    expect(retentionOf(withContact.id)).toBe(new Date("2028-09-01T08:00:00Z").getTime());
    expect(state.notifications[0]!.content).toContain("Conservation prolongée (activité récente du candidat) : 5 dossier(s).");

    // The next run finds nothing expired: the dates now follow the activity.
    await expect(runRecruitmentRetentionCleanup("vercel-cron", { now: NOW, dependencies })).resolves.toMatchObject({ expiredFound: 0, erased: 0 });
  });

  it("efface les espaces candidats sans candidature inactifs depuis 2 ans et rattache ceux dont l’adresse a candidaté", async () => {
    const longAgo = new Date(NOW.getTime() - 3 * 365 * DAY);
    const [dormant] = memory.seed(candidateAccounts, [{ email: "dormant@test.local", first_name: "Dora", password_hash: "x", created_at: longAgo, updated_at: longAgo }]);
    const [oldDocument] = memory.seed(candidateDocuments, [{ candidate_id: dormant!.id, category: "identity_document", original_name: "passeport.pdf", storage_key: `candidate-documents/quarantine/${dormant!.id}/passeport.pdf.enc`, mime_type: "application/pdf", size_bytes: 1, checksum: "c", retention_until: new Date(NOW.getTime() - 400 * DAY) }]);
    blobs.add(String(oldDocument!.storage_key));
    memory.seed(candidateSessions, [{ candidate_id: dormant!.id, token_hash: "old-session", expires_at: longAgo }]);
    const [recent] = memory.seed(candidateAccounts, [{ email: "recent@test.local", password_hash: "x", created_at: new Date(NOW.getTime() - 300 * DAY), updated_at: new Date(NOW.getTime() - 300 * DAY) }]);
    const application = seedApplication(7, new Date(NOW.getTime() + 300 * DAY));
    for (const row of memory.rows(cvApplications)) if (row.id === application.id) row.email = "Applied.Later@Test.Local";
    const [registeredBeforeApplying] = memory.seed(candidateAccounts, [{ email: "applied.later@test.local", password_hash: "x", created_at: longAgo, updated_at: longAgo }]);

    const result = await runRecruitmentRetentionCleanup("vercel-cron", { now: NOW, dependencies });
    expect(result).toMatchObject({ erased: 0, inactiveCandidateAccountsErased: 1, candidateAccountsAttached: 1, candidateAccountsErased: 1 });
    expect(memory.rows(candidateAccounts).map(row => row.id).sort()).toEqual([recent!.id, registeredBeforeApplying!.id].sort());
    expect(memory.rows(candidateAccounts).find(row => row.id === registeredBeforeApplying!.id)!.linked_application_id).toBe(application.id);
    expect(memory.rows(candidateDocuments)).toHaveLength(0);
    expect(memory.rows(candidateSessions)).toHaveLength(0);
    expect(blobs.has(String(oldDocument!.storage_key))).toBe(false);
    const proof = memory.rows(candidateDocumentAuditLogs).find(row => row.candidate_id === dormant!.id && row.action === "erased" && String(row.metadata).includes("inactive_account"));
    expect(proof).toBeDefined();
    expect(String(proof!.metadata)).not.toContain("dormant@");
    expect(state.notifications[0]!.content).toContain("Dont espaces candidats sans candidature, inactifs depuis 2 ans : 1.");
  });

  it("si le stockage échoue : rien n’est effacé en base et le bilan signale les dossiers à vérifier", async () => {
    const dossier = seedApplication(1, new Date(NOW.getTime() - DAY));
    storageDown = true;
    const result = await runRecruitmentRetentionCleanup("vercel-cron", { now: NOW, dependencies });
    expect(result).toMatchObject({ erased: 0, failed: 1 });
    expect(memory.rows(cvApplications).map(row => row.id)).toEqual([dossier.id]);
    expect(state.notifications[0]!.title).toContain("1 à vérifier");
    expect(state.notifications[0]!.content).toContain(dossier.trackingId);
  });

  it("reporte un dossier dont l’analyse est en cours", async () => {
    const dossier = seedApplication(1, new Date(NOW.getTime() - DAY));
    memory.seed(cvProcessingJobs, [{ application_id: dossier.id, job_status: "running", started_at: new Date() }]);
    const result = await runRecruitmentRetentionCleanup("vercel-cron", { now: NOW, dependencies });
    expect(result).toMatchObject({ erased: 0, deferred: 1, failed: 0 });
    expect(memory.rows(cvApplications)).toHaveLength(1);
  });
});
