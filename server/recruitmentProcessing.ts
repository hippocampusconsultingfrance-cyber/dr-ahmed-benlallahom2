import { and, desc, eq, exists, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { cvApplications, cvProcessingJobs } from "../drizzle/schema";
import { getDb } from "./db";
import { AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR, extractCvDocument, analyzeCvText, invisibleTextRequiresReview, isVisibilityCheckWarning, MANUAL_REVIEW_FALLBACK_MODEL, RECRUITMENT_ANALYSIS_PROMPT_VERSION, saveCvAnalysis } from "./recruitmentAnalysis";
import { storageGetSignedUrl, storagePut } from "./storage";
import { validateCvFile } from "./recruitmentFileValidation";
import { isProcessingDeadlineError } from "./processingDeadline";
import { notifyOwner } from "./_core/notification";
import { dailyOwnerAlertIdempotencyKey, sendOwnerAlertOncePerWindow } from "./candidateSecurity";

const MAX_ATTEMPTS = 3;
const PROCESSING_BATCH_SIZE = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tells the owner, at most once a day, that the AI provider refuses CV analyses
 * for billing (card expired, credit exhausted): the dossiers stay readable,
 * marked « Analyse IA indisponible », until the credit is restored (REC-08).
 * An alert that could not leave is sent by a later refused analysis.
 */
export async function notifyOwnerOfAiAnalysisUnavailable() {
  const action = "recruitment_ai_billing_alert";
  return sendOwnerAlertOncePerWindow({ action, subject: "global", windowMs: DAY_MS, blockMs: DAY_MS }, () => notifyOwner({
    title: "Recrutement : analyse IA des CV indisponible (facturation du fournisseur)",
    content: [
      "Le service d’IA (Vercel AI Gateway) a refusé l’analyse d’un CV pour une raison de facturation : carte bancaire expirée ou absente, ou crédit épuisé.",
      "Les candidatures continuent d’être acceptées ; les CV concernés restent consultables et sont marqués « Analyse IA indisponible » dans l’onglet Candidatures, à examiner manuellement.",
      "Pour reprendre : rétablissez le moyen de paiement ou le crédit dans Vercel > AI Gateway, puis cliquez sur « Mettre à jour / reprendre l’IA » dans l’onglet Candidatures.",
      "Cette alerte est envoyée au plus une fois par jour.",
    ].join("\n\n"),
  }, { idempotencyKey: dailyOwnerAlertIdempotencyKey(action) })).catch(() => false);
}

/**
 * Dossiers left « Analyse IA indisponible » by a billing refusal, until « Mettre
 * à jour / reprendre l’IA » requeues them: the daily security review reports
 * them every day, whatever became of the single alert above (REC-08). Rejected
 * and archived dossiers are left out, as that button leaves them as they are.
 */
export async function countCvAnalysesAwaitingAiCredit(cap = 1_000) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: cvApplications.id }).from(cvApplications)
    .where(and(
      eq(cvApplications.analysisStatus, "degraded"),
      eq(cvApplications.analysisLastError, AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR),
      ne(cvApplications.status, "rejected"),
      ne(cvApplications.status, "archived"),
    ))
    .limit(cap);
  return rows.length;
}

type CvPipelineInput = {
  cvFileKey: string;
  cvMimeType: string;
  cvOriginalName: string;
  cvSizeBytes: number;
  fileChecksum: string | null;
  fileValidationStatus: "quarantined" | "accepted" | "rejected" | "validation_failed";
  trackingId: string;
  firstName: string;
  lastName: string;
  specialty: string;
  targetCountries: string;
  languages: string | null;
  yearsExperience: number | null;
  message: string | null;
};

type CvPipelineSteps = {
  download: (storageKey: string) => Promise<Buffer>;
  promote: (storageKey: string, buffer: Buffer, mimeType: string) => Promise<{ key: string }>;
  validate: typeof validateCvFile;
  extract: typeof extractCvDocument;
  analyze: typeof analyzeCvText;
};

