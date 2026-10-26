import { and, eq, gt, gte, inArray } from "drizzle-orm";
import { appointments, securityEvents } from "../drizzle/schema";
import { APPOINTMENT_HOLD_MS } from "./appointmentHolds";
import { logSecurityEvent, recordPersistentRateLimitAttempt } from "./candidateSecurity";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";

/**
 * ABUS-02: the booking keeps no anti-robot check on its normal path. Once this
 * many slots are held without payment, the owner is alerted (at most once a
 * day) and every new booking must pass Turnstile before its Stripe session;
 * a network that already holds HELD_SLOTS_PER_IP_CHALLENGE_THRESHOLD slots
 * must pass it too. Holds keep their duration and stay shown as taken.
 */
export const HELD_SLOTS_ALERT_THRESHOLD = 6;
export const HELD_SLOTS_PER_IP_CHALLENGE_THRESHOLD = 2;

/** Security event recorded for each hold with the network's hash, to count a network's holds. */
const HOLD_CREATED_CATEGORY = "public_booking_hold_created";
const DAY_MS = 24 * 60 * 60 * 1000;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function heldUnpaid(now: Date) {
  return and(eq(appointments.paymentStatus, "pending"), eq(appointments.appointmentStatus, "held"), gt(appointments.holdExpiresAt, now));
}

function holdTrackingId(metadata: string | null): string | null {
  try {
    const trackingId = metadata ? (JSON.parse(metadata) as { trackingId?: unknown }).trackingId : null;
    return typeof trackingId === "string" ? trackingId : null;
  } catch {
    return null;
  }
}

async function notifyOwnerOfHeldSlots() {
  const slot = await recordPersistentRateLimitAttempt({ action: "booking_held_slots_alert", subject: "global", maxAttempts: 1, windowMs: DAY_MS, blockMs: DAY_MS });
  if (slot.blocked) return;
  await notifyOwner({
    title: `Réservations : au moins ${HELD_SLOTS_ALERT_THRESHOLD} créneaux retenus sans paiement`,
    content: [
      `Au moins ${HELD_SLOTS_ALERT_THRESHOLD} créneaux sont retenus en attente de paiement en même temps. Chaque maintien dure une trentaine de minutes ; un tel nombre peut signaler un blocage volontaire de l’agenda.`,
      "Tant que ce nombre reste élevé, chaque nouvelle réservation passe par la vérification anti-robot avant le paiement ; les patients peuvent toujours réserver.",
      "Vérifiez les réservations en attente dans l’administration. En cas d’attaque, activez l’Attack Challenge Mode du pare-feu Vercel. Cette alerte n’est envoyée qu’une fois par jour.",
    ].join("\n\n"),
  });
}

/**
 * Whether this booking must pass the anti-robot check: as many unpaid holds as
 * the threshold (the new one would exceed it), or this network already holding
 * two slots. Without an identifiable IP only the overall count applies.
 */
export async function bookingChallengeRequired(db: Database, ipHash: string | null, now = new Date()): Promise<boolean> {
  const heldSlots = await db.select({ id: appointments.id }).from(appointments).where(heldUnpaid(now)).limit(HELD_SLOTS_ALERT_THRESHOLD);
  if (heldSlots.length >= HELD_SLOTS_ALERT_THRESHOLD) {
    await notifyOwnerOfHeldSlots().catch((error: unknown) => console.error("booking_held_slots_alert_failed", error instanceof Error ? error.name : "UnknownError"));
    return true;
  }
  if (!ipHash) return false;
  // A hold never outlives APPOINTMENT_HOLD_MS: older events cannot name a held slot.
  const recentHolds = await db.select({ metadata: securityEvents.metadata }).from(securityEvents).where(and(
    eq(securityEvents.category, HOLD_CREATED_CATEGORY),
    eq(securityEvents.ipHash, ipHash),
    gte(securityEvents.createdAt, new Date(now.getTime() - APPOINTMENT_HOLD_MS)),
  )).limit(50);
  const trackingIds = recentHolds.map(event => holdTrackingId(event.metadata)).filter((trackingId): trackingId is string => Boolean(trackingId));
  if (trackingIds.length < HELD_SLOTS_PER_IP_CHALLENGE_THRESHOLD) return false;
  const stillHeld = await db.select({ id: appointments.id }).from(appointments)
    .where(and(heldUnpaid(now), inArray(appointments.trackingId, trackingIds)))
    .limit(HELD_SLOTS_PER_IP_CHALLENGE_THRESHOLD);
  return stillHeld.length >= HELD_SLOTS_PER_IP_CHALLENGE_THRESHOLD;
}

/** Records the network that holds a new slot (nothing without an identifiable IP). */
export async function recordBookingHold(ipHash: string | null, trackingId: string) {
  if (!ipHash) return;
  await logSecurityEvent({ actorKind: "anonymous", category: HOLD_CREATED_CATEGORY, outcome: "allowed", severity: "info", ipHash, metadata: { trackingId } });
}
