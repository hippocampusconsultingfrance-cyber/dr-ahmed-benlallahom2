import { inArray } from "drizzle-orm";
import { cvProcessingJobs } from "../drizzle/schema";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import { enforcePersistentRateLimit } from "./candidateSecurity";

/**
 * Time budget of the daily recruitment-processing cron (Vercel function limit:
 * 60 s). Fast work (confirmation-email retries, Drive copies) runs first and
 * stops being started after `budgetMs`; a CV analysis (AI call up to ~35 s)
 * is only started before `analysisStartDeadlineMs`, so the last one still
 * ends inside the function limit. Interrupted jobs are recovered next run.
 */
export const RECRUITMENT_PROCESSING_BUDGET = {
  budgetMs: 35_000,
  analysisStartDeadlineMs: 25_000,
  maxEmailBatches: 5,
  maxDriveBatches: 10,
  maxAnalyses: 25,
} as const;

/** Above this many waiting analyses the owner is told (applications are never refused). */
export const RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD = 50;

type Batch = { processed: number };

/** Runs batches while `canStart()` holds; the check happens before each batch. */
async function drainWhile<T extends Batch>(runBatch: () => Promise<T>, canStart: () => boolean, maxBatches: number, stop?: (batch: T) => boolean) {
  const batches: T[] = [];
  while (batches.length < maxBatches && canStart()) {
    const batch = await runBatch();
    batches.push(batch);
    if (stop?.(batch) || batch.processed === 0) break;
  }
  return { processed: batches.reduce((total, batch) => total + batch.processed, 0), batches: batches.length };
}

export async function countWaitingCvAnalyses(cap = 1_000) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: cvProcessingJobs.id }).from(cvProcessingJobs)
    .where(inArray(cvProcessingJobs.status, ["queued", "retry", "running"]))
    .limit(cap);
  return rows.length;
}

/**
 * Tells the owner, at most once a day, that CV analyses are piling up. The
 * application form keeps accepting candidates: analyses are a review aid and
 * can catch up later (manual review stays possible meanwhile).
 */
export async function notifyOwnerOfAnalysisBacklog(waiting: number) {
  if (waiting < RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD) return false;
  try {
    await enforcePersistentRateLimit({ action: "recruitment_analysis_backlog_alert", subject: "global", maxAttempts: 1, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000 });
  } catch {
    return false;
  }
  return notifyOwner({
    title: `Recrutement : ${waiting} analyse(s) de CV en attente`,
    content: [
      `${waiting} analyse(s) de CV attendent leur traitement (seuil d’alerte : ${RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD}).`,
      "Les candidatures continuent d’être acceptées ; les CV restent consultables et peuvent être examinés manuellement en attendant l’analyse.",
      "Le traitement automatique avance à chaque passage quotidien. Pour l’accélérer : utilisez « Relancer l’analyse » sur les dossiers prioritaires, ou passez le cron en horaire (offre Vercel Pro).",
    ].join("\n\n"),
  }).catch(() => false);
}

export async function runRecruitmentProcessingWorker(
  options: Partial<typeof RECRUITMENT_PROCESSING_BUDGET> = {},
  clock: () => number = Date.now,
) {
  const budget = { ...RECRUITMENT_PROCESSING_BUDGET, ...options };
  const startedAt = clock();
  const elapsed = () => clock() - startedAt;
  const withinBudget = () => elapsed() < budget.budgetMs;

  const { backfillLegacyCvAnalysisJobs, processDueCvAnalysisJobs, recoverStaleCvAnalysisJobs } = await import("./recruitmentProcessing");
  const { backfillCvGoogleDriveExportJobs, processDueCvGoogleDriveExports, recoverStaleCvGoogleDriveExportJobs } = await import("./googleDriveExport");
  const { retryDueFailedCvConfirmationEmails } = await import("./recruitmentEmailTrace");
  const { retryPendingGoogleDriveErasures } = await import("./recruitmentErasure");

  const analysisRecovery = await recoverStaleCvAnalysisJobs();
  const driveRecovery = await recoverStaleCvGoogleDriveExportJobs();
  // GDPR: finish the Drive deletions an erasure could not complete.
  const driveErasures = await retryPendingGoogleDriveErasures(10);

  // Fast jobs first: a slow AI provider must not starve them.
  const confirmationEmails = await drainWhile(() => retryDueFailedCvConfirmationEmails(3), withinBudget, budget.maxEmailBatches);
  const driveBackfill = await backfillCvGoogleDriveExportJobs(25);
  let waitingForAuthorization = false;
  const stopWithoutDrive = (batch: { waitingForAuthorization: boolean }) => {
    waitingForAuthorization = batch.waitingForAuthorization;
    return batch.waitingForAuthorization;
  };
  // Copies of CVs already validated; quarantined ones wait for their analysis.
  const driveExports = await drainWhile(() => processDueCvGoogleDriveExports(3, undefined, { skipQuarantinedCvs: true }), withinBudget, budget.maxDriveBatches, stopWithoutDrive);

  // Then the analyses, one at a time, none started after the deadline. The
  // analysis validates a quarantined CV before calling the AI provider.
  const analysisBackfill = await backfillLegacyCvAnalysisJobs(5);
  const analysis = await drainWhile(() => processDueCvAnalysisJobs(1), () => elapsed() < budget.analysisStartDeadlineMs, budget.maxAnalyses);

  // Copies of the CVs validated by this run, if time remains (else next run).
  const lateDriveExports = waitingForAuthorization
    ? { processed: 0, batches: 0 }
    : await drainWhile(() => processDueCvGoogleDriveExports(3, undefined, { skipQuarantinedCvs: true }), withinBudget, budget.maxDriveBatches, stopWithoutDrive);

  const analysesWaiting = await countWaitingCvAnalyses();
  const backlogAlertSent = await notifyOwnerOfAnalysisBacklog(analysesWaiting);
  return {
    elapsedMs: elapsed(),
    analysisRecovery,
    driveRecovery,
    driveErasures,
    confirmationEmails,
    driveBackfill,
    driveExports: { processed: driveExports.processed + lateDriveExports.processed, batches: driveExports.batches + lateDriveExports.batches, afterAnalyses: lateDriveExports.processed, waitingForAuthorization },
    analysisBackfill,
    analysis,
    analysesWaiting,
    backlogAlertSent,
  };
}
