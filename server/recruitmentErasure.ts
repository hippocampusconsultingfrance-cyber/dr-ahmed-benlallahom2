import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
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
import { logError } from "./_core/logError";
import {
  CANDIDATE_DOCUMENT_ACCOUNT_FOREIGN_KEY,
  isForeignKeyViolation,
} from "./databaseConstraints";
import { mutationRowCount } from "./dbMutation";
import { hashSecurityValue } from "./candidateSecurity";
import {
  deleteCvCopiesFromGoogleDrive,
  type GoogleDriveCopyDeletion,
} from "./googleDriveExport";
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
  constructor() {
    super("candidate_erasure_not_found");
  }
}

/** An analysis or Drive copy is running and could recreate data after the erasure. */
export class CandidateErasureBusyError extends Error {
  constructor() {
    super("candidate_erasure_processing_in_progress");
  }
}

/**
 * The erasure stopped once begun (DATA-08): stored files may already be
 * deleted (all of them at the "database" stage), but nothing was removed from
 * the database, its deletions being one batch. The dossier keeps the journal
 * entry that marks it, and the next retention run resumes it
 * (findInterruptedErasures).
 */
export class CandidateErasureInterruptedError extends Error {
  constructor(
    readonly stage: "storage" | "database",
    cause: unknown
  ) {
    super(`candidate_erasure_interrupted_${stage}`, { cause });
  }
}

