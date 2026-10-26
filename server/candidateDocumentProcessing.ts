import { and, asc, eq, inArray, isNull, lt, lte, ne } from "drizzle-orm";
import { candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments } from "../drizzle/schema";
import { getDb } from "./db";
import { analyzeCandidateDocument } from "./candidateDocumentAnalysis";
import { storageGetSignedUrl } from "./storage";
import { decryptCandidateDocument } from "./candidateDocumentEncryption";
import { CANDIDATE_HUMAN_REVIEW_ONLY_FLAG, CANDIDATE_HUMAN_REVIEW_ONLY_SUMMARY, candidateDocumentAllowsAiAnalysis } from "../shared/candidateDocumentCategories";

const MAX_DOCUMENT_ANALYSIS_ATTEMPTS = 3;

/** Fields that mark a document as reviewed by a human only, without any AI processing (LEGAL-12). */
export function candidateHumanReviewOnlyFields() {
  return {
    validationStatus: "accepted" as const,
    status: "needs_review" as const,
    analysisStatus: "needs_review" as const,
    aiSummary: CANDIDATE_HUMAN_REVIEW_ONLY_SUMMARY,
    aiExtractedData: null,
    aiConfidence: null,
    aiFlags: JSON.stringify([CANDIDATE_HUMAN_REVIEW_ONLY_FLAG]),
    aiModel: null,
    analysisLastError: null,
  };
}

export async function enqueueCandidateDocumentAnalysis(documentId: number) {
  const db = await getDb();
  if (!db) throw new Error("candidate_document_database_unavailable");
  const category = (await db.select({ category: candidateDocuments.category }).from(candidateDocuments).where(eq(candidateDocuments.id, documentId)).limit(1))[0]?.category;
  if (!candidateDocumentAllowsAiAnalysis(category)) throw new Error("candidate_document_human_review_only");
  await db.insert(candidateDocumentProcessingJobs).values({ documentId, status: "queued", maxAttempts: MAX_DOCUMENT_ANALYSIS_ATTEMPTS, scheduledFor: new Date() });
  await db.update(candidateDocuments).set({ status: "validating", analysisStatus: "queued" }).where(eq(candidateDocuments.id, documentId));
  await db.insert(candidateDocumentAuditLogs).values({ candidateId: (await db.select({ candidateId: candidateDocuments.candidateId }).from(candidateDocuments).where(eq(candidateDocuments.id, documentId)).limit(1))[0]?.candidateId ?? null, documentId, actorType: "system", action: "analysis_requested" });
}

/** A document uploaded longer ago than this without its analysis job was left by an interrupted upload. */
export const CANDIDATE_DOCUMENT_MISSING_JOB_AFTER_MS = 15 * 60_000;

/**
 * DATA-02: the upload stores the document, then its analysis job. A request
 * stopped between the two leaves a document waiting for an analysis no job
 * would ever run: the scheduled run gives it the missing job. The job also
 * settles a document reserved for human review (LEGAL-12) without any AI.
 */
export async function recreateMissingCandidateDocumentAnalysisJobs(limit = 25, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("candidate_document_database_unavailable");
  const documents = await db.select({ id: candidateDocuments.id, candidateId: candidateDocuments.candidateId })
    .from(candidateDocuments)
    .leftJoin(candidateDocumentProcessingJobs, eq(candidateDocumentProcessingJobs.documentId, candidateDocuments.id))
    .where(and(
      eq(candidateDocuments.analysisStatus, "queued"),
      inArray(candidateDocuments.status, ["uploaded", "validating"]),
      ne(candidateDocuments.validationStatus, "rejected"),
      lt(candidateDocuments.createdAt, new Date(now.getTime() - CANDIDATE_DOCUMENT_MISSING_JOB_AFTER_MS)),
      isNull(candidateDocumentProcessingJobs.id),
    ))
    .orderBy(asc(candidateDocuments.createdAt))
    .limit(limit);
  for (const document of documents) {
    await db.insert(candidateDocumentProcessingJobs).values({ documentId: document.id, status: "queued", maxAttempts: MAX_DOCUMENT_ANALYSIS_ATTEMPTS, scheduledFor: now });
    await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "system", action: "analysis_requested", metadata: JSON.stringify({ reason: "analysis_job_missing_after_upload" }) });
  }
  return { recreated: documents.length };
}

async function privateDocumentBytes(input: { storageKey: string; encryptionAlgorithm?: string | null; encryptionIv?: string | null; encryptionAuthTag?: string | null }): Promise<Buffer> {
  const url = await storageGetSignedUrl(input.storageKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`candidate_document_download_failed_${response.status}`);
  const stored = Buffer.from(await response.arrayBuffer());
  if (!input.encryptionAlgorithm) return stored;
  if (input.encryptionAlgorithm !== "aes-256-gcm" || !input.encryptionIv || !input.encryptionAuthTag) throw new Error("candidate_document_encryption_metadata_invalid");
  return decryptCandidateDocument(stored, input.encryptionIv, input.encryptionAuthTag);
}

function retryTime(attempt: number) {
  return new Date(Date.now() + Math.min(20, 2 ** attempt) * 60 * 1000);
}

