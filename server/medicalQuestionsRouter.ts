import { randomInt } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { medicalQuestionAuditLogs, medicalQuestions } from "../drizzle/schema";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { enforcePersistentRateLimit, hashSecurityValue, logSecurityEvent, requestIpHash } from "./candidateSecurity";
import { verifyCandidateTurnstile } from "./candidateTurnstile";
import { countPublicFormDailyVolume, enforcePublicEmailIpRateLimit, releasePublicEmailIpRateLimit } from "./publicFormRateLimit";
import { isAdminMfaVerified } from "./adminMfa";
import { improveMedicalAnswerDraft } from "./medicalQuestionAssistant";
import { notifyOwner } from "./_core/notification";
import { buildMedicalQuestionOwnerNotification, sendMedicalQuestionAcknowledgementEmail, sendMedicalQuestionResponseEmail } from "./medicalQuestionEmails";

const PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";

const privateQuestionInput = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(5).max(50),
  question: z.string().trim().min(30).max(3000),
  language: z.enum(["fr", "en", "de", "zh"]).default("fr"),
  privacyConsent: z.literal(true),
  // Separate and optional: answering never depends on accepting publication.
  publicationConsent: z.boolean().default(false),
  urgencyAcknowledged: z.literal(true),
  turnstileToken: z.string().min(20).max(4096),
  website: z.string().max(200).optional().default(""),
});

const publicQuestionInput = z.object({ limit: z.number().int().min(1).max(50).default(12) }).optional();
const medicalQuestionStatus = z.enum(["submitted", "drafting", "answered", "published", "rejected"]);
const questionIdInput = z.object({ id: z.number().int().positive() });

const TRACKING_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomTrackingSegment(length: number) {
  let segment = "";
  for (let index = 0; index < length; index += 1) segment += TRACKING_ID_ALPHABET[randomInt(TRACKING_ID_ALPHABET.length)];
  return segment;
}

