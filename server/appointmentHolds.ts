import type Stripe from "stripe";
import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { handleCheckoutSessionCompleted } from "./appointmentPaymentWebhook";

/** Expired holds checked with Stripe per run (scheduled job or new booking); the rest wait for the next one. */
const EXPIRED_HOLDS_CHECKED_PER_RUN = 25;

/**
 * Stripe Checkout accepts an `expires_at` between 30 minutes and 24 hours after
 * the session is created. The hold (and the session expiry, which is the same
 * instant) is computed a moment before Stripe is called, so it keeps a margin:
 * at least 31 minutes, 32 by default.
 */
export const STRIPE_CHECKOUT_MIN_EXPIRY_MS = 31 * 60 * 1000;
export const APPOINTMENT_HOLD_MS = 32 * 60 * 1000;

/**
 * End of the temporary hold, which is also the Stripe Checkout `expires_at`:
 * never after the start of the consultation, so a session can never be paid
 * once the slot has begun. Returns null when the slot is too close to leave a
 * valid Stripe expiry: the booking must then be refused.
 */
export function getAppointmentHoldExpiry(now = new Date(), appointmentStart?: Date): Date | null {
  const latest = now.getTime() + APPOINTMENT_HOLD_MS;
  const expiresAt = appointmentStart ? Math.min(latest, appointmentStart.getTime()) : latest;
  if (expiresAt - now.getTime() < STRIPE_CHECKOUT_MIN_EXPIRY_MS) return null;
  return new Date(expiresAt);
}

/** Stripe `expires_at` (seconds) for a hold, rounded down so it never exceeds the hold. */
export function stripeExpiresAt(holdExpiresAt: Date): number {
  return Math.floor(holdExpiresAt.getTime() / 1000);
}

export function getExpiredAppointmentHoldUpdate(cancelledAt = new Date()) {
  return {
    appointmentStatus: "cancelled" as const,
    slotKey: null,
    holdExpiresAt: null,
    cancelledAt,
  };
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type ExpiredHoldOutcome = "released" | "confirmed" | "kept";

/**
 * An expired hold with a Checkout session is released only once Stripe says
 * the session can no longer be paid. A session Stripe still shows as open is
 * closed first (as cancelPending does); a paid one confirms the slot through
 * the webhook's own conditional update, so the patient who paid keeps it. If
 * Stripe cannot be asked, the hold is kept until the next run.
 */
async function settleExpiredHold(db: Database, stripe: () => Stripe, hold: { id: number; stripeSessionId: string }, now: Date): Promise<ExpiredHoldOutcome> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.retrieve(hold.stripeSessionId);
    if (session.status === "open") session = await stripe().checkout.sessions.expire(hold.stripeSessionId);
  } catch {
    // Unreachable, or the session was just paid while being closed.
    console.warn("[AppointmentHolds] Stripe session could not be checked; hold kept until the next run");
    return "kept";
  }
  if (session.payment_status === "paid") {
    try {
      const completion = await handleCheckoutSessionCompleted(session);
      return completion.outcome === "confirmed" || completion.outcome === "duplicate" ? "confirmed" : "kept";
    } catch {
      console.error("[AppointmentHolds] Paid session of an expired hold could not be confirmed; hold kept until the next run");
      return "kept";
    }
  }
  // Complete but not paid yet (delayed payment method): the webhook settles it.
  if (session.status !== "expired") return "kept";
  const result = await db.update(appointments).set(getExpiredAppointmentHoldUpdate(now)).where(and(
    eq(appointments.id, hold.id),
    eq(appointments.stripeSessionId, hold.stripeSessionId),
    eq(appointments.paymentStatus, "pending"),
    eq(appointments.appointmentStatus, "held"),
  ));
  return mutationRowCount(result) === 1 ? "released" : "kept";
}

/**
 * Releases only unpaid, temporarily held slots (EXPL-01). A hold without a
 * Checkout session can never be paid and is released at once; one with a
 * session is checked with Stripe first (see settleExpiredHold). When the
 * webhook works, `checkout.session.expired` has already released those, so
 * Stripe is only asked about holds whose webhook did not arrive. Idempotent,
 * so it can safely run from a heartbeat and immediately before a new hold.
 */
export async function releaseExpiredAppointmentHolds(stripe: () => Stripe, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("appointment_hold_database_unavailable");
  const expiredHold = and(
    eq(appointments.paymentStatus, "pending"),
    eq(appointments.appointmentStatus, "held"),
    lte(appointments.holdExpiresAt, now),
  );
  const withoutSession = await db
    .update(appointments)
    .set(getExpiredAppointmentHoldUpdate(now))
    .where(and(expiredHold, isNull(appointments.stripeSessionId)));
  const withSession = await db
    .select({ id: appointments.id, stripeSessionId: appointments.stripeSessionId })
    .from(appointments)
    .where(and(expiredHold, isNotNull(appointments.stripeSessionId)))
    .orderBy(appointments.holdExpiresAt)
    .limit(EXPIRED_HOLDS_CHECKED_PER_RUN);
  const outcomes = await Promise.all(withSession.map(hold => settleExpiredHold(db, stripe, { id: hold.id, stripeSessionId: hold.stripeSessionId! }, now)));
  const count = (outcome: ExpiredHoldOutcome) => outcomes.filter(value => value === outcome).length;
  return { released: mutationRowCount(withoutSession) + count("released"), confirmed: count("confirmed"), kept: count("kept") };
}