const defaultCvPipelineSteps: CvPipelineSteps = {
  download: async storageKey => {
    const signedUrl = await storageGetSignedUrl(storageKey);
    const fileResponse = await fetch(signedUrl);
    if (!fileResponse.ok) throw new Error(`cv_download_failed_${fileResponse.status}`);
    return Buffer.from(await fileResponse.arrayBuffer());
  },
  promote: async (storageKey, buffer, mimeType) => storagePut(storageKey, buffer, mimeType),
  validate: validateCvFile,
  extract: extractCvDocument,
  analyze: analyzeCvText,
};

/** Keep the extraction trace independent of any later AI-provider outcome. */
export function cvExtractionPersistenceFields(
  validation: ReturnType<typeof validateCvFile>,
  extraction: Awaited<ReturnType<typeof extractCvDocument>>,
  updatedAt = new Date(),
) {
  return {
    analysisStatus: "analyzing" as const,
    extractedText: extraction.text,
    extractionMethod: extraction.method,
    extractionPageCount: extraction.totalPages,
    extractionTotalPages: extraction.totalPages,
    ocrConfidence: extraction.ocrConfidence,
    ocrModelVersion: extraction.ocrModelVersion,
    extractionWarnings: JSON.stringify([...validation.warnings, ...extraction.warnings]),
    updatedAt,
  };
}

/** External-boundary pipeline, dependency-injected for deterministic integration tests. */
export async function executeCvExternalPipeline(
  input: CvPipelineInput,
  steps: CvPipelineSteps = defaultCvPipelineSteps,
  onValidated?: (artifact: { validation: ReturnType<typeof validateCvFile>; promotedStorage: { key: string } | null }) => Promise<void>,
  onExtracted?: (artifact: { validation: ReturnType<typeof validateCvFile>; extraction: Awaited<ReturnType<typeof extractCvDocument>> }) => Promise<void>,
) {
  const buffer = await steps.download(input.cvFileKey);
  const validation = steps.validate({
    buffer,
    mimeType: input.cvMimeType,
    originalName: input.cvOriginalName,
    size: input.cvSizeBytes,
    // .doc is refused at upload; dossiers stored before that stay processable.
    allowLegacyDoc: true,
  });
  if (input.fileChecksum && input.fileChecksum !== validation.checksum) {
    throw new Error("cv_validation_checksum_mismatch");
  }
  const promotedStorage = input.fileValidationStatus === "quarantined"
    ? await steps.promote(`recruitment/cv/${input.trackingId}-${input.cvOriginalName}`, buffer, input.cvMimeType)
    : null;
  await onValidated?.({ validation, promotedStorage });
  const extraction = await steps.extract(buffer, input.cvMimeType);
  // Persist the source evidence before calling the AI provider: a provider
  // failure must not erase an otherwise successful document extraction.
  await onExtracted?.({ validation, extraction });
  // A partial OCR (currently capped to the first rendered pages) must never
  // produce a trustworthy whole-document score even if those pages are clear.
  const analysisOcrConfidence = extraction.warnings.includes("vision_ocr_first_3_pages_only")
    ? 0
    : extraction.ocrConfidence;
  const analysisExecution = await steps.analyze({
    firstName: input.firstName,
    lastName: input.lastName,
    specialty: input.specialty,
    targetCountries: JSON.parse(input.targetCountries || "[]"),
    languages: JSON.parse(input.languages || "[]"),
    yearsExperience: input.yearsExperience ?? undefined,
    message: input.message ?? undefined,
    extractedText: extraction.text,
    extractionMethod: extraction.method,
    ocrConfidence: analysisOcrConfidence,
    // IA-01: incomplete too when invisible text could not be ruled out, or
    // when the file hides more of it than a CV template does.
    extractionIncomplete: extraction.warnings.some(warning =>
      warning.startsWith("pdf_text_page_") ||
      warning === "pdf_text_pages_missing" ||
      warning === "vision_ocr_first_3_pages_only" ||
      isVisibilityCheckWarning(warning)
    ) || invisibleTextRequiresReview(extraction.invisibleText),
    invisibleText: extraction.invisibleText,
    visibilityUnchecked: extraction.warnings.some(isVisibilityCheckWarning),
  });
  return {
    validation,
    promotedStorage,
    extraction,
    analysis: analysisExecution.result,
    analysisModel: analysisExecution.model,
    analysisGenerationId: analysisExecution.generationId,
    analysisUsage: analysisExecution.usage,
  };
}

