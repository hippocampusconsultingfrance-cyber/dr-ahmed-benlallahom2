import { randomUUID } from "node:crypto";
import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import { mutationRowCount } from "../../dbMutation";
import {
  cvApplications,
  recruitmentAuditLogs,
  recruitmentCampaigns,
  recruitmentCampaignRecipients,
  recruitmentEmailEvents,
  recruitmentFollowUpTasks,
  recruitmentOfferTemplates,
} from "../../../drizzle/schema";
import { eq, and, sql, desc, inArray, isNull } from "drizzle-orm";
import { sendRecruitmentCampaignEmail, type RecruitmentEmailLanguage } from "../../_core/notifications";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "../../recruitmentAnalysis";
import { adminFilterContains } from "../../adminSearch";
import { DEFAULT_PUBLIC_ORIGIN } from "../publicOrigin";
import { verifiedRecruitmentScore, verifiedScoreFirst } from "./recruitmentShared";

type CampaignDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Sends one campaign email and records the outcome; returns true when the
 * provider accepted it. Whatever stops it before that acceptance, the
 * recording of the unsubscribe token as much as the provider, leaves it
 * « failed » (and offered again by retryFailed, under the same key). Once
 * accepted, the email counts as sent whatever happens to its bookkeeping,
 * written in one batch (DATA-05): a failure there is logged, never turned
 * into a retryable failure, and the per-recipient key keeps any later attempt
 * from delivering it twice.
 */
