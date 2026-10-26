import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { getDb } from "./db";
import { handleCheckoutSessionCompleted } from "./appointmentPaymentWebhook";

/**
 * State shown on /booking/confirmation after Stripe's redirect:
 * - "confirmed": the appointment is paid and confirmed with this session;
 * - "processing": paid at Stripe but not confirmed yet (confirmation failed
 *   for now, or the session is complete without funds yet);
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

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * How long the page waits for the post-payment emails it starts (EXPL-01):
 * the owner notification, sent first, and the patient's confirmation go out
 * within it even when the webhook never comes, through one passing rate limit
 * of Resend as well (a new try after its retry-after). The invoice usually
 * follows just after, in the same processing; an email that would have to
 * wait past it goes back to the queue, and a job whose turn comes after it
 * does not start: both stay due for the webhook, the scheduled job or
 * « Renvoyer ». Tests shorten it.
 */
export const paymentStatusPageFulfillment = { timeoutMs: 3_000 };

async function readAppointment(db: Database, trackingId: string) {
  const [appointment] = await db.select({
    trackingId: appointments.trackingId,
    paymentStatus: appointments.paymentStatus,
    appointmentStatus: appointments.appointmentStatus,
    stripeSessionId: appointments.stripeSessionId,
    appointmentDate: appointments.appointmentDate,
    duration: appointments.duration,
    finalPrice: appointments.finalPrice,
  }).from(appointments).where(eq(appointments.trackingId, trackingId)).limit(1);
  return appointment;
}

function confirmedStatus(appointment: Awaited<ReturnType<typeof readAppointment>>, sessionId: string): PublicPaymentStatus | null {
  if (!appointment || appointment.stripeSessionId !== sessionId) return null;
  if (appointment.paymentStatus !== "completed" || !["confirmed", "completed", "no_show"].includes(appointment.appointmentStatus)) return null;
  return {
    state: "confirmed",
    appointment: {
      appointmentDate: appointment.appointmentDate.toISOString(),
      durationMinutes: appointment.duration,
      amountEur: Number(appointment.finalPrice),
    },
  };
}

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
  const appointment = await readAppointment(db, input.trackingId);
  if (!appointment) return { state: "unknown" };

  const ownSession = appointment.stripeSessionId === input.sessionId;
  const confirmed = confirmedStatus(appointment, input.sessionId);
  if (confirmed) return confirmed;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.retrieve(input.sessionId);
  } catch {
    return { state: ownSession ? "processing" : "unknown" };
  }
  if (session.metadata?.trackingId !== appointment.trackingId) return { state: "unknown" };

  if (session.payment_status === "paid") {
    const stillHeld = appointment.paymentStatus === "pending"
      && appointment.appointmentStatus === "held"
      && (ownSession || !appointment.stripeSessionId);
    if (!stillHeld) return { state: "attention" };
    // Stripe has just said this session is paid: confirm the slot now instead
    // of waiting for the webhook (EXPL-01). Same conditional update as the
    // webhook, so whichever comes first confirms, once, and the confirmation
    // and invoice go through the same idempotent queue, stored before the
    // emails are tried. The page waits for them a few seconds only, not the
    // webhook's 15: whatever is left goes on with the webhook or the scheduled job.
    try {
      const completion = await handleCheckoutSessionCompleted(session, { fulfillmentTimeoutMs: paymentStatusPageFulfillment.timeoutMs });
      if (completion.outcome === "unconfirmable") return { state: "attention" };
    } catch (error) {
      console.error("Confirmation from the payment status page failed; left to the webhook", error instanceof Error ? error.name : "UnknownError");
      return { state: "processing" };
    }
    return confirmedStatus(await readAppointment(db, input.trackingId), input.sessionId) ?? { state: "processing" };
  }
  // Completed without funds yet (delayed payment methods): still processing.
  if (session.status === "complete") return { state: "processing" };
  return { state: "not_paid" };
}
