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
    const [account] = memory.seed(candidateAccounts, [{ email: "candidat1@test.local", password_hash: "x", linked_application_id: dossier.id }]);
    const [otherAccount] = memory.seed(candidateAccounts, [{ email: "candidat2@test.local", password_hash: "x", linked_application_id: active.id }]);
    const documents = memory.seed(candidateDocuments, [
      { candidate_id: account!.id, category: "diploma", original_name: "a.pdf", storage_key: `candidate-documents/quarantine/${account!.id}/a.pdf.enc`, mime_type: "application/pdf", size_bytes: 1, checksum: "c", retention_until: new Date(NOW.getTime() + 100 * DAY) },
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
