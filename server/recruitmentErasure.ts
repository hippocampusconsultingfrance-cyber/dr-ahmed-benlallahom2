import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, like, lt, or, sql } from "drizzle-orm";
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
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { hashSecurityValue } from "./candidateSecurity";
import { deleteCvCopiesFromGoogleDrive, type GoogleDriveCopyDeletion } from "./googleDriveExport";
import { storageDelete, storageListKeys } from "./storage";

/**
 * Marker kept on a scrubbed `cv_google_drive_export_jobs` row when the Drive
 * copy of an erased dossier could not be deleted yet. The row holds only the
 * opaque Drive file id and the pseudonymous tracking id needed to finish the
 * deletion; the retry worker removes it once Drive confirms.
 */
export const ERASURE_PENDING_DRIVE_PREFIX = "erasure_pending_drive_delete:";

/** A job started within this delay may still write to the dossier. */
const ACTIVE_JOB_WINDOW_MS = 15 * 60_000;

export type CandidateErasureReason = "admin_gdpr_request" | "retention_expired";

export class CandidateErasureNotFoundError extends Error {
  constructor() { super("candidate_erasure_not_found"); }
}

/** An analysis or Drive copy is running and could recreate data after the erasure. */
export class CandidateErasureBusyError extends Error {
  constructor() { super("candidate_erasure_processing_in_progress"); }
}

/** Stored files could not be deleted: nothing was removed from the database. */
export class CandidateErasureStorageError extends Error {
  constructor(cause: unknown) { super("candidate_erasure_storage_failed", { cause }); }
}

export type CandidateErasureDependencies = {
  storageDelete: (keys: string[]) => Promise<number>;
  storageListKeys: (prefix: string) => Promise<string[]>;
  deleteDriveCopies: (input: { trackingId: string; knownFileIds: string[] }) => Promise<GoogleDriveCopyDeletion>;
};

const defaultDependencies: CandidateErasureDependencies = {
  storageDelete,
  storageListKeys,
  deleteDriveCopies: deleteCvCopiesFromGoogleDrive,
};