function humanReviewFallback(error: unknown) {
  const reason = error instanceof Error ? error.message : "analyse_indisponible";
  return {
    aiSummary: "Analyse automatique indisponible : le document est conservé et transmis à une revue humaine. Aucune décision automatique n’a été prise.",
    aiExtractedData: JSON.stringify({ documentKind: "À confirmer par revue humaine", summary: "Aucune extraction fiable n’a été conservée.", issuingOrganization: null, issueDate: null, expiryDate: null, confidence: 0, flags: ["ai_analysis_unavailable", reason], missingInformation: ["Revue humaine requise"] }),
    aiConfidence: 0,
    aiFlags: JSON.stringify(["ai_analysis_unavailable", reason]),
  };
}

export async function processDueCandidateDocumentAnalysisJobs(limit = 1) {
  const db = await getDb();
  if (!db) throw new Error("candidate_document_database_unavailable");
  const jobs = await db.select().from(candidateDocumentProcessingJobs).where(and(inArray(candidateDocumentProcessingJobs.status, ["queued", "retry"]), lte(candidateDocumentProcessingJobs.scheduledFor, new Date()))).orderBy(asc(candidateDocumentProcessingJobs.scheduledFor)).limit(limit);
  let completed = 0;
  let retried = 0;
  let needsReview = 0;
  for (const job of jobs) {
    const now = new Date();
    const attempts = job.attempts + 1;
    await db.update(candidateDocumentProcessingJobs).set({ status: "running", attempts, startedAt: now, lastError: null }).where(eq(candidateDocumentProcessingJobs.id, job.id));
    const document = (await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, job.documentId)).limit(1))[0];
    if (!document || document.validationStatus === "rejected") {
      await db.update(candidateDocumentProcessingJobs).set({ status: "completed", finishedAt: new Date(), lastError: "document_unavailable_or_rejected" }).where(eq(candidateDocumentProcessingJobs.id, job.id));
      continue;
    }
    if (!candidateDocumentAllowsAiAnalysis(document.category)) {
      // Identity documents, proofs of address, free-form files and retired sensitive
      // categories are never read for, nor sent to, an AI service (LEGAL-12).
      await db.update(candidateDocuments).set(candidateHumanReviewOnlyFields()).where(eq(candidateDocuments.id, document.id));
      await db.update(candidateDocumentProcessingJobs).set({ status: "completed", finishedAt: new Date(), lastError: "human_review_only" }).where(eq(candidateDocumentProcessingJobs.id, job.id));
      await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "system", action: "analysis_completed", metadata: JSON.stringify({ outcome: "human_review_only", category: document.category }) });
      needsReview += 1;
      continue;
    }
    try {
      await db.update(candidateDocuments).set({ status: "analyzing", analysisStatus: "analyzing", analysisAttempts: attempts }).where(eq(candidateDocuments.id, document.id));
      const result = await analyzeCandidateDocument({ buffer: await privateDocumentBytes(document), mimeType: document.mimeType, declaredCategory: document.categoryOtherLabel || document.category, attempt: attempts });
      await db.update(candidateDocuments).set({
        validationStatus: "accepted",
        status: "needs_review",
        analysisStatus: "completed",
        aiSummary: result.analysis.summary,
        aiExtractedData: JSON.stringify(result.analysis),
        aiConfidence: result.analysis.confidence,
        aiFlags: JSON.stringify(result.analysis.flags),
        aiModel: result.model,
        analyzedAt: new Date(),
        analysisLastError: null,
      }).where(eq(candidateDocuments.id, document.id));
      await db.update(candidateDocumentProcessingJobs).set({ status: "completed", finishedAt: new Date() }).where(eq(candidateDocumentProcessingJobs.id, job.id));
      await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "system", action: "analysis_completed", metadata: JSON.stringify({ model: result.model, confidence: result.analysis.confidence }) });
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "candidate_document_analysis_failed";
      if (attempts < job.maxAttempts) {
        await db.update(candidateDocumentProcessingJobs).set({ status: "retry", scheduledFor: retryTime(attempts), lastError: message }).where(eq(candidateDocumentProcessingJobs.id, job.id));
        await db.update(candidateDocuments).set({ status: "uploaded", analysisStatus: "queued", analysisAttempts: attempts, analysisLastError: message }).where(eq(candidateDocuments.id, document.id));
        retried += 1;
      } else {
        const fallback = humanReviewFallback(error);
        await db.update(candidateDocuments).set({ validationStatus: "accepted", status: "needs_review", analysisStatus: "needs_review", analysisAttempts: attempts, analysisLastError: message, analyzedAt: new Date(), ...fallback }).where(eq(candidateDocuments.id, document.id));
        await db.update(candidateDocumentProcessingJobs).set({ status: "completed", finishedAt: new Date(), lastError: message }).where(eq(candidateDocumentProcessingJobs.id, job.id));
        await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "system", action: "analysis_completed", metadata: JSON.stringify({ outcome: "human_review_fallback", error: message }) });
        needsReview += 1;
      }
    }
  }
  return { processed: jobs.length, completed, retried, needsReview };
}
