import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { cvApplications, cvProcessingJobs } from "../drizzle/schema";
import { getDb } from "./db";
import { extractCvDocument, analyzeCvText, saveCvAnalysis } from "./recruitmentAnalysis";
import { storageGetSignedUrl, storagePut } from "./storage";
import { validateCvFile } from "./recruitmentFileValidation";

const MAX_ATTEMPTS = 3;
const PROCESSING_BATCH_SIZE = 5;
const ANALYSIS_PROMPT_VERSION = "recruitment-v2";

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

/** External-boundary pipeline, dependency-injected for deterministic integration tests. */
export async function executeCvExternalPipeline(
  input: CvPipelineInput,
  steps: CvPipelineSteps = defaultCvPipelineSteps,
  onValidated?: (artifact: { validation: ReturnType<typeof validateCvFile>; promotedStorage: { key: string } | null }) => Promise<void>,
) {
  const buffer = await steps.download(input.cvFileKey);
  const validation = steps.validate({
    buffer,
    mimeType: input.cvMimeType,
    originalName: input.cvOriginalName,
    size: input.cvSizeBytes,
  });
  if (input.fileChecksum && input.fileChecksum !== validation.checksum) {
    throw new Error("cv_validation_checksum_mismatch");
  }
  const promotedStorage = input.fileValidationStatus === "quarantined"
    ? await steps.promote(`recruitment/cv/${input.trackingId}-${input.cvOriginalName}`, buffer, input.cvMimeType)
    : null;
  await onValidated?.({ validation, promotedStorage });
  const extraction = await steps.extract(buffer, input.cvMimeType);
  const analysisExecution = await steps.analyze({
    firstName: input.firstName,
    lastName: input.lastName,
    specialty: input.specialty,
    targetCountries: JSON.parse(input.targetCountries || "[]"),
    languages: JSON.parse(input.languages || "[]"),
    yearsExperience: input.yearsExperience ?? undefined,
    message: input.message ?? undefined,
    extractedText: extraction.text,
  });
  return { validation, promotedStorage, extraction, analysis: analysisExecution.result, analysisModel: analysisExecution.model };
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

export function analysisCompletionStatus(input: { gaps: string[]; dataQualityWarnings: string[] }) {
  return input.dataQualityWarnings.length > 0 || input.gaps.length > 0 ? "needs_review" as const : "completed" as const;
}

export async function enqueueCvAnalysis(applicationId: number, requestedAt = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

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
    .where(and(
      eq(cvApplications.fileValidationStatus, "quarantined"),
      inArray(cvApplications.status, ["new", "reviewing", "shortlisted", "placed"]),
    ))
    .orderBy(cvApplications.createdAt)
    .limit(Math.min(Math.max(limit, 1), PROCESSING_BATCH_SIZE));

  let queued = 0;
  let accelerated = 0;
  for (const application of applications) {
    const [latestJob] = await db.select({ status: cvProcessingJobs.status })
      .from(cvProcessingJobs)
      .where(eq(cvProcessingJobs.applicationId, application.id))
      .orderBy(desc(cvProcessingJobs.id))
      .limit(1);
    if (latestJob && ["queued", "retry"].includes(latestJob.status)) {
      await db.update(cvProcessingJobs).set({ scheduledFor: new Date() })
        .where(and(eq(cvProcessingJobs.applicationId, application.id), inArray(cvProcessingJobs.status, ["queued", "retry"])));
      accelerated += 1;
      continue;
    }
    if (latestJob?.status === "running") continue;
    await enqueueCvAnalysis(application.id);
    queued += 1;
  }

  return { inspected: applications.length, queued, accelerated };
}

/** Release jobs left in `running` when an earlier serverless invocation stopped. */
export async function recoverStaleCvAnalysisJobs(staleAfterMs = 15 * 60_000) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = new Date();
  const result = await db.update(cvProcessingJobs).set({
    status: "retry",
    scheduledFor: now,
    startedAt: null,
    finishedAt: null,
    lastError: "worker_interrupted",
  }).where(and(
    eq(cvProcessingJobs.status, "running"),
    lte(cvProcessingJobs.startedAt, new Date(now.getTime() - staleAfterMs)),
  ));
  return { recovered: mutationRowCount(result) };
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
    });

      await db.update(cvApplications).set({
        analysisStatus: "analyzing",
        extractedText: pipeline.extraction.text,
        extractionMethod: pipeline.extraction.method,
      extractionPageCount: pipeline.extraction.totalPages,
      extractionTotalPages: pipeline.extraction.totalPages,
      ocrConfidence: pipeline.extraction.ocrConfidence,
      ocrModelVersion: pipeline.extraction.ocrModelVersion,
      extractionWarnings: JSON.stringify([...pipeline.validation.warnings, ...pipeline.extraction.warnings]),
      updatedAt: new Date(),
    }).where(eq(cvApplications.id, application.id));

    const analysis = pipeline.analysis;
    await saveCvAnalysis(application.id, analysis);

    const now = new Date();
    const completionStatus = analysisCompletionStatus(analysis);
    await db.update(cvApplications).set({
      analysisStatus: completionStatus,
      analysisAttempts: job.attempts,
      analysisLastError: null,
        analysisModel: pipeline.analysisModel,
      analysisPromptVersion: ANALYSIS_PROMPT_VERSION,
      updatedAt: now,
    }).where(eq(cvApplications.id, application.id));
    await db.update(cvProcessingJobs).set({ status: "completed", finishedAt: now, lastError: null })
      .where(eq(cvProcessingJobs.id, job.id));
    return { completed: true, applicationId: application.id, score: analysis.relevanceScore, needsReview: completionStatus === "needs_review" };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4_000) : "unknown_processing_error";
    const now = new Date();
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
export async function processDueCvAnalysisJobs(limit = PROCESSING_BATCH_SIZE) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = new Date();
  const candidates = await db.select().from(cvProcessingJobs)
    .where(and(
      inArray(cvProcessingJobs.status, ["queued", "retry"]),
      lte(cvProcessingJobs.scheduledFor, now),
    ))
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
    ));
    if (!didClaimProcessingJob(claimResult)) continue;
    results.push(await processCvAnalysisJob(candidate.id));
  }
  return { processed: results.length, results };
}
