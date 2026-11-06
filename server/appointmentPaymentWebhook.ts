import { and, eq, isNull, ne, or } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { closeUnsentAppointmentFulfillment, enqueueAppointmentFulfillment, enqueueStripeRefundNotices, processAppointmentFulfillmentNow } from "./appointmentFulfillment";
import { notifyOwner } from "./_core/notification";
import { formatPatientAmount, sendUnconfirmablePaymentEmail } from "./_core/notifications";
import { emailLanguageFor } from "./emailLanguage";
import { isUnconfirmedPaidAppointment } from "./appointmentAdminActions";

/** Keeps the Stripe acknowledgement well inside Stripe's delivery timeout. */
export const IMMEDIATE_FULFILLMENT_TIMEOUT_MS = 15_000;

type Appointment = typeof appointments.$inferSelect;

export type CheckoutSessionPayload = {
  id?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  payment_intent?: unknown;
  metadata?: { trackingId?: unknown } | null;
};

export type CheckoutCompletionResult = {
  httpStatus: 200 | 400 | 500;
  body: Record<string, unknown>;
  outcome:
    | "missing_reference"
    | "payment_not_paid"
    | "appointment_not_found"
    | "duplicate"
    | "amount_mismatch"
    | "confirmed"
    | "unconfirmable";
};

export type UnconfirmablePaymentReason = "session_mismatch" | "already_paid_other_session" | "hold_released";

const INVALID_WEBHOOK = { error: "Invalid webhook" } as const;

