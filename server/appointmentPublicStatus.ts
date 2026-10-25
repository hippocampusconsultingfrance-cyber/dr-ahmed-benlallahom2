import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * State shown on /booking/confirmation after Stripe's redirect:
 * - "confirmed": the appointment is paid and confirmed with this session;
 * - "processing": paid at Stripe but the webhook has not confirmed it yet;
 * - "attention": paid, but it could not be attached to the slot (hold
 *   released, other session): to be refunded or rescheduled ("à régulariser");
 * - "not_paid": this session was not paid;
 * - "unknown": no appointment for this reference and session.
 */
export type PublicPaymentState = "confirmed" | "processing" | "attention" | "not_paid" | "unknown";

/**
 * What the confirmation page recalls once the appointment is confirmed, and
 * nothing more: start (exact UTC instant), duration and amount paid (RES-05).
 */
export type PublicConfirmedAppointment = { appointmentDate: string; durationMinutes: number; amountEur: number };

export type PublicPaymentStatus =
  | { state: "confirmed"; appointment: PublicConfirmedAppointment }
  | { state: Exclude<PublicPaymentState, "confirmed"> };

/**
 * Keyed by the tracking reference AND the Checkout session id from the
 * success URL: a session that does not belong to the appointment reveals
 * nothing. Stripe is only asked when the database is not yet conclusive.
 */
export async function getPublicPaymentState(
  stripe: () => Stripe,
  input: { trackingId: string; sessionId: string },
): Promise<PublicPaymentStatus> {
  const db = await getDb();
  if (!db) return { state: "unknown" };
  const [appointment] = await db.select({
    trackingId: appointments.trackingId,
    paymentStatus: appointments.paymentStatus,
    appointmentStatus: appointments.appointmentStatus,
    stripeSessionId: appointments.stripeSessionId,
    appointmentDate: appointments.appointmentDate,
    duration: appointments.duration,
    finalPrice: appointments.finalPrice,
  }).from(appointments).where(eq(appointments.trackingId, input.trackingId)).limit(1);
  if (!appointment) return { state: "unknown" };

  const ownSession = appointment.stripeSessionId === input.sessionId;
  if (ownSession && appointment.paymentStatus === "completed" && ["confirmed", "completed", "no_show"].includes(appointment.appointmentStatus)) {
    return {
      state: "confirmed",
      appointment: {
        appointmentDate: appointment.appointmentDate.toISOString(),
        durationMinutes: appointment.duration,
        amountEur: Number(appointment.finalPrice),
      },
    };
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.retrieve(input.sessionId);
  } catch {
    return { state: ownSession ? "processing" : "unknown" };
  }
  if (session.metadata?.trackingId !== appointment.trackingId) return { state: "unknown" };

  if (session.payment_status === "paid") {
    const awaitingWebhook = appointment.paymentStatus === "pending"
      && appointment.appointmentStatus === "held"
      && (ownSession || !appointment.stripeSessionId);
    return { state: awaitingWebhook ? "processing" : "attention" };
  }
  // Completed without funds yet (delayed payment methods): still processing.
  if (session.status === "complete") return { state: "processing" };
  return { state: "not_paid" };
}