export function retryDelayMs(attempt: number) {
  return Math.min(60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempt - 1));
}

/** Accept only the worker whose conditional status update actually claimed the row. */
export function didClaimProcessingJob(result: unknown): boolean {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object") return false;
  if ("rowCount" in header) return header.rowCount === 1;
  if ("affectedRows" in header) return header.affectedRows === 1;
  return false;
}

function mutationRowCount(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object") return 0;
  if ("rowCount" in header && typeof header.rowCount === "number") return header.rowCount;
  if ("affectedRows" in header && typeof header.affectedRows === "number") return header.affectedRows;
  return 0;
}

export function extractionMethodFor(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf_text_or_vision";
  if (mimeType === "application/msword") return "doc";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return "unknown";
}

export function analysisCompletionStatus(input: {
  gaps: string[];
  dataQualityWarnings: string[];
  requiredFollowUps?: string[];
  contradictions?: unknown[];
  relevanceScore?: number | null;
}) {
  return input.dataQualityWarnings.length > 0 ||
    input.gaps.length > 0 ||
    (input.requiredFollowUps?.length ?? 0) > 0 ||
    (input.contradictions?.length ?? 0) > 0 ||
    input.relevanceScore === null
    ? ("needs_review" as const)
    : ("completed" as const);
}

type CvProcessingJobStatus = typeof cvProcessingJobs.$inferSelect["status"];

/**
 * Reuse an existing active job instead of creating concurrent analyses for the
 * same CV when an administrator clicks the retry action more than once.
 */
export function cvAnalysisEnqueueDisposition(latestStatus: CvProcessingJobStatus | null) {
  if (latestStatus === "queued" || latestStatus === "retry") return "accelerate" as const;
  if (latestStatus === "running") return "already_running" as const;
  return "create" as const;
}

/** Do not show a recovered retry as pending if another worker already claimed it. */
export function recoveredCvAnalysisRetryIsCurrent(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  jobId: number,
  attempts: number,
) {
  return exists(db.select({ id: cvProcessingJobs.id })
    .from(cvProcessingJobs)
    .where(and(
      eq(cvProcessingJobs.id, jobId),
      eq(cvProcessingJobs.status, "retry"),
      eq(cvProcessingJobs.attempts, attempts),
    )));
}

function queuedCvAnalysisJobIsCurrent(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  jobId: number,
  attempts: number,
) {
  return exists(db.select({ id: cvProcessingJobs.id })
    .from(cvProcessingJobs)
    .where(and(
      eq(cvProcessingJobs.id, jobId),
      eq(cvProcessingJobs.status, "queued"),
      eq(cvProcessingJobs.attempts, attempts),
    )));
}

export async function enqueueCvAnalysis(applicationId: number, requestedAt = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // A worker can claim the selected row before an administrator accelerates
  // it. Re-read after a failed compare-and-set instead of reopening running work.
  for (let contention = 0; contention < 3; contention += 1) {
    const [latestJob] = await db.select({
      id: cvProcessingJobs.id,
      status: cvProcessingJobs.status,
      attempts: cvProcessingJobs.attempts,
    }).from(cvProcessingJobs)
      .where(eq(cvProcessingJobs.applicationId, applicationId))
      .orderBy(desc(cvProcessingJobs.id))
      .limit(1);
    const disposition = cvAnalysisEnqueueDisposition(latestJob?.status ?? null);

    if (latestJob && disposition === "accelerate") {
      const updated = await db.update(cvProcessingJobs).set({
        status: "queued",
        scheduledFor: requestedAt,
        finishedAt: null,
        lastError: null,
      }).where(and(
        eq(cvProcessingJobs.id, latestJob.id),
        eq(cvProcessingJobs.status, latestJob.status),
        eq(cvProcessingJobs.attempts, latestJob.attempts),
      ));
      if (mutationRowCount(updated) !== 1) continue;
      await db.update(cvApplications).set({
        analysisStatus: "queued",
        analysisLastError: null,
        analysisRequestedAt: requestedAt,
        updatedAt: requestedAt,
      }).where(and(
        eq(cvApplications.id, applicationId),
        queuedCvAnalysisJobIsCurrent(db, latestJob.id, latestJob.attempts),
      ));
      return { queued: false, accelerated: true, alreadyRunning: false };
    }

    if (disposition === "already_running") {
      return { queued: false, accelerated: false, alreadyRunning: true };
    }

    await db.insert(cvProcessingJobs).values({
      applicationId,
      jobType: "analyze_cv",
      status: "queued",
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      scheduledFor: requestedAt,
    });
    await db.update(cvApplications).set({
      analysisStatus: "queued",
      analysisLastError: null,
      analysisRequestedAt: requestedAt,
      updatedAt: requestedAt,
    }).where(eq(cvApplications.id, applicationId));
    return { queued: true, accelerated: false, alreadyRunning: false };
  }
  throw new Error("cv_analysis_enqueue_contention");
}

