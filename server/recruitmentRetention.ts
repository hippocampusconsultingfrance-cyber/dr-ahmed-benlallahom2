import { and, asc, desc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { candidateAccounts, candidateDocuments, candidateSessions, cvApplications, recruitmentAuditLogs } from "../drizzle/schema";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import {
  CandidateErasureBusyError,
  CandidateErasureNotFoundError,
  eraseCandidateApplication,
  eraseExpiredCandidateDocuments,
  eraseInactiveCandidateAccounts,
  type CandidateErasureDependencies,
} from "./recruitmentErasure";

/**
 * Retention of recruitment data: a candidate's data is kept 2 years after
 * their latest activity. `retention_until` is written at submission
 * (submission + 2 years); when it passes, the cleanup first recomputes the
 * date from the person's latest activity (see `recruitmentRetentionDeadline`)
 * and only erases the dossier when that date has passed too, otherwise it
 * pushes `retention_until` forward. Each run handles at most this many
 * expired dossiers, oldest first, with the same complete routine as a GDPR
 * request; the rest waits for the next run.
 */
export const RECRUITMENT_RETENTION_BATCH_LIMIT = 10;
export const CANDIDATE_DOCUMENT_RETENTION_BATCH_LIMIT = 25;
export const CANDIDATE_ACCOUNT_RETENTION_BATCH_LIMIT = 25;
export const RECRUITMENT_RETENTION_YEARS = 2;
/** Recruiter actions that show an ongoing relationship with the candidate. */
const RECRUITER_ACTIVITY_ACTIONS = ["status_update", "email"] as const;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function retentionAfter(date: Date | null | undefined) {
  if (!date) return null;
  const until = new Date(date);
  until.setFullYear(until.getFullYear() + RECRUITMENT_RETENTION_YEARS);
  return until;
}

/**
 * Date until which a dossier must be kept: two years after the latest
 * activity of the person behind it, i.e. of every application sent with the
 * same address (case-insensitive) and of their candidate portal: submissions,
 * contacts and replies, recruiter status changes and emails, portal sign-up,
 * sign-ins and sessions, and vault uploads (each document carries its own
 * retention date). Returns the stored date when nothing later is found.
 */
export async function recruitmentRetentionDeadline(db: Database, application: { id: number; email: string; retentionUntil: Date | null }) {
  const email = application.email.trim().toLowerCase();
  const dates: Array<Date | null> = [application.retentionUntil];
  const applications = await db.select({
    id: cvApplications.id,
    retentionUntil: cvApplications.retentionUntil,
    createdAt: cvApplications.createdAt,
    lastContactedAt: cvApplications.lastContactedAt,
    lastCandidateResponseAt: cvApplications.lastCandidateResponseAt,
  }).from(cvApplications)
    .where(or(eq(cvApplications.id, application.id), sql`lower(${cvApplications.email}) = ${email}`))
    .limit(200);
  for (const row of applications) {
    dates.push(row.retentionUntil ?? retentionAfter(row.createdAt), retentionAfter(row.lastContactedAt), retentionAfter(row.lastCandidateResponseAt));
  }
  const applicationIds = Array.from(new Set([application.id, ...applications.map(row => row.id)]));
  const [recruiterActivity] = await db.select({ createdAt: recruitmentAuditLogs.createdAt }).from(recruitmentAuditLogs)
    .where(and(inArray(recruitmentAuditLogs.applicationId, applicationIds), inArray(recruitmentAuditLogs.action, [...RECRUITER_ACTIVITY_ACTIONS])))
    .orderBy(desc(recruitmentAuditLogs.createdAt))
    .limit(1);
  dates.push(retentionAfter(recruiterActivity?.createdAt));

  const accounts = await db.select({ id: candidateAccounts.id, createdAt: candidateAccounts.createdAt, updatedAt: candidateAccounts.updatedAt, lastLoginAt: candidateAccounts.lastLoginAt })
    .from(candidateAccounts)
    .where(or(inArray(candidateAccounts.linkedApplicationId, applicationIds), eq(candidateAccounts.email, email)));
  for (const account of accounts) dates.push(retentionAfter(account.createdAt), retentionAfter(account.updatedAt), retentionAfter(account.lastLoginAt));
  const accountIds = accounts.map(account => account.id);
  const documents = await db.select({ retentionUntil: candidateDocuments.retentionUntil, createdAt: candidateDocuments.createdAt }).from(candidateDocuments)
    .where(accountIds.length
      ? or(inArray(candidateDocuments.candidateId, accountIds), inArray(candidateDocuments.applicationId, applicationIds))
      : inArray(candidateDocuments.applicationId, applicationIds));
  for (const document of documents) dates.push(document.retentionUntil ?? retentionAfter(document.createdAt));
  if (accountIds.length) {
    const sessions = await db.select({ lastSeenAt: candidateSessions.lastSeenAt }).from(candidateSessions)
      .where(inArray(candidateSessions.candidateId, accountIds))
      .orderBy(desc(candidateSessions.lastSeenAt))
      .limit(1);
    dates.push(retentionAfter(sessions[0]?.lastSeenAt));
  }
  const latest = Math.max(...dates.filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime())).map(date => date.getTime()));
  return Number.isFinite(latest) ? new Date(latest) : null;
}