async function deliverCampaignRecipient(
  db: CampaignDb,
  campaign: { id: number; title: string; subject: string; body: string; language: string },
  candidate: { id: number; firstName: string; lastName: string; email: string; marketingUnsubscribeToken: string | null },
  recipientId: number,
  adminOpenId: string,
) {
  const unsubscribeToken = candidate.marketingUnsubscribeToken || randomUUID().replace(/-/g, "");
  let email: { id?: string };
  try {
    // Recorded before the send, so that the email's unsubscribe link works.
    // Refused, nothing is sent: a stable reason, never the query with its
    // parameters (the token among them), is kept for the admin.
    if (!candidate.marketingUnsubscribeToken) {
      await db.update(cvApplications).set({ marketingUnsubscribeToken: unsubscribeToken }).where(eq(cvApplications.id, candidate.id))
        .catch(tokenError => {
          console.error("[RecruitmentCampaign] Unsubscribe token not recorded; email not sent", { campaignId: campaign.id, recipientId, error: tokenError instanceof Error ? tokenError.name : "UnknownError" });
          throw new Error("unsubscribe_token_not_recorded");
        });
    }
    email = await sendRecruitmentCampaignEmail({
      candidateEmail: candidate.email,
      candidateFirstName: candidate.firstName,
      campaignTitle: campaign.title,
      subject: campaign.subject,
      body: campaign.body,
      language: campaign.language as RecruitmentEmailLanguage,
      unsubscribeUrl: `${DEFAULT_PUBLIC_ORIGIN}/recruitment/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
      idempotencyKey: `campaign-${campaign.id}-recipient-${recipientId}`,
    });
  } catch (error) {
    await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "failed", error: error instanceof Error ? error.message.slice(0, 2000) : "Unknown campaign email failure" }).where(eq(recruitmentCampaignRecipients.id, recipientId));
    return false;
  }
  const contactedAt = new Date();
  try {
    await db.batch([
      db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "sent", providerEmailId: email.id || null, error: null, sentAt: contactedAt, lastEventAt: contactedAt }).where(eq(recruitmentCampaignRecipients.id, recipientId)),
      db.update(cvApplications).set({ lastContactedAt: contactedAt }).where(eq(cvApplications.id, candidate.id)),
      db.insert(recruitmentFollowUpTasks).values([
        { applicationId: candidate.id, campaignId: campaign.id, kind: "follow_up_7", dueAt: new Date(contactedAt.getTime() + 7 * 24 * 60 * 60 * 1000), notes: "Relance suggérée à J+7 — aucun email n’est envoyé automatiquement." },
        { applicationId: candidate.id, campaignId: campaign.id, kind: "follow_up_14", dueAt: new Date(contactedAt.getTime() + 14 * 24 * 60 * 60 * 1000), notes: "Relance suggérée à J+14 — aucun email n’est envoyé automatiquement." },
      ]),
      db.insert(recruitmentAuditLogs).values({ applicationId: candidate.id, adminOpenId, action: "email", metadata: JSON.stringify({ campaignId: campaign.id, resendId: email.id, language: campaign.language }) }),
    ]);
  } catch (error) {
    console.error("[RecruitmentCampaign] Email accepted by the provider but its recording failed", { campaignId: campaign.id, recipientId, resendId: email.id ?? null, error: error instanceof Error ? error.name : "UnknownError" });
    // The recipient alone, if it can be: « sent » with the provider's id, the
    // link its bounce or complaint events need (DATA-04). Otherwise it stays
    // « queued », which no retry picks up: the email is not sent again either way.
    await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "sent", providerEmailId: email.id || null, error: null, sentAt: contactedAt, lastEventAt: contactedAt }).where(eq(recruitmentCampaignRecipients.id, recipientId))
      .catch(linkError => console.error("[RecruitmentCampaign] Sent recipient not recorded", { campaignId: campaign.id, recipientId, error: linkError instanceof Error ? linkError.name : "UnknownError" }));
  }
  return true;
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
        if (input.specialty) conditions.push(sql`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${input.specialty}%`})`);
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
      // Only a send that failed before the provider accepted it can be retried.
      retryable: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'failed' THEN ${recruitmentCampaignRecipients.id} END)`,
      delayed: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delayed' THEN ${recruitmentCampaignRecipients.id} END)`,
      opened: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentEmailEvents.eventType} = 'email.opened' THEN ${recruitmentCampaignRecipients.id} END)`,
    }).from(recruitmentCampaignRecipients)
      .leftJoin(recruitmentEmailEvents, eq(recruitmentEmailEvents.campaignRecipientId, recruitmentCampaignRecipients.id))
      .where(inArray(recruitmentCampaignRecipients.campaignId, campaigns.map(campaign => campaign.id)))
      .groupBy(recruitmentCampaignRecipients.campaignId);
    const metricByCampaign = new Map(metrics.map(metric => [metric.campaignId, metric]));
    return campaigns.map(campaign => ({ ...campaign, delivery: metricByCampaign.get(campaign.id) || { total: 0, sent: 0, delivered: 0, failed: 0, retryable: 0, delayed: 0, opened: 0 } }));
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
        if (input.specialty) conditions.push(sql`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${input.specialty}%`})`);
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
      let sent = 0;
      let failed = 0;
      for (const candidate of audience) {
        const [recipientResult] = await db.insert(recruitmentCampaignRecipients).values({ campaignId, applicationId: candidate.id, recipientEmail: candidate.email, deliveryStatus: "queued" }).returning({ id: recruitmentCampaignRecipients.id });
        if (await deliverCampaignRecipient(db, campaign, candidate, Number(recipientResult.id), ctx.user.openId)) sent += 1;
        else failed += 1;
      }
      await db.update(recruitmentCampaigns).set({ status: failed === 0 ? "sent" : sent > 0 ? "partially_sent" : "failed", sentAt: new Date() }).where(eq(recruitmentCampaigns.id, campaignId));
      return { campaignId, total: audience.length, sent, failed };
    }),

  /**
   * Sends the campaign again to its failed recipients only (provider
   * error before acceptance). Bounces, complaints, suppressions and
   * candidates who withdrew their consent are never retried; recipients
   * already served are never emailed twice.
   */
  retryFailed: adminProcedure
    .input(z.object({ campaignId: z.number().int().positive(), confirmed: z.literal(true) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const [campaign] = await db.select({ id: recruitmentCampaigns.id, title: recruitmentCampaigns.title, subject: recruitmentCampaigns.subject, body: recruitmentCampaigns.body, language: recruitmentCampaigns.language })
        .from(recruitmentCampaigns).where(eq(recruitmentCampaigns.id, input.campaignId)).limit(1);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campagne introuvable" });
      const failedRecipients = await db.select({ recipientId: recruitmentCampaignRecipients.id, applicationId: recruitmentCampaignRecipients.applicationId })
        .from(recruitmentCampaignRecipients)
        .where(and(eq(recruitmentCampaignRecipients.campaignId, campaign.id), eq(recruitmentCampaignRecipients.deliveryStatus, "failed")))
        .limit(200);
      const eligible = failedRecipients.length
        ? await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, marketingUnsubscribeToken: cvApplications.marketingUnsubscribeToken })
          .from(cvApplications)
          .where(and(inArray(cvApplications.id, failedRecipients.map(recipient => recipient.applicationId)), eq(cvApplications.marketingConsent, 1), isNull(cvApplications.marketingUnsubscribedAt), isNull(cvApplications.marketingSuppressedAt), sql`${cvApplications.status} NOT IN ('rejected', 'archived')`))
        : [];
      const candidateById = new Map(eligible.map(candidate => [candidate.id, candidate]));
      let sent = 0;
      let failed = 0;
      let skipped = 0;
      for (const recipient of failedRecipients) {
        const candidate = candidateById.get(recipient.applicationId);
        if (!candidate) {
          await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "skipped", error: "consent_withdrawn_or_profile_closed" }).where(and(eq(recruitmentCampaignRecipients.id, recipient.recipientId), eq(recruitmentCampaignRecipients.deliveryStatus, "failed")));
          skipped += 1;
          continue;
        }
        // Claim the row: a concurrent retry cannot send the same email twice.
        const claimed = await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "queued", error: null })
          .where(and(eq(recruitmentCampaignRecipients.id, recipient.recipientId), eq(recruitmentCampaignRecipients.deliveryStatus, "failed")));
        if (mutationRowCount(claimed) !== 1) continue;
        if (await deliverCampaignRecipient(db, campaign, candidate, recipient.recipientId, ctx.user.openId)) sent += 1;
        else failed += 1;
      }
      const statuses = await db.select({ deliveryStatus: recruitmentCampaignRecipients.deliveryStatus }).from(recruitmentCampaignRecipients).where(eq(recruitmentCampaignRecipients.campaignId, campaign.id));
      // A recipient left « queued » is no failure, and is never retried:
      // its email went out under its own key, accepted with both
      // recordings refused (DATA-05), or is going out in another send.
      // One stopped before the provider accepted it, its unsubscribe
      // token not recorded included, is left « failed », offered again.
      const served = statuses.filter(row => ["sent", "delivered", "delayed", "queued"].includes(row.deliveryStatus)).length;
      await db.update(recruitmentCampaigns).set({ status: served === statuses.length ? "sent" : served > 0 ? "partially_sent" : "failed" }).where(eq(recruitmentCampaigns.id, campaign.id));
      return { campaignId: campaign.id, attempted: failedRecipients.length, sent, failed, skipped };
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
