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

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));

import { hashSecurityValue } from "./candidateSecurity";
import { CandidateErasureBusyError, CandidateErasureStorageError, ERASURE_PENDING_DRIVE_PREFIX, eraseCandidateApplication, retryPendingGoogleDriveErasures, type CandidateErasureDependencies } from "./recruitmentErasure";

const TABLES = [candidateAccounts, candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments, candidateSessions, clientBriefCandidates, cvApplications, cvCandidateCertifications, cvCandidateExperiences, cvCandidateLanguages, cvGoogleDriveExportJobs, cvProcessingJobs, recruitmentAuditLogs, recruitmentCampaignRecipients, recruitmentEmailEvents, recruitmentFollowUpTasks, securityEvents];
const TRACKING = "CV75VJN6FWRS9B8SFK";
const OTHER_TRACKING = "CVOTHERDOSSIER0001";

let memory: MemoryPg;
let blobs: Set<string>;
let driveFiles: Map<string, string>;
let driveMode: "ok" | "down";

function dependencies(): CandidateErasureDependencies {
  return {
    storageListKeys: async prefix => Array.from(blobs).filter(key => key.startsWith(prefix)),
    storageDelete: async keys => {
      keys.forEach(key => blobs.delete(key));
      return keys.length;
    },
    deleteDriveCopies: async ({ trackingId, knownFileIds }) => {
      if (driveMode === "down") return { status: "failed", deleted: 0, error: "google_drive_token_invalid_grant" };
      let deleted = 0;
      for (const id of knownFileIds) if (driveFiles.delete(id)) deleted += 1;
      for (const [id, tracking] of Array.from(driveFiles)) if (tracking === trackingId && driveFiles.delete(id)) deleted += 1;
      return { status: deleted ? "deleted" : "none", deleted, error: null };
    },
  };
}

