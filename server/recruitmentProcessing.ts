import { and, eq, inArray, lte } from "drizzle-orm";
import { cvApplications, cvProcessingJobs } from "../drizzle/schema";
import { getDb } from "./db";
import { extractCvDocument, analyzeCvText, analysisProviderForAttempt, saveCvAnalysis } from "./recruitmentAnalysis";
import { storageGetSignedUrl, storagePut } from "./storage";
import { validateCvFile } from "./recruitmentFileValidation";

const MAX_ATTEMPTS = 3;
const PROCESSING_BATCH_SIZE = 5;
const ANALYSIS_MODEL = "gpt-5-mini";
const ANALYSIS_PROMPT_VERSION = "recruitment-v2";
const STALE_JOB_CLAIM_MS = 2 * 60 * 1000;

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
  analysisAttempt?: number;
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
export async function executeCvExternalPipeline(input: CvPipelineInput, steps: CvPipelineSteps = defaultCvPipelineSteps) {
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
  const extraction = await steps.extract(buffer, input.cvMimeType);
  const analysis = await steps.analyze({
    firstName: input.firstName,
    lastName: input.lastName,
    specialty: input.specialty,
    targetCountries: JSON.parse(input.targetCountries || "[]"),
    languages: JSON.parse(input.languages || "[]"),
    yearsExperience: input.yearsExperience ?? undefined,
    message: input.message ?? undefined,
    extractedText: extraction.text,
    provider: analysisProviderForAttempt(input.analysisAttempt ?? 1),
  });
  return { validation, promotedStorage, extraction, analysis };
}

export function retryDelayMs(attempt: number) {
  return Math.min(60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempt - 1));
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

  const [existingJob] = await db.select().from(cvProcessingJobs)
    .where(and(eq(cvProcessingJobs.applicationId, applicationId), inArray(cvProcessingJobs.status, ["queued", "retry"])))
    .orderBy(cvProcessingJobs.scheduledFor)
    .limit(1);
  if (existingJob) {
    await db.update(cvProcessingJobs).set({
      status: "queued",
      attempts: 0,
      scheduledFor: requestedAt,
      startedAt: null,
      finishedAt: null,
      lastError: null,
    }).where(eq(cvProcessingJobs.id, existingJob.id));
  } else {
    await db.insert(cvProcessingJobs).values({
      applicationId,
      jobType: "analyze_cv",
      status: "queued",
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      scheduledFor: requestedAt,
    });
  }
  await db.update(cvApplications).set({
    analysisStatus: "queued",
    analysisLastError: null,
    analysisRequestedAt: requestedAt,
    updatedAt: requestedAt,
  }).where(eq(cvApplications.id, applicationId));
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

    const pipeline = await executeCvExternalPipeline({ ...application, analysisAttempt: job.attempts });
    if (pipeline.promotedStorage) {
      await db.update(cvApplications).set({
        cvFileKey: pipeline.promotedStorage.key,
        fileValidationStatus: "accepted",
        fileChecksum: pipeline.validation.checksum,
        fileValidationNotes: `${pipeline.validation.notes}; promoted_from_quarantine`,
        fileValidatedAt: new Date(),
        fileSecurityScanVersion: pipeline.validation.securityScanVersion,
        updatedAt: new Date(),
      }).where(eq(cvApplications.id, application.id));
    }

    await db.update(cvApplications).set({
      analysisStatus: "analyzing",
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
      analysisModel: analysisProviderForAttempt(job.attempts),
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
  const staleBefore = new Date(now.getTime() - STALE_JOB_CLAIM_MS);
  await db.update(cvProcessingJobs).set({
    status: "retry",
    scheduledFor: now,
    startedAt: null,
    lastError: "worker_callback_timeout_requeued",
  }).where(and(eq(cvProcessingJobs.status, "running"), lte(cvProcessingJobs.startedAt, staleBefore)));
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
    await db.update(cvProcessingJobs).set({
      status: "running",
      attempts: candidate.attempts + 1,
      startedAt,
      finishedAt: null,
    }).where(and(
      eq(cvProcessingJobs.id, candidate.id),
      inArray(cvProcessingJobs.status, ["queued", "retry"]),
    ));
    results.push(await processCvAnalysisJob(candidate.id));
  }
  return { processed: results.length, results };
}
