import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointments, securityEvents } from "../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "./testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// ABUS-02 : quand la réservation demande l’anti-robot, et l’alerte au propriétaire.
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async (_payload: { title: string; content: string }) => true) }));

const { bookingChallengeRequired, HELD_SLOTS_ALERT_THRESHOLD, HELD_SLOTS_PER_IP_CHALLENGE_THRESHOLD, recordBookingHold } = await import("./appointmentHoldAbuse");
const { notifyOwner } = await import("./_core/notification");
const { getExpiredAppointmentHoldUpdate } = await import("./appointmentHolds");

const MINUTE = 60_000;
const IP_A = "a".repeat(64);
const IP_B = "b".repeat(64);
let sequence = 0;

function db() { return state.db as InMemoryDrizzle; }

function heldUnpaidCount() {
  return db().rows(appointments).filter(row => row.appointmentStatus === "held" && row.paymentStatus === "pending").length;
}

/**
 * Same order as appointments.create once the slot is free: check, hold written,
 * hold recorded for the network, check again with it counted (then released
 * when refused). Every in-memory statement yields, so parallel calls interleave.
 */
async function bookWithoutChallenge(ipHash: string) {
  if (await bookingChallengeRequired(db() as never, ipHash)) return "challenged_before_hold";
  sequence += 1;
  const trackingId = `APTRACE${String(sequence).padStart(5, "0")}`;
  await db().insert(appointments).values({
    trackingId,
    customerName: "Patient Synthétique",
    customerEmail: `race${sequence}@test.local`,
    customerPhone: "+33600000000",
    requestDetails: "Demande d’avis",
    appointmentDate: new Date(Date.now() + 3 * 24 * 60 * MINUTE + sequence * 30 * MINUTE),
    basePrice: "100.00",
    finalPrice: "100.00",
    paymentStatus: "pending",
    appointmentStatus: "held",
    holdExpiresAt: new Date(Date.now() + 30 * MINUTE),
  });
  await recordBookingHold(ipHash, trackingId);
  if (await bookingChallengeRequired(db() as never, ipHash, { afterOwnHold: true })) {
    await db().update(appointments).set(getExpiredAppointmentHoldUpdate()).where(eq(appointments.trackingId, trackingId));
    return "challenged_after_hold";
  }
  return "held";
}

function seedAppointment(overrides: Record<string, unknown> = {}) {
  sequence += 1;
  return db().seed(appointments, {
    trackingId: `APTABUSE${String(sequence).padStart(4, "0")}`,
    customerName: "Patient Synthétique",
    customerEmail: `patient${sequence}@test.local`,
    customerPhone: "+33600000000",
    requestDetails: "Demande d’avis",
    appointmentDate: new Date(Date.now() + 3 * 24 * 60 * MINUTE),
    basePrice: "100.00",
    finalPrice: "100.00",
    paymentStatus: "pending",
    appointmentStatus: "held",
    holdExpiresAt: new Date(Date.now() + 20 * MINUTE),
    ...overrides,
  });
}

beforeEach(() => {
  state.db = createInMemoryDrizzle();
  vi.mocked(notifyOwner).mockClear();
});