function seedDossier() {
  const [application] = memory.seed(cvApplications, [{
    tracking_id: TRACKING, first_name: "Claire", last_name: "Martin", email: "Claire.Martin@test.local", specialty: "Anesthésie", target_countries: "[\"France\"]",
    cv_file_key: `recruitment/cv/${TRACKING}-cv_ab12cd34.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, admin_notes: "Très bon profil",
  }]);
  const [other] = memory.seed(cvApplications, [{
    tracking_id: OTHER_TRACKING, first_name: "Paul", last_name: "Durand", email: "paul@test.local", specialty: "Urgences", target_countries: "[]",
    cv_file_key: `recruitment/quarantine/${OTHER_TRACKING}-cv_ffff0000.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
  }]);
  const id = application!.id as number;
  const otherId = other!.id as number;
  blobs = new Set([
    `recruitment/quarantine/${TRACKING}-cv_11111111.pdf`,
    `recruitment/cv/${TRACKING}-cv_ab12cd34.pdf`,
    `recruitment/quarantine/${OTHER_TRACKING}-cv_ffff0000.pdf`,
  ]);
  driveFiles = new Map([["drive-claire", TRACKING], ["drive-claire-orphan", TRACKING], ["drive-paul", OTHER_TRACKING]]);
  memory.seed(cvCandidateCertifications, [{ application_id: id, name: "DESAR", evidence: "extrait du CV" }, { application_id: otherId, name: "AFGSU" }]);
  memory.seed(cvCandidateLanguages, [{ application_id: id, language: "Français" }, { application_id: id, language: "Anglais" }]);
  memory.seed(cvCandidateExperiences, [{ application_id: id, role: "Interne", organization: "CHU Lyon", specialty: "Anesthésie", evidence: "CHU Lyon 2019-2023" }]);
  memory.seed(cvProcessingJobs, [{ application_id: id, job_status: "completed" }, { application_id: otherId, job_status: "queued" }]);
  memory.seed(cvGoogleDriveExportJobs, [{ application_id: id, status: "completed", drive_file_id: "drive-claire", drive_file_url: "https://drive.google.com/file/d/drive-claire/view" }]);
  memory.seed(clientBriefCandidates, [{ brief_id: 1, application_id: id, association_status: "shortlisted" }, { brief_id: 1, application_id: otherId }]);
  memory.seed(recruitmentFollowUpTasks, [{ application_id: id, kind: "follow_up_7", due_at: new Date() }]);
  const [recipient] = memory.seed(recruitmentCampaignRecipients, [{ campaign_id: 1, application_id: id, recipient_email: "Claire.Martin@test.local", delivery_status: "sent" }]);
  memory.seed(recruitmentEmailEvents, [
    { provider_event_id: "evt-1", campaign_recipient_id: recipient!.id, event_type: "email.delivered", recipient_email: "Claire.Martin@test.local", occurred_at: new Date() },
    { provider_event_id: "evt-2", application_id: id, event_type: "email.sent", recipient_email: "Claire.Martin@test.local", occurred_at: new Date() },
    { provider_event_id: "evt-3", application_id: otherId, event_type: "email.sent", recipient_email: "paul@test.local", occurred_at: new Date() },
  ]);
  const [account] = memory.seed(candidateAccounts, [{ email: "claire.martin@test.local", password_hash: "x", linked_application_id: id, email_verified_at: new Date() }]);
  const accountId = account!.id as number;
  memory.seed(candidateSessions, [{ candidate_id: accountId, token_hash: "s1", expires_at: new Date(Date.now() + 3600_000) }, { candidate_id: accountId, token_hash: "s2", expires_at: new Date(Date.now() + 3600_000) }]);
  const documents = memory.seed(candidateDocuments, [1, 2, 3].map(index => ({
    candidate_id: accountId, category: "diploma", original_name: `diplome-${index}.pdf`, storage_key: `candidate-documents/quarantine/${accountId}/17000000${index}-diplome-${index}.pdf.enc`, mime_type: "application/pdf", size_bytes: 10, checksum: "c",
  })));
  documents.forEach(document => blobs.add(String(document.storage_key)));
  blobs.add(`candidate-documents/quarantine/${accountId}/orphan-upload.pdf.enc`);
  memory.seed(candidateDocumentProcessingJobs, documents.map(document => ({ document_id: document.id })));
  memory.seed(candidateDocumentAuditLogs, [{ document_id: documents[0]!.id, candidate_id: accountId, actor_type: "candidate", action: "upload", metadata: "{\"name\":\"diplome-1.pdf\"}" }]);
  memory.seed(securityEvents, [
    { security_event_actor_kind: "anonymous", actor_reference: "Claire.Martin@test.local", category: "public_recruitment_apply_duplicate_file", security_event_outcome: "allowed" },
    { security_event_actor_kind: "candidate", actor_reference: String(accountId), category: "candidate_login", security_event_outcome: "allowed" },
    { security_event_actor_kind: "anonymous", actor_reference: hashSecurityValue("claire.martin@test.local"), category: "candidate_login", security_event_outcome: "failed" },
    { security_event_actor_kind: "admin", actor_reference: "user_owner", category: "admin_mfa_verify", security_event_outcome: "allowed" },
    { security_event_actor_kind: "admin", actor_reference: String(accountId), category: "admin_numeric_reference", security_event_outcome: "allowed" },
  ]);
  memory.seed(recruitmentAuditLogs, [{ application_id: id, admin_open_id: "user_owner", action: "email", metadata: "{\"customRequest\":\"Merci d’envoyer votre diplôme\"}" }]);
  return { id, otherId, accountId };
}

function rowsFor(table: Parameters<MemoryPg["rows"]>[0], column: string, value: unknown) {
  return memory.rows(table).filter(row => row[column] === value);
}

