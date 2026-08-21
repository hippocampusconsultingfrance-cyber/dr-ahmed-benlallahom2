import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { medicalQuestionAuditLogs, medicalQuestions } from "../drizzle/schema";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { enforcePersistentRateLimit, hashSecurityValue, logSecurityEvent, requestIpHash } from "./candidateSecurity";
import { verifyCandidateTurnstile } from "./candidateTurnstile";
import { isAdminMfaVerified } from "./adminMfa";
import { improveMedicalAnswerDraft } from "./medicalQuestionAssistant";
import { sendMedicalQuestionResponseEmail } from "./_core/notifications";

const privateQuestionInput = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(5).max(50),
  question: z.string().trim().min(30).max(3000),
  language: z.enum(["fr", "en", "de", "zh"]).default("fr"),
  privacyConsent: z.literal(true),
  publicationConsent: z.literal(true),
  urgencyAcknowledged: z.literal(true),
  turnstileToken: z.string().min(20).max(4096),
  website: z.string().max(200).optional().default(""),
});

const publicQuestionInput = z.object({ limit: z.number().int().min(1).max(50).default(12) }).optional();
const questionIdInput = z.object({ id: z.number().int().positive() });

function medicalQuestionTrackingId() {
  return `QMED-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Service temporairement indisponible." });
  return db;
}

async function auditQuestion(input: { questionId: number; actorOpenId?: string | null; action: string; metadata?: Record<string, unknown> }) {
  const db = await requireDb();
  await db.insert(medicalQuestionAuditLogs).values({
    medicalQuestionId: input.questionId,
    actorOpenId: input.actorOpenId ?? null,
    action: input.action,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

async function requireMfa(ctx: { req: Parameters<typeof isAdminMfaVerified>[0]; user: { openId: string } }) {
  if (!(await isAdminMfaVerified(ctx.req, ctx.user.openId))) throw new TRPCError({ code: "FORBIDDEN", message: "Double authentification administrateur requise." });
}

const draftInput = z.object({ id: z.number().int().positive(), adminResponse: z.string().trim().min(20).max(5000), publicQuestion: z.string().trim().max(1000).optional().default(""), publicResponse: z.string().trim().max(5000).optional().default("") });

export const medicalQuestionsRouter = router({
  submit: publicProcedure.input(privateQuestionInput).mutation(async ({ input, ctx }) => {
    if (input.website.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "La demande n’a pas pu être traitée." });
    const ipHash = requestIpHash(ctx.req.headers);
    const ipSubject = ipHash ?? hashSecurityValue(ctx.req.ip || "unknown");
    if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
      try {
        await enforcePersistentRateLimit({
          action: "public_medical_question_submit",
          subject: `${ipSubject}:${input.email}`,
          maxAttempts: 3,
          windowMs: 24 * 60 * 60 * 1000,
          blockMs: 24 * 60 * 60 * 1000,
        });
        await verifyCandidateTurnstile({ token: input.turnstileToken, remoteIp: ctx.req.ip });
      } catch {
        await logSecurityEvent({ actorKind: "anonymous", actorReference: input.email, category: "public_medical_question_protection", outcome: "blocked", severity: "warning", ipHash });
        throw new TRPCError({ code: "BAD_REQUEST", message: "La vérification de sécurité doit être renouvelée avant l’envoi." });
      }
    }
    const db = await requireDb();
    const trackingId = medicalQuestionTrackingId();
    const result = await db.insert(medicalQuestions).values({
      trackingId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      question: input.question,
      language: input.language,
      privacyConsent: 1,
      publicationConsent: input.publicationConsent ? 1 : 0,
      urgencyAcknowledged: 1,
    });
    const questionId = Number(result[0].insertId);
    await auditQuestion({ questionId, action: "submitted", metadata: { publicationConsent: input.publicationConsent, language: input.language } });
    await logSecurityEvent({ actorKind: "anonymous", actorReference: input.email, category: "public_medical_question_submitted", outcome: "allowed", severity: "info", ipHash });
    return { trackingId };
  }),

  published: publicProcedure.input(publicQuestionInput).query(async ({ input }) => {
    const db = await requireDb();
    return db.select({
      id: medicalQuestions.id,
      question: medicalQuestions.publicQuestion,
      response: medicalQuestions.publicResponse,
      language: medicalQuestions.language,
      publishedAt: medicalQuestions.publishedAt,
    }).from(medicalQuestions)
      .where(and(eq(medicalQuestions.status, "published"), eq(medicalQuestions.publicationConsent, 1)))
      .orderBy(desc(medicalQuestions.publishedAt))
      .limit(input?.limit ?? 12);
  }),

  admin: router({
    list: adminProcedure.input(z.object({ status: z.enum(["submitted", "drafting", "answered", "published", "rejected"]).optional(), limit: z.number().int().min(1).max(100).default(50) }).optional()).query(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      return db.select().from(medicalQuestions)
        .where(input?.status ? eq(medicalQuestions.status, input.status) : undefined)
        .orderBy(desc(medicalQuestions.createdAt)).limit(input?.limit ?? 50);
    }),
    get: adminProcedure.input(questionIdInput).query(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const [question] = await db.select().from(medicalQuestions).where(eq(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question introuvable." });
      return question;
    }),
    saveDraft: adminProcedure.input(draftInput).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const [question] = await db.select().from(medicalQuestions).where(eq(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question introuvable." });
      await db.update(medicalQuestions).set({ adminResponse: input.adminResponse, publicQuestion: input.publicQuestion || null, publicResponse: input.publicResponse || null, status: "drafting", respondedByOpenId: ctx.user.openId }).where(eq(medicalQuestions.id, input.id));
      await auditQuestion({ questionId: input.id, actorOpenId: ctx.user.openId, action: "draft_saved" });
      return { success: true };
    }),
    improveDraft: adminProcedure.input(z.object({ adminResponse: z.string().trim().min(20).max(5000) })).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      try {
        const result = await improveMedicalAnswerDraft(input.adminResponse);
        return result;
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "La proposition de reformulation est temporairement indisponible." });
      }
    }),
    sendValidatedResponse: adminProcedure.input(draftInput.extend({ publish: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const [question] = await db.select().from(medicalQuestions).where(eq(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question introuvable." });
      if (input.publish && question.publicationConsent !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "La publication exige l’accord explicite de la personne." });
      if (input.publish && (!input.publicQuestion || !input.publicResponse)) throw new TRPCError({ code: "BAD_REQUEST", message: "Une question et une réponse anonymisées sont requises pour publier." });
      try {
        await sendMedicalQuestionResponseEmail({ email: question.email, firstName: question.firstName, trackingId: question.trackingId, response: input.adminResponse });
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "L’email n’a pas pu être envoyé. La réponse n’a pas été publiée." });
      }
      const now = new Date();
      await db.update(medicalQuestions).set({ adminResponse: input.adminResponse, publicQuestion: input.publish ? input.publicQuestion : null, publicResponse: input.publish ? input.publicResponse : null, status: input.publish ? "published" : "answered", respondedByOpenId: ctx.user.openId, responseSentAt: now, publishedAt: input.publish ? now : null }).where(eq(medicalQuestions.id, input.id));
      await auditQuestion({ questionId: input.id, actorOpenId: ctx.user.openId, action: input.publish ? "response_sent_and_published" : "response_sent", metadata: { published: input.publish } });
      return { success: true, published: input.publish };
    }),
    unpublish: adminProcedure.input(questionIdInput).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const [question] = await db.select().from(medicalQuestions).where(eq(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question introuvable." });
      if (question.status !== "published") throw new TRPCError({ code: "BAD_REQUEST", message: "Cette question n’est pas publiée." });

      await db.update(medicalQuestions).set({
        status: "answered",
        publicQuestion: null,
        publicResponse: null,
        publishedAt: null,
      }).where(eq(medicalQuestions.id, input.id));
      await auditQuestion({ questionId: input.id, actorOpenId: ctx.user.openId, action: "unpublished", metadata: { retainedPrivateRecord: true } });
      return { success: true };
    }),
  }),
});