/** analysisLastError of an application received beyond the day's volume (ABUS-01). */
export const CV_ANALYSIS_DEFERRED_DAILY_VOLUME = "analysis_deferred_daily_volume";

/**
 * ABUS-01: an application received beyond the day's volume is kept for human
 * review without queueing its AI analysis, and the legacy backfill leaves it
 * alone, as does the admin's batch resume; its own « Analyser le CV » queues it
 * like any other.
 */
export async function deferCvAnalysisForDailyVolume(applicationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(cvApplications).set({
    analysisStatus: "needs_review",
    analysisLastError: CV_ANALYSIS_DEFERRED_DAILY_VOLUME,
    updatedAt: new Date(),
  }).where(eq(cvApplications.id, applicationId));
}

/**
 * Recreates a processing job for legacy applications left in quarantine before
 * the Vercel worker replaced Manus. Active jobs are never duplicated.
 */
export async function backfillLegacyCvAnalysisJobs(limit = PROCESSING_BATCH_SIZE) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const applications = await db.select({ id: cvApplications.id })
    .from(cvApplications)
    .leftJoin(cvProcessingJobs, eq(cvProcessingJobs.applicationId, cvApplications.id))
    .where(and(
      eq(cvApplications.fileValidationStatus, "quarantined"),
      inArray(cvApplications.status, ["new", "reviewing", "shortlisted", "placed"]),
      isNull(cvProcessingJobs.id),
      or(isNull(cvApplications.analysisLastError), ne(cvApplications.analysisLastError, CV_ANALYSIS_DEFERRED_DAILY_VOLUME)),
    ))
    .orderBy(cvApplications.createdAt)
    .limit(Math.min(Math.max(limit, 1), PROCESSING_BATCH_SIZE));

  let queued = 0;
  let accelerated = 0;
  for (const application of applications) {
    const result = await enqueueCvAnalysis(application.id);
    if (result.queued) queued += 1;
    if (result.accelerated) accelerated += 1;
  }

  return { inspected: applications.length, queued, accelerated };
}