function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function paymentIntentIdOf(payment: { payment_intent?: unknown }): string | null {
  const value = payment.payment_intent;
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

function sessionMatchesAppointment(appointment: Pick<Appointment, "stripeSessionId">, sessionId: string) {
  return !appointment.stripeSessionId || appointment.stripeSessionId === sessionId;
}

const UNCONFIRMABLE_REASON_LABELS: Record<UnconfirmablePaymentReason, string> = {
  session_mismatch: "la session de paiement Stripe ne correspond pas à celle enregistrée pour ce rendez-vous",
  already_paid_other_session: "le rendez-vous était déjà réglé par une autre session de paiement (double paiement possible)",
  hold_released: "la réservation temporaire du créneau a expiré ou a été annulée avant la réception du paiement ; le créneau a pu être attribué à un autre patient",
};

/** French amount of the owner alerts, written as in the patient emails (« 100,00 € »). */
function formatAlertAmount(cents: number | null) {
  return cents === null ? "inconnu" : formatPatientAmount(cents / 100);
}

export function buildUnconfirmablePaymentAlert(input: {
  trackingId: string;
  reason: UnconfirmablePaymentReason;
  amountCents: number | null;
  sessionId: string;
  paymentIntentId: string | null;
  paymentStatus: string;
  appointmentStatus: string;
}) {
  const amount = formatAlertAmount(input.amountCents);
  return {
    title: `Paiement reçu pour un rendez-vous non confirmable (${input.trackingId})`,
    content: [
      `Un paiement Stripe a été reçu pour le rendez-vous ${input.trackingId}, mais il n’a pas pu être confirmé automatiquement : ${UNCONFIRMABLE_REASON_LABELS[input.reason]}.`,
      "Remboursement ou reprogrammation manuelle requis : contactez le patient, puis remboursez ce paiement depuis le tableau de bord du site (onglet Rendez-vous : « Rembourser un paiement non confirmé » avec la session Stripe ci-dessous, ou bouton « Rembourser ce paiement » sur le rendez-vous) ou depuis Stripe.",
      `Référence : ${input.trackingId}`,
      `Montant reçu : ${amount}`,
      `Session Stripe : ${input.sessionId}`,
      `Paiement Stripe (PaymentIntent) : ${input.paymentIntentId ?? "non communiqué"}`,
      `État actuel du rendez-vous : paiement ${input.paymentStatus}, statut ${input.appointmentStatus}.`,
    ].join("\n"),
  };
}

/**
 * Best-effort immediate delivery of the confirmation and invoice. It reuses the
 * exact claim of the scheduled worker, never rejects, and stops waiting after
 * `timeoutMs`; anything left over is retried by the scheduled job. The jobs
 * share that budget (ABUS-03): past a first wait for Resend, one that would
 * wait beyond its share goes back to the queue, without counting the attempt,
 * instead of holding back the next ones.
 */
export async function processFulfillmentBestEffort(
  appointmentId: number,
  timeoutMs = IMMEDIATE_FULFILLMENT_TIMEOUT_MS,
  processNow: (appointmentId: number, options: { deadlineAt: number }) => Promise<{ processed: number }> = processAppointmentFulfillmentNow,
): Promise<{ processed: number; timedOut: boolean; failed: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = processNow(appointmentId, { deadlineAt: Date.now() + timeoutMs }).then(
    result => ({ processed: result.processed, timedOut: false, failed: false }),
    error => {
      console.error("[AppointmentFulfillment] Immediate processing failed; left for scheduled retry", safeErrorName(error));
      return { processed: 0, timedOut: false, failed: true };
    },
  );
  const timeout = new Promise<{ processed: number; timedOut: boolean; failed: boolean }>(resolve => {
    timer = setTimeout(() => resolve({ processed: 0, timedOut: true, failed: false }), timeoutMs);
  });
  try {
    const outcome = await Promise.race([work, timeout]);
    if (outcome.timedOut) {
      // No job starts past the budget: one already started may still finish its
      // send; the others stay due, untried, for the next processing.
      console.warn("[AppointmentFulfillment] Immediate processing budget spent; emails not sent yet stay queued for the next processing (webhook, payment status page, scheduled run or « Renvoyer »)");
    }
    return outcome;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function acknowledgeUnconfirmablePayment(input: {
  appointment: Appointment;
  reason: UnconfirmablePaymentReason;
  session: CheckoutSessionPayload;
  sessionId: string;
  paymentIntentId: string | null;
}): Promise<CheckoutCompletionResult> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const paidAmount = Number(input.session.amount_total);
  const alert = buildUnconfirmablePaymentAlert({
    trackingId: input.appointment.trackingId,
    reason: input.reason,
    amountCents: Number.isFinite(paidAmount) ? paidAmount : null,
    sessionId: input.sessionId,
    paymentIntentId: input.paymentIntentId,
    paymentStatus: input.appointment.paymentStatus,
    appointmentStatus: input.appointment.appointmentStatus,
  });
  console.error("Stripe payment received for an appointment that cannot be confirmed", {
    trackingId: input.appointment.trackingId,
    reason: input.reason,
  });
  const delivered = await notifyOwner(alert).catch(() => false);
  if (!delivered) {
    // The alert is the only signal that money arrived without a confirmed
    // appointment: answer 5xx so Stripe redelivers (and flags the failing
    // webhook) instead of acknowledging a payment nobody was told about.
    console.error("Owner alert for unconfirmable payment was not delivered; asking Stripe to retry", { trackingId: input.appointment.trackingId });
    return { httpStatus: 500, body: { received: false }, outcome: "unconfirmable" };
  }
  // The patient learns that the payment arrived but the slot could not be
  // confirmed (the success page shows the same); best effort, one email per
  // Checkout session.
  await sendUnconfirmablePaymentEmail(input.appointment.customerEmail, {
    customerName: input.appointment.customerName,
    trackingId: input.appointment.trackingId,
    appointmentDate: input.appointment.appointmentDate,
    amountCents: Number.isFinite(paidAmount) ? paidAmount : null,
    language: emailLanguageFor(input.appointment.language),
  }, `appointment-unconfirmable-${input.sessionId}`).catch(() => false);
  // Keep a durable trace of the received payment on the row when it cannot
  // clash with an active hold or an already recorded payment. Written only once
  // the owner knows: it makes later deliveries of this payment no-op duplicates.
  if (input.paymentIntentId) {
    await db.update(appointments)
      .set({ stripePaymentIntentId: input.paymentIntentId })
      .where(and(
        eq(appointments.id, input.appointment.id),
        isNull(appointments.stripePaymentIntentId),
        eq(appointments.paymentStatus, "pending"),
        ne(appointments.appointmentStatus, "held"),
      ));
  }
  return { httpStatus: 200, body: { received: true, confirmed: false, manualReviewRequired: true }, outcome: "unconfirmable" };
}

async function fulfill(appointmentId: number, timeoutMs: number) {
  // Persisted fulfillment is idempotent. Re-enqueueing on a Stripe retry
  // protects a payment whose previous acknowledgement failed after the DB update.
  await enqueueAppointmentFulfillment(appointmentId);
  await processFulfillmentBestEffort(appointmentId, timeoutMs);
}

/**
 * Handles a signed `checkout.session.completed` event. Database and queue
 * errors propagate so the caller answers 500 and Stripe retries the delivery.
 */
export async function handleCheckoutSessionCompleted(
  session: CheckoutSessionPayload,
  options: { fulfillmentTimeoutMs?: number } = {},
): Promise<CheckoutCompletionResult> {
  const timeoutMs = options.fulfillmentTimeoutMs ?? IMMEDIATE_FULFILLMENT_TIMEOUT_MS;
  const trackingId = typeof session.metadata?.trackingId === "string" ? session.metadata.trackingId : "";
  const sessionId = typeof session.id === "string" ? session.id : "";
  if (!trackingId || !sessionId) {
    console.error("Stripe webhook rejected: missing appointment reference");
    return { httpStatus: 400, body: INVALID_WEBHOOK, outcome: "missing_reference" };
  }

  if (session.payment_status !== "paid") {
    console.warn("Stripe checkout completed without a paid status; appointment left pending");
    return { httpStatus: 200, body: { received: true, confirmed: false }, outcome: "payment_not_paid" };
  }

  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [appointment] = await db.select().from(appointments).where(eq(appointments.trackingId, trackingId)).limit(1);
  if (!appointment) {
    console.error("Stripe webhook rejected: appointment not found");
    return { httpStatus: 400, body: INVALID_WEBHOOK, outcome: "appointment_not_found" };
  }

  const paymentIntentId = paymentIntentIdOf(session);
  if (appointment.paymentStatus === "completed") {
    if (!sessionMatchesAppointment(appointment, sessionId)) {
      return acknowledgeUnconfirmablePayment({ appointment, reason: "already_paid_other_session", session, sessionId, paymentIntentId });
    }
    await fulfill(appointment.id, timeoutMs);
    return { httpStatus: 200, body: { received: true, duplicate: true }, outcome: "duplicate" };
  }

  // This exact payment was already handled (refunded, or flagged for manual review).
  if (paymentIntentId && appointment.stripePaymentIntentId === paymentIntentId) {
    return { httpStatus: 200, body: { received: true, duplicate: true }, outcome: "duplicate" };
  }

  const paidAmount = Number(session.amount_total);
  const expectedAmount = Math.round(Number(appointment.finalPrice) * 100);
  if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) {
    console.error("Stripe webhook rejected: amount mismatch");
    return { httpStatus: 400, body: INVALID_WEBHOOK, outcome: "amount_mismatch" };
  }

  if (!sessionMatchesAppointment(appointment, sessionId)) {
    return acknowledgeUnconfirmablePayment({ appointment, reason: "session_mismatch", session, sessionId, paymentIntentId });
  }

  // Only a still-pending, still-held slot may be confirmed: a late payment for
  // an expired or cancelled hold must never take back a slot given to someone else.
  const confirmation = await db
    .update(appointments)
    .set({
      paymentStatus: "completed",
      appointmentStatus: "confirmed",
      holdExpiresAt: null,
      stripeSessionId: sessionId,
      stripePaymentIntentId: paymentIntentId,
    })
    .where(and(
      eq(appointments.id, appointment.id),
      eq(appointments.paymentStatus, "pending"),
      eq(appointments.appointmentStatus, "held"),
      or(isNull(appointments.stripeSessionId), eq(appointments.stripeSessionId, sessionId)),
    ));

  if (mutationRowCount(confirmation) === 1) {
    console.log("Payment confirmed for appointment");
    await fulfill(appointment.id, timeoutMs);
    return { httpStatus: 200, body: { received: true }, outcome: "confirmed" };
  }

  // The row changed since it was read: either a concurrent delivery of this
  // same event confirmed it, or the hold was released in the meantime.
  const [current] = await db.select().from(appointments).where(eq(appointments.id, appointment.id)).limit(1);
  if (current?.paymentStatus === "completed" && current.stripeSessionId === sessionId) {
    await fulfill(current.id, timeoutMs);
    return { httpStatus: 200, body: { received: true, duplicate: true }, outcome: "duplicate" };
  }
  const latest = current ?? appointment;
  const reason: UnconfirmablePaymentReason = latest.paymentStatus === "completed"
    ? "already_paid_other_session"
    : sessionMatchesAppointment(latest, sessionId) ? "hold_released" : "session_mismatch";
  return acknowledgeUnconfirmablePayment({
    appointment: latest,
    reason,
    session,
    sessionId,
    paymentIntentId,
  });
}

export type ChargePayload = {
  id?: unknown;
  amount?: unknown;
  amount_refunded?: unknown;
  refunded?: unknown;
  payment_intent?: unknown;
};

export type DisputePayload = {
  id?: unknown;
  amount?: unknown;
  reason?: unknown;
  status?: unknown;
  payment_intent?: unknown;
  evidence_details?: { due_by?: unknown } | null;
};

export type ChargeEventResult = {
  httpStatus: 200 | 500;
  body: Record<string, unknown>;
  outcome: "not_attached" | "duplicate" | "partial_refund" | "refunded" | "changed_concurrently" | "dispute_reported" | "alert_not_delivered";
};

/** Recorded on an appointment whose refund reached the site only through Stripe's notification. */
export const STRIPE_REFUND_CANCELLATION_REASON = "Remboursement constaté chez Stripe (fait hors du tableau de bord du site, ou enregistrement interrompu)";
/** Same, for a payment never attached to a confirmed slot: the patient email then says so. */
export const STRIPE_UNCONFIRMED_REFUND_CANCELLATION_REASON = "Remboursement constaté chez Stripe d’un paiement reçu sans créneau confirmé (fait hors du tableau de bord du site, ou enregistrement interrompu)";

/**
 * The payment that a refund recorded from Stripe's notification was for: a
 * paid appointment, or a payment never attached to a confirmed slot. Null for
 * a refund made from the dashboard, whose patient email the refund job reads
 * from dashboardRefundEmailOf (EXPL-02).
 */
export function stripeRecordedRefundOf(appointment: Pick<Appointment, "paymentStatus" | "cancellationReason">): "paid" | "unconfirmed" | null {
  if (appointment.paymentStatus !== "refunded") return null;
  if (appointment.cancellationReason === STRIPE_REFUND_CANCELLATION_REASON) return "paid";
  return appointment.cancellationReason === STRIPE_UNCONFIRMED_REFUND_CANCELLATION_REASON ? "unconfirmed" : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatAlertDate(date: Date) {
  return date.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });
}