/** QMED-XXXXXXXX-XXXXX : 13 caractères tirés par le générateur cryptographique (≈ 67 bits), 19 caractères pour une colonne varchar(32). */
export function medicalQuestionTrackingId() {
  return `QMED-${randomTrackingSegment(8)}-${randomTrackingSegment(5)}`;
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
      await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(input.email), category: "public_medical_question_protection", outcome: "blocked", severity: "warning", ipHash });
      throw new TRPCError({ code: "BAD_REQUEST", message: "La vérification de sécurité doit être renouvelée avant l’envoi." });
    }
    const db = await requireDb();
    // MAIL-01: only a question that passed the anti-bot check counts towards the
    // per-IP cap, and is given back if it cannot be recorded. Its refusal has its
    // own code, so the page does not point at the security check.
    const emailIpHash = ipHash ?? (ctx.req.ip ? hashSecurityValue(ctx.req.ip) : null);
    try {
      await enforcePublicEmailIpRateLimit("medicalQuestion", emailIpHash);
    } catch (error) {
      if (!(error instanceof Error && error.message === "candidate_security_rate_limited")) throw error;
      await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(input.email), category: "public_medical_question_protection", outcome: "blocked", severity: "warning", ipHash });
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop d’envois depuis cette connexion. Réessayez dans une heure." });
    }
    const trackingId = medicalQuestionTrackingId();
    let questionId: number;
    try {
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
      }).returning({ id: medicalQuestions.id });
      questionId = Number(result[0].id);
    } catch (error) {
      // Nothing was recorded: the attempt is given back. Once the row exists it stays counted.
      await releasePublicEmailIpRateLimit("medicalQuestion", emailIpHash).catch(() => undefined);
      throw error;
    }
    await auditQuestion({ questionId, action: "submitted", metadata: { publicationConsent: input.publicationConsent, language: input.language } });
    await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(input.email), category: "public_medical_question_submitted", outcome: "allowed", severity: "info", ipHash });
    // PUB-FORM-01: the owner is told (no health content), the person gets an
    // acknowledgement with the reference. Neither failure loses the question.
    // ABUS-01: beyond the day's volume the question is kept without either email.
    if (!(await countPublicFormDailyVolume("medicalQuestion"))) {
      await auditQuestion({ questionId, action: "acknowledgement_skipped_daily_volume" }).catch(() => undefined);
      return { trackingId, acknowledgementSent: false };
    }
    const [ownerNotified, acknowledged] = await Promise.all([
      notifyOwner(buildMedicalQuestionOwnerNotification({ trackingId, language: input.language, publicationConsent: input.publicationConsent, adminUrl: `${PUBLIC_APP_ORIGIN}/admin` })).catch(() => false),
      sendMedicalQuestionAcknowledgementEmail({ email: input.email, firstName: input.firstName, trackingId, language: input.language }).then(() => true, () => false),
    ]);
    await auditQuestion({ questionId, action: acknowledged ? "acknowledgement_sent" : "acknowledgement_failed", metadata: { ownerNotified } }).catch(() => undefined);
    return { trackingId, acknowledgementSent: acknowledged };
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
    /**
     * ADM-01: one page of the questions in the given statuses, with their total.
     * The tab opens on the questions to answer, oldest first, so that none
     * waits out of sight behind the newer ones.
     */
    list: adminProcedure.input(z.object({
      statuses: z.array(medicalQuestionStatus).min(1).max(medicalQuestionStatus.options.length).optional(),
      order: z.enum(["oldest", "newest"]).default("newest"),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }).optional()).query(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const whereClause = input?.statuses ? inArray(medicalQuestions.status, input.statuses) : undefined;
      const createdAt = input?.order === "oldest" ? asc(medicalQuestions.createdAt) : desc(medicalQuestions.createdAt);
      const items = await db.select().from(medicalQuestions)
        .where(whereClause)
        .orderBy(createdAt, input?.order === "oldest" ? asc(medicalQuestions.id) : desc(medicalQuestions.id))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);
      const [count] = await db.select({ count: sql<number>`COUNT(*)` }).from(medicalQuestions).where(whereClause);
      return { items, total: Number(count?.count ?? 0) };
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
    sendValidatedResponse: adminProcedure.input(draftInput.extend({ publish: z.boolean().default(false), resend: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const [question] = await db.select().from(medicalQuestions).where(eq(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question introuvable." });
      if (question.responseSentAt && !input.resend) {
        throw new TRPCError({ code: "CONFLICT", message: `La réponse a déjà été envoyée le ${question.responseSentAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}. Utilisez « Renvoyer la réponse » pour un nouvel envoi volontaire, ou « Mettre à jour la publication ».` });
      }
      if (input.resend && !question.responseSentAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune réponse n’a encore été envoyée pour cette question." });
      if (!input.resend && input.publish && question.publicationConsent !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "La publication exige l’accord explicite de la personne." });
      if (!input.resend && input.publish && (!input.publicQuestion || !input.publicResponse)) throw new TRPCError({ code: "BAD_REQUEST", message: "Une question et une réponse anonymisées sont requises pour publier." });
      // Same key for a double click (Resend keeps the first email); a
      // deliberate resend is keyed on the previous sending time.
      const idempotencyKey = question.responseSentAt
        ? `medical-question-response/${question.id}/after-${question.responseSentAt.getTime()}`
        : `medical-question-response/${question.id}/first`;
      try {
        await sendMedicalQuestionResponseEmail({ email: question.email, firstName: question.firstName, trackingId: question.trackingId, response: input.adminResponse }, { idempotencyKey });
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "L’email n’a pas pu être envoyé. La réponse n’a pas été publiée." });
      }
      if (input.resend) {
        const resentAt = new Date();
        await db.update(medicalQuestions).set({ adminResponse: input.adminResponse, respondedByOpenId: ctx.user.openId, responseSentAt: resentAt }).where(eq(medicalQuestions.id, input.id));
        await auditQuestion({ questionId: input.id, actorOpenId: ctx.user.openId, action: "response_resent" });
        return { success: true, published: question.status === "published", resent: true };
      }
      const now = new Date();
      await db.update(medicalQuestions).set({ adminResponse: input.adminResponse, publicQuestion: input.publish ? input.publicQuestion : null, publicResponse: input.publish ? input.publicResponse : null, status: input.publish ? "published" : "answered", respondedByOpenId: ctx.user.openId, responseSentAt: now, publishedAt: input.publish ? now : null }).where(eq(medicalQuestions.id, input.id));
      await auditQuestion({ questionId: input.id, actorOpenId: ctx.user.openId, action: input.publish ? "response_sent_and_published" : "response_sent", metadata: { published: input.publish } });
      return { success: true, published: input.publish, resent: false };
    }),
    /** Publishes or updates the anonymised version of an answered question, without emailing anyone. */
    updatePublication: adminProcedure.input(z.object({ id: z.number().int().positive(), publicQuestion: z.string().trim().min(1).max(1000), publicResponse: z.string().trim().min(1).max(5000) })).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const [question] = await db.select().from(medicalQuestions).where(eq(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question introuvable." });
      if (!question.responseSentAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Envoyez d’abord la réponse privée avant de publier." });
      if (question.publicationConsent !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "La publication exige l’accord explicite de la personne." });
      const now = new Date();
      await db.update(medicalQuestions).set({ publicQuestion: input.publicQuestion, publicResponse: input.publicResponse, status: "published", publishedAt: question.publishedAt ?? now }).where(eq(medicalQuestions.id, input.id));
      await auditQuestion({ questionId: input.id, actorOpenId: ctx.user.openId, action: question.status === "published" ? "publication_updated" : "published" });
      return { success: true };
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
    /**
     * « Classer sans suite » (ADM-01): a question that will not be answered
     * leaves the queue; the private record and its journal are kept, and
     * saving a draft puts it back in the queue. The update only matches a
     * question still without reply: a reply sent meanwhile is never filed
     * away, and filing twice writes a single journal entry.
     */
    reject: adminProcedure.input(questionIdInput).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      const alreadyAnswered = "Cette question a déjà reçu une réponse : elle ne peut plus être classée sans suite.";
      const [question] = await db.select().from(medicalQuestions).where(eq(medicalQuestions.id, input.id)).limit(1);
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question introuvable." });
      if (question.responseSentAt) throw new TRPCError({ code: "BAD_REQUEST", message: alreadyAnswered });
      const result = await db.update(medicalQuestions).set({ status: "rejected" })
        .where(and(eq(medicalQuestions.id, input.id), isNull(medicalQuestions.responseSentAt), ne(medicalQuestions.status, "rejected")));
      if (mutationRowCount(result) === 0) {
        const [current] = await db.select({ responseSentAt: medicalQuestions.responseSentAt }).from(medicalQuestions).where(eq(medicalQuestions.id, input.id)).limit(1);
        if (current?.responseSentAt) throw new TRPCError({ code: "BAD_REQUEST", message: alreadyAnswered });
        return { success: true };
      }
      await auditQuestion({ questionId: input.id, actorOpenId: ctx.user.openId, action: "rejected", metadata: { previousStatus: question.status } });
      return { success: true };
    }),
    /**
     * « Supprimer » (RGPD-12): erasure request or withdrawn consent. The
     * question, its public version and its journal are deleted; the security
     * journal keeps a trace that names no one.
     */
    delete: adminProcedure.input(questionIdInput).mutation(async ({ input, ctx }) => {
      await requireMfa(ctx);
      const db = await requireDb();
      await db.delete(medicalQuestionAuditLogs).where(eq(medicalQuestionAuditLogs.medicalQuestionId, input.id));
      const deleted = mutationRowCount(await db.delete(medicalQuestions).where(eq(medicalQuestions.id, input.id)));
      if (deleted === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Question introuvable : elle a peut-être déjà été supprimée." });
      await logSecurityEvent({ actorKind: "admin", actorReference: ctx.user.openId, category: "admin_medical_question_deleted", outcome: "allowed", metadata: { deleted } });
      return { success: true };
    }),
  }),
});
