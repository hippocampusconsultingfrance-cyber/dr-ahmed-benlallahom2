import { and, asc, eq, inArray, isNull, lt, lte, ne } from "drizzle-orm";
import { candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { isProcessingDeadlineError } from "./processingDeadline";
import { analyzeCandidateDocument, CandidateDocumentTextSetAsideError } from "./candidateDocumentAnalysis";
import { hiddenTextFlags } from "../shared/candidateDocumentHiddenText";
import { storageGetSignedUrl } from "./storage";
import { decryptCandidateDocument } from "./candidateDocumentEncryption";
import { CANDIDATE_HUMAN_REVIEW_ONLY_FLAG, CANDIDATE_HUMAN_REVIEW_ONLY_SUMMARY, candidateDocumentAllowsAiAnalysis } from "../shared/candidateDocumentCategories";
import { CANDIDATE_DOCUMENT_ACTIVE_JOB_STATUSES } from "../shared/candidateDocumentReanalysis";

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
 * stopped between the two, or a job refused after the document was stored
 * (DATA-06), leaves a document waiting for an analysis no job would ever run:
 * the scheduled run gives a document waiting with no active job its missing
 * job. The job also settles a document reserved for human review (LEGAL-12)
 * without any AI.
 */
export async function recreateMissingCandidateDocumentAnalysisJobs(limit = 25, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("candidate_document_database_unavailable");
  const documents = await db.select({ id: candidateDocuments.id, candidateId: candidateDocuments.candidateId })
    .from(candidateDocuments)
    .leftJoin(candidateDocumentProcessingJobs, and(
      eq(candidateDocumentProcessingJobs.documentId, candidateDocuments.id),
      inArray(candidateDocumentProcessingJobs.status, [...CANDIDATE_DOCUMENT_ACTIVE_JOB_STATUSES]),
    ))
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
  // The text left out of a document that has too little left to analyse is said, as when the AI reads one (IA-01).
  const hiddenText = error instanceof CandidateDocumentTextSetAsideError ? error.hiddenText : undefined;
  const flags = ["ai_analysis_unavailable", reason, ...hiddenTextFlags(hiddenText)];
  return {
    aiSummary: "Analyse automatique indisponible : le document est conservé et transmis à une revue humaine. Aucune décision automatique n’a été prise.",
    aiExtractedData: JSON.stringify({ documentKind: "À confirmer par revue humaine", summary: "Aucune extraction fiable n’a été conservée.", issuingOrganization: null, issueDate: null, expiryDate: null, confidence: 0, flags, missingInformation: ["Revue humaine requise"], ...(hiddenText ? { hiddenText } : {}) }),
    aiConfidence: 0,
    aiFlags: JSON.stringify(flags),
  };
}

/** A job "running" for longer was left by a run that stopped: an analysis ends within the cron's 60 s (EXPL-12). */
export const CANDIDATE_DOCUMENT_JOB_STALE_AFTER_MS = 15 * 60_000;

const ANALYSIS_IN_PROGRESS_STATUSES = ["queued", "extracting", "analyzing"] as const;

/**
 * EXPL-12: a job left "running" by a run that stopped (function limit, frozen
 * instance) goes back to the queue, due at once, its interrupted attempt
 * counted, and its document leaves « analyse en cours »; once its attempts
 * are spent, the document goes to a human review, as after a last failed
 * attempt. Each job is taken back on its exact state, so two runs never both
 * take it back; a document whose analysis has ended keeps it.
 */
export async function recoverStaleCandidateDocumentJobs(staleAfterMs = CANDIDATE_DOCUMENT_JOB_STALE_AFTER_MS, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("candidate_document_database_unavailable");
  const staleBefore = new Date(now.getTime() - staleAfterMs);
  const stale = await db.select().from(candidateDocumentProcessingJobs)
    .where(and(eq(candidateDocumentProcessingJobs.status, "running"), lte(candidateDocumentProcessingJobs.startedAt, staleBefore)))
    .orderBy(asc(candidateDocumentProcessingJobs.id))
    .limit(25);
  let recovered = 0;
  let exhausted = 0;
  for (const job of stale) {
    const terminal = job.attempts >= job.maxAttempts;
    const lastError = terminal ? "worker_interrupted_attempts_exhausted" : "worker_interrupted";
    const taken = await db.update(candidateDocumentProcessingJobs)
      .set(terminal ? { status: "completed", finishedAt: now, lastError } : { status: "retry", scheduledFor: now, startedAt: null, lastError })
      .where(and(
        eq(candidateDocumentProcessingJobs.id, job.id),
        eq(candidateDocumentProcessingJobs.status, "running"),
        eq(candidateDocumentProcessingJobs.attempts, job.attempts),
        lte(candidateDocumentProcessingJobs.startedAt, staleBefore),
      ));
    if (mutationRowCount(taken) !== 1) continue;
    const analysing = and(
      eq(candidateDocuments.id, job.documentId),
      inArray(candidateDocuments.analysisStatus, [...ANALYSIS_IN_PROGRESS_STATUSES]),
      ne(candidateDocuments.validationStatus, "rejected"),
    );
    if (!terminal) {
      recovered += 1;
      await db.update(candidateDocuments).set({ status: "uploaded", analysisStatus: "queued", analysisAttempts: job.attempts, analysisLastError: lastError }).where(analysing);
      continue;
    }
    exhausted += 1;
    const [settled] = await db.update(candidateDocuments)
      .set({ validationStatus: "accepted", status: "needs_review", analysisStatus: "needs_review", analysisAttempts: job.attempts, analysisLastError: lastError, analyzedAt: now, ...humanReviewFallback(new Error(lastError)) })
      .where(analysing)
      .returning({ candidateId: candidateDocuments.candidateId });
    if (settled) await db.insert(candidateDocumentAuditLogs).values({ candidateId: settled.candidateId, documentId: job.documentId, actorType: "system", action: "analysis_completed", metadata: JSON.stringify({ outcome: "human_review_fallback", error: lastError }) });
  }
  return { recovered, exhausted };
}

export async function processDueCandidateDocumentAnalysisJobs(limit = 1) {
  const db = await getDb();
  if (!db) throw new Error("candidate_document_database_unavailable");
  const jobs = await db.select().from(candidateDocumentProcessingJobs).where(and(inArray(candidateDocumentProcessingJobs.status, ["queued", "retry"]), lte(candidateDocumentProcessingJobs.scheduledFor, new Date()))).orderBy(asc(candidateDocumentProcessingJobs.scheduledFor)).limit(limit);
  let processed = 0;
  let completed = 0;
  let retried = 0;
  let needsReview = 0;
  let released = 0;
  for (const job of jobs) {
    const now = new Date();
    const attempts = job.attempts + 1;
    // EXPL-12: taken only in the state it was read in; a concurrent run that
    // took it first matches no row, and the document is analysed once.
    const claim = await db.update(candidateDocumentProcessingJobs).set({ status: "running", attempts, startedAt: now, lastError: null }).where(and(
      eq(candidateDocumentProcessingJobs.id, job.id),
      inArray(candidateDocumentProcessingJobs.status, ["queued", "retry"]),
      eq(candidateDocumentProcessingJobs.attempts, job.attempts),
      lte(candidateDocumentProcessingJobs.scheduledFor, now),
    ));
    if (mutationRowCount(claim) !== 1) continue;
    processed += 1;
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
      if (isProcessingDeadlineError(error)) {
        // Neither the file's nor the AI's fault: the cron invocation is about
        // to end (EXPL-12). The job goes back to the queue at the same place,
        // for the next run, without counting this attempt, and this run
        // starts no other analysis.
        await db.update(candidateDocumentProcessingJobs).set({ status: job.status, attempts: job.attempts, startedAt: null, lastError: message }).where(eq(candidateDocumentProcessingJobs.id, job.id));
        await db.update(candidateDocuments).set({ status: "uploaded", analysisStatus: "queued", analysisAttempts: job.attempts }).where(eq(candidateDocuments.id, document.id));
        released += 1;
        break;
      }
      // Another attempt would read the same text: only what may fail once (download, AI) is tried again.
      if (attempts < job.maxAttempts && !(error instanceof CandidateDocumentTextSetAsideError)) {
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
  return { processed, completed, retried, needsReview, released };
}