export function buildStripeRefundAlert(input: {
  trackingId: string;
  refundAmount: string;
  paymentIntentId: string;
  effect: "cancelled" | "status_kept" | "unconfirmed_payment";
  appointmentStatus: string;
  /** The patient's refund email: sent, refused by the email service (not passing), or still to send. */
  patientEmail: "sent" | "refused" | "pending";
  /** Booking reduced to its accounting record (RGPD-12): no email was sent, none will be. */
  patientDataErased?: boolean;
}) {
  const effect = input.effect === "cancelled"
    ? "Le rendez-vous a été annulé et son créneau libéré ; aucun rappel ne sera envoyé."
    : input.effect === "unconfirmed_payment"
      ? "Ce paiement n’était rattaché à aucun créneau confirmé : il est marqué remboursé."
      : `Le statut du rendez-vous (${input.appointmentStatus}) est conservé ; seul le paiement est marqué remboursé.`;
  return {
    title: `Remboursement constaté chez Stripe (${input.trackingId})`,
    content: [
      `Stripe signale le remboursement intégral du paiement du rendez-vous ${input.trackingId} (${formatPatientAmount(input.refundAmount)}), qui n’était pas encore enregistré sur le site. Il vient de l’être.`,
      effect,
      input.patientDataErased
        ? "Données du patient effacées (RGPD) : il n’est plus joignable par le site et n’a pas été prévenu du remboursement par email."
        : input.patientEmail === "sent"
          ? "Le patient a été prévenu du remboursement par email."
          : input.patientEmail === "refused"
            ? "L’email de remboursement au patient a été refusé par le service d’envoi (adresse email du patient refusée ou invalide, ou contenu de l’email refusé). Ce refus n’est pas passager et le site ne le renverra pas de lui-même : prévenez le patient directement ; corrigez son adresse sur le rendez-vous (onglet Réservations, « Corriger l’email du patient »), puis « Renvoyer » l’envoie à la nouvelle adresse."
          : "L’email de remboursement au patient n’est pas encore parti : le site le renvoie automatiquement (état visible sur le rendez-vous, onglet Réservations, et dans « À traiter »). Vous pouvez aussi prévenir le patient directement.",
      `Référence : ${input.trackingId}`,
      `Paiement Stripe (PaymentIntent) : ${input.paymentIntentId}`,
    ].join("\n"),
  };
}

