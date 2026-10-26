import type Stripe from "stripe";
import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { handleCheckoutSessionCompleted } from "./appointmentPaymentWebhook";
import { notifyOwner } from "./_core/notification";

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
 * An expired hold is offered as free: booking its slot first settles it with
 * Stripe (releaseExpiredAppointmentHolds). One the cleanup had to keep (Stripe
 * did not answer, or has not settled the session yet) is held this much
 * longer, so its slot shows as taken, then checked again by the next booking
 * or run (EXPL-01).
 */
export const KEPT_HOLD_RECHECK_MS = 5 * 60 * 1000;

/**
 * A kept hold's end moves on at each run, so only the age of its booking tells
 * one Stripe has not settled for a day (payment never confirmed, long outage):
 * it is then logged at each run.
 */
const KEPT_HOLD_REPORTED_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * A booking's hold ends at most APPOINTMENT_HOLD_MS after its row is written; a
 * kept one at least STRIPE_CHECKOUT_MIN_EXPIRY_MS + KEPT_HOLD_RECHECK_MS after.
 * The two minutes between them absorb the clock difference between the app,
 * which computes the end, and the database, which stamps the creation.
 */
const CHECKOUT_HOLD_LIMIT_MINUTES = (APPOINTMENT_HOLD_MS + 2 * 60 * 1000) / 60_000;

/**
 * Hold still within its Checkout session, as opposed to one the cleanup kept
 * past it: only the former counts towards the holds of an email address and
 * the abuse thresholds (ABUS-02), as the patient or a script made it. Both
 * show their slot as taken while they last.
 */
export function holdWithinCheckoutSession() {
  return sql`${appointments.holdExpiresAt} <= ${appointments.createdAt} + ${sql.raw(`INTERVAL '${CHECKOUT_HOLD_LIMIT_MINUTES} minutes'`)}`;
}

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
type ExpiredHold = { id: number; trackingId: string; stripeSessionId: string; createdAt: Date };

/**
 * Stripe's definitive answer that the session does not exist on the account of
 * the configured key (session of the other test / live mode or of another
 * account after a key change, invalid id), as opposed to a transient failure.
 */
function isMissingStripeSession(error: unknown) {
  const { statusCode, code } = (error ?? {}) as { statusCode?: unknown; code?: unknown };
  return statusCode === 404 || code === "resource_missing";
}

function buildMissingSessionHoldAlert(input: { trackingId: string; stripeSessionId: string }) {
  return {
    title: `Réservation libérée : session Stripe introuvable (${input.trackingId})`,
    content: [
      `La réservation temporaire ${input.trackingId} a expiré et Stripe ne connaît pas sa session de paiement avec la clé actuellement configurée : elle ne peut plus être payée sur ce compte. Le créneau a été libéré.`,
      "Cela arrive après un changement de STRIPE_SECRET_KEY (mode test ou live, autre compte). Vérifiez dans l’autre mode ou compte Stripe qu’aucun paiement n’a été reçu pour cette référence ; s’il y en a un, remboursez-le ou contactez le patient.",
      `Référence : ${input.trackingId}`,
      `Session Stripe : ${input.stripeSessionId}`,
    ].join("\n"),
  };
}

async function releaseExpiredHold(db: Database, hold: ExpiredHold, now: Date) {
  const result = await db.update(appointments).set(getExpiredAppointmentHoldUpdate(now)).where(and(
    eq(appointments.id, hold.id),
    eq(appointments.stripeSessionId, hold.stripeSessionId),
    eq(appointments.paymentStatus, "pending"),
    eq(appointments.appointmentStatus, "held"),
  ));
  return mutationRowCount(result) === 1;
}

/**
 * A kept hold takes its slot for KEPT_HOLD_RECHECK_MS more, then is offered and
 * checked again. Best effort: if this write fails, the hold stays expired and
 * its slot offered, and booking it checks Stripe first all the same.
 */
