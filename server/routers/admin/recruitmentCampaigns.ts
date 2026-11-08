import { createHash, randomUUID } from "node:crypto";
import type { BatchItem } from "drizzle-orm/batch";
import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import {
  cvApplications,
  recruitmentAuditLogs,
  recruitmentCampaigns,
  recruitmentCampaignRecipients,
  recruitmentEmailEvents,
  recruitmentFollowUpTasks,
  recruitmentOfferTemplates,
} from "../../../drizzle/schema";
import { eq, and, or, sql, desc, inArray, isNull, lt, gt } from "drizzle-orm";
import {
  buildRecruitmentCampaignEmail,
  RESEND_BATCH_MAX_EMAILS,
  sendRecruitmentCampaignBatch,
  sendRecruitmentCampaignEmail,
  type RecruitmentCampaignBatchDelivery,
  type RecruitmentEmailLanguage,
} from "../../_core/notifications";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "../../recruitmentAnalysis";
import { adminFilterContains } from "../../adminSearch";
import { recruitmentUnsubscribeLinks } from "../recruitmentPreferences";
import { verifiedRecruitmentScore, verifiedScoreFirst } from "./recruitmentShared";

type CampaignDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type CampaignContent = { id: number; title: string; subject: string; body: string; language: string };
type CampaignCandidate = { id: number; firstName: string; lastName: string; email: string; marketingUnsubscribeToken: string | null };
/** `previousOutcome`: the status and reason a retried recipient was left with, shared by the recipients of its batch. */
type CampaignRecipient = { recipientId: number; candidate: CampaignCandidate; previousOutcome?: string };
type ReadyRecipient = Omit<CampaignRecipient, "candidate"> & { candidate: CampaignCandidate & { marketingUnsubscribeToken: string } };

/**
 * A recipient « queued » this long without an answer was cut off mid-send (the
 * 60 s of a Vercel function): retryFailed takes it up again (EXPL-08). Counted
 * from its last attempt (lastEventAt, set when a retry claims it), else from
 * its insertion, so that a send in progress is not taken up twice.
 */
const STALLED_RECIPIENT_MS = 10 * 60 * 1000;

/**
 * Taken up only while Resend still knows the key of its batch: a key is kept
 * 24 hours from its first use, never earlier than the recipient's insertion,
 * so an email accepted with its answer lost gets Resend's first answer back.
 * Older, its outcome stays uncertain (« queued ») and it is never sent again
 * blindly, as before EXPL-08 (DATA-05).
 */
const STALLED_RECIPIENT_MAX_AGE_MS = 23 * 60 * 60 * 1000;

function stalledRecipient(now: Date) {
  const stalledBefore = new Date(now.getTime() - STALLED_RECIPIENT_MS);
  return and(
    eq(recruitmentCampaignRecipients.deliveryStatus, "queued"),
    gt(recruitmentCampaignRecipients.createdAt, new Date(now.getTime() - STALLED_RECIPIENT_MAX_AGE_MS)),
    or(
      and(isNull(recruitmentCampaignRecipients.lastEventAt), lt(recruitmentCampaignRecipients.createdAt, stalledBefore)),
      lt(recruitmentCampaignRecipients.lastEventAt, stalledBefore),
    ),
  );
}

/** What retryFailed sends again: a failure before the provider accepted it, or a stalled send. */
function retryableRecipient(now: Date) {
  return or(eq(recruitmentCampaignRecipients.deliveryStatus, "failed"), stalledRecipient(now));
}

/**
 * Resend's idempotency key of one batch (EXPL-08, RGPD-19): resend.batch.send
 * takes one key a call, not one per email, so the key is that of its
 * recipients, the same whenever the same recipients are sent again, and the
 * recipient's own key (DATA-05) for a batch of one. A batch whose answer was
 * lost (network, function cut off) and sent again within 24 hours gets
 * Resend's first answer, not a second email.
 */
