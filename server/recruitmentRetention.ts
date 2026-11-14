import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  candidateAccounts,
  candidateDocuments,
  candidateSessions,
  cvApplications,
  recruitmentAuditLogs,
} from "../drizzle/schema";
import { getDb } from "./db";
import { logError } from "./_core/logError";
import { notifyOwner } from "./_core/notification";
import {
  CandidateErasureBusyError,
  CandidateErasureInterruptedError,
  CandidateErasureNotFoundError,
  eraseCandidateApplication,
  eraseExpiredCandidateDocuments,
  eraseInactiveCandidateAccounts,
  findInterruptedErasures,
  type CandidateErasureDependencies,
} from "./recruitmentErasure";

/**
 * Retention of recruitment data: a candidate's data is kept 2 years after
 * their latest activity. `retention_until` is written at submission
 * (submission + 2 years); when it passes, the cleanup first recomputes the
 * date from the person's latest activity (see `recruitmentRetentionDeadline`)
 * and only erases the dossier when that date has passed too, otherwise it
 * pushes `retention_until` forward. Each run first resumes the erasures that
 * stopped before their end (GDPR requests included), then handles at most
 * this many expired dossiers, oldest first, with the same complete routine as
 * a GDPR request; the rest waits for the next run.
 */
export const RECRUITMENT_RETENTION_BATCH_LIMIT = 10;
/**
 * No dossier is started past this time (DATA-08): each one deletes files in
 * Blob and Drive, and the run, its vault and account clean-ups, the orphan CVs
 * and the owner's report must end within the function's 60 s.
 */
export const RECRUITMENT_RETENTION_BUDGET_MS = 40_000;
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
export async function recruitmentRetentionDeadline(
  db: Database,
  application: { id: number; email: string; retentionUntil: Date | null }
) {
  const email = application.email.trim().toLowerCase();
  const dates: Array<Date | null> = [application.retentionUntil];
  const applications = await db
    .select({
      id: cvApplications.id,
      retentionUntil: cvApplications.retentionUntil,
      createdAt: cvApplications.createdAt,
      lastContactedAt: cvApplications.lastContactedAt,
      lastCandidateResponseAt: cvApplications.lastCandidateResponseAt,
    })
    .from(cvApplications)
    .where(
      or(
        eq(cvApplications.id, application.id),
        sql`lower(${cvApplications.email}) = ${email}`
      )
    )
    .limit(200);
  for (const row of applications) {
    dates.push(
      row.retentionUntil ?? retentionAfter(row.createdAt),
      retentionAfter(row.lastContactedAt),
      retentionAfter(row.lastCandidateResponseAt)
    );
  }
  const applicationIds = Array.from(
    new Set([application.id, ...applications.map(row => row.id)])
  );
  const [recruiterActivity] = await db
    .select({ createdAt: recruitmentAuditLogs.createdAt })
    .from(recruitmentAuditLogs)
    .where(
      and(
        inArray(recruitmentAuditLogs.applicationId, applicationIds),
        inArray(recruitmentAuditLogs.action, [...RECRUITER_ACTIVITY_ACTIONS])
      )
    )
    .orderBy(desc(recruitmentAuditLogs.createdAt))
    .limit(1);
  dates.push(retentionAfter(recruiterActivity?.createdAt));

  // The portal's activity columns, never updated_at: a failed sign-in or a
  // reset request also changes the row (DATA-09). Sign-up (renewed by a new
  // registration), activation, sign-in.
  const accounts = await db
    .select({
      id: candidateAccounts.id,
      createdAt: candidateAccounts.createdAt,
      termsAcceptedAt: candidateAccounts.termsAcceptedAt,
      emailVerifiedAt: candidateAccounts.emailVerifiedAt,
      lastLoginAt: candidateAccounts.lastLoginAt,
    })
    .from(candidateAccounts)
    .where(
      or(
        inArray(candidateAccounts.linkedApplicationId, applicationIds),
        eq(candidateAccounts.email, email)
      )
    );
  for (const account of accounts)
    dates.push(
      retentionAfter(account.createdAt),
      retentionAfter(account.termsAcceptedAt),
      retentionAfter(account.emailVerifiedAt),
      retentionAfter(account.lastLoginAt)
    );
  const accountIds = accounts.map(account => account.id);
  const documents = await db
    .select({
      retentionUntil: candidateDocuments.retentionUntil,
      createdAt: candidateDocuments.createdAt,
    })
    .from(candidateDocuments)
    .where(
      accountIds.length
        ? or(
            inArray(candidateDocuments.candidateId, accountIds),
            inArray(candidateDocuments.applicationId, applicationIds)
          )
        : inArray(candidateDocuments.applicationId, applicationIds)
    );
  for (const document of documents)
    dates.push(document.retentionUntil ?? retentionAfter(document.createdAt));
  if (accountIds.length) {
    const sessions = await db
      .select({ lastSeenAt: candidateSessions.lastSeenAt })
      .from(candidateSessions)
      .where(inArray(candidateSessions.candidateId, accountIds))
      .orderBy(desc(candidateSessions.lastSeenAt))
      .limit(1);
    dates.push(retentionAfter(sessions[0]?.lastSeenAt));
  }
  const latest = Math.max(
    ...dates
      .filter(
        (date): date is Date =>
          date instanceof Date && !Number.isNaN(date.getTime())
      )
      .map(date => date.getTime())
  );
  return Number.isFinite(latest) ? new Date(latest) : null;
}