/** Release jobs left in `running` when an earlier serverless invocation stopped. */
export async function recoverStaleCvAnalysisJobs(staleAfterMs = 15 * 60_000) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = new Date();
  const staleBefore = new Date(now.getTime() - staleAfterMs);
  const candidates = await db.select({
    id: cvProcessingJobs.id,
    applicationId: cvProcessingJobs.applicationId,
    status: cvProcessingJobs.status,
    attempts: cvProcessingJobs.attempts,
    maxAttempts: cvProcessingJobs.maxAttempts,
  }).from(cvProcessingJobs).where(or(
    and(eq(cvProcessingJobs.status, "running"), lte(cvProcessingJobs.startedAt, staleBefore)),
    and(inArray(cvProcessingJobs.status, ["queued", "retry"]), gte(cvProcessingJobs.attempts, cvProcessingJobs.maxAttempts)),
  )).orderBy(cvProcessingJobs.id).limit(25);

  let recovered = 0;
  let exhausted = 0;
  for (const candidate of candidates) {
    const terminal = candidate.attempts >= candidate.maxAttempts;
    const result = await db.update(cvProcessingJobs).set({
      status: terminal ? "failed" : "retry",
      scheduledFor: now,
      startedAt: null,
      finishedAt: terminal ? now : null,
      lastError: terminal ? "worker_interrupted_attempts_exhausted" : "worker_interrupted",
    }).where(and(
      eq(cvProcessingJobs.id, candidate.id),
      eq(cvProcessingJobs.status, candidate.status),
      eq(cvProcessingJobs.attempts, candidate.attempts),
      ...(candidate.status === "running" ? [lte(cvProcessingJobs.startedAt, staleBefore)] : []),
    ));
    if (mutationRowCount(result) !== 1) continue;
    if (terminal) {
      exhausted += 1;
      await db.update(cvApplications).set({
        analysisStatus: "failed",
        analysisAttempts: candidate.attempts,
        analysisLastError: "worker_interrupted_attempts_exhausted",
        updatedAt: now,
      }).where(eq(cvApplications.id, candidate.applicationId));
    } else {
      recovered += 1;
      await db.update(cvApplications).set({
        analysisStatus: "queued",
        analysisAttempts: candidate.attempts,
        analysisLastError: null,
        updatedAt: now,
      }).where(and(
        eq(cvApplications.id, candidate.applicationId),
        recoveredCvAnalysisRetryIsCurrent(db, candidate.id, candidate.attempts),
      ));
    }
  }
  return { recovered, exhausted };
}

async function processCvAnalysisJob(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [job] = await db.select().from(cvProcessingJobs).where(eq(cvProcessingJobs.id, jobId)).limit(1);
  if (!job || job.status !== "running") return { skipped: true, reason: "not_claimed" as const };

  const [application] = await db.select().from(cvApplications)
    .where(eq(cvApplications.id, job.applicationId)).limit(1);
  if (!application) {
    await db.update(cvProcessingJobs).set({ status: "completed", finishedAt: new Date(), lastError: "application_missing" })
      .where(eq(cvProcessingJobs.id, job.id));
    return { skipped: true, reason: "application_missing" as const };
  }

  try {
    if (application.fileValidationStatus === "rejected" || application.fileValidationStatus === "validation_failed") {
      throw new Error("cv_validation_previously_failed");
    }
    await db.update(cvApplications).set({ analysisStatus: "extracting", updatedAt: new Date() })
      .where(eq(cvApplications.id, application.id));

    const pipeline = await executeCvExternalPipeline(application, defaultCvPipelineSteps, async ({ validation, promotedStorage }) => {
      if (!promotedStorage) return;
      await db.update(cvApplications).set({
        cvFileKey: promotedStorage.key,
        fileValidationStatus: "accepted",
        fileChecksum: validation.checksum,
        fileValidationNotes: `${validation.notes}; promoted_from_quarantine`,
        fileValidatedAt: new Date(),
        fileSecurityScanVersion: validation.securityScanVersion,
        updatedAt: new Date(),
      }).where(eq(cvApplications.id, application.id));
    }, async ({ validation, extraction }) => {
      await db.update(cvApplications).set(cvExtractionPersistenceFields(validation, extraction))
        .where(eq(cvApplications.id, application.id));
    });

    const analysis = pipeline.analysis;
    await saveCvAnalysis(application.id, analysis, {
      model: pipeline.analysisModel,
      generationId: pipeline.analysisGenerationId,
      usage: pipeline.analysisUsage,
    });

    const now = new Date();
    // The AI Gateway refused for billing: the manual-review result is kept, in
    // a status of its own that « Mettre à jour / reprendre l’IA » resumes.
    const aiUnavailable = pipeline.analysisModel === MANUAL_REVIEW_FALLBACK_MODEL;
    const completionStatus = aiUnavailable ? "degraded" as const : analysisCompletionStatus(analysis);
    const lastError = aiUnavailable ? AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR : null;
    await db.update(cvApplications).set({
      analysisStatus: completionStatus,
      analysisAttempts: job.attempts,
      analysisLastError: lastError,
        analysisModel: pipeline.analysisModel,
      analysisPromptVersion: RECRUITMENT_ANALYSIS_PROMPT_VERSION,
      updatedAt: now,
    }).where(eq(cvApplications.id, application.id));
    await db.update(cvProcessingJobs).set({ status: "completed", finishedAt: now, lastError })
      .where(eq(cvProcessingJobs.id, job.id));
    if (aiUnavailable) await notifyOwnerOfAiAnalysisUnavailable();
    return { completed: true, applicationId: application.id, score: analysis.relevanceScore, needsReview: completionStatus !== "completed", aiUnavailable };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4_000) : "unknown_processing_error";
    const now = new Date();
    if (isProcessingDeadlineError(error)) {
      // Neither the file's nor the provider's fault: the cron invocation is
      // about to end. The job goes back to the queue at the same place, for
      // the next run, without counting this attempt.
      await db.update(cvProcessingJobs).set({ status: "retry", attempts: Math.max(0, job.attempts - 1), startedAt: null, finishedAt: null, lastError: message })
        .where(eq(cvProcessingJobs.id, job.id));
      await db.update(cvApplications).set({ analysisStatus: "queued", updatedAt: now }).where(eq(cvApplications.id, job.applicationId));
      return { completed: false, applicationId: job.applicationId, retry: true, deadlineReached: true, error: message };
    }
    const validationFailure = message.startsWith("cv_validation_");
    const finalFailure = validationFailure || job.attempts >= job.maxAttempts;
    await db.update(cvProcessingJobs).set({
      status: finalFailure ? "failed" : "retry",
      lastError: message,
      scheduledFor: new Date(now.getTime() + retryDelayMs(job.attempts)),
      finishedAt: finalFailure ? now : null,
    }).where(eq(cvProcessingJobs.id, job.id));
    await db.update(cvApplications).set({
      analysisStatus: finalFailure ? "failed" : "queued",
      analysisAttempts: job.attempts,
      analysisLastError: message,
      ...(validationFailure ? { fileValidationStatus: "validation_failed" as const, fileValidationNotes: message, fileValidatedAt: now } : {}),
      updatedAt: now,
    }).where(eq(cvApplications.id, job.applicationId));
    return { completed: false, applicationId: job.applicationId, retry: !finalFailure, error: message };
  }
}