export type CandidateErasureDependencies = {
  storageDelete: (keys: string[]) => Promise<number>;
  storageListKeys: (prefix: string) => Promise<string[]>;
  deleteDriveCopies: (input: {
    trackingId: string;
    knownFileIds: string[];
  }) => Promise<GoogleDriveCopyDeletion>;
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
  googleDrive: {
    status: "deleted" | "none" | "pending_retry";
    deleted: number;
    error: string | null;
  };
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

/** neon-http's batch (one transaction) takes a non-empty list. */
function nonEmpty(statements: BatchItem<"pg">[]) {
  if (!statements.length) throw new Error("empty_batch");
  return statements as [BatchItem<"pg">, ...BatchItem<"pg">[]];
}

/** Journal entry written before anything is deleted, removed with the dossier: while the dossier exists, it marks an interrupted erasure. */
const ERASURE_STARTED = "started";

/**
 * Complete, verifiable erasure of one recruitment dossier (GDPR art. 17 and
 * end of the retention period):
 * 1. an "erase" journal entry marks the dossier as being erased: should the
 *    erasure stop before its end, the next retention run resumes it
 *    (findInterruptedErasures);
 * 2. every stored object — the CV in quarantine and its promoted copies, the
 *    encrypted vault documents of the linked candidate account — is deleted;
 * 3. the Google Drive copies are deleted; a failure is recorded for retry;
 * 4. one batch, one transaction (DATA-08), deletes the derived rows (AI
 *    extractions, jobs, shortlists, campaign recipients, provider events,
 *    follow-ups, audit entries holding free text), the linked candidate
 *    account with its sessions and documents, the security events naming the
 *    person or the account (before the account), the application row, and
 *    writes a minimal proof (hashes of the email and tracking id, counts):
 *    all or nothing. A document uploaded meanwhile is found again just before
 *    it, file deleted; one stored after that makes the database refuse to
 *    delete its account (foreign key of drizzle/pg/0004), and the batch is
 *    run again once that document is found too.
 */
export async function eraseCandidateApplication(
  input: {
    applicationId: number;
    actorOpenId: string;
    reason: CandidateErasureReason;
  },
  dependencies: CandidateErasureDependencies = defaultDependencies
): Promise<CandidateErasureReport> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [application] = await db
    .select({
      id: cvApplications.id,
      trackingId: cvApplications.trackingId,
      email: cvApplications.email,
      cvFileKey: cvApplications.cvFileKey,
    })
    .from(cvApplications)
    .where(eq(cvApplications.id, input.applicationId))
    .limit(1);
  if (!application) throw new CandidateErasureNotFoundError();

  const activeSince = new Date(Date.now() - ACTIVE_JOB_WINDOW_MS);
  const [runningAnalysis] = await db
    .select({ id: cvProcessingJobs.id })
    .from(cvProcessingJobs)
    .where(
      and(
        eq(cvProcessingJobs.applicationId, application.id),
        eq(cvProcessingJobs.status, "running"),
        gt(cvProcessingJobs.startedAt, activeSince)
      )
    )
    .limit(1);
  const [runningExport] = await db
    .select({ id: cvGoogleDriveExportJobs.id })
    .from(cvGoogleDriveExportJobs)
    .where(
      and(
        eq(cvGoogleDriveExportJobs.applicationId, application.id),
        eq(cvGoogleDriveExportJobs.status, "running"),
        gt(cvGoogleDriveExportJobs.startedAt, activeSince)
      )
    )
    .limit(1);
  if (runningAnalysis || runningExport) throw new CandidateErasureBusyError();

  // Candidate accounts store the address normalised (trimmed, lower case)
  // while the application keeps it as typed: the person's portal is the
  // account linked to this dossier or registered with the same address
  // (before applying, or after an expired invitation), like the admin list.
  const normalizedEmail = application.email.trim().toLowerCase();
  const emailVariants = Array.from(
    new Set([application.email, normalizedEmail])
  );
  const accounts = await db
    .select({ id: candidateAccounts.id })
    .from(candidateAccounts)
    .where(
      or(
        eq(candidateAccounts.linkedApplicationId, application.id),
        eq(candidateAccounts.email, normalizedEmail)
      )
    );
  const accountIds = accounts.map(account => account.id);
  const documentsOfDossier = () =>
    db
      .select({
        id: candidateDocuments.id,
        storageKey: candidateDocuments.storageKey,
      })
      .from(candidateDocuments)
      .where(
        accountIds.length
          ? or(
              inArray(candidateDocuments.candidateId, accountIds),
              eq(candidateDocuments.applicationId, application.id)
            )
          : eq(candidateDocuments.applicationId, application.id)
      );
  const documents = await documentsOfDossier();
  const otherApplicationsWithSameEmail = (
    await db
      .select({ id: cvApplications.id })
      .from(cvApplications)
      .where(
        and(
          sql`lower(${cvApplications.email}) = ${normalizedEmail}`,
          ne(cvApplications.id, application.id)
        )
      )
      .limit(100)
  ).length;

  // 1. From here on, an interruption leaves this entry with the dossier.
  await db.insert(recruitmentAuditLogs).values({
    applicationId: application.id,
    adminOpenId: input.actorOpenId,
    action: "erase",
    metadata: JSON.stringify({
      erasureMode: input.reason,
      status: ERASURE_STARTED,
      startedAt: new Date().toISOString(),
    }),
  });

  // 2. Stored objects.
  const deletedKeys = new Set<string>();
  let storageObjectsDeleted = 0;
  const deleteStoredObjects = async (keys: Iterable<string>) => {
    const pending = Array.from(new Set(keys)).filter(
      key => !deletedKeys.has(key)
    );
    if (!pending.length) return;
    storageObjectsDeleted += await dependencies.storageDelete(pending);
    pending.forEach(key => deletedKeys.add(key));
  };
  const trackingId = safeTrackingId(application.trackingId);
  try {
    const keys = new Set<string>([
      application.cvFileKey,
      ...documents.map(document => document.storageKey),
    ]);
    if (trackingId) {
      for (const prefix of [
        `recruitment/quarantine/${trackingId}-`,
        `recruitment/cv/${trackingId}-`,
      ]) {
        for (const key of await dependencies.storageListKeys(prefix))
          keys.add(key);
      }
    }
    for (const accountId of accountIds) {
      for (const key of await dependencies.storageListKeys(
        `candidate-documents/quarantine/${accountId}/`
      ))
        keys.add(key);
    }
    await deleteStoredObjects(keys);
  } catch (error) {
    throw new CandidateErasureInterruptedError("storage", error);
  }

  try {
    // 3. Google Drive copies.
    const [exportJob] = await db
      .select({
        id: cvGoogleDriveExportJobs.id,
        driveFileId: cvGoogleDriveExportJobs.driveFileId,
      })
      .from(cvGoogleDriveExportJobs)
      .where(eq(cvGoogleDriveExportJobs.applicationId, application.id))
      .limit(1);
    const knownFileIds = exportJob?.driveFileId ? [exportJob.driveFileId] : [];
    const drive = await dependencies.deleteDriveCopies({
      trackingId: application.trackingId,
      knownFileIds,
    });
    const drivePending =
      drive.status === "failed" || drive.status === "not_connected";
    const googleDrive: CandidateErasureReport["googleDrive"] = {
      status: drivePending
        ? "pending_retry"
        : drive.status === "deleted"
          ? "deleted"
          : "none",
      deleted: drive.deleted,
      error: drive.error,
    };
    const pendingDriveFields = {
      status: "failed" as const,
      driveFileId: knownFileIds[0] ?? null,
      driveFileUrl: null,
      lastError: `${ERASURE_PENDING_DRIVE_PREFIX}${application.trackingId}`,
      startedAt: null,
      finishedAt: new Date(),
    };

    // 4. Database rows: one batch.
    for (let attempt = 1; ; attempt += 1) {
      // A document uploaded while the erasure ran is found again, its stored
      // file deleted: it would otherwise survive its account, its analysis
      // still queued (DATA-01).
      const current = await documentsOfDossier();
      try {
        await deleteStoredObjects(current.map(document => document.storageKey));
      } catch (error) {
        throw new CandidateErasureInterruptedError("storage", error);
      }
      const documentIds = current.map(document => document.id);
      const performedAt = new Date().toISOString();
      const statements: Array<
        [label: string | null, statement: BatchItem<"pg">]
      > = [
        [
          "cv_candidate_certifications",
          db
            .delete(cvCandidateCertifications)
            .where(eq(cvCandidateCertifications.applicationId, application.id)),
        ],
        [
          "cv_candidate_languages",
          db
            .delete(cvCandidateLanguages)
            .where(eq(cvCandidateLanguages.applicationId, application.id)),
        ],
        [
          "cv_candidate_experiences",
          db
            .delete(cvCandidateExperiences)
            .where(eq(cvCandidateExperiences.applicationId, application.id)),
        ],
        [
          "cv_processing_jobs",
          db
            .delete(cvProcessingJobs)
            .where(eq(cvProcessingJobs.applicationId, application.id)),
        ],
        drivePending
          ? [
              null,
              exportJob
                ? db
                    .update(cvGoogleDriveExportJobs)
                    .set(pendingDriveFields)
                    .where(eq(cvGoogleDriveExportJobs.id, exportJob.id))
                : db
                    .insert(cvGoogleDriveExportJobs)
                    .values({
                      applicationId: application.id,
                      attempts: 0,
                      maxAttempts: 0,
                      scheduledFor: new Date(),
                      ...pendingDriveFields,
                    })
                    .onConflictDoNothing(),
            ]
          : [
              "cv_google_drive_export_jobs",
              db
                .delete(cvGoogleDriveExportJobs)
                .where(
                  eq(cvGoogleDriveExportJobs.applicationId, application.id)
                ),
            ],
        [
          "client_brief_candidates",
          db
            .delete(clientBriefCandidates)
            .where(eq(clientBriefCandidates.applicationId, application.id)),
        ],
        [
          "recruitment_follow_up_tasks",
          db
            .delete(recruitmentFollowUpTasks)
            .where(eq(recruitmentFollowUpTasks.applicationId, application.id)),
        ],
        [
          "recruitment_email_events",
          db
            .delete(recruitmentEmailEvents)
            .where(
              or(
                eq(recruitmentEmailEvents.applicationId, application.id),
                and(
                  isNull(recruitmentEmailEvents.applicationId),
                  sql`lower(${recruitmentEmailEvents.recipientEmail}) = ${normalizedEmail}`
                ),
                inArray(
                  recruitmentEmailEvents.campaignRecipientId,
                  db
                    .select({ id: recruitmentCampaignRecipients.id })
                    .from(recruitmentCampaignRecipients)
                    .where(
                      eq(
                        recruitmentCampaignRecipients.applicationId,
                        application.id
                      )
                    )
                )
              )
            ),
        ],
        [
          "recruitment_campaign_recipients",
          db
            .delete(recruitmentCampaignRecipients)
            .where(
              eq(recruitmentCampaignRecipients.applicationId, application.id)
            ),
        ],
      ];
      // Vault documents with their processing jobs and audit entries, then the account's sessions.
      if (documentIds.length)
        statements.push([
          "candidate_document_processing_jobs",
          db
            .delete(candidateDocumentProcessingJobs)
            .where(
              inArray(candidateDocumentProcessingJobs.documentId, documentIds)
            ),
        ]);
      const documentAuditConditions = [
        ...(documentIds.length
          ? [inArray(candidateDocumentAuditLogs.documentId, documentIds)]
          : []),
        ...(accountIds.length
          ? [inArray(candidateDocumentAuditLogs.candidateId, accountIds)]
          : []),
      ];
      if (documentAuditConditions.length)
        statements.push([
          "candidate_document_audit_logs",
          db
            .delete(candidateDocumentAuditLogs)
            .where(or(...documentAuditConditions)),
        ]);
      if (documentIds.length)
        statements.push([
          "candidate_documents",
          db
            .delete(candidateDocuments)
            .where(inArray(candidateDocuments.id, documentIds)),
        ]);
      if (accountIds.length)
        statements.push([
          "candidate_sessions",
          db
            .delete(candidateSessions)
            .where(inArray(candidateSessions.candidateId, accountIds)),
        ]);
      // The account's security events before the account itself: none can outlive it.
      statements.push([
        "security_events",
        db
          .delete(securityEvents)
          .where(
            or(
              inArray(securityEvents.actorReference, [
                ...emailVariants,
                hashSecurityValue(application.email),
              ]),
              ...(accountIds.length
                ? [
                    and(
                      eq(securityEvents.actorKind, "candidate"),
                      inArray(
                        securityEvents.actorReference,
                        accountIds.map(String)
                      )
                    ),
                  ]
                : [])
            )
          ),
      ]);
      if (accountIds.length)
        statements.push([
          "candidate_accounts",
          db
            .delete(candidateAccounts)
            .where(inArray(candidateAccounts.id, accountIds)),
        ]);
      // Earlier audit entries can hold free text sent to the candidate; the entry of step 1 goes with them.
      statements.push([
        "recruitment_audit_logs",
        db
          .delete(recruitmentAuditLogs)
          .where(eq(recruitmentAuditLogs.applicationId, application.id)),
      ]);
      statements.push([
        "cv_applications",
        db.delete(cvApplications).where(eq(cvApplications.id, application.id)),
      ]);
      // Minimal proof: no name, email, file name or storage key.
      statements.push([
        null,
        db.insert(recruitmentAuditLogs).values({
          applicationId: application.id,
          adminOpenId: input.actorOpenId,
          action: "erase",
          metadata: JSON.stringify({
            erasureMode: input.reason,
            trackingIdHash: sha256(application.trackingId),
            emailHash: hashSecurityValue(application.email),
            storageObjectsDeleted,
            googleDrive: googleDrive.status,
            googleDriveFilesDeleted: drive.deleted,
            candidateAccountsErased: accountIds.length,
            candidateDocumentsDeleted: documentIds.length,
            performedAt,
          }),
        }),
      ]);

      let results: unknown[];
      try {
        results = await db.batch(
          nonEmpty(statements.map(([, statement]) => statement))
        );
      } catch (error) {
        // A document stored since the check above: the database refused to delete its account, and nothing was deleted.
        if (
          attempt < 3 &&
          isForeignKeyViolation(error, CANDIDATE_DOCUMENT_ACCOUNT_FOREIGN_KEY)
        )
          continue;
        throw error;
      }
      const rowsDeleted: Record<string, number> = {};
      statements.forEach(([label], index) => {
        if (label) rowsDeleted[label] = mutationRowCount(results[index]);
      });
      return {
        applicationId: application.id,
        reason: input.reason,
        storageObjectsDeleted,
        googleDrive,
        candidateAccountsErased: rowsDeleted.candidate_accounts ?? 0,
        candidateSessionsDeleted: rowsDeleted.candidate_sessions ?? 0,
        candidateDocumentsDeleted: rowsDeleted.candidate_documents ?? 0,
        rowsDeleted,
        otherApplicationsWithSameEmail,
        performedAt,
      };
    }
  } catch (error) {
    if (error instanceof CandidateErasureInterruptedError) throw error;
    throw new CandidateErasureInterruptedError("database", error);
  }
}