export function campaignBatchIdempotencyKey(campaignId: number, recipientIds: number[]) {
  if (recipientIds.length === 1) return `campaign-${campaignId}-recipient-${recipientIds[0]}`;
  const digest = createHash("sha256").update([...recipientIds].sort((a, b) => a - b).join(",")).digest("hex").slice(0, 40);
  return `campaign-${campaignId}-recipients-${recipientIds.length}-${digest}`;
}

/** neon-http's batch (one transaction) takes a non-empty list. */
function nonEmpty(statements: BatchItem<"pg">[]) {
  if (!statements.length) throw new Error("empty_batch");
  return statements as [BatchItem<"pg">, ...BatchItem<"pg">[]];
}

/**
 * Recipients not sent, kept for retryFailed with a stable reason; only those
 * still « queued », so that a send recorded meanwhile by another request is
 * never turned into a failure (DATA-05).
 */
async function markRecipientsFailed(db: CampaignDb, recipientIds: number[], error: string) {
  await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "failed", error: error.slice(0, 2000) })
    .where(and(inArray(recruitmentCampaignRecipients.id, recipientIds), eq(recruitmentCampaignRecipients.deliveryStatus, "queued")));
}

/**
 * The unsubscribe token of each candidate who has none yet, recorded in one
 * batch before any send, so that the email's links work. Refused, those
 * candidates get nothing: « failed », a stable reason, never the query with
 * its parameters (the tokens among them), is kept for the admin.
 */
async function withUnsubscribeTokens(db: CampaignDb, campaignId: number, recipients: CampaignRecipient[]): Promise<ReadyRecipient[]> {
  const ready: ReadyRecipient[] = [];
  const missing: ReadyRecipient[] = [];
  for (const { candidate, ...recipient } of recipients) {
    if (candidate.marketingUnsubscribeToken) ready.push({ ...recipient, candidate: { ...candidate, marketingUnsubscribeToken: candidate.marketingUnsubscribeToken } });
    else missing.push({ ...recipient, candidate: { ...candidate, marketingUnsubscribeToken: randomUUID().replace(/-/g, "") } });
  }
  if (!missing.length) return ready;
  try {
    await db.batch(nonEmpty(missing.map(({ candidate }) => db.update(cvApplications).set({ marketingUnsubscribeToken: candidate.marketingUnsubscribeToken }).where(eq(cvApplications.id, candidate.id)))));
    return [...ready, ...missing];
  } catch (tokenError) {
    console.error("[RecruitmentCampaign] Unsubscribe tokens not recorded; emails not sent", { campaignId, recipients: missing.length, error: tokenError instanceof Error ? tokenError.name : "UnknownError" });
    await markRecipientsFailed(db, missing.map(recipient => recipient.recipientId), "unsubscribe_token_not_recorded");
    return ready;
  }
}

/**
 * The bookkeeping of a batch Resend accepted: once accepted, its emails count
 * as sent whatever happens to it, written in one batch (DATA-05): a failure
 * there is logged, never turned into a retryable failure. The recipients
 * alone are then recorded « sent » with the provider's ids, the link their
 * bounce or complaint events need (DATA-04); refused too, they stay
 * « queued » and a retry, 10 minutes later and within 23 hours, sends the
 * same batch under the same key: Resend answers with the same ids, the
 * emails do not go twice.
 */