export async function runRecruitmentRetentionCleanup(
  actorOpenId: string,
  options: {
    now?: Date;
    limit?: number;
    documentLimit?: number;
    budgetMs?: number;
    dependencies?: CandidateErasureDependencies;
  } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? RECRUITMENT_RETENTION_BUDGET_MS;
  const hasTime = () => Date.now() - startedAt < budgetMs;
  const now = options.now ?? new Date();
  const limit = Math.min(
    Math.max(options.limit ?? RECRUITMENT_RETENTION_BATCH_LIMIT, 1),
    50
  );
  // Erasures stopped before their end first (DATA-08): GDPR requests too.
  const interrupted = await findInterruptedErasures(limit);
  // Only rows whose retention date is set and passed; one extra row tells
  // whether more expired dossiers remain for the next run.
  const expired = await db
    .select({
      id: cvApplications.id,
      trackingId: cvApplications.trackingId,
      email: cvApplications.email,
      retentionUntil: cvApplications.retentionUntil,
    })
    .from(cvApplications)
    .where(
      and(
        isNotNull(cvApplications.retentionUntil),
        lt(cvApplications.retentionUntil, now)
      )
    )
    .orderBy(asc(cvApplications.retentionUntil), asc(cvApplications.id))
    .limit(limit + 1);
  const resumedIds = new Set(interrupted.map(erasure => erasure.applicationId));
  const batch = expired
    .slice(0, limit)
    .filter(application => !resumedIds.has(application.id));

  let erased = 0;
  let resumed = 0;
  let extendedForActivity = 0;
  let storageObjectsDeleted = 0;
  let candidateAccountsErased = 0;
  let candidateDocumentsDeleted = 0;
  let driveDeletionsPending = 0;
  let stoppedForTime = false;
  const deferred: string[] = [];
  const failed: string[] = [];
  // By the stage at which the erasure stopped: the files are then all deleted, or perhaps not all.
  const partial: Record<CandidateErasureInterruptedError["stage"], string[]> = {
    storage: [],
    database: [],
  };
  const work = [
    ...interrupted.map(erasure => ({
      trackingId: erasure.trackingId,
      resume: erasure,
      expired: null,
    })),
    ...batch.map(application => ({
      trackingId: application.trackingId,
      resume: null,
      expired: application,
    })),
  ];
  for (const { trackingId, resume, expired: application } of work) {
    // Within the function's 60 s: what is left waits for the next run.
    if (!hasTime()) {
      stoppedForTime = true;
      break;
    }
    try {
      if (application) {
        // Never erase a person who is still active: their dossier is kept two
        // years after the latest activity, and the stored date follows it.
        const keepUntil = await recruitmentRetentionDeadline(db, application);
        if (keepUntil && keepUntil.getTime() > now.getTime()) {
          await db
            .update(cvApplications)
            .set({ retentionUntil: keepUntil })
            .where(eq(cvApplications.id, application.id));
          extendedForActivity += 1;
          continue;
        }
      }
      const report = await eraseCandidateApplication(
        resume ?? {
          applicationId: application!.id,
          actorOpenId,
          reason: "retention_expired",
        },
        options.dependencies
      );
      erased += 1;
      if (resume) resumed += 1;
      storageObjectsDeleted += report.storageObjectsDeleted;
      candidateAccountsErased += report.candidateAccountsErased;
      candidateDocumentsDeleted += report.candidateDocumentsDeleted;
      if (report.googleDrive.status === "pending_retry")
        driveDeletionsPending += 1;
    } catch (error) {
      if (error instanceof CandidateErasureNotFoundError) continue;
      if (error instanceof CandidateErasureBusyError) deferred.push(trackingId);
      else {
        (error instanceof CandidateErasureInterruptedError
          ? partial[error.stage]
          : failed
        ).push(trackingId);
        // Under the reference the owner's report lists; Drizzle's message would hold the candidate's address.
        logError("[RecruitmentRetention] erasure failed", error, {
          ref: trackingId,
        });
      }
    }
  }

  const partialCount = partial.storage.length + partial.database.length;
  const documents = await eraseExpiredCandidateDocuments({
    now,
    limit: options.documentLimit ?? CANDIDATE_DOCUMENT_RETENTION_BATCH_LIMIT,
    dependencies: options.dependencies,
  });
  const inactiveAccounts = await eraseInactiveCandidateAccounts({
    now,
    limit: CANDIDATE_ACCOUNT_RETENTION_BATCH_LIMIT,
    dependencies: options.dependencies,
    hasTime,
  });
  const moreRemaining = expired.length > limit || stoppedForTime;
  const accountsErased = candidateAccountsErased + inactiveAccounts.erased;
  const documentsErased =
    candidateDocumentsDeleted +
    documents.deleted +
    inactiveAccounts.documentsDeleted;

  if (
    erased > 0 ||
    documents.deleted > 0 ||
    inactiveAccounts.erased > 0 ||
    failed.length > 0 ||
    partialCount > 0 ||
    deferred.length > 0 ||
    inactiveAccounts.failed > 0
  ) {
    const lines = [
      `Durée de conservation des candidatures (2 ans après la dernière activité du candidat) : ${erased - resumed} dossier(s) échu(s) effacé(s) définitivement (CV et copies, analyses, historique, espace candidat).`,
      ...(resumed
        ? [
            `Effacements interrompus repris et terminés (demande RGPD ou dossier échu) : ${resumed}.`,
          ]
        : []),
      `Fichiers stockés supprimés : ${storageObjectsDeleted + inactiveAccounts.storageObjectsDeleted} · espaces candidats supprimés : ${accountsErased} · documents du coffre supprimés : ${documentsErased}.`,
      ...(inactiveAccounts.erased
        ? [
            `Dont espaces candidats sans candidature, inactifs depuis 2 ans : ${inactiveAccounts.erased}.`,
          ]
        : []),
      ...(extendedForActivity
        ? [
            `Conservation prolongée (activité récente du candidat) : ${extendedForActivity} dossier(s).`,
          ]
        : []),
      ...(driveDeletionsPending
        ? [
            `Copies Google Drive en attente de suppression : ${driveDeletionsPending} (nouvel essai automatique ; reconnectez Google Drive si l’erreur persiste).`,
          ]
        : []),
      ...(deferred.length
        ? [
            `Reportés au prochain passage (traitement en cours) : ${deferred.join(", ")}.`,
          ]
        : []),
      ...(partial.storage.length
        ? [
            `Effacement partiel, reprise automatique au prochain passage : ${partial.storage.join(", ")} (fichiers stockés supprimés en partie ou pas du tout, rien n’a été effacé en base).`,
          ]
        : []),
      ...(partial.database.length
        ? [
            `Effacement partiel, reprise automatique au prochain passage : ${partial.database.join(", ")} (fichiers stockés supprimés, rien n’a été effacé en base).`,
          ]
        : []),
      ...(failed.length
        ? [
            `À vérifier (effacement impossible, rien n’a été supprimé pour ces dossiers ; nouvel essai au prochain passage) : ${failed.join(", ")}.`,
          ]
        : []),
      ...(inactiveAccounts.failed
        ? [
            `Espaces candidats inactifs non effacés (stockage indisponible, nouvel essai au prochain passage) : ${inactiveAccounts.failed}.`,
          ]
        : []),
      ...(moreRemaining
        ? [
            `D’autres dossiers échus restent à effacer : ils le seront aux prochains passages (${limit} par jour au maximum${stoppedForTime ? ", dans la durée limite d’un passage" : ""}).`,
          ]
        : []),
      "Une preuve d’effacement anonymisée (empreintes, nombres) est conservée dans le journal de recrutement.",
    ];
    const titleIssues = [
      ...(partialCount ? [`${partialCount} effacement(s) partiel(s)`] : []),
      ...(failed.length ? [`${failed.length} à vérifier`] : []),
    ];
    await notifyOwner({
      title: [
        `Rétention recrutement : ${erased} dossier(s) effacé(s)`,
        ...titleIssues,
      ].join(", "),
      content: lines.join("\n\n"),
    }).catch(() => false);
  }

  return {
    expiredFound: Math.min(expired.length, limit),
    erased,
    resumed,
    extendedForActivity,
    deferred: deferred.length,
    failed: failed.length,
    partial: partialCount,
    moreRemaining,
    storageObjectsDeleted:
      storageObjectsDeleted + inactiveAccounts.storageObjectsDeleted,
    candidateAccountsErased: accountsErased,
    candidateDocumentsDeleted: documentsErased,
    inactiveCandidateAccountsErased: inactiveAccounts.erased,
    candidateAccountsAttached: inactiveAccounts.attached,
    driveDeletionsPending,
  };
}