export function buildPartialRefundAlert(input: { trackingId: string; refundedCents: number | null; amountCents: number | null; paymentIntentId: string }) {
  return {
    title: `Remboursement partiel fait depuis Stripe (${input.trackingId})`,
    content: [
      `Stripe signale un remboursement partiel du paiement du rendez-vous ${input.trackingId} : ${formatAlertAmount(input.refundedCents)} remboursés au total, sur ${formatAlertAmount(input.amountCents)} payés.`,
      "Le rendez-vous reste payé et son statut est inchangé ; le site n’a envoyé aucun email au patient. Si la consultation doit être annulée, remboursez le solde : le site enregistrera alors le remboursement intégral.",
      `Référence : ${input.trackingId}`,
      `Paiement Stripe (PaymentIntent) : ${input.paymentIntentId}`,
    ].join("\n"),
  };
}

export function buildDisputeAlert(input: {
  disputeId: string;
  amountCents: number | null;
  reason: string | null;
  status: string | null;
  dueBy: Date | null;
  paymentIntentId: string | null;
  appointment: Pick<Appointment, "trackingId" | "paymentStatus" | "appointmentStatus" | "appointmentDate"> | null;
}) {
  const amount = formatAlertAmount(input.amountCents);
  const appointment = input.appointment;
  // An inquiry (warning_* status) withdraws nothing yet; unanswered, it can become a chargeback.
  const funds = input.status?.startsWith("warning_")
    ? `Il s’agit pour l’instant d’une demande d’information de la banque (pré-litige) : aucun montant n’est retenu sur votre compte (paiement de ${amount}), mais sans réponse elle peut devenir un litige.`
    : `Stripe retient ${amount} sur votre compte jusqu’à l’issue du litige.`;
  return {
    title: `Contestation bancaire d’un paiement (${appointment?.trackingId ?? input.paymentIntentId ?? input.disputeId})`,
    content: [
      appointment
        ? `Le titulaire de la carte conteste auprès de sa banque le paiement du rendez-vous ${appointment.trackingId}. ${funds}`
        : `Le titulaire de la carte conteste auprès de sa banque un paiement Stripe rattaché à aucun rendez-vous du site. ${funds}`,
      `Motif indiqué par la banque : ${input.reason ?? "non communiqué"}.`,
      input.dueBy
        ? `Répondez depuis le tableau de bord Stripe (Paiements > Litiges) avant le ${formatAlertDate(input.dueBy)} (heure de Paris), avec les éléments utiles : confirmation de réservation, échanges avec le patient, déroulement de la consultation.`
        : "Stripe n’indique pas de date limite de réponse : consultez le litige dans le tableau de bord Stripe (Paiements > Litiges).",
      ...(appointment
        ? [
            "Le rendez-vous n’est pas modifié automatiquement : décidez s’il est maintenu.",
            `État actuel du rendez-vous : paiement ${appointment.paymentStatus}, statut ${appointment.appointmentStatus}, consultation prévue le ${formatAlertDate(appointment.appointmentDate)}.`,
          ]
        : []),
      `Litige Stripe : ${input.disputeId}`,
      `Paiement Stripe (PaymentIntent) : ${input.paymentIntentId ?? "non communiqué"}`,
    ].join("\n"),
  };
}