async function recordBatchSent(db: CampaignDb, campaign: CampaignContent, recipients: ReadyRecipient[], providerIds: Array<string | null>, adminOpenId: string) {
  const contactedAt = new Date();
  const sentRecipients = () => recipients.map(({ recipientId }, index) => db.update(recruitmentCampaignRecipients)
    .set({ deliveryStatus: "sent", providerEmailId: providerIds[index] || null, error: null, sentAt: contactedAt, lastEventAt: contactedAt })
    .where(eq(recruitmentCampaignRecipients.id, recipientId)));
  try {
    await db.batch([
      ...nonEmpty(sentRecipients()),
      db.update(cvApplications).set({ lastContactedAt: contactedAt }).where(inArray(cvApplications.id, recipients.map(({ candidate }) => candidate.id))),
      db.insert(recruitmentFollowUpTasks).values(recipients.flatMap(({ candidate }) => [
        { applicationId: candidate.id, campaignId: campaign.id, kind: "follow_up_7" as const, dueAt: new Date(contactedAt.getTime() + 7 * 24 * 60 * 60 * 1000), notes: "Relance suggérée à J+7 — aucun email n’est envoyé automatiquement." },
        { applicationId: candidate.id, campaignId: campaign.id, kind: "follow_up_14" as const, dueAt: new Date(contactedAt.getTime() + 14 * 24 * 60 * 60 * 1000), notes: "Relance suggérée à J+14 — aucun email n’est envoyé automatiquement." },
      ])),
      db.insert(recruitmentAuditLogs).values(recipients.map(({ candidate }, index) => ({ applicationId: candidate.id, adminOpenId, action: "email" as const, metadata: JSON.stringify({ campaignId: campaign.id, resendId: providerIds[index] ?? undefined, language: campaign.language }) }))),
    ]);
  } catch (error) {
    console.error("[RecruitmentCampaign] Emails accepted by the provider but their recording failed", { campaignId: campaign.id, recipients: recipients.length, error: error instanceof Error ? error.name : "UnknownError" });
    await db.batch(nonEmpty(sentRecipients()))
      .catch(linkError => console.error("[RecruitmentCampaign] Sent recipients not recorded", { campaignId: campaign.id, recipients: recipients.length, error: linkError instanceof Error ? linkError.name : "UnknownError" }));
  }
}

type BatchOutcome = { status: "sent" } | { status: "split" } | { status: "failed"; error: string; stop: boolean };

/**
 * One call of Resend's batch endpoint for up to 100 recipients (EXPL-08), each
 * email with its own unsubscribe link and headers (RGPD-19). Resend's strict
 * validation sends all of them or none: refused for one of its messages (an
 * address), the batch is split in two and each half sent on its own, so that
 * only that email fails; any other refusal or a network error leaves them all
 * « failed », offered again by retryFailed. A used-up quota, or a rate limit
 * longer than a request waits, stops the campaign there (ABUS-03).
 */
async function sendCampaignBatch(db: CampaignDb, campaign: CampaignContent, recipients: ReadyRecipient[], adminOpenId: string): Promise<BatchOutcome> {
  const recipientIds = recipients.map(recipient => recipient.recipientId);
  let delivery: RecruitmentCampaignBatchDelivery;
  try {
    delivery = await sendRecruitmentCampaignBatch(recipients.map(({ candidate }) => ({
      to: candidate.email,
      ...buildRecruitmentCampaignEmail({
        candidateFirstName: candidate.firstName,
        campaignTitle: campaign.title,
        subject: campaign.subject,
        body: campaign.body,
        language: campaign.language as RecruitmentEmailLanguage,
        ...recruitmentUnsubscribeLinks(candidate.marketingUnsubscribeToken),
      }),
    })), campaignBatchIdempotencyKey(campaign.id, recipientIds));
  } catch (error) {
    // The batch may have left: sent again with the same recipients, under the same key.
    const reason = error instanceof Error ? error.message : "Unknown campaign email failure";
    await markRecipientsFailed(db, recipientIds, reason);
    return { status: "failed", error: reason, stop: false };
  }
  if (!delivery.error) {
    await recordBatchSent(db, campaign, recipients, delivery.ids, adminOpenId);
    return { status: "sent" };
  }
  if (delivery.messageRefused && recipients.length > 1) return { status: "split" };
  const reason = `Resend campaign email failed: ${delivery.error.message}`;
  await markRecipientsFailed(db, recipientIds, reason);
  return { status: "failed", error: reason, stop: delivery.retryLater };
}

/**
 * Sends the campaign to these recipients, all inserted or claimed « queued »
 * beforehand: by batches of 100 in the order of their ids, so that 200
 * recipients take two calls, well within the 60 s of a request and the rate
 * limit (EXPL-08). Retried, the recipients of one earlier batch, which share
 * its outcome, are batched together again: the same recipients, the same
 * key. After a stop, the recipients left are « failed » with its reason,
 * never sent.
 */