/** Process a small, durable batch. Safe to invoke repeatedly from Heartbeat. */
export async function processDueCvAnalysisJobs(limit = PROCESSING_BATCH_SIZE, applicationIds?: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = new Date();
  const dueJobs = applicationIds?.length
    ? and(
        inArray(cvProcessingJobs.status, ["queued", "retry"]),
        lte(cvProcessingJobs.scheduledFor, now),
        lt(cvProcessingJobs.attempts, cvProcessingJobs.maxAttempts),
        inArray(cvProcessingJobs.applicationId, applicationIds),
      )
    : and(
        inArray(cvProcessingJobs.status, ["queued", "retry"]),
        lte(cvProcessingJobs.scheduledFor, now),
        lt(cvProcessingJobs.attempts, cvProcessingJobs.maxAttempts),
      );
  const candidates = await db.select().from(cvProcessingJobs)
    .where(dueJobs)
    .orderBy(cvProcessingJobs.scheduledFor)
    .limit(Math.min(Math.max(limit, 1), PROCESSING_BATCH_SIZE));

  const results: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    const startedAt = new Date();
    const claimResult = await db.update(cvProcessingJobs).set({
      status: "running",
      attempts: candidate.attempts + 1,
      startedAt,
      finishedAt: null,
    }).where(and(
      eq(cvProcessingJobs.id, candidate.id),
      inArray(cvProcessingJobs.status, ["queued", "retry"]),
      lte(cvProcessingJobs.scheduledFor, startedAt),
      eq(cvProcessingJobs.attempts, candidate.attempts),
      lt(cvProcessingJobs.attempts, cvProcessingJobs.maxAttempts),
    ));
    if (!didClaimProcessingJob(claimResult)) continue;
    results.push(await processCvAnalysisJob(candidate.id));
  }
  return { processed: results.length, results };
}