async function findAppointmentByPaymentIntent(paymentIntentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [appointment] = await db.select().from(appointments).where(eq(appointments.stripePaymentIntentId, paymentIntentId)).limit(1);
  return { db, appointment };
}

/**
 * The patient email and the owner alert of a refund recorded from Stripe go
 * through the post-payment queue (RES-06): attempted right away, then retried,
 * and shown on the appointment and in « À traiter » while they fail, instead
 * of being lost when the email provider is down. Queuing is idempotent.
 */
async function sendStripeRefundNotices(appointmentId: number) {
  await enqueueStripeRefundNotices(appointmentId);
  await processFulfillmentBestEffort(appointmentId);
}

/**
 * Handles a signed `charge.refunded` event: a full refund made in Stripe (or
 * one the dashboard could not finish recording) is applied to the appointment
 * found by its PaymentIntent, with the same effect as a dashboard refund. The
 * conditional UPDATE makes it idempotent: a replay, or the event of a refund
 * the dashboard already recorded, changes nothing and sends nothing.
 */
export async function handleChargeRefunded(charge: ChargePayload, now = new Date()): Promise<ChargeEventResult> {
  const paymentIntentId = paymentIntentIdOf(charge);
  if (!paymentIntentId) return { httpStatus: 200, body: { received: true }, outcome: "not_attached" };
  const { db, appointment } = await findAppointmentByPaymentIntent(paymentIntentId);
  // A payment never attached to the row (second payment of a booking) is
  // refunded from the dashboard, which emails the patient itself.
  if (!appointment) return { httpStatus: 200, body: { received: true }, outcome: "not_attached" };
  if (appointment.paymentStatus === "refunded") {
    // Recorded by an earlier delivery of this notification, which may have
    // failed right after the update: its notices are queued again (no new job
    // when they exist, nothing sent twice). A dashboard refund sends its own.
    if (stripeRecordedRefundOf(appointment)) await sendStripeRefundNotices(appointment.id);
    return { httpStatus: 200, body: { received: true, duplicate: true }, outcome: "duplicate" };
  }
  const paid = appointment.paymentStatus === "completed";
  if (!paid && !isUnconfirmedPaidAppointment(appointment)) return { httpStatus: 200, body: { received: true }, outcome: "not_attached" };

  const refundedCents = finiteNumber(charge.amount_refunded);
  if (charge.refunded !== true) {
    // Partial refund (gesture made in Stripe): the site only records full
    // refunds, so the appointment stays paid and the owner is told once. The
    // alert is the only trace of it: Stripe redelivers until it goes out.
    const delivered = await notifyOwner(
      buildPartialRefundAlert({ trackingId: appointment.trackingId, refundedCents, amountCents: finiteNumber(charge.amount), paymentIntentId }),
      { idempotencyKey: `appointment-partial-refund-${appointment.trackingId}-${refundedCents ?? "unknown"}` },
    ).catch(() => false);
    if (!delivered) {
      console.error("Owner alert for a partial Stripe refund was not delivered; asking Stripe to retry", { trackingId: appointment.trackingId });
      return { httpStatus: 500, body: { received: false }, outcome: "alert_not_delivered" };
    }
    return { httpStatus: 200, body: { received: true, partial: true }, outcome: "partial_refund" };
  }

  const refundAmount = (refundedCents === null ? Number(appointment.finalPrice) : refundedCents / 100).toFixed(2);
  const cancelsAppointment = paid && appointment.appointmentStatus === "confirmed";
  const result = await db.update(appointments).set({
    paymentStatus: "refunded",
    ...(cancelsAppointment ? { appointmentStatus: "cancelled" as const, slotKey: null } : {}),
    // Also tells the queued notices which payment this was (stripeRecordedRefundOf).
    cancellationReason: paid ? STRIPE_REFUND_CANCELLATION_REASON : STRIPE_UNCONFIRMED_REFUND_CANCELLATION_REASON,
    cancelledAt: appointment.cancelledAt ?? now,
    refundAmount,
    refundedAt: now,
    updatedAt: now,
  }).where(and(
    eq(appointments.id, appointment.id),
    eq(appointments.stripePaymentIntentId, paymentIntentId),
    eq(appointments.paymentStatus, appointment.paymentStatus),
    eq(appointments.appointmentStatus, appointment.appointmentStatus),
  ));
  if (mutationRowCount(result) !== 1) {
    // Changed since it was read: recorded meanwhile by a concurrent delivery or
    // by the dashboard (nothing left to do), or another change: Stripe retries.
    const [current] = await db.select().from(appointments).where(eq(appointments.id, appointment.id)).limit(1);
    if (current?.paymentStatus === "refunded") return { httpStatus: 200, body: { received: true, duplicate: true }, outcome: "duplicate" };
    return { httpStatus: 500, body: { received: false }, outcome: "changed_concurrently" };
  }
  console.log("Stripe refund recorded for appointment", { trackingId: appointment.trackingId });
  // As for a dashboard refund: post-payment emails still waiting for a retry are no longer sent (EXPL-02).
  await closeUnsentAppointmentFulfillment(appointment.id, now)
    .catch(error => console.error("[Stripe] Pending post-payment emails could not be closed", error instanceof Error ? error.name : "UnknownError"));

  // A queuing failure answers 500: the redelivery finds the refund recorded and queues them again.
  await sendStripeRefundNotices(appointment.id);
  return { httpStatus: 200, body: { received: true, refunded: true }, outcome: "refunded" };
}