export type CandidateErasureReport = {
  applicationId: number;
  reason: CandidateErasureReason;
  storageObjectsDeleted: number;
  googleDrive: { status: "deleted" | "none" | "pending_retry"; deleted: number; error: string | null };
  candidateAccountsErased: number;
  candidateSessionsDeleted: number;
  candidateDocumentsDeleted: number;
  rowsDeleted: Record<string, number>;
  otherApplicationsWithSameEmail: number;
  performedAt: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Tracking ids are generated server-side; anything else must never become a storage prefix. */
function safeTrackingId(trackingId: string) {
  return /^[A-Z0-9][A-Z0-9-]{5,19}$/.test(trackingId) ? trackingId : null;
}

async function deleteRows(label: string, counts: Record<string, number>, operation: Promise<unknown>) {
  counts[label] = (counts[label] ?? 0) + mutationRowCount(await operation);
}

/**
 * Complete, verifiable erasure of one recruitment dossier (GDPR art. 17 and
 * end of the retention period):
 * 1. every stored object — the CV in quarantine and its promoted copies, the
 *    encrypted vault documents of the linked candidate account — is deleted
 *    first; on failure nothing is removed from the database and the call can
 *    simply be retried;
 * 2. the Google Drive copies are deleted; a failure is recorded for retry;
 * 3. derived rows (AI extractions, jobs, shortlists, campaign recipients,
 *    provider events, follow-ups, audit entries holding free text, security
 *    events naming the person) and the linked candidate account with its
 *    sessions and documents are deleted, the application row last;
 * 4. a minimal proof is logged: hashes of the email and tracking id, counts.
 */
export async function eraseCandidateApplication(
  input: { applicationId: number; actorOpenId: string; reason: CandidateErasureReason },
  dependencies: CandidateErasureDependencies = defaultDependencies,
): Promise<CandidateErasureReport> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [application] = await db.select({
    id: cvApplications.id,
    trackingId: cvApplications.trackingId,
    email: cvApplications.email,
    cvFileKey: cvApplications.cvFileKey,
  }).from(cvApplications).where(eq(cvApplications.id, input.applicationId)).limit(1);
  if (!application) throw new CandidateErasureNotFoundError();

  const activeSince = new Date(Date.now() - ACTIVE_JOB_WINDOW_MS);
  const [runningAnalysis] = await db.select({ id: cvProcessingJobs.id }).from(cvProcessingJobs)
    .where(and(eq(cvProcessingJobs.applicationId, application.id), eq(cvProcessingJobs.status, "running"), gt(cvProcessingJobs.startedAt, activeSince))).limit(1);
  const [runningExport] = await db.select({ id: cvGoogleDriveExportJobs.id }).from(cvGoogleDriveExportJobs)
    .where(and(eq(cvGoogleDriveExportJobs.applicationId, application.id), eq(cvGoogleDriveExportJobs.status, "running"), gt(cvGoogleDriveExportJobs.startedAt, activeSince))).limit(1);
  if (runningAnalysis || runningExport) throw new CandidateErasureBusyError();

  // Candidate accounts store the address normalised (trimmed, lower case)
  // while the application keeps it as typed: the person's portal is the
  // account linked to this dossier or registered with the same address
  // (before applying, or after an expired invitation), like the admin list.
  const normalizedEmail = application.email.trim().toLowerCase();
  const emailVariants = Array.from(new Set([application.email, normalizedEmail]));
  const accounts = await db.select({ id: candidateAccounts.id }).from(candidateAccounts)
    .where(or(eq(candidateAccounts.linkedApplicationId, application.id), eq(candidateAccounts.email, normalizedEmail)));
  const accountIds = accounts.map(account => account.id);
  const documents = await db.select({ id: candidateDocuments.id, storageKey: candidateDocuments.storageKey }).from(candidateDocuments)
    .where(accountIds.length
      ? or(inArray(candidateDocuments.candidateId, accountIds), eq(candidateDocuments.applicationId, application.id))
      : eq(candidateDocuments.applicationId, application.id));
  const documentIds = documents.map(document => document.id);

  // 1. Stored objects.
  const trackingId = safeTrackingId(application.trackingId);
  let storageObjectsDeleted = 0;
  try {
    const keys = new Set<string>([application.cvFileKey, ...documents.map(document => document.storageKey)]);
    if (trackingId) {
      for (const prefix of [`recruitment/quarantine/${trackingId}-`, `recruitment/cv/${trackingId}-`]) {
        for (const key of await dependencies.storageListKeys(prefix)) keys.add(key);
      }
    }
    for (const accountId of accountIds) {
      for (const key of await dependencies.storageListKeys(`candidate-documents/quarantine/${accountId}/`)) keys.add(key);
    }
    storageObjectsDeleted = await dependencies.storageDelete(Array.from(keys));
  } catch (error) {
    throw new CandidateErasureStorageError(error);
  }

  // 2. Google Drive copies.
  const [exportJob] = await db.select({ id: cvGoogleDriveExportJobs.id, driveFileId: cvGoogleDriveExportJobs.driveFileId }).from(cvGoogleDriveExportJobs)
    .where(eq(cvGoogleDriveExportJobs.applicationId, application.id)).limit(1);
  const knownFileIds = exportJob?.driveFileId ? [exportJob.driveFileId] : [];
  const drive = await dependencies.deleteDriveCopies({ trackingId: application.trackingId, knownFileIds });
  const drivePending = drive.status === "failed" || drive.status === "not_connected";

  // 3. Database rows, the application last so an interrupted run can resume.
  const rowsDeleted: Record<string, number> = {};
  await deleteRows("cv_candidate_certifications", rowsDeleted, db.delete(cvCandidateCertifications).where(eq(cvCandidateCertifications.applicationId, application.id)));
  await deleteRows("cv_candidate_languages", rowsDeleted, db.delete(cvCandidateLanguages).where(eq(cvCandidateLanguages.applicationId, application.id)));
  await deleteRows("cv_candidate_experiences", rowsDeleted, db.delete(cvCandidateExperiences).where(eq(cvCandidateExperiences.applicationId, application.id)));
  await deleteRows("cv_processing_jobs", rowsDeleted, db.delete(cvProcessingJobs).where(eq(cvProcessingJobs.applicationId, application.id)));
  if (drivePending) {
    const pendingFields = {
      status: "failed" as const,
      driveFileId: knownFileIds[0] ?? null,
      driveFileUrl: null,
      lastError: `${ERASURE_PENDING_DRIVE_PREFIX}${application.trackingId}`,
      startedAt: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    };
    if (exportJob) await db.update(cvGoogleDriveExportJobs).set(pendingFields).where(eq(cvGoogleDriveExportJobs.id, exportJob.id));
    else await db.insert(cvGoogleDriveExportJobs).values({ applicationId: application.id, attempts: 0, maxAttempts: 0, scheduledFor: new Date(), ...pendingFields }).onConflictDoNothing();
  } else {
    await deleteRows("cv_google_drive_export_jobs", rowsDeleted, db.delete(cvGoogleDriveExportJobs).where(eq(cvGoogleDriveExportJobs.applicationId, application.id)));
  }
  await deleteRows("client_brief_candidates", rowsDeleted, db.delete(clientBriefCandidates).where(eq(clientBriefCandidates.applicationId, application.id)));
  await deleteRows("recruitment_follow_up_tasks", rowsDeleted, db.delete(recruitmentFollowUpTasks).where(eq(recruitmentFollowUpTasks.applicationId, application.id)));
  const recipients = await db.select({ id: recruitmentCampaignRecipients.id }).from(recruitmentCampaignRecipients)
    .where(eq(recruitmentCampaignRecipients.applicationId, application.id));
  const recipientIds = recipients.map(recipient => recipient.id);
  const emailEventConditions = [
    eq(recruitmentEmailEvents.applicationId, application.id),
    and(isNull(recruitmentEmailEvents.applicationId), sql`lower(${recruitmentEmailEvents.recipientEmail}) = ${normalizedEmail}`),
    ...(recipientIds.length ? [inArray(recruitmentEmailEvents.campaignRecipientId, recipientIds)] : []),
  ];
  await deleteRows("recruitment_email_events", rowsDeleted, db.delete(recruitmentEmailEvents).where(or(...emailEventConditions)));
  await deleteRows("recruitment_campaign_recipients", rowsDeleted, db.delete(recruitmentCampaignRecipients).where(eq(recruitmentCampaignRecipients.applicationId, application.id)));

  if (documentIds.length) {
    await deleteRows("candidate_document_processing_jobs", rowsDeleted, db.delete(candidateDocumentProcessingJobs).where(inArray(candidateDocumentProcessingJobs.documentId, documentIds)));
  }
  const documentAuditConditions = [
    ...(documentIds.length ? [inArray(candidateDocumentAuditLogs.documentId, documentIds)] : []),
    ...(accountIds.length ? [inArray(candidateDocumentAuditLogs.candidateId, accountIds)] : []),
  ];
  if (documentAuditConditions.length) {
    await deleteRows("candidate_document_audit_logs", rowsDeleted, db.delete(candidateDocumentAuditLogs).where(or(...documentAuditConditions)));
  }
  if (documentIds.length) {
    await deleteRows("candidate_documents", rowsDeleted, db.delete(candidateDocuments).where(inArray(candidateDocuments.id, documentIds)));
  }
  let candidateSessionsDeleted = 0;
  let candidateAccountsErased = 0;
  if (accountIds.length) {
    candidateSessionsDeleted = mutationRowCount(await db.delete(candidateSessions).where(inArray(candidateSessions.candidateId, accountIds)));
    rowsDeleted.candidate_sessions = candidateSessionsDeleted;
    candidateAccountsErased = mutationRowCount(await db.delete(candidateAccounts).where(inArray(candidateAccounts.id, accountIds)));
    rowsDeleted.candidate_accounts = candidateAccountsErased;
  }
  const securityConditions = [
    inArray(securityEvents.actorReference, [...emailVariants, hashSecurityValue(application.email)]),
    ...(accountIds.length ? [and(eq(securityEvents.actorKind, "candidate"), inArray(securityEvents.actorReference, accountIds.map(String)))] : []),
  ];
  await deleteRows("security_events", rowsDeleted, db.delete(securityEvents).where(or(...securityConditions)));
  // Earlier audit entries can hold free text sent to the candidate.
  await deleteRows("recruitment_audit_logs", rowsDeleted, db.delete(recruitmentAuditLogs).where(eq(recruitmentAuditLogs.applicationId, application.id)));
  await deleteRows("cv_applications", rowsDeleted, db.delete(cvApplications).where(eq(cvApplications.id, application.id)));

  const otherApplicationsWithSameEmail = (await db.select({ id: cvApplications.id }).from(cvApplications)
    .where(sql`lower(${cvApplications.email}) = ${normalizedEmail}`).limit(100)).length;

  const performedAt = new Date().toISOString();
  const report: CandidateErasureReport = {
    applicationId: application.id,
    reason: input.reason,
    storageObjectsDeleted,
    googleDrive: { status: drivePending ? "pending_retry" : drive.status === "deleted" ? "deleted" : "none", deleted: drive.deleted, error: drive.error },
    candidateAccountsErased,
    candidateSessionsDeleted,
    candidateDocumentsDeleted: rowsDeleted.candidate_documents ?? 0,
    rowsDeleted,
    otherApplicationsWithSameEmail,
    performedAt,
  };

  // 4. Minimal proof: no name, email, file name or storage key.
  await db.insert(recruitmentAuditLogs).values({
    applicationId: application.id,
    adminOpenId: input.actorOpenId,
    action: "erase",
    metadata: JSON.stringify({
      erasureMode: input.reason,
      trackingIdHash: sha256(application.trackingId),
      emailHash: hashSecurityValue(application.email),
      storageObjectsDeleted,
      googleDrive: report.googleDrive.status,
      googleDriveFilesDeleted: drive.deleted,
      candidateAccountsErased,
      candidateDocumentsDeleted: report.candidateDocumentsDeleted,
      rowsDeleted,
      performedAt,
    }),
  });
  return report;
}

