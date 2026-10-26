import type Stripe from "stripe";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { closeUnsentAppointmentFulfillment, sendAppointmentRefundEmail } from "./appointmentFulfillment";
import { sendRefundConfirmationEmail, type RefundEmailContext } from "./_core/notifications";
import { emailLanguageFor } from "./emailLanguage";
import { BOOKING_PATIENT_REFUND_DEADLINE_HOURS } from "../shared/bookingPolicy";

/** A patient may obtain a full refund up to this many hours before the consultation. */
export const PATIENT_REFUND_DEADLINE_HOURS = BOOKING_PATIENT_REFUND_DEADLINE_HOURS;

/**
 * "patient": cancellation requested by the patient, subject to the 24 h rule.
 * "practitioner": cancellation or commercial gesture by the practitioner, always
 * a full refund, whatever the delay.
 */
export type RefundInitiator = "patient" | "practitioner";

export type AdminAppointmentStatus = "confirmed" | "cancelled" | "completed" | "no_show";

type Appointment = typeof appointments.$inferSelect;

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db;
}

async function loadAppointment(trackingId: string): Promise<Appointment> {
  const db = await database();
  const [appointment] = await db.select().from(appointments).where(eq(appointments.trackingId, trackingId)).limit(1);
  if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Rendez-vous introuvable" });
  return appointment;
}

/**
 * Start of the cancellation reason a dashboard refund records, one per patient
 * email; the reason typed in the dashboard follows. The refund email job reads
 * that email back from it (dashboardRefundEmailOf), the same at every attempt.
 */
const DASHBOARD_REFUND_LABELS = {
  patient: "Annulation à la demande du patient",
  practitioner_cancellation: "Annulation / remboursement par le praticien",
  practitioner_refund: "Remboursement par le praticien, statut du rendez-vous conservé",
  unconfirmed_payment: "Remboursement par le praticien d’un paiement reçu sans créneau confirmé",
} as const;
type DashboardRefundKind = keyof typeof DASHBOARD_REFUND_LABELS;

/**
 * The patient email of a refund made from the dashboard, read from the
 * cancellation reason it recorded: the practitioner's reason is given to the
 * patient, the patient's own is not. Null for any other appointment (a refund
 * recorded from Stripe has its own: stripeRecordedRefundOf).
 */
export function dashboardRefundEmailOf(appointment: Pick<Appointment, "paymentStatus" | "cancellationReason">): { context: RefundEmailContext; reason?: string } | null {
  if (appointment.paymentStatus !== "refunded") return null;
  for (const kind of Object.keys(DASHBOARD_REFUND_LABELS) as DashboardRefundKind[]) {
    const start = `${DASHBOARD_REFUND_LABELS[kind]} : `;
    if (!appointment.cancellationReason?.startsWith(start)) continue;
    if (kind === "patient") return { context: "refund" };
    return { context: kind === "practitioner_refund" ? "refund" : kind, reason: appointment.cancellationReason.slice(start.length) };
  }
  return null;
}

/** A payment received after the hold was released: recorded on the row, never confirmed. */
export function isUnconfirmedPaidAppointment(appointment: Pick<Appointment, "paymentStatus" | "appointmentStatus" | "stripePaymentIntentId">) {
  return appointment.paymentStatus === "pending" && appointment.appointmentStatus !== "held" && Boolean(appointment.stripePaymentIntentId);
}

function hoursUntil(date: Date, now = Date.now()) {
  return (date.getTime() - now) / (60 * 60 * 1000);
}

/**
 * The refund Stripe already holds for a fully refunded payment (DATA-03: an
 * earlier attempt whose database update failed, past the 24 h of its
 * idempotency key, or a refund made in Stripe): its id and the total refunded.
 */
async function existingRefund(stripe: Stripe, paymentIntentId: string): Promise<{ id: string; amount: number } | null> {
  const { data } = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  const refunds = data.filter(refund => refund.status !== "failed" && refund.status !== "canceled");
  if (!refunds.length) return null;
  return { id: refunds[0].id, amount: refunds.reduce((total, refund) => total + refund.amount, 0) };
}

/**
 * Full refund of an appointment's payment, then a patient email. A practitioner
 * refund of a confirmed appointment cancels it and frees the slot; a refund
 * after the consultation (commercial gesture) keeps its status.
 */