/**
 * An erasure started within this delay may still be running (the function's
 * 60 s, with margin): the retention run does not resume it in parallel.
 */
const ERASURE_IN_PROGRESS_WINDOW_MS = 2 * 60_000;

/**
 * Erasures that stopped before their end (CandidateErasureInterruptedError,
 * or a function stopped at its time limit): the dossier still has the
 * "erase" entries written when each attempt began. One per dossier, oldest
 * dossier first, whatever the number of attempts it carries, with the reason
 * and the administrator of the first attempt; none started within the last
 * two minutes. The retention run resumes them.
 */
export async function findInterruptedErasures(limit: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const startedRecently = db
    .select({ id: recruitmentAuditLogs.applicationId })
    .from(recruitmentAuditLogs)
    .where(
      and(
        eq(recruitmentAuditLogs.action, "erase"),
        isNotNull(recruitmentAuditLogs.applicationId),
        gt(
          recruitmentAuditLogs.createdAt,
          new Date(Date.now() - ERASURE_IN_PROGRESS_WINDOW_MS)
        )
      )
    );
  // A dossier that always fails gains an entry per attempt: one row each, so it never hides the others.
  const dossiers = await db
    .selectDistinct({ applicationId: recruitmentAuditLogs.applicationId })
    .from(recruitmentAuditLogs)
    .where(
      and(
        eq(recruitmentAuditLogs.action, "erase"),
        inArray(
          recruitmentAuditLogs.applicationId,
          db.select({ id: cvApplications.id }).from(cvApplications)
        ),
        notInArray(recruitmentAuditLogs.applicationId, startedRecently)
      )
    )
    .orderBy(asc(recruitmentAuditLogs.applicationId))
    .limit(Math.min(Math.max(limit, 1), 50));
  const applicationIds = dossiers
    .map(dossier => dossier.applicationId)
    .filter((id): id is number => id !== null);
  if (!applicationIds.length) return [];
  const entries = await db
    .select({
      applicationId: recruitmentAuditLogs.applicationId,
      adminOpenId: recruitmentAuditLogs.adminOpenId,
      metadata: recruitmentAuditLogs.metadata,
    })
    .from(recruitmentAuditLogs)
    .where(
      and(
        eq(recruitmentAuditLogs.action, "erase"),
        inArray(recruitmentAuditLogs.applicationId, applicationIds)
      )
    )
    .orderBy(asc(recruitmentAuditLogs.id));
  const interrupted = new Map<
    number,
    {
      applicationId: number;
      trackingId: string;
      actorOpenId: string;
      reason: CandidateErasureReason;
    }
  >();
  for (const entry of entries) {
    if (entry.applicationId === null || interrupted.has(entry.applicationId))
      continue;
    let reason: CandidateErasureReason = "admin_gdpr_request";
    try {
      if (
        (JSON.parse(entry.metadata ?? "{}") as { erasureMode?: unknown })
          .erasureMode === "retention_expired"
      )
        reason = "retention_expired";
    } catch {
      // An unreadable entry is resumed as a GDPR request: the dossier is erased either way.
    }
    interrupted.set(entry.applicationId, {
      applicationId: entry.applicationId,
      trackingId: "",
      actorOpenId: entry.adminOpenId,
      reason,
    });
  }
  const references = await db
    .select({ id: cvApplications.id, trackingId: cvApplications.trackingId })
    .from(cvApplications)
    .where(inArray(cvApplications.id, applicationIds));
  for (const row of references) {
    const erasure = interrupted.get(row.id);
    if (erasure) erasure.trackingId = row.trackingId;
  }
  return applicationIds
    .map(id => interrupted.get(id))
    .filter((erasure): erasure is NonNullable<typeof erasure> =>
      Boolean(erasure?.trackingId)
    );
}

