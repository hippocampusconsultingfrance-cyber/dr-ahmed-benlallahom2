import { and, desc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { appointments, cvApplications, recruitmentCampaignRecipients, recruitmentEmailEvents, type RecruitmentCampaignRecipient } from "../drizzle/schema";
import { getDb } from "./db";
import { resendApplicationReferenceFromTags, resendAppointmentEmailFromTags, resendRecipientMatchesApplication } from "./resendWebhookCorrelation";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type DeliveryStatus = "sent" | "delivered" | "delayed" | "bounced" | "complained" | "failed" | "suppressed";

const DELIVERY_STATUS_BY_EVENT: Record<string, DeliveryStatus | undefined> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

/** After these, the address receives no more recruitment offers (marketing consent withdrawn). */
const SUPPRESSING_STATUSES = new Set<DeliveryStatus>(["bounced", "complained", "suppressed"]);

/** After these, a patient email Resend had accepted did not reach the patient (EXPL-13). */
const UNDELIVERED_STATUSES = new Set<DeliveryStatus>(["bounced", "complained", "failed", "suppressed"]);

/**
 * Time the webhook gives the owner's alert of a patient email that bounced to
 * go out before it answers (EXPL-13), well under the time Resend waits for the
 * answer. Past it, the alert stays queued for the next processing: never sent
 * after the answer.
 */
const RESEND_BOUNCE_ALERT_BUDGET_MS = 5_000;

export type ResendWebhookEvent = { type: string; created_at?: string; data?: Record<string, any> };

/** neon-http's batch (one transaction) takes a non-empty list. */
function nonEmpty(statements: BatchItem<"pg">[]) {
  if (!statements.length) throw new Error("empty_batch");
  return statements as [BatchItem<"pg">, ...BatchItem<"pg">[]];
}

/**
 * The writes an event calls for: its campaign recipient's delivery status and,
 * for a bounce, a complaint or a suppression, the withdrawal of the
 * candidate's marketing consent. `onlyIfNotApplied` keeps a replay from
 * overwriting a later event or an earlier suppression.
 */
function eventEffects(db: Database, input: {
  deliveryStatus: DeliveryStatus | undefined;
  data: Record<string, any>;
  occurredAt: Date;
  recipient: Pick<RecruitmentCampaignRecipient, "id" | "deliveredAt"> | undefined;
  applicationId: number | null;
  onlyIfNotApplied?: boolean;
}): BatchItem<"pg">[] {
  const { deliveryStatus, data, occurredAt, recipient, applicationId } = input;
  const effects: BatchItem<"pg">[] = [];
  if (recipient && deliveryStatus) {
    effects.push(db.update(recruitmentCampaignRecipients).set({
      deliveryStatus,
      error: deliveryStatus === "bounced" || deliveryStatus === "failed" ? String(data.bounce?.message || data.error?.message || data.error || "Email delivery failed").slice(0, 2_000) : null,
      deliveredAt: deliveryStatus === "delivered" ? occurredAt : recipient.deliveredAt,
      lastEventAt: occurredAt,
    }).where(and(
      eq(recruitmentCampaignRecipients.id, recipient.id),
      input.onlyIfNotApplied ? or(isNull(recruitmentCampaignRecipients.lastEventAt), lt(recruitmentCampaignRecipients.lastEventAt, occurredAt)) : undefined,
    )));
  }
  if (applicationId && deliveryStatus && SUPPRESSING_STATUSES.has(deliveryStatus)) {
    effects.push(db.update(cvApplications).set({ marketingConsent: 0, marketingSuppressedAt: occurredAt, updatedAt: new Date() }).where(and(
      eq(cvApplications.id, applicationId),
      input.onlyIfNotApplied ? isNull(cvApplications.marketingSuppressedAt) : undefined,
    )));
  }
  return effects;
}

/**
 * Records a signed Resend event (delivery reporting, bounce and complaint
 * suppression). The event row is written in the same batch as its effects,
 * after them (DATA-04): if any write fails, nothing is recorded, the webhook
 * answers an error and Resend's next delivery applies the whole event again.
 * An event already recorded whose suppression is missing (recorded before its
 * effects, by an earlier version of this handler) gets it now instead of being
 * answered as a duplicate. A patient email of a booking, tagged with it, that
 * bounced after Resend accepted it (EXPL-13) is marked on its appointment and
 * its owner alert queued, in the same batch; that alert is then sent within
 * RESEND_BOUNCE_ALERT_BUDGET_MS.
 */
export async function recordResendEmailEvent(input: { providerEventId: string; event: ResendWebhookEvent; payload: string }): Promise<{ duplicate: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const { providerEventId, event, payload } = input;
  const data = event.data || {};
  const deliveryStatus = DELIVERY_STATUS_BY_EVENT[event.type];
  const occurredAt = event.created_at && Number.isFinite(new Date(event.created_at).getTime()) ? new Date(event.created_at) : new Date();

  const [alreadyRecorded] = await db.select({ applicationId: recruitmentEmailEvents.applicationId, campaignRecipientId: recruitmentEmailEvents.campaignRecipientId, occurredAt: recruitmentEmailEvents.occurredAt })
    .from(recruitmentEmailEvents).where(eq(recruitmentEmailEvents.providerEventId, providerEventId)).limit(1);
  if (alreadyRecorded) {
    const applicationId = alreadyRecorded.applicationId;
    if (!applicationId || !deliveryStatus || !SUPPRESSING_STATUSES.has(deliveryStatus)) return { duplicate: true };
    const [application] = await db.select({ marketingSuppressedAt: cvApplications.marketingSuppressedAt }).from(cvApplications).where(eq(cvApplications.id, applicationId)).limit(1);
    if (!application || application.marketingSuppressedAt) return { duplicate: true };
    const [recipient] = alreadyRecorded.campaignRecipientId
      ? await db.select({ id: recruitmentCampaignRecipients.id, deliveredAt: recruitmentCampaignRecipients.deliveredAt }).from(recruitmentCampaignRecipients).where(eq(recruitmentCampaignRecipients.id, alreadyRecorded.campaignRecipientId)).limit(1)
      : [];
    await db.batch(nonEmpty(eventEffects(db, { deliveryStatus, data, occurredAt: alreadyRecorded.occurredAt, recipient, applicationId, onlyIfNotApplied: true })));
    return { duplicate: false };
  }

  const providerEmailId = typeof data.email_id === "string" ? data.email_id : null;
  const recipientEmail = Array.isArray(data.to) && typeof data.to[0] === "string" ? data.to[0].toLowerCase() : null;
  const recipients = providerEmailId
    ? await db.select().from(recruitmentCampaignRecipients).where(eq(recruitmentCampaignRecipients.providerEmailId, providerEmailId)).limit(5)
    : [];
  const recipient = recipients[0];
  const [trackedEmail] = !recipient && providerEmailId
    ? await db.select({ applicationId: recruitmentEmailEvents.applicationId })
      .from(recruitmentEmailEvents)
      .where(and(
        eq(recruitmentEmailEvents.providerEmailId, providerEmailId),
        isNotNull(recruitmentEmailEvents.applicationId),
      ))
      .orderBy(desc(recruitmentEmailEvents.occurredAt))
      .limit(1)
    : [];
  const taggedApplicationReference = resendApplicationReferenceFromTags(data.tags);
  const [taggedApplication] = !recipient && !trackedEmail?.applicationId && taggedApplicationReference
    ? await db.select({ id: cvApplications.id, email: cvApplications.email })
      .from(cvApplications)
      .where(eq(cvApplications.trackingId, taggedApplicationReference))
      .limit(1)
    : [];
  const taggedApplicationId = taggedApplication && resendRecipientMatchesApplication(recipientEmail, taggedApplication.email)
    ? taggedApplication.id
    : null;
  const applicationId = recipient?.applicationId || trackedEmail?.applicationId || taggedApplicationId || null;
  // A patient email of a booking that did not reach the patient (EXPL-13),
  // about the address the appointment holds now: a late bounce of an address
  // corrected since is left alone, and an erased booking has none.
  const appointmentEmail = deliveryStatus && UNDELIVERED_STATUSES.has(deliveryStatus) ? resendAppointmentEmailFromTags(data.tags) : null;
  const [taggedAppointment] = appointmentEmail
    ? await db.select({ id: appointments.id, customerEmail: appointments.customerEmail }).from(appointments).where(eq(appointments.trackingId, appointmentEmail.trackingId)).limit(1)
    : [];
  const bouncedAppointment = appointmentEmail && taggedAppointment && resendRecipientMatchesApplication(recipientEmail, taggedAppointment.customerEmail)
    ? { ...taggedAppointment, email: appointmentEmail.email }
    : null;
  // Loaded only for such a bounce.
  const appointmentFulfillment = bouncedAppointment ? await import("./appointmentFulfillment") : null;

  const statements: BatchItem<"pg">[] = [];
  if (applicationId && providerEmailId) {
    statements.push(db.update(recruitmentEmailEvents)
      .set({ applicationId })
      .where(and(eq(recruitmentEmailEvents.providerEmailId, providerEmailId), isNull(recruitmentEmailEvents.applicationId))));
  }
  statements.push(...eventEffects(db, { deliveryStatus, data, occurredAt, recipient, applicationId }));
  if (bouncedAppointment && appointmentFulfillment) {
    statements.push(...appointmentFulfillment.appointmentEmailBounceEffects(db, { appointmentId: bouncedAppointment.id, customerEmail: bouncedAppointment.customerEmail, email: bouncedAppointment.email }));
  }
  // Last, in the same batch: a recorded event always has its effects.
  statements.push(db.insert(recruitmentEmailEvents).values({
    providerEventId,
    providerEmailId,
    campaignRecipientId: recipient?.id || null,
    applicationId,
    eventType: event.type,
    recipientEmail,
    payload: payload.slice(0, 20_000),
    occurredAt,
  }));
  await db.batch(nonEmpty(statements));
  if (bouncedAppointment) {
    // The owner's alert goes out now, through the send slots and within the
    // budget, before the webhook answers (never after: what is left stays
    // queued for the next processing). It never throws.
    const { processFulfillmentBestEffort } = await import("./appointmentPaymentWebhook");
    await processFulfillmentBestEffort(bouncedAppointment.id, RESEND_BOUNCE_ALERT_BUDGET_MS);
  }
  return { duplicate: false };
}