export async function refundAppointmentPayment(
  stripe: Stripe,
  input: { trackingId: string; reason: string; initiator: RefundInitiator },
  now = new Date(),
) {
  const db = await database();
  const appointment = await loadAppointment(input.trackingId);
  if (appointment.paymentStatus === "refunded") {
    throw new TRPCError({ code: "CONFLICT", message: "Ce rendez-vous a déjà été remboursé" });
  }
  const paid = appointment.paymentStatus === "completed" && Boolean(appointment.stripePaymentIntentId);
  const unconfirmedPayment = isUnconfirmedPaidAppointment(appointment);
  if (!paid && !unconfirmedPayment) {
    throw new TRPCError({ code: "CONFLICT", message: "Le rendez-vous n’est pas éligible au remboursement" });
  }
  if (input.initiator === "patient") {
    if (!paid || appointment.appointmentStatus !== "confirmed") {
      throw new TRPCError({ code: "CONFLICT", message: "La règle des 24 heures ne s’applique qu’à un rendez-vous payé et confirmé. Utilisez le remboursement par le praticien." });
    }
    if (hoursUntil(appointment.appointmentDate, now.getTime()) < PATIENT_REFUND_DEADLINE_HOURS) {
      throw new TRPCError({ code: "CONFLICT", message: "Le remboursement intégral à la demande du patient est possible jusqu’à 24 heures avant la consultation. Si vous annulez vous-même la consultation, utilisez « Annuler (praticien) et rembourser »." });
    }
  }

  let refund: { id: string; amount?: number | null };
  try {
    // Only stable parameters: a retry after a failure reuses the idempotency
    // key and must send exactly the same request.
    refund = await stripe.refunds.create(
      { payment_intent: appointment.stripePaymentIntentId!, metadata: { trackingId: appointment.trackingId } },
      { idempotencyKey: `refund_${appointment.trackingId}` },
    );
  } catch (error) {
    // Already refunded at Stripe: finish recording that refund (database and
    // patient email) instead of failing on every new attempt.
    const alreadyRefunded = (error as { code?: unknown } | null)?.code === "charge_already_refunded"
      ? await existingRefund(stripe, appointment.stripePaymentIntentId!).catch(() => null)
      : null;
    if (!alreadyRefunded) {
      console.error("Stripe refund error:", error instanceof Error ? error.name : "UnknownError");
      throw new TRPCError({ code: "BAD_REQUEST", message: "Le remboursement Stripe a échoué" });
    }
    console.log("Stripe payment already refunded; recording the existing refund", { trackingId: appointment.trackingId });
    refund = alreadyRefunded;
  }

  const refundAmount = ((refund.amount ?? Math.round(Number(appointment.finalPrice) * 100)) / 100).toFixed(2);
  const cancelsAppointment = appointment.appointmentStatus === "confirmed";
  // Also tells the refund email job which email to send (dashboardRefundEmailOf).
  const refundKind: DashboardRefundKind = unconfirmedPayment
    ? "unconfirmed_payment"
    : input.initiator === "patient" ? "patient" : cancelsAppointment ? "practitioner_cancellation" : "practitioner_refund";
  const recorded = await db.update(appointments).set({
    paymentStatus: "refunded",
    ...(cancelsAppointment ? { appointmentStatus: "cancelled" as const, slotKey: null } : {}),
    cancellationReason: `${DASHBOARD_REFUND_LABELS[refundKind]} : ${input.reason}`,
    cancelledAt: appointment.cancelledAt ?? now,
    refundAmount,
    refundedAt: now,
    updatedAt: now,
  }).where(and(eq(appointments.id, appointment.id), eq(appointments.paymentStatus, appointment.paymentStatus)));
  // Post-payment emails still waiting for a retry are no longer sent (EXPL-02).
  // Not recorded here: a concurrent Stripe notification recorded the refund
  // and closes them itself.
  if (mutationRowCount(recorded) === 1) {
    await closeUnsentAppointmentFulfillment(appointment.id, now)
      .catch(error => console.error("[Refund] Pending post-payment emails could not be closed", error instanceof Error ? error.name : "UnknownError"));
  }

  // The patient email goes through the queue of the refund notices (RES-06):
  // attempted right away, then retried, and shown on the appointment and in
  // « À traiter » until it goes out.
  const patientEmail = await sendAppointmentRefundEmail(appointment.id);
  return { success: true as const, refundId: refund.id, refundAmount, cancelled: cancelsAppointment, patientNotified: patientEmail === "sent", patientEmail };
}

/**
 * Status changes from the dashboard. A paid appointment is never cancelled
 * silently (refund + patient email go through refundAppointmentPayment); an
 * appointment can only be marked done or no-show once it has started, and a
 * done / no-show appointment can be put back to confirmed.
 */
