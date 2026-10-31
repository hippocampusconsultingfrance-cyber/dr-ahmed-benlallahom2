import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { canRequestCandidateDocumentReanalysis } from "../../../shared/candidateDocumentReanalysis";
import { candidateDocumentAllowsAiAnalysis } from "../../../shared/candidateDocumentCategories";
import { getDb } from "../../db";
import { candidateAccounts, candidateDocumentAuditLogs, candidateDocuments } from "../../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

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
      return db.select({
        id: candidateDocuments.id,
        candidateId: candidateDocuments.candidateId,
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
      }).from(candidateDocuments).innerJoin(candidateAccounts, eq(candidateDocuments.candidateId, candidateAccounts.id)).where(conditions).orderBy(desc(candidateDocuments.createdAt)).limit(input.limit);
    }),
  review: adminProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["reviewed", "rejected", "archived"]), notes: z.string().trim().min(1).max(5000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le coffre documentaire est temporairement indisponible." });
      const document = (await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, input.id)).limit(1))[0];
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
      await db.update(candidateDocuments).set({ status: input.status, reviewedByOpenId: ctx.user.openId, reviewedAt: new Date(), reviewNotes: input.notes }).where(eq(candidateDocuments.id, input.id));
      await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "admin", actorReference: ctx.user.openId, action: "reviewed", metadata: JSON.stringify({ status: input.status }) });
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
      if (!canRequestCandidateDocumentReanalysis(document)) {
        throw new TRPCError({ code: document.status === "rejected" ? "BAD_REQUEST" : "CONFLICT", message: document.status === "rejected" ? "Un document refusé ne peut pas être relancé." : "Une analyse de ce document est déjà en cours." });
      }
      const { enqueueCandidateDocumentAnalysis } = await import("../../candidateDocumentProcessing");
      await enqueueCandidateDocumentAnalysis(document.id);
      await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "admin", actorReference: ctx.user.openId, action: "analysis_requested", metadata: JSON.stringify({ source: "admin_reanalysis" }) });
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