async function keepExpiredHold(db: Database, hold: ExpiredHold, now: Date) {
  try {
    await db.update(appointments).set({ holdExpiresAt: new Date(now.getTime() + KEPT_HOLD_RECHECK_MS) }).where(and(
      eq(appointments.id, hold.id),
      eq(appointments.stripeSessionId, hold.stripeSessionId),
      eq(appointments.paymentStatus, "pending"),
      eq(appointments.appointmentStatus, "held"),
      lte(appointments.holdExpiresAt, now),
    ));
  } catch (error) {
    console.error("[AppointmentHolds] Kept hold could not be extended", { trackingId: hold.trackingId, error: error instanceof Error ? error.name : "UnknownError" });
  }
  if (now.getTime() - hold.createdAt.getTime() > KEPT_HOLD_REPORTED_AFTER_MS) {
    console.error("[AppointmentHolds] Hold kept for over a day; check its Stripe session and payment", { trackingId: hold.trackingId });
  }
}

/**
 * An expired hold with a Checkout session is released only once Stripe says
 * the session can no longer be paid. A session Stripe still shows as open is
 * closed first (as cancelPending does); a paid one confirms the slot through
 * the webhook's own conditional update, so the patient who paid keeps it. If
 * Stripe cannot be asked, the hold is kept (see keepExpiredHold); a session
 * Stripe does not know at all can never be paid there, so its hold is released
 * and the owner told.
 */
async function settleExpiredHold(db: Database, stripe: () => Stripe, hold: ExpiredHold, now: Date): Promise<ExpiredHoldOutcome> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.retrieve(hold.stripeSessionId);
  } catch (error) {
    if (isMissingStripeSession(error)) {
      if (!await releaseExpiredHold(db, hold, now)) return "kept";
      console.warn("[AppointmentHolds] Stripe does not know the session of an expired hold; hold released", { trackingId: hold.trackingId });
      await notifyOwner(buildMissingSessionHoldAlert(hold), { idempotencyKey: `appointment-hold-missing-session-${hold.trackingId}` }).catch(() => false);
      return "released";
    }
    // Unreachable, rate limited or not configured.
    console.warn("[AppointmentHolds] Stripe session could not be checked; hold kept until the next run", { trackingId: hold.trackingId });
    return "kept";
  }
  try {
    if (session.status === "open") session = await stripe().checkout.sessions.expire(hold.stripeSessionId);
  } catch {
    // Unreachable, or the session was just paid while being closed.
    console.warn("[AppointmentHolds] Open Stripe session could not be closed; hold kept until the next run", { trackingId: hold.trackingId });
    return "kept";
  }
  if (session.payment_status === "paid") {
    try {
      // Once the consultation time has passed, the fulfillment queue skips the
      // patient confirmation and alerts the owner instead.
      const completion = await handleCheckoutSessionCompleted(session);
      return completion.outcome === "confirmed" || completion.outcome === "duplicate" ? "confirmed" : "kept";
    } catch {
      console.error("[AppointmentHolds] Paid session of an expired hold could not be confirmed; hold kept until the next run", { trackingId: hold.trackingId });
      return "kept";
    }
  }
  // Complete but not paid yet (delayed payment method): the webhook settles it.
  if (session.status !== "expired") return "kept";
  return await releaseExpiredHold(db, hold, now) ? "released" : "kept";
}

/**
 * Releases only unpaid, temporarily held slots (EXPL-01). A hold without a
 * Checkout session can never be paid and is released at once; one with a
 * session is checked with Stripe first (see settleExpiredHold). When the
 * webhook works, `checkout.session.expired` has already released those, so
 * Stripe is only asked about holds whose webhook did not arrive. A hold kept
 * because Stripe could not settle it takes its slot a few more minutes
 * (KEPT_HOLD_RECHECK_MS). Idempotent, so it can safely run from a heartbeat and
 * immediately before a new hold.
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
    .select({ id: appointments.id, trackingId: appointments.trackingId, stripeSessionId: appointments.stripeSessionId, createdAt: appointments.createdAt })
    .from(appointments)
    .where(and(expiredHold, isNotNull(appointments.stripeSessionId)))
    .orderBy(appointments.holdExpiresAt)
    .limit(EXPIRED_HOLDS_CHECKED_PER_RUN);
  const outcomes = await Promise.all(withSession.map(async row => {
    const hold = { ...row, stripeSessionId: row.stripeSessionId! };
    const outcome = await settleExpiredHold(db, stripe, hold, now);
    if (outcome === "kept") await keepExpiredHold(db, hold, now);
    return outcome;
  }));
  const count = (outcome: ExpiredHoldOutcome) => outcomes.filter(value => value === outcome).length;
  return { released: mutationRowCount(withoutSession) + count("released"), confirmed: count("confirmed"), kept: count("kept") };
}