/**
 * Finishes the Google Drive deletions left pending by an erasure (Drive
 * disconnected or unavailable at the time). Safe to run on every cron.
 */
export async function retryPendingGoogleDriveErasures(
  limit = 10,
  deleteDriveCopies: CandidateErasureDependencies["deleteDriveCopies"] = deleteCvCopiesFromGoogleDrive,
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const pending = await db.select({ id: cvGoogleDriveExportJobs.id, driveFileId: cvGoogleDriveExportJobs.driveFileId, lastError: cvGoogleDriveExportJobs.lastError, attempts: cvGoogleDriveExportJobs.attempts })
    .from(cvGoogleDriveExportJobs)
    .where(and(eq(cvGoogleDriveExportJobs.status, "failed"), like(cvGoogleDriveExportJobs.lastError, `${ERASURE_PENDING_DRIVE_PREFIX}%`)))
    .orderBy(cvGoogleDriveExportJobs.updatedAt)
    .limit(Math.min(Math.max(limit, 1), 50));
  let completed = 0;
  let stillPending = 0;
  for (const row of pending) {
    const trackingId = (row.lastError ?? "").slice(ERASURE_PENDING_DRIVE_PREFIX.length);
    const result = await deleteDriveCopies({ trackingId, knownFileIds: row.driveFileId ? [row.driveFileId] : [] });
    if (result.status === "deleted" || result.status === "none") {
      await db.delete(cvGoogleDriveExportJobs).where(eq(cvGoogleDriveExportJobs.id, row.id));
      completed += 1;
    } else {
      await db.update(cvGoogleDriveExportJobs).set({ attempts: row.attempts + 1, updatedAt: new Date() }).where(eq(cvGoogleDriveExportJobs.id, row.id));
      stillPending += 1;
    }
  }
  return { processed: pending.length, completed, pending: stillPending };
}

