import { and, eq, isNull, ne, or } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { enqueueAppointmentFulfillment, processAppointmentFulfillmentNow } from "./appointmentFulfillment";
import { notifyOwner } from "./_core/notification";
import { sendUnconfirmablePaymentEmail } from "./_core/notifications";
import { emailLanguageFor } from "./emailLanguage";

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

function paymentIntentIdOf(session: CheckoutSessionPayload): string | null {
  const value = session.payment_intent;
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

export function buildUnconfirmablePaymentAlert(input: {
  trackingId: string;
  reason: UnconfirmablePaymentReason;
  amountCents: number | null;
  sessionId: string;
  paymentIntentId: string | null;
  paymentStatus: string;
  appointmentStatus: string;
}) {
  const amount = input.amountCents === null ? "inconnu" : `${(input.amountCents / 100).toFixed(2)} €`;
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
 * `timeoutMs`; anything left over is retried by the scheduled job.
 */
export async function processFulfillmentBestEffort(
  appointmentId: number,
  timeoutMs = IMMEDIATE_FULFILLMENT_TIMEOUT_MS,
  processNow: (appointmentId: number) => Promise<{ processed: number }> = processAppointmentFulfillmentNow,
): Promise<{ processed: number; timedOut: boolean; failed: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = processNow(appointmentId).then(
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
      console.warn("[AppointmentFulfillment] Immediate processing still running after timeout; scheduled job will recover it if needed");
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
