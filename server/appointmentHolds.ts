import { and, eq, lte } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { getDb } from "./db";

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

/**
 * Releases only unpaid, temporarily held slots. The update is idempotent so it
 * can safely run from a heartbeat and immediately before creating a new hold.
 */
export async function releaseExpiredAppointmentHolds(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("appointment_hold_database_unavailable");
  const result = await db
    .update(appointments)
    .set(getExpiredAppointmentHoldUpdate(now))
    .where(and(
      eq(appointments.paymentStatus, "pending"),
      eq(appointments.appointmentStatus, "held"),
      lte(appointments.holdExpiresAt, now)
    ));
  return { released: Number(result.rowCount ?? 0) };
}