/**
 * Retention of vault documents on their own `retention_until` (documents of
 * an erased dossier are already removed with it). Stored objects first; on a
 * storage failure nothing is removed from the database.
 */
export async function eraseExpiredCandidateDocuments(input: { now?: Date; limit?: number; dependencies?: CandidateErasureDependencies } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const dependencies = input.dependencies ?? defaultDependencies;
  const now = input.now ?? new Date();
  const documents = await db.select({ id: candidateDocuments.id, candidateId: candidateDocuments.candidateId, storageKey: candidateDocuments.storageKey })
    .from(candidateDocuments)
    .where(and(isNotNull(candidateDocuments.retentionUntil), lt(candidateDocuments.retentionUntil, now)))
    .orderBy(asc(candidateDocuments.retentionUntil), asc(candidateDocuments.id))
    .limit(Math.min(Math.max(input.limit ?? 25, 1), 100));
  if (!documents.length) return { deleted: 0, failed: 0 };
  try {
    await dependencies.storageDelete(documents.map(document => document.storageKey));
  } catch (error) {
    console.error("[RecruitmentRetention] vault document deletion failed", error instanceof Error ? error.message : "unknown");
    return { deleted: 0, failed: documents.length };
  }
  const documentIds = documents.map(document => document.id);
  await db.delete(candidateDocumentProcessingJobs).where(inArray(candidateDocumentProcessingJobs.documentId, documentIds));
  await db.delete(candidateDocumentAuditLogs).where(inArray(candidateDocumentAuditLogs.documentId, documentIds));
  const deleted = mutationRowCount(await db.delete(candidateDocuments).where(inArray(candidateDocuments.id, documentIds)));
  const perCandidate = new Map<number, number>();
  for (const document of documents) perCandidate.set(document.candidateId, (perCandidate.get(document.candidateId) ?? 0) + 1);
  for (const [candidateId, count] of Array.from(perCandidate)) {
    await db.insert(candidateDocumentAuditLogs).values({ candidateId, documentId: null, actorType: "system", actorReference: "retention", action: "erased", metadata: JSON.stringify({ reason: "retention_expired", documentsDeleted: count, performedAt: now.toISOString() }) });
  }
  return { deleted, failed: 0 };
}