export async function runRecruitmentRetentionCleanup(
  actorOpenId: string,
  options: { now?: Date; limit?: number; documentLimit?: number; dependencies?: CandidateErasureDependencies } = {},
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? RECRUITMENT_RETENTION_BATCH_LIMIT, 1), 50);
  // Only rows whose retention date is set and passed; one extra row tells
  // whether more expired dossiers remain for the next run.
  const expired = await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId, email: cvApplications.email, retentionUntil: cvApplications.retentionUntil })
    .from(cvApplications)
    .where(and(isNotNull(cvApplications.retentionUntil), lt(cvApplications.retentionUntil, now)))
    .orderBy(asc(cvApplications.retentionUntil), asc(cvApplications.id))
    .limit(limit + 1);
  const batch = expired.slice(0, limit);

  let erased = 0;
  let extendedForActivity = 0;
  let storageObjectsDeleted = 0;
  let candidateAccountsErased = 0;
  let candidateDocumentsDeleted = 0;
  let driveDeletionsPending = 0;
  const deferred: string[] = [];
  const failed: string[] = [];
  for (const application of batch) {
    try {
      // Never erase a person who is still active: their dossier is kept two
      // years after the latest activity, and the stored date follows it.
      const keepUntil = await recruitmentRetentionDeadline(db, application);
      if (keepUntil && keepUntil.getTime() > now.getTime()) {
        await db.update(cvApplications).set({ retentionUntil: keepUntil }).where(eq(cvApplications.id, application.id));
        extendedForActivity += 1;
        continue;
      }
      const report = await eraseCandidateApplication({ applicationId: application.id, actorOpenId, reason: "retention_expired" }, options.dependencies);
      erased += 1;
      storageObjectsDeleted += report.storageObjectsDeleted;
      candidateAccountsErased += report.candidateAccountsErased;
      candidateDocumentsDeleted += report.candidateDocumentsDeleted;
      if (report.googleDrive.status === "pending_retry") driveDeletionsPending += 1;
    } catch (error) {
      if (error instanceof CandidateErasureNotFoundError) continue;
      if (error instanceof CandidateErasureBusyError) deferred.push(application.trackingId);
      else {
        failed.push(application.trackingId);
        console.error("[RecruitmentRetention] erasure failed", { applicationId: application.id, error: error instanceof Error ? error.message : "unknown" });
      }
    }
  }

  const documents = await eraseExpiredCandidateDocuments({ now, limit: options.documentLimit ?? CANDIDATE_DOCUMENT_RETENTION_BATCH_LIMIT, dependencies: options.dependencies });
  const inactiveAccounts = await eraseInactiveCandidateAccounts({ now, limit: CANDIDATE_ACCOUNT_RETENTION_BATCH_LIMIT, dependencies: options.dependencies });
  const moreRemaining = expired.length > limit;
  const accountsErased = candidateAccountsErased + inactiveAccounts.erased;
  const documentsErased = candidateDocumentsDeleted + documents.deleted + inactiveAccounts.documentsDeleted;

  if (erased > 0 || documents.deleted > 0 || inactiveAccounts.erased > 0 || failed.length > 0 || deferred.length > 0 || inactiveAccounts.failed > 0) {
    const lines = [
      `Durée de conservation des candidatures (2 ans après la dernière activité du candidat) : ${erased} dossier(s) échu(s) effacé(s) définitivement (CV et copies, analyses, historique, espace candidat).`,
      `Fichiers stockés supprimés : ${storageObjectsDeleted + inactiveAccounts.storageObjectsDeleted} · espaces candidats supprimés : ${accountsErased} · documents du coffre supprimés : ${documentsErased}.`,
      ...(inactiveAccounts.erased ? [`Dont espaces candidats sans candidature, inactifs depuis 2 ans : ${inactiveAccounts.erased}.`] : []),
      ...(extendedForActivity ? [`Conservation prolongée (activité récente du candidat) : ${extendedForActivity} dossier(s).`] : []),
      ...(driveDeletionsPending ? [`Copies Google Drive en attente de suppression : ${driveDeletionsPending} (nouvel essai automatique ; reconnectez Google Drive si l’erreur persiste).`] : []),
      ...(deferred.length ? [`Reportés au prochain passage (traitement en cours) : ${deferred.join(", ")}.`] : []),
      ...(failed.length ? [`À vérifier (effacement impossible, rien n’a été supprimé en base pour ces dossiers) : ${failed.join(", ")}.`] : []),
      ...(inactiveAccounts.failed ? [`Espaces candidats inactifs non effacés (stockage indisponible, nouvel essai au prochain passage) : ${inactiveAccounts.failed}.`] : []),
      ...(moreRemaining ? [`D’autres dossiers échus restent à effacer : ils le seront aux prochains passages (${limit} par jour au maximum).`] : []),
      "Une preuve d’effacement anonymisée (empreintes, nombres) est conservée dans le journal de recrutement.",
    ];
    await notifyOwner({
      title: failed.length ? `Rétention recrutement : ${erased} dossier(s) effacé(s), ${failed.length} à vérifier` : `Rétention recrutement : ${erased} dossier(s) effacé(s)`,
      content: lines.join("\n\n"),
    }).catch(() => false);
  }

  return {
    expiredFound: Math.min(expired.length, limit),
    erased,
    extendedForActivity,
    deferred: deferred.length,
    failed: failed.length,
    moreRemaining,
    storageObjectsDeleted: storageObjectsDeleted + inactiveAccounts.storageObjectsDeleted,
    candidateAccountsErased: accountsErased,
    candidateDocumentsDeleted: documentsErased,
    inactiveCandidateAccountsErased: inactiveAccounts.erased,
    candidateAccountsAttached: inactiveAccounts.attached,
    driveDeletionsPending,
  };
}
