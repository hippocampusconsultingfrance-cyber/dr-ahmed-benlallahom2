import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments } from "../drizzle/schema";
import { getDb } from "./db";
import { analyzeCandidateDocument } from "./candidateDocumentAnalysis";
import { storageGetSignedUrl } from "./storage";
import { decryptCandidateDocument } from "./candidateDocumentEncryption";

const MAX_DOCUMENT_ANALYSIS_ATTEMPTS = 3;

export async function enqueueCandidateDocumentAnalysis(documentId: number) {
  const db = await getDb();
  if (!db) throw new Error("candidate_document_database_unavailable");
  await db.insert(candidateDocumentProcessingJobs).values({ documentId, status: "queued", maxAttempts: MAX_DOCUMENT_ANALYSIS_ATTEMPTS, scheduledFor: new Date() });
  await db.update(candidateDocuments).set({ status: "validating", analysisStatus: "queued" }).where(eq(candidateDocuments.id, documentId));
  await db.insert(candidateDocumentAuditLogs).values({ candidateId: (await db.select({ candidateId: candidateDocuments.candidateId }).from(candidateDocuments).where(eq(candidateDocuments.id, documentId)).limit(1))[0]?.candidateId ?? null, documentId, actorType: "system", action: "analysis_requested" });
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