/**
 * Retention of candidate accounts that belong to no application (opened on
 * /candidate/access and never followed by an application, or never
 * activated): erased with their sessions and remaining documents two years
 * after their latest activity (sign-up, account change, sign-in; a session
 * lasts 7 days and every vault document carries its own retention date). An
 * unlinked account whose address matches an application is attached to it
 * instead and then follows that dossier's retention. Stored objects first; on
 * a storage failure nothing is removed from the database for that account.
 */
export async function eraseInactiveCandidateAccounts(input: { now?: Date; limit?: number; dependencies?: CandidateErasureDependencies } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const dependencies = input.dependencies ?? defaultDependencies;
  const now = input.now ?? new Date();
  const inactiveSince = new Date(now);
  inactiveSince.setFullYear(inactiveSince.getFullYear() - 2);
  const accounts = await db.select({ id: candidateAccounts.id, email: candidateAccounts.email }).from(candidateAccounts)
    .where(and(
      isNull(candidateAccounts.linkedApplicationId),
      lt(candidateAccounts.createdAt, inactiveSince),
      lt(candidateAccounts.updatedAt, inactiveSince),
      or(isNull(candidateAccounts.lastLoginAt), lt(candidateAccounts.lastLoginAt, inactiveSince)),
    ))
    .orderBy(asc(candidateAccounts.id))
    .limit(Math.min(Math.max(input.limit ?? 25, 1), 100));
  let erased = 0;
  let attached = 0;
  let failed = 0;
  let documentsDeleted = 0;
  let storageObjectsDeleted = 0;
  for (const account of accounts) {
    const [application] = await db.select({ id: cvApplications.id }).from(cvApplications)
      .where(sql`lower(${cvApplications.email}) = ${account.email}`)
      .orderBy(desc(cvApplications.id))
      .limit(1);
    if (application) {
      await db.update(candidateAccounts).set({ linkedApplicationId: application.id })
        .where(and(eq(candidateAccounts.id, account.id), isNull(candidateAccounts.linkedApplicationId)));
      attached += 1;
      continue;
    }
    const documents = await db.select({ id: candidateDocuments.id, storageKey: candidateDocuments.storageKey, retentionUntil: candidateDocuments.retentionUntil })
      .from(candidateDocuments).where(eq(candidateDocuments.candidateId, account.id));
    if (documents.some(document => !document.retentionUntil || document.retentionUntil.getTime() > now.getTime())) continue;
    const [liveSession] = await db.select({ id: candidateSessions.id }).from(candidateSessions)
      .where(and(eq(candidateSessions.candidateId, account.id), isNull(candidateSessions.revokedAt), gt(candidateSessions.expiresAt, now)))
      .limit(1);
    if (liveSession) continue;
    try {
      const keys = new Set(documents.map(document => document.storageKey));
      for (const key of await dependencies.storageListKeys(`candidate-documents/quarantine/${account.id}/`)) keys.add(key);
      if (keys.size) storageObjectsDeleted += await dependencies.storageDelete(Array.from(keys));
    } catch (error) {
      failed += 1;
      console.error("[RecruitmentRetention] inactive candidate account storage deletion failed", error instanceof Error ? error.message : "unknown");
      continue;
    }
    const documentIds = documents.map(document => document.id);
    if (documentIds.length) await db.delete(candidateDocumentProcessingJobs).where(inArray(candidateDocumentProcessingJobs.documentId, documentIds));
    await db.delete(candidateDocumentAuditLogs).where(documentIds.length
      ? or(eq(candidateDocumentAuditLogs.candidateId, account.id), inArray(candidateDocumentAuditLogs.documentId, documentIds))
      : eq(candidateDocumentAuditLogs.candidateId, account.id));
    documentsDeleted += mutationRowCount(await db.delete(candidateDocuments).where(eq(candidateDocuments.candidateId, account.id)));
    await db.delete(candidateSessions).where(eq(candidateSessions.candidateId, account.id));
    await db.delete(securityEvents).where(or(
      and(eq(securityEvents.actorKind, "candidate"), eq(securityEvents.actorReference, String(account.id))),
      inArray(securityEvents.actorReference, [account.email, hashSecurityValue(account.email)]),
    ));
    erased += mutationRowCount(await db.delete(candidateAccounts).where(eq(candidateAccounts.id, account.id)));
    // Minimal proof: no name, email or file name.
    await db.insert(candidateDocumentAuditLogs).values({ candidateId: account.id, documentId: null, actorType: "system", actorReference: "retention", action: "erased", metadata: JSON.stringify({ reason: "inactive_account_retention_expired", emailHash: hashSecurityValue(account.email), documentsDeleted: documentIds.length, performedAt: now.toISOString() }) });
  }
  return { erased, attached, failed, documentsDeleted, storageObjectsDeleted };
}