/**
 * Finishes the Google Drive deletions left pending by an erasure (Drive
 * disconnected or unavailable at the time). Safe to run on every cron.
 */
export async function retryPendingGoogleDriveErasures(
  limit = 10,
  deleteDriveCopies: CandidateErasureDependencies["deleteDriveCopies"] = deleteCvCopiesFromGoogleDrive
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const pending = await db
    .select({
      id: cvGoogleDriveExportJobs.id,
      driveFileId: cvGoogleDriveExportJobs.driveFileId,
      lastError: cvGoogleDriveExportJobs.lastError,
      attempts: cvGoogleDriveExportJobs.attempts,
    })
    .from(cvGoogleDriveExportJobs)
    .where(
      and(
        eq(cvGoogleDriveExportJobs.status, "failed"),
        like(
          cvGoogleDriveExportJobs.lastError,
          `${ERASURE_PENDING_DRIVE_PREFIX}%`
        )
      )
    )
    .orderBy(cvGoogleDriveExportJobs.updatedAt)
    .limit(Math.min(Math.max(limit, 1), 50));
  let completed = 0;
  let stillPending = 0;
  for (const row of pending) {
    const trackingId = (row.lastError ?? "").slice(
      ERASURE_PENDING_DRIVE_PREFIX.length
    );
    const result = await deleteDriveCopies({
      trackingId,
      knownFileIds: row.driveFileId ? [row.driveFileId] : [],
    });
    if (result.status === "deleted" || result.status === "none") {
      await db
        .delete(cvGoogleDriveExportJobs)
        .where(eq(cvGoogleDriveExportJobs.id, row.id));
      completed += 1;
    } else {
      await db
        .update(cvGoogleDriveExportJobs)
        .set({ attempts: row.attempts + 1, updatedAt: new Date() })
        .where(eq(cvGoogleDriveExportJobs.id, row.id));
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
export async function eraseExpiredCandidateDocuments(
  input: {
    now?: Date;
    limit?: number;
    dependencies?: CandidateErasureDependencies;
  } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const dependencies = input.dependencies ?? defaultDependencies;
  const now = input.now ?? new Date();
  const documents = await db
    .select({
      id: candidateDocuments.id,
      candidateId: candidateDocuments.candidateId,
      storageKey: candidateDocuments.storageKey,
    })
    .from(candidateDocuments)
    .where(
      and(
        isNotNull(candidateDocuments.retentionUntil),
        lt(candidateDocuments.retentionUntil, now)
      )
    )
    .orderBy(asc(candidateDocuments.retentionUntil), asc(candidateDocuments.id))
    .limit(Math.min(Math.max(input.limit ?? 25, 1), 100));
  if (!documents.length) return { deleted: 0, failed: 0 };
  try {
    await dependencies.storageDelete(
      documents.map(document => document.storageKey)
    );
  } catch (error) {
    logError("[RecruitmentRetention] vault document deletion failed", error);
    return { deleted: 0, failed: documents.length };
  }
  const documentIds = documents.map(document => document.id);
  await db
    .delete(candidateDocumentProcessingJobs)
    .where(inArray(candidateDocumentProcessingJobs.documentId, documentIds));
  await db
    .delete(candidateDocumentAuditLogs)
    .where(inArray(candidateDocumentAuditLogs.documentId, documentIds));
  const deleted = mutationRowCount(
    await db
      .delete(candidateDocuments)
      .where(inArray(candidateDocuments.id, documentIds))
  );
  const perCandidate = new Map<number, number>();
  for (const document of documents)
    perCandidate.set(
      document.candidateId,
      (perCandidate.get(document.candidateId) ?? 0) + 1
    );
  for (const [candidateId, count] of Array.from(perCandidate)) {
    await db.insert(candidateDocumentAuditLogs).values({
      candidateId,
      documentId: null,
      actorType: "system",
      actorReference: "retention",
      action: "erased",
      metadata: JSON.stringify({
        reason: "retention_expired",
        documentsDeleted: count,
        performedAt: now.toISOString(),
      }),
    });
  }
  return { deleted, failed: 0 };
}

/**
 * Retention of candidate accounts that belong to no application (opened on
 * /candidate/access and never followed by an application, or never
 * activated): erased with their sessions and remaining documents two years
 * after their latest activity (sign-up, renewed by a new registration,
 * activation, sign-in; a session lasts 7 days and every vault document carries
 * its own retention date). Never updated_at: a failed sign-in or a reset
 * request also changes the row, and must not prolong the retention (DATA-09). An
 * unlinked account whose address matches an application is attached to it
 * instead and then follows that dossier's retention. Stored objects first; on
 * a storage failure nothing is removed from the database for that account.
 * `hasTime`: no account is started once it answers false; the rest waits for
 * the next run.
 */
export async function eraseInactiveCandidateAccounts(
  input: {
    now?: Date;
    limit?: number;
    dependencies?: CandidateErasureDependencies;
    hasTime?: () => boolean;
  } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const dependencies = input.dependencies ?? defaultDependencies;
  const now = input.now ?? new Date();
  const inactiveSince = new Date(now);
  inactiveSince.setFullYear(inactiveSince.getFullYear() - 2);
  const accounts = await db
    .select({ id: candidateAccounts.id, email: candidateAccounts.email })
    .from(candidateAccounts)
    .where(
      and(
        isNull(candidateAccounts.linkedApplicationId),
        lt(candidateAccounts.createdAt, inactiveSince),
        or(
          isNull(candidateAccounts.termsAcceptedAt),
          lt(candidateAccounts.termsAcceptedAt, inactiveSince)
        ),
        or(
          isNull(candidateAccounts.emailVerifiedAt),
          lt(candidateAccounts.emailVerifiedAt, inactiveSince)
        ),
        or(
          isNull(candidateAccounts.lastLoginAt),
          lt(candidateAccounts.lastLoginAt, inactiveSince)
        )
      )
    )
    .orderBy(asc(candidateAccounts.id))
    .limit(Math.min(Math.max(input.limit ?? 25, 1), 100));
  let erased = 0;
  let attached = 0;
  let failed = 0;
  let documentsDeleted = 0;
  let storageObjectsDeleted = 0;
  for (const account of accounts) {
    if (input.hasTime && !input.hasTime()) break;
    const [application] = await db
      .select({ id: cvApplications.id })
      .from(cvApplications)
      .where(sql`lower(${cvApplications.email}) = ${account.email}`)
      .orderBy(desc(cvApplications.id))
      .limit(1);
    if (application) {
      await db
        .update(candidateAccounts)
        .set({ linkedApplicationId: application.id })
        .where(
          and(
            eq(candidateAccounts.id, account.id),
            isNull(candidateAccounts.linkedApplicationId)
          )
        );
      attached += 1;
      continue;
    }
    const documents = await db
      .select({
        id: candidateDocuments.id,
        storageKey: candidateDocuments.storageKey,
        retentionUntil: candidateDocuments.retentionUntil,
      })
      .from(candidateDocuments)
      .where(eq(candidateDocuments.candidateId, account.id));
    if (
      documents.some(
        document =>
          !document.retentionUntil ||
          document.retentionUntil.getTime() > now.getTime()
      )
    )
      continue;
    const [liveSession] = await db
      .select({ id: candidateSessions.id })
      .from(candidateSessions)
      .where(
        and(
          eq(candidateSessions.candidateId, account.id),
          isNull(candidateSessions.revokedAt),
          gt(candidateSessions.expiresAt, now)
        )
      )
      .limit(1);
    if (liveSession) continue;
    try {
      const keys = new Set(documents.map(document => document.storageKey));
      for (const key of await dependencies.storageListKeys(
        `candidate-documents/quarantine/${account.id}/`
      ))
        keys.add(key);
      if (keys.size)
        storageObjectsDeleted += await dependencies.storageDelete(
          Array.from(keys)
        );
    } catch (error) {
      failed += 1;
      logError(
        "[RecruitmentRetention] inactive candidate account storage deletion failed",
        error
      );
      continue;
    }
    const documentIds = documents.map(document => document.id);
    if (documentIds.length)
      await db
        .delete(candidateDocumentProcessingJobs)
        .where(
          inArray(candidateDocumentProcessingJobs.documentId, documentIds)
        );
    await db
      .delete(candidateDocumentAuditLogs)
      .where(
        documentIds.length
          ? or(
              eq(candidateDocumentAuditLogs.candidateId, account.id),
              inArray(candidateDocumentAuditLogs.documentId, documentIds)
            )
          : eq(candidateDocumentAuditLogs.candidateId, account.id)
      );
    documentsDeleted += mutationRowCount(
      await db
        .delete(candidateDocuments)
        .where(eq(candidateDocuments.candidateId, account.id))
    );
    await db
      .delete(candidateSessions)
      .where(eq(candidateSessions.candidateId, account.id));
    await db
      .delete(securityEvents)
      .where(
        or(
          and(
            eq(securityEvents.actorKind, "candidate"),
            eq(securityEvents.actorReference, String(account.id))
          ),
          inArray(securityEvents.actorReference, [
            account.email,
            hashSecurityValue(account.email),
          ])
        )
      );
    erased += mutationRowCount(
      await db
        .delete(candidateAccounts)
        .where(eq(candidateAccounts.id, account.id))
    );
    // Minimal proof: no name, email or file name.
    await db.insert(candidateDocumentAuditLogs).values({
      candidateId: account.id,
      documentId: null,
      actorType: "system",
      actorReference: "retention",
      action: "erased",
      metadata: JSON.stringify({
        reason: "inactive_account_retention_expired",
        emailHash: hashSecurityValue(account.email),
        documentsDeleted: documentIds.length,
        performedAt: now.toISOString(),
      }),
    });
  }
  return { erased, attached, failed, documentsDeleted, storageObjectsDeleted };
}