describe("vérification anti-robot de la réservation, seulement en cas d’abus (ABUS-02)", () => {
  it("ne demande rien sous le seuil, sans compter les maintiens expirés ni les rendez-vous payés", async () => {
    for (let index = 1; index < HELD_SLOTS_ALERT_THRESHOLD; index += 1) seedAppointment();
    for (let index = 0; index < 3; index += 1) seedAppointment({ holdExpiresAt: new Date(Date.now() - MINUTE) });
    for (let index = 0; index < 3; index += 1) seedAppointment({ paymentStatus: "completed", appointmentStatus: "confirmed", holdExpiresAt: null });

    await expect(bookingChallengeRequired(db() as never, IP_A)).resolves.toBe(false);
    expect(vi.mocked(notifyOwner)).not.toHaveBeenCalled();
  });

  it("au seuil de créneaux retenus non payés, la demande à chaque réservation et n’alerte le propriétaire qu’une fois par jour", async () => {
    for (let index = 0; index < HELD_SLOTS_ALERT_THRESHOLD; index += 1) seedAppointment();

    await expect(bookingChallengeRequired(db() as never, IP_A)).resolves.toBe(true);
    await expect(bookingChallengeRequired(db() as never, null)).resolves.toBe(true);

    expect(vi.mocked(notifyOwner)).toHaveBeenCalledTimes(1);
    const [[alert]] = vi.mocked(notifyOwner).mock.calls;
    expect(alert.title).toBe(`Réservations : au moins ${HELD_SLOTS_ALERT_THRESHOLD} créneaux retenus sans paiement`);
    expect(alert.content).toContain("les patients peuvent toujours réserver");
    expect(alert.content).toContain("Attack Challenge Mode");
  });

  it("la demande à une IP qui retient déjà deux créneaux, pas aux autres visiteurs", async () => {
    for (let index = 0; index < HELD_SLOTS_PER_IP_CHALLENGE_THRESHOLD; index += 1) {
      await recordBookingHold(IP_A, String(seedAppointment().trackingId));
    }

    await expect(bookingChallengeRequired(db() as never, IP_A)).resolves.toBe(true);
    await expect(bookingChallengeRequired(db() as never, IP_B)).resolves.toBe(false);
    await expect(bookingChallengeRequired(db() as never, null)).resolves.toBe(false);
    expect(vi.mocked(notifyOwner)).not.toHaveBeenCalled();
  });

  it("ne compte plus pour l’IP un créneau payé ou libéré", async () => {
    const paid = seedAppointment();
    await recordBookingHold(IP_A, String(paid.trackingId));
    await recordBookingHold(IP_A, String(seedAppointment().trackingId));
    Object.assign(paid, { paymentStatus: "completed", appointmentStatus: "confirmed", holdExpiresAt: null });

    await expect(bookingChallengeRequired(db() as never, IP_A)).resolves.toBe(false);
  });

  it("ne laisse pas une vague de réservations simultanées dépasser le seuil sans vérification", async () => {
    // 7 réseaux × 6 réservations lancées en même temps : toutes lisent l’état d’avant la vague.
    const networks = Array.from({ length: 7 }, (_, index) => String(index + 1).repeat(64));
    const outcomes = await Promise.all(networks.flatMap(ipHash => Array.from({ length: 6 }, () => bookWithoutChallenge(ipHash))));

    expect(outcomes.filter(outcome => outcome === "challenged_before_hold")).toHaveLength(0);
    expect(outcomes.filter(outcome => outcome === "held").length).toBeLessThanOrEqual(HELD_SLOTS_ALERT_THRESHOLD);
    expect(heldUnpaidCount()).toBeLessThanOrEqual(HELD_SLOTS_ALERT_THRESHOLD);
  });

  it("ne laisse pas une même IP retenir plus de deux créneaux par des réservations simultanées", async () => {
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => bookWithoutChallenge(IP_A)));

    expect(outcomes.filter(outcome => outcome === "held").length).toBeLessThanOrEqual(HELD_SLOTS_PER_IP_CHALLENGE_THRESHOLD);
    expect(heldUnpaidCount()).toBeLessThanOrEqual(HELD_SLOTS_PER_IP_CHALLENGE_THRESHOLD);
    // Une fois la vague passée, les créneaux libérés laissent réserver normalement.
    await expect(bookWithoutChallenge(IP_B)).resolves.toBe("held");
  });

  it("compte, après l’écriture, le maintien de la réservation en plus des seuils", async () => {
    for (let index = 0; index < HELD_SLOTS_ALERT_THRESHOLD; index += 1) seedAppointment();
    await expect(bookingChallengeRequired(db() as never, null, { afterOwnHold: true })).resolves.toBe(false);
    seedAppointment();
    await expect(bookingChallengeRequired(db() as never, null, { afterOwnHold: true })).resolves.toBe(true);
  });

  it("n’enregistre aucun maintien sans IP identifiable", async () => {
    await recordBookingHold(null, String(seedAppointment().trackingId));
    expect(db().rows(securityEvents)).toEqual([]);
  });
});
