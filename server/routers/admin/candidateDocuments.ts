import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { CANDIDATE_DOCUMENT_ACTIVE_JOB_STATUSES, CANDIDATE_DOCUMENT_JOB_STALE_AFTER_MS, canRequestCandidateDocumentReanalysis } from "../../../shared/candidateDocumentReanalysis";
import { candidateDocumentAllowsAiAnalysis } from "../../../shared/candidateDocumentCategories";
import { getDb } from "../../db";
import { candidateAccounts, candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments, cvApplications } from "../../../drizzle/schema";
import { and, eq, desc, gt, inArray, lte, ne, or, sql } from "drizzle-orm";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const staleRunningSince = () => new Date(Date.now() - CANDIDATE_DOCUMENT_JOB_STALE_AFTER_MS);

/**
 * Documents among `ids` with an analysis job queued, retried or running
 * (DATA-06); a job "running" for 15 min was left by a run that stopped
 * (EXPL-12) and no longer counts.
 */
async function documentsWithActiveAnalysisJob(db: Database, ids: number[]) {
  if (ids.length === 0) return new Set<number>();
  const jobs = await db.select({ documentId: candidateDocumentProcessingJobs.documentId }).from(candidateDocumentProcessingJobs).where(and(
    inArray(candidateDocumentProcessingJobs.documentId, ids),
    inArray(candidateDocumentProcessingJobs.status, [...CANDIDATE_DOCUMENT_ACTIVE_JOB_STATUSES]),
    or(ne(candidateDocumentProcessingJobs.status, "running"), gt(candidateDocumentProcessingJobs.startedAt, staleRunningSince())),
  ));
  return new Set(jobs.map(job => job.documentId));
}

export const adminCandidateDocumentsRouter = router({
  list: adminProcedure
    .input(z.object({
      status: z.enum(["uploaded", "validating", "analyzing", "needs_review", "reviewed", "rejected", "archived"]).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = input.status ? eq(candidateDocuments.status, input.status) : undefined;
      const documents = await db.select({
        id: candidateDocuments.id,
        candidateId: candidateDocuments.candidateId,
        // ADM-19: the reference of the application the document goes with (« Voir la candidature »).
        applicationTrackingId: cvApplications.trackingId,
        candidateEmail: candidateAccounts.email,
        firstName: candidateAccounts.firstName,
        lastName: candidateAccounts.lastName,
        category: candidateDocuments.category,
        categoryOtherLabel: candidateDocuments.categoryOtherLabel,
        originalName: candidateDocuments.originalName,
        mimeType: candidateDocuments.mimeType,
        sizeBytes: candidateDocuments.sizeBytes,
        validationStatus: candidateDocuments.validationStatus,
        status: candidateDocuments.status,
        analysisStatus: candidateDocuments.analysisStatus,
        aiSummary: candidateDocuments.aiSummary,
        aiExtractedData: candidateDocuments.aiExtractedData,
        aiConfidence: candidateDocuments.aiConfidence,
        aiFlags: candidateDocuments.aiFlags,
        aiModel: candidateDocuments.aiModel,
        reviewNotes: candidateDocuments.reviewNotes,
        createdAt: candidateDocuments.createdAt,
        analyzedAt: candidateDocuments.analyzedAt,
      }).from(candidateDocuments).innerJoin(candidateAccounts, eq(candidateDocuments.candidateId, candidateAccounts.id))
        // The application the document was sent for, else the one its account is linked to since; none once erased.
        .leftJoin(cvApplications, eq(cvApplications.id, sql`coalesce(${candidateDocuments.applicationId}, ${candidateAccounts.linkedApplicationId})`))
        .where(conditions).orderBy(desc(candidateDocuments.createdAt)).limit(input.limit);
      // « Relancer l’analyse » is offered by the job, not the document's status alone (DATA-06).
      const active = await documentsWithActiveAnalysisJob(db, documents.map(document => document.id));
      return documents.map(document => ({ ...document, hasActiveAnalysisJob: active.has(document.id) }));
    }),
  review: adminProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["reviewed", "rejected", "archived"]), notes: z.string().trim().min(1).max(5000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le coffre documentaire est temporairement indisponible." });
      const document = (await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, input.id)).limit(1))[0];
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
      // The decision and its audit line in one batch, both or neither (DATA-01):
      // a refused line leaves the document as it was, as the screen then says.
      await db.batch([
        db.update(candidateDocuments).set({ status: input.status, reviewedByOpenId: ctx.user.openId, reviewedAt: new Date(), reviewNotes: input.notes }).where(eq(candidateDocuments.id, input.id)),
        db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "admin", actorReference: ctx.user.openId, action: "reviewed", metadata: JSON.stringify({ status: input.status }) }),
      ]);
      return { success: true };
    }),
  reanalyze: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le coffre documentaire est temporairement indisponible." });
      const document = (await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, input.id)).limit(1))[0];
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
      if (!candidateDocumentAllowsAiAnalysis(document.category)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce type de document est réservé à la revue humaine : il n’est jamais transmis à l’IA." });
      }
      // A document left waiting or « en cours » with no job queued, retried or
      // running (a job "running" for 15 min no longer counts) can be analysed again (DATA-06).
      const hasActiveAnalysisJob = (await documentsWithActiveAnalysisJob(db, [document.id])).has(document.id);
      if (!canRequestCandidateDocumentReanalysis({ ...document, hasActiveAnalysisJob })) {
        throw new TRPCError({ code: document.status === "rejected" ? "BAD_REQUEST" : "CONFLICT", message: document.status === "rejected" ? "Un document refusé ne peut pas être relancé." : "Une analyse de ce document est déjà en cours." });
      }
      const { candidateDocumentAnalysisQueueing } = await import("../../candidateDocumentProcessing");
      // In one batch with the admin's audit line, all or none (DATA-01): the
      // job a stopped run left "running" closed here rather than at the next
      // daily run, which would otherwise queue it again (EXPL-12), the new job,
      // the document « en file » and their lines.
      await db.batch([
        db.update(candidateDocumentProcessingJobs).set({ status: "completed", finishedAt: new Date(), lastError: "worker_interrupted_reanalysis_requested" }).where(and(
          eq(candidateDocumentProcessingJobs.documentId, document.id),
          eq(candidateDocumentProcessingJobs.status, "running"),
          lte(candidateDocumentProcessingJobs.startedAt, staleRunningSince()),
        )),
        ...candidateDocumentAnalysisQueueing(db, document),
        db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "admin", actorReference: ctx.user.openId, action: "analysis_requested", metadata: JSON.stringify({ source: "admin_reanalysis" }) }),
      ]);
      return { success: true, queued: true };
    }),
  download: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le coffre documentaire est temporairement indisponible." });
      const document = (await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, input.id)).limit(1))[0];
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
      return { url: `/api/admin/candidate-documents/${document.id}/download`, filename: document.originalName };
    }),
});