async function deliverCampaign(db: CampaignDb, campaign: CampaignContent, recipients: CampaignRecipient[], adminOpenId: string) {
  const ready = (await withUnsubscribeTokens(db, campaign.id, recipients)).sort((a, b) => a.recipientId - b.recipientId);
  let sent = 0;
  let failed = recipients.length - ready.length;
  const byOutcome = new Map<string, ReadyRecipient[]>();
  for (const recipient of ready) {
    const group = byOutcome.get(recipient.previousOutcome ?? "");
    if (group) group.push(recipient);
    else byOutcome.set(recipient.previousOutcome ?? "", [recipient]);
  }
  const batches: ReadyRecipient[][] = [];
  for (const group of byOutcome.values()) {
    for (let index = 0; index < group.length; index += RESEND_BATCH_MAX_EMAILS) batches.push(group.slice(index, index + RESEND_BATCH_MAX_EMAILS));
  }
  let stopReason: string | null = null;
  while (batches.length) {
    const batch = batches.shift()!;
    if (stopReason) {
      await markRecipientsFailed(db, batch.map(recipient => recipient.recipientId), stopReason);
      failed += batch.length;
      continue;
    }
    const outcome = await sendCampaignBatch(db, campaign, batch, adminOpenId);
    if (outcome.status === "sent") sent += batch.length;
    else if (outcome.status === "split") {
      const half = Math.ceil(batch.length / 2);
      batches.unshift(batch.slice(0, half), batch.slice(half));
    } else {
      failed += batch.length;
      if (outcome.stop) stopReason = outcome.error;
    }
  }
  return { sent, failed };
}

/** The preview and the test of a campaign: its content as the admin types it (MAIL-13). */
const campaignContentInput = z.object({
  title: z.string().trim().max(180),
  subject: z.string().trim().max(255),
  body: z.string().trim().max(8000),
  language: z.enum(["fr", "en"]),
});

/**
 * A campaign email as a recipient gets it (MAIL-13), greeting the admin by
 * the first word of their name as a candidate is greeted by theirs. Its
 * unsubscribe links carry a token no candidate has: they unsubscribe nobody.
 */
function campaignTestEmail(input: z.infer<typeof campaignContentInput>, adminName: string | null | undefined) {
  return {
    candidateFirstName: adminName?.trim().split(/\s+/)[0] ?? "",
    campaignTitle: input.title,
    subject: input.subject,
    body: input.body,
    language: input.language,
    ...recruitmentUnsubscribeLinks("apercu"),
  };
}

