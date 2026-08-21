import { and, eq, lte } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { getDb } from "./db";

export const APPOINTMENT_HOLD_MS = 30 * 60 * 1000;

export function getAppointmentHoldExpiry(now = new Date()): Date {
  return new Date(now.getTime() + APPOINTMENT_HOLD_MS);
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
  return { released: Number(result[0]?.affectedRows ?? 0) };
}
