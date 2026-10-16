import { asc, isNotNull, lt, and } from "drizzle-orm";
import { cvApplications } from "../drizzle/schema";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import {
  CandidateErasureBusyError,
  CandidateErasureNotFoundError,
  eraseCandidateApplication,
  eraseExpiredCandidateDocuments,
  type CandidateErasureDependencies,
} from "./recruitmentErasure";

/**
 * Retention of recruitment data (privacy policy: candidate dossiers are kept
 * 2 years, `retention_until` is set at submission and on each vault upload).
 * Each run erases at most this many expired dossiers, oldest first, with the
 * same complete routine as a GDPR request; the rest waits for the next run.
 */
export const RECRUITMENT_RETENTION_BATCH_LIMIT = 10;
export const CANDIDATE_DOCUMENT_RETENTION_BATCH_LIMIT = 25;

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
  const expired = await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId })
    .from(cvApplications)
    .where(and(isNotNull(cvApplications.retentionUntil), lt(cvApplications.retentionUntil, now)))
    .orderBy(asc(cvApplications.retentionUntil), asc(cvApplications.id))
    .limit(limit + 1);
  const batch = expired.slice(0, limit);

  let erased = 0;
  let storageObjectsDeleted = 0;
  let candidateAccountsErased = 0;
  let candidateDocumentsDeleted = 0;
  let driveDeletionsPending = 0;
  const deferred: string[] = [];
  const failed: string[] = [];
  for (const application of batch) {
    try {
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
  const moreRemaining = expired.length > limit;

  if (erased > 0 || documents.deleted > 0 || failed.length > 0 || deferred.length > 0) {
    const lines = [
      `Durée de conservation des candidatures (2 ans) : ${erased} dossier(s) échu(s) effacé(s) définitivement (CV et copies, analyses, historique, espace candidat).`,
      `Fichiers stockés supprimés : ${storageObjectsDeleted} · espaces candidats supprimés : ${candidateAccountsErased} · documents du coffre supprimés : ${candidateDocumentsDeleted + documents.deleted}.`,
      ...(driveDeletionsPending ? [`Copies Google Drive en attente de suppression : ${driveDeletionsPending} (nouvel essai automatique ; reconnectez Google Drive si l’erreur persiste).`] : []),
      ...(deferred.length ? [`Reportés au prochain passage (traitement en cours) : ${deferred.join(", ")}.`] : []),
      ...(failed.length ? [`À vérifier (effacement impossible, rien n’a été supprimé en base pour ces dossiers) : ${failed.join(", ")}.`] : []),
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
    deferred: deferred.length,
    failed: failed.length,
    moreRemaining,
    storageObjectsDeleted,
    candidateAccountsErased,
    candidateDocumentsDeleted: candidateDocumentsDeleted + documents.deleted,
    driveDeletionsPending,
  };
}