export const adminRecruitmentCampaignsRouter = router({
  previewAudience: adminProcedure
    .input(z.object({
      mode: z.enum(["selected", "all_eligible", "filtered"]),
      selectedIds: z.array(z.number().int().positive()).max(200).default([]),
      specialty: z.string().trim().max(160).optional(),
      country: z.string().trim().max(80).optional(),
      minimumScore: z.number().int().min(0).max(100).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(cvApplications.marketingConsent, 1), isNull(cvApplications.marketingUnsubscribedAt), isNull(cvApplications.marketingSuppressedAt), sql`${cvApplications.status} NOT IN ('rejected', 'archived')`];
      if (input.mode === "selected") {
        if (!input.selectedIds.length) return [];
        conditions.push(inArray(cvApplications.id, input.selectedIds));
      }
      if (input.mode === "filtered") {
        if (input.specialty) conditions.push(adminFilterContains(cvApplications.specialty, input.specialty));
        if (input.country) conditions.push(adminFilterContains(cvApplications.targetCountries, input.country));
        if (input.minimumScore !== undefined) {
          conditions.push(sql`${cvApplications.aiScore} >= ${input.minimumScore}`);
          conditions.push(eq(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION));
        }
      }
      return db.select({
        id: cvApplications.id,
        firstName: cvApplications.firstName,
        lastName: cvApplications.lastName,
        email: cvApplications.email,
        specialty: cvApplications.specialty,
        aiScore: verifiedRecruitmentScore,
      }).from(cvApplications).where(and(...conditions)).orderBy(verifiedScoreFirst, desc(cvApplications.createdAt)).limit(200);
    }),

  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const campaigns = await db.select().from(recruitmentCampaigns).orderBy(desc(recruitmentCampaigns.createdAt)).limit(50);
    if (!campaigns.length) return [];
    const metrics = await db.select({
      campaignId: recruitmentCampaignRecipients.campaignId,
      total: sql<number>`COUNT(DISTINCT ${recruitmentCampaignRecipients.id})`,
      delivered: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delivered' THEN ${recruitmentCampaignRecipients.id} END)`,
      sent: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} IN ('sent', 'delivered') THEN ${recruitmentCampaignRecipients.id} END)`,
      failed: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} IN ('failed', 'bounced', 'complained', 'suppressed') THEN ${recruitmentCampaignRecipients.id} END)`,
      // Only a send that failed before the provider accepted it, or was cut off mid-way, can be retried.
      retryable: sql<number>`COUNT(DISTINCT CASE WHEN ${retryableRecipient(new Date())} THEN ${recruitmentCampaignRecipients.id} END)`,
      delayed: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delayed' THEN ${recruitmentCampaignRecipients.id} END)`,
      opened: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentEmailEvents.eventType} = 'email.opened' THEN ${recruitmentCampaignRecipients.id} END)`,
    }).from(recruitmentCampaignRecipients)
      .leftJoin(recruitmentEmailEvents, eq(recruitmentEmailEvents.campaignRecipientId, recruitmentCampaignRecipients.id))
      .where(inArray(recruitmentCampaignRecipients.campaignId, campaigns.map(campaign => campaign.id)))
      .groupBy(recruitmentCampaignRecipients.campaignId);
    const metricByCampaign = new Map(metrics.map(metric => [metric.campaignId, metric]));
    return campaigns.map(campaign => ({ ...campaign, delivery: metricByCampaign.get(campaign.id) || { total: 0, sent: 0, delivered: 0, failed: 0, retryable: 0, delayed: 0, opened: 0 } }));
  }),

  /** The exact email of the campaign being written, rendered by its real builder (MAIL-13); nothing is sent nor recorded. */
  previewEmail: adminProcedure
    .input(campaignContentInput)
    .query(({ input, ctx }) => {
      const email = buildRecruitmentCampaignEmail(campaignTestEmail(input, ctx.user.name));
      return { subject: email.subject, html: email.html, text: email.text };
    }),

  /**
   * « M'envoyer un test » (MAIL-13): the campaign being written, to the
   * verified address of the signed-in admin only. No campaign, recipient,
   * status or counter is written.
   */
  sendTest: adminProcedure
    .input(campaignContentInput)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune adresse email vérifiée n’est associée à votre compte administrateur." });
      await sendRecruitmentCampaignEmail({ ...campaignTestEmail(input, ctx.user.name), candidateEmail: ctx.user.email });
      return { success: true, to: ctx.user.email };
    }),

  send: adminProcedure
    .input(z.object({
      title: z.string().trim().min(3).max(180),
      subject: z.string().trim().min(3).max(255),
      body: z.string().trim().min(10).max(8000),
      language: z.enum(["fr", "en"]),
      mode: z.enum(["selected", "all_eligible", "filtered"]),
      selectedIds: z.array(z.number().int().positive()).max(200).default([]),
      specialty: z.string().trim().max(160).optional(),
      country: z.string().trim().max(80).optional(),
      minimumScore: z.number().int().min(0).max(100).optional(),
      confirmed: z.literal(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const conditions = [eq(cvApplications.marketingConsent, 1), isNull(cvApplications.marketingUnsubscribedAt), isNull(cvApplications.marketingSuppressedAt), sql`${cvApplications.status} NOT IN ('rejected', 'archived')`];
      if (input.mode === "selected") {
        if (!input.selectedIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Sélectionnez au moins un profil éligible" });
        conditions.push(inArray(cvApplications.id, input.selectedIds));
      }
      if (input.mode === "filtered") {
        if (input.specialty) conditions.push(adminFilterContains(cvApplications.specialty, input.specialty));
        if (input.country) conditions.push(adminFilterContains(cvApplications.targetCountries, input.country));
        if (input.minimumScore !== undefined) {
          conditions.push(sql`${cvApplications.aiScore} >= ${input.minimumScore}`);
          conditions.push(eq(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION));
        }
      }
      const audience = await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, marketingUnsubscribeToken: cvApplications.marketingUnsubscribeToken })
        .from(cvApplications).where(and(...conditions)).limit(200);
      if (!audience.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun profil éligible : seuls les candidats ayant accepté les communications de recrutement peuvent être contactés." });

      const [campaignResult] = await db.insert(recruitmentCampaigns).values({
        title: input.title,
        subject: input.subject,
        body: input.body,
        language: input.language,
        audienceMode: input.mode,
        audienceFilters: JSON.stringify({ specialty: input.specialty || null, country: input.country || null, minimumScore: input.minimumScore ?? null, selectedIds: input.mode === "selected" ? input.selectedIds : undefined }),
        recipientCount: audience.length,
        status: "sending",
        createdByOpenId: ctx.user.openId,
      }).returning({ id: recruitmentCampaigns.id });
      const campaignId = Number(campaignResult.id);
      const campaign = { id: campaignId, title: input.title, subject: input.subject, body: input.body, language: input.language };
      // Every recipient « queued » in one query, before the first email (EXPL-08).
      const inserted = await db.insert(recruitmentCampaignRecipients)
        .values(audience.map(candidate => ({ campaignId, applicationId: candidate.id, recipientEmail: candidate.email, deliveryStatus: "queued" as const })))
        .returning({ id: recruitmentCampaignRecipients.id, applicationId: recruitmentCampaignRecipients.applicationId });
      const recipientIdByApplication = new Map(inserted.map(row => [row.applicationId, Number(row.id)]));
      const { sent, failed } = await deliverCampaign(db, campaign, audience.map(candidate => ({ recipientId: recipientIdByApplication.get(candidate.id)!, candidate })), ctx.user.openId);
      await db.update(recruitmentCampaigns).set({ status: failed === 0 ? "sent" : sent > 0 ? "partially_sent" : "failed", sentAt: new Date() }).where(eq(recruitmentCampaigns.id, campaignId));
      return { campaignId, total: audience.length, sent, failed };
    }),

  /**
   * Sends the campaign again to its failed recipients (provider error
   * before acceptance) and to those left « queued » more than 10 minutes,
   * within 23 hours of the campaign, a send cut off mid-way (EXPL-08), by
   * the same batches, so that a batch whose answer was lost goes again
   * under the same key and Resend gives its first answer back. Bounces,
   * complaints, suppressions and candidates who withdrew their consent are
   * never retried; recipients already served are never emailed twice.
   */
  retryFailed: adminProcedure
    .input(z.object({ campaignId: z.number().int().positive(), confirmed: z.literal(true) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const [campaign] = await db.select({ id: recruitmentCampaigns.id, title: recruitmentCampaigns.title, subject: recruitmentCampaigns.subject, body: recruitmentCampaigns.body, language: recruitmentCampaigns.language })
        .from(recruitmentCampaigns).where(eq(recruitmentCampaigns.id, input.campaignId)).limit(1);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campagne introuvable" });
      const now = new Date();
      const retryable = and(eq(recruitmentCampaignRecipients.campaignId, campaign.id), retryableRecipient(now));
      const toRetry = await db.select({ recipientId: recruitmentCampaignRecipients.id, applicationId: recruitmentCampaignRecipients.applicationId, deliveryStatus: recruitmentCampaignRecipients.deliveryStatus, error: recruitmentCampaignRecipients.error })
        .from(recruitmentCampaignRecipients).where(retryable).limit(200);
      const previousOutcome = new Map(toRetry.map(recipient => [recipient.recipientId, `${recipient.deliveryStatus}:${recipient.error ?? ""}`]));
      const eligible = toRetry.length
        ? await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, marketingUnsubscribeToken: cvApplications.marketingUnsubscribeToken })
          .from(cvApplications)
          .where(and(inArray(cvApplications.id, toRetry.map(recipient => recipient.applicationId)), eq(cvApplications.marketingConsent, 1), isNull(cvApplications.marketingUnsubscribedAt), isNull(cvApplications.marketingSuppressedAt), sql`${cvApplications.status} NOT IN ('rejected', 'archived')`))
        : [];
      const candidateById = new Map(eligible.map(candidate => [candidate.id, candidate]));
      const withdrawn = toRetry.filter(recipient => !candidateById.has(recipient.applicationId)).map(recipient => recipient.recipientId);
      const skipped = withdrawn.length
        ? (await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "skipped", error: "consent_withdrawn_or_profile_closed" })
          .where(and(inArray(recruitmentCampaignRecipients.id, withdrawn), retryable)).returning({ id: recruitmentCampaignRecipients.id })).length
        : 0;
      // Claim the rows in one query, the attempt dated: a concurrent retry
      // cannot take them up, nor this one take up those another claimed.
      const toSend = toRetry.filter(recipient => candidateById.has(recipient.applicationId)).map(recipient => recipient.recipientId);
      const claimed = toSend.length
        ? await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "queued", error: null, lastEventAt: now })
          .where(and(inArray(recruitmentCampaignRecipients.id, toSend), retryable)).returning({ id: recruitmentCampaignRecipients.id, applicationId: recruitmentCampaignRecipients.applicationId })
        : [];
      const { sent, failed } = claimed.length
        ? await deliverCampaign(db, campaign, claimed.map(row => ({ recipientId: Number(row.id), candidate: candidateById.get(row.applicationId)!, previousOutcome: previousOutcome.get(Number(row.id)) })), ctx.user.openId)
        : { sent: 0, failed: 0 };
      const statuses = await db.select({ deliveryStatus: recruitmentCampaignRecipients.deliveryStatus }).from(recruitmentCampaignRecipients).where(eq(recruitmentCampaignRecipients.campaignId, campaign.id));
      // A recipient « queued » is no failure: its email went out, accepted
      // with both recordings refused (DATA-05), or is going out in another
      // send; a retry 10 minutes later, within 23 hours of the campaign,
      // sends it again under the same key.
      // One stopped before the provider accepted it, its unsubscribe token
      // not recorded included, is left « failed », offered again.
      const served = statuses.filter(row => ["sent", "delivered", "delayed", "queued"].includes(row.deliveryStatus)).length;
      await db.update(recruitmentCampaigns).set({ status: served === statuses.length ? "sent" : served > 0 ? "partially_sent" : "failed" }).where(eq(recruitmentCampaigns.id, campaign.id));
      return { campaignId: campaign.id, attempted: toRetry.length, sent, failed, skipped };
    }),
});

export const adminRecruitmentOfferTemplatesRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(recruitmentOfferTemplates).orderBy(desc(recruitmentOfferTemplates.updatedAt)).limit(100);
  }),
  create: adminProcedure.input(z.object({ name: z.string().trim().min(3).max(180), category: z.enum(["europe", "canada", "middle_east", "vvip_offshore", "paramedical", "general"]), language: z.enum(["fr", "en"]), subject: z.string().trim().min(3).max(255), body: z.string().trim().min(10).max(8000) })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    const [result] = await db.insert(recruitmentOfferTemplates).values({ ...input, createdByOpenId: ctx.user.openId }).returning({ id: recruitmentOfferTemplates.id });
    return { success: true, id: Number(result.id) };
  }),
  update: adminProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(3).max(180), category: z.enum(["europe", "canada", "middle_east", "vvip_offshore", "paramedical", "general"]), language: z.enum(["fr", "en"]), subject: z.string().trim().min(3).max(255), body: z.string().trim().min(10).max(8000), active: z.number().int().min(0).max(1) })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    await db.update(recruitmentOfferTemplates).set({ ...input, updatedAt: new Date() }).where(eq(recruitmentOfferTemplates.id, input.id));
    return { success: true };
  }),
});