describe("effacement RGPD complet d’un dossier candidat", () => {
  beforeEach(() => {
    process.env.CANDIDATE_AUTH_PEPPER ||= "test-pepper-for-erasure-tests-0123456789";
    memory = createMemoryPg(TABLES);
    state.memory = memory;
    driveMode = "ok";
  });

  it("supprime fichiers, copies Drive, données dérivées, espace candidat et documents, et ne garde qu’une preuve hachée", async () => {
    const { id, otherId, accountId } = seedDossier();
    const report = await eraseCandidateApplication({ applicationId: id, actorOpenId: "user_owner", reason: "admin_gdpr_request" }, dependencies());

    // Stored objects: CV in quarantine, promoted copy, 3 vault documents and an orphan upload.
    expect(report.storageObjectsDeleted).toBe(6);
    expect(Array.from(blobs)).toEqual([`recruitment/quarantine/${OTHER_TRACKING}-cv_ffff0000.pdf`]);
    expect(report.googleDrive).toEqual({ status: "deleted", deleted: 2, error: null });
    expect(Array.from(driveFiles.keys())).toEqual(["drive-paul"]);

    for (const table of [cvApplications]) expect(rowsFor(table, "id", id)).toHaveLength(0);
    for (const table of [cvCandidateCertifications, cvCandidateLanguages, cvCandidateExperiences, cvProcessingJobs, cvGoogleDriveExportJobs, clientBriefCandidates, recruitmentFollowUpTasks, recruitmentCampaignRecipients]) {
      expect(rowsFor(table, "application_id", id)).toHaveLength(0);
    }
    expect(memory.rows(recruitmentEmailEvents).map(row => row.provider_event_id)).toEqual(["evt-3"]);
    expect(memory.rows(candidateAccounts)).toHaveLength(0);
    expect(memory.rows(candidateSessions)).toHaveLength(0);
    expect(memory.rows(candidateDocuments)).toHaveLength(0);
    expect(memory.rows(candidateDocumentProcessingJobs)).toHaveLength(0);
    expect(memory.rows(candidateDocumentAuditLogs)).toHaveLength(0);
    expect(memory.rows(securityEvents).map(row => row.category)).toEqual(["admin_mfa_verify", "admin_numeric_reference"]);
    expect(report.candidateAccountsErased).toBe(1);
    expect(report.candidateSessionsDeleted).toBe(2);
    expect(report.candidateDocumentsDeleted).toBe(3);

    // The other dossier is untouched.
    expect(rowsFor(cvApplications, "id", otherId)).toHaveLength(1);
    expect(rowsFor(cvCandidateCertifications, "application_id", otherId)).toHaveLength(1);
    expect(rowsFor(cvProcessingJobs, "application_id", otherId)).toHaveLength(1);
    expect(rowsFor(clientBriefCandidates, "application_id", otherId)).toHaveLength(1);

    // Only the minimal proof remains: no name, email, file name or storage key.
    const audit = memory.rows(recruitmentAuditLogs);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe("erase");
    const proof = String(audit[0]!.metadata);
    for (const forbidden of ["Claire", "Martin", "test.local", TRACKING, "diplome", "recruitment/", "candidate-documents/", "Merci"]) expect(proof).not.toContain(forbidden);
    expect(JSON.parse(proof)).toMatchObject({ erasureMode: "admin_gdpr_request", emailHash: hashSecurityValue("claire.martin@test.local"), storageObjectsDeleted: 6, googleDrive: "deleted" });
    expect(accountId).toBeGreaterThan(0);
  });

  it("efface aussi l’espace candidat ouvert avec la même adresse mais non rattaché (majuscules, inscription avant candidature)", async () => {
    const { id, accountId } = seedDossier();
    // Account created on /candidate/access: lower-case address, no link to the dossier.
    for (const row of memory.rows(candidateAccounts)) if (row.id === accountId) row.linked_application_id = null;
    for (const row of memory.rows(candidateDocuments)) Object.assign(row, { application_id: null, category: "identity_document" });
    const [unrelated] = memory.seed(candidateAccounts, [{ email: "paul@test.local", password_hash: "x", email_verified_at: new Date() }]);
    memory.seed(cvApplications, [{
      tracking_id: "CVSAMEPERSON000001", first_name: "Claire", last_name: "Martin", email: "CLAIRE.MARTIN@test.local", specialty: "Anesthésie", target_countries: "[]",
      cv_file_key: "recruitment/quarantine/CVSAMEPERSON000001-cv.pdf", cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000,
    }]);

    const report = await eraseCandidateApplication({ applicationId: id, actorOpenId: "user_owner", reason: "admin_gdpr_request" }, dependencies());
    expect(report.candidateAccountsErased).toBe(1);
    expect(report.candidateSessionsDeleted).toBe(2);
    expect(report.candidateDocumentsDeleted).toBe(3);
    expect(report.otherApplicationsWithSameEmail).toBe(1);
    expect(memory.rows(candidateAccounts).map(row => row.id)).toEqual([unrelated!.id]);
    expect(memory.rows(candidateSessions)).toHaveLength(0);
    expect(memory.rows(candidateDocuments)).toHaveLength(0);
    expect(Array.from(blobs).some(key => key.startsWith(`candidate-documents/quarantine/${accountId}/`))).toBe(false);
  });

  it("n’efface rien en base si le stockage refuse la suppression (nouvel essai possible)", async () => {
    const { id } = seedDossier();
    const deps = dependencies();
    deps.storageDelete = async () => { throw new Error("BlobServiceNotAvailable"); };
    await expect(eraseCandidateApplication({ applicationId: id, actorOpenId: "user_owner", reason: "admin_gdpr_request" }, deps)).rejects.toBeInstanceOf(CandidateErasureStorageError);
    expect(rowsFor(cvApplications, "id", id)).toHaveLength(1);
    expect(memory.rows(candidateAccounts)).toHaveLength(1);
    expect(driveFiles.size).toBe(3);

    const report = await eraseCandidateApplication({ applicationId: id, actorOpenId: "user_owner", reason: "admin_gdpr_request" }, dependencies());
    expect(report.storageObjectsDeleted).toBe(6);
    expect(rowsFor(cvApplications, "id", id)).toHaveLength(0);
  });

  it("refuse l’effacement pendant une analyse en cours", async () => {
    const { id } = seedDossier();
    memory.seed(cvProcessingJobs, [{ application_id: id, job_status: "running", started_at: new Date() }]);
    await expect(eraseCandidateApplication({ applicationId: id, actorOpenId: "user_owner", reason: "admin_gdpr_request" }, dependencies())).rejects.toBeInstanceOf(CandidateErasureBusyError);
    expect(rowsFor(cvApplications, "id", id)).toHaveLength(1);
    expect(blobs.size).toBe(7);
  });

  it("enregistre la copie Drive non supprimée et la supprime au passage suivant du cron", async () => {
    const { id } = seedDossier();
    driveMode = "down";
    const report = await eraseCandidateApplication({ applicationId: id, actorOpenId: "user_owner", reason: "admin_gdpr_request" }, dependencies());
    expect(report.googleDrive.status).toBe("pending_retry");
    expect(rowsFor(cvApplications, "id", id)).toHaveLength(0);
    const [pending] = rowsFor(cvGoogleDriveExportJobs, "application_id", id);
    expect(pending).toMatchObject({ status: "failed", drive_file_id: "drive-claire", drive_file_url: null, last_error: `${ERASURE_PENDING_DRIVE_PREFIX}${TRACKING}` });

    await expect(retryPendingGoogleDriveErasures(10, dependencies().deleteDriveCopies)).resolves.toEqual({ processed: 1, completed: 0, pending: 1 });
    driveMode = "ok";
    await expect(retryPendingGoogleDriveErasures(10, dependencies().deleteDriveCopies)).resolves.toEqual({ processed: 1, completed: 1, pending: 0 });
    expect(rowsFor(cvGoogleDriveExportJobs, "application_id", id)).toHaveLength(0);
    expect(Array.from(driveFiles.keys())).toEqual(["drive-paul"]);
  });
});