export async function updateAppointmentStatusByAdmin(input: { trackingId: string; appointmentStatus: AdminAppointmentStatus }, now = new Date()) {
  const db = await database();
  const appointment = await loadAppointment(input.trackingId);
  const current = appointment.appointmentStatus;
  const target = input.appointmentStatus;
  if (current === target) return { success: true as const, unchanged: true };
  if (current === "held") {
    throw new TRPCError({ code: "CONFLICT", message: "Un paiement est en cours pour ce créneau : attendez sa confirmation ou son expiration." });
  }

  if (target === "cancelled") {
    if (appointment.paymentStatus === "completed") {
      throw new TRPCError({ code: "CONFLICT", message: "Ce rendez-vous est payé : utilisez « Annuler (praticien) et rembourser » pour rembourser et prévenir le patient." });
    }
  } else if (target === "completed" || target === "no_show") {
    if (!["confirmed", "completed", "no_show"].includes(current)) {
      throw new TRPCError({ code: "CONFLICT", message: "Seul un rendez-vous confirmé peut être marqué terminé ou absent." });
    }
    if (appointment.appointmentDate.getTime() > now.getTime()) {
      throw new TRPCError({ code: "CONFLICT", message: "Le rendez-vous n’a pas encore commencé : il ne peut pas encore être marqué terminé ou absent." });
    }
  } else if (target === "confirmed") {
    if (!["completed", "no_show"].includes(current) || appointment.paymentStatus !== "completed") {
      throw new TRPCError({ code: "CONFLICT", message: "Seul un rendez-vous payé marqué terminé ou absent peut être remis en confirmé." });
    }
  }

  const result = await db.update(appointments).set({
    appointmentStatus: target,
    ...(target === "cancelled" ? { slotKey: null, cancelledAt: now } : {}),
    updatedAt: now,
  }).where(and(eq(appointments.id, appointment.id), eq(appointments.appointmentStatus, current)));
  if (mutationRowCount(result) !== 1) {
    throw new TRPCError({ code: "CONFLICT", message: "Le rendez-vous a été modifié entre-temps. Actualisez la liste." });
  }
  return { success: true as const, unchanged: false };
}

/**
 * Refunds a paid Stripe Checkout session that could not be confirmed for its
 * appointment (session mismatch, double payment): the session id comes from
 * the owner's alert. The appointment's own confirmed payment is refused here.
 */
export async function refundUnconfirmedCheckoutSession(stripe: Stripe, input: { sessionId: string }) {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(input.sessionId);
  } catch {
    throw new TRPCError({ code: "NOT_FOUND", message: "Session de paiement Stripe introuvable" });
  }
  const trackingId = session.metadata?.trackingId;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!trackingId || session.payment_status !== "paid" || !paymentIntentId) {
    throw new TRPCError({ code: "CONFLICT", message: "Cette session Stripe n’a pas de paiement remboursable pour un rendez-vous." });
  }
  const appointment = await loadAppointment(trackingId);
  if (appointment.stripePaymentIntentId === paymentIntentId) {
    throw new TRPCError({ code: "CONFLICT", message: "Ce paiement est celui du rendez-vous : utilisez le bouton de remboursement du rendez-vous." });
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId, metadata: { trackingId, checkoutSessionId: session.id } },
      { idempotencyKey: `refund_session_${session.id}` },
    );
  } catch (error) {
    console.error("Stripe refund error:", error instanceof Error ? error.name : "UnknownError");
    throw new TRPCError({ code: "BAD_REQUEST", message: "Le remboursement Stripe a échoué" });
  }
  const refundAmount = ((refund.amount ?? session.amount_total ?? 0) / 100).toFixed(2);
  const customerEmail = session.customer_details?.email ?? session.customer_email ?? appointment.customerEmail;
  const patientNotified = await sendRefundConfirmationEmail(customerEmail, appointment.customerName, trackingId, new Date(appointment.appointmentDate), refundAmount, {
    context: "unconfirmed_payment",
    idempotencyKey: `appointment-refund-session-${session.id}`,
    language: emailLanguageFor(appointment.language),
  }).then(() => true, () => {
    console.error("Refund email delivery failed");
    return false;
  });
  console.log("Unconfirmed Stripe payment refunded", { trackingId });
  return { success: true as const, refundId: refund.id, refundAmount, trackingId, patientNotified };
}

/**
 * Corrects the patient's email of a booking from the dashboard (EXPL-02),
 * typically after the email service refused it: each post-payment or refund
 * email reads the address from the booking at every attempt, so « Renvoyer »
 * then writes to the new one. The address is already validated by the caller.
 * Never on a booking reduced to its accounting record (erasure or retention,
 * RGPD-12): its emptied address stays empty, even under a concurrent erasure.
 */
export async function updateAppointmentCustomerEmailByAdmin(input: { trackingId: string; customerEmail: string }, now = new Date()) {
  const db = await database();
  const appointment = await loadAppointment(input.trackingId);
  if (!appointment.customerEmail.trim()) {
    throw new TRPCError({ code: "CONFLICT", message: "Les données de ce patient ont été effacées (RGPD) : son adresse email ne peut plus être renseignée." });
  }
  if (appointment.customerEmail === input.customerEmail) return { success: true as const, unchanged: true };
  const result = await db.update(appointments).set({ customerEmail: input.customerEmail, updatedAt: now })
    .where(and(eq(appointments.id, appointment.id), eq(appointments.customerEmail, appointment.customerEmail)));
  if (mutationRowCount(result) !== 1) {
    throw new TRPCError({ code: "CONFLICT", message: "Le rendez-vous a été modifié entre-temps. Actualisez la liste." });
  }
  return { success: true as const, unchanged: false };
}