/**
 * Handles a signed `charge.dispute.created` event: the owner is alerted, with
 * the deadline to answer in Stripe, once per dispute. The appointment is left
 * as it is, since the dispute may be won. Answers 5xx while the alert cannot be
 * delivered, so that Stripe redelivers: it is the only trace of the dispute.
 */
export async function handleChargeDisputeCreated(dispute: DisputePayload): Promise<ChargeEventResult> {
  const disputeId = typeof dispute.id === "string" ? dispute.id : "unknown";
  const paymentIntentId = paymentIntentIdOf(dispute);
  const appointment = paymentIntentId ? (await findAppointmentByPaymentIntent(paymentIntentId)).appointment ?? null : null;
  // 0 when the bank does not accept a response.
  const dueBySeconds = finiteNumber(dispute.evidence_details?.due_by);
  const delivered = await notifyOwner(buildDisputeAlert({
    disputeId,
    amountCents: finiteNumber(dispute.amount),
    reason: typeof dispute.reason === "string" ? dispute.reason : null,
    status: typeof dispute.status === "string" ? dispute.status : null,
    dueBy: dueBySeconds ? new Date(dueBySeconds * 1000) : null,
    paymentIntentId,
    appointment,
  }), { idempotencyKey: `stripe-dispute-${disputeId}` }).catch(() => false);
  if (!delivered) {
    console.error("Owner alert for a Stripe dispute was not delivered; asking Stripe to retry", { disputeId });
    return { httpStatus: 500, body: { received: false }, outcome: "alert_not_delivered" };
  }
  return { httpStatus: 200, body: { received: true }, outcome: "dispute_reported" };
}
