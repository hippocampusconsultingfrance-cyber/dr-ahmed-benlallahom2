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

const MINUTE = 60_000;
const IP_A = "a".repeat(64);
const IP_B = "b".repeat(64);
let sequence = 0;

function db() { return state.db as InMemoryDrizzle; }

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

  it("n’enregistre aucun maintien sans IP identifiable", async () => {
    await recordBookingHold(null, String(seedAppointment().trackingId));
    expect(db().rows(securityEvents)).toEqual([]);
  });
});
