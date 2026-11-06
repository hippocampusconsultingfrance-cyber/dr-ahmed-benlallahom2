import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { appointments } from "../drizzle/schema";
import { getAppointmentAdminActions } from "../client/src/pages/appointmentAdminActions";

// M3 — BOOK-DOCTOR-CANCEL / ADM-APT-01.

const database = vi.hoisted(() => ({ getDb: vi.fn() }));
const notifications = vi.hoisted(() => ({ sendRefundConfirmationEmail: vi.fn(async (..._args: unknown[]) => undefined) }));
// The patient email of a dashboard refund goes through the refund queue (EXPL-02), which
// answers its state after the immediate attempt; the queue itself runs in
// appointmentFulfillmentRefusal.test.ts.
const fulfillment = vi.hoisted(() => ({
  closeUnsentAppointmentFulfillment: vi.fn(async () => 0),
  sendAppointmentRefundEmail: vi.fn(async (_appointmentId: number): Promise<string | null> => "sent"),
}));
vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./_core/notifications", () => notifications);
vi.mock("./appointmentFulfillment", () => fulfillment);

import { dashboardRefundEmailOf, refundAppointmentPayment, refundUnconfirmedCheckoutSession, updateAppointmentStatusByAdmin } from "./appointmentAdminActions";

/** The patient email the refund job sends for the refund this update recorded. */
const queuedEmail = (update: Record<string, unknown>) => dashboardRefundEmailOf({ paymentStatus: "refunded", cancellationReason: String(update.cancellationReason) });

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-10-16T10:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    trackingId: "APTADMIN0001",
    customerName: "Patient Test",
    customerEmail: "patient@example.test",
    customerPhone: "+33600000000",
    appointmentDate: new Date(NOW.getTime() + 7 * HOUR),
    finalPrice: "100.00",
    paymentStatus: "completed",
    appointmentStatus: "confirmed",
    stripePaymentIntentId: "pi_test_paid",
    stripeSessionId: "cs_test_paid",
    cancelledAt: null,
    ...overrides,
  };
}

function fakeDb(appointment: Record<string, unknown> | null, updateRowCount = 1) {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => (appointment ? [appointment] : []) }) }) })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === appointments) updates.push(values);
          return { rowCount: updateRowCount };
        },
      }),
    })),
  };
  database.getDb.mockResolvedValue(db);
  return { db, updates };
}

function fakeStripe(session?: Partial<Stripe.Checkout.Session>) {
  const refundsCreate = vi.fn(async (params: { payment_intent: string }) => ({ id: "re_test_1", amount: 10000, payment_intent: params.payment_intent }));
  const refundsList = vi.fn(async (_params: { payment_intent: string; limit?: number }) => ({ data: [] as Array<{ id: string; amount: number; status: string }> }));
  const stripe = {
    refunds: { create: refundsCreate, list: refundsList },
    checkout: { sessions: { retrieve: vi.fn(async () => session) } },
  } as unknown as Stripe;
  return { stripe, refundsCreate, refundsList };
}

/** What Stripe answers once the payment is fully refunded, whatever the idempotency key. */
const chargeAlreadyRefunded = () => Object.assign(new Error("Charge ch_test has already been refunded."), { name: "StripeInvalidRequestError", type: "StripeInvalidRequestError", code: "charge_already_refunded" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("annulation par le praticien et remboursements depuis le tableau de bord", () => {
  it("rembourse intégralement à moins de 24 h quand le praticien annule, libère le créneau et prévient le patient avec le motif", async () => {
    const { updates } = fakeDb(row());
    const { stripe, refundsCreate } = fakeStripe();

    const result = await refundAppointmentPayment(stripe, { trackingId: "APTADMIN0001", reason: "Indisponibilité du médecin", initiator: "practitioner" }, NOW);

    expect(result).toMatchObject({ success: true, refundAmount: "100.00", cancelled: true, patientNotified: true, patientEmail: "sent" });
    // Paramètres Stripe stables (clé d’idempotence) : le motif reste en base.
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_test_paid", metadata: { trackingId: "APTADMIN0001" } }, { idempotencyKey: "refund_APTADMIN0001" });
    expect(updates[0]).toMatchObject({ paymentStatus: "refunded", appointmentStatus: "cancelled", slotKey: null, refundAmount: "100.00" });
    expect(String(updates[0].cancellationReason)).toContain("praticien");
    // L’email au patient part par la file des remboursements (EXPL-02), une seule fois, avec le motif.
    expect(fulfillment.sendAppointmentRefundEmail).toHaveBeenCalledTimes(1);
    expect(fulfillment.sendAppointmentRefundEmail).toHaveBeenCalledWith(5);
    expect(notifications.sendRefundConfirmationEmail).not.toHaveBeenCalled();
    expect(queuedEmail(updates[0])).toEqual({ context: "practitioner_cancellation", reason: "Indisponibilité du médecin" });
  });

  it("dit si l’email au patient attend un nouvel essai ou a été refusé, sans faire échouer le remboursement (EXPL-02)", async () => {
    for (const patientEmail of ["retrying", "refused", null]) {
      fakeDb(row());
      fulfillment.sendAppointmentRefundEmail.mockResolvedValueOnce(patientEmail);
      await expect(refundAppointmentPayment(fakeStripe().stripe, { trackingId: "APTADMIN0001", reason: "Indisponibilité du médecin", initiator: "practitioner" }, NOW))
        .resolves.toMatchObject({ success: true, cancelled: true, patientNotified: false, patientEmail });
    }
  });

  it("garde la règle des 24 h pour une annulation demandée par le patient", async () => {
    fakeDb(row());
    const { stripe, refundsCreate } = fakeStripe();
    await expect(refundAppointmentPayment(stripe, { trackingId: "APTADMIN0001", reason: "Empêchement", initiator: "patient" }, NOW))
      .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("24 heures") });
    expect(refundsCreate).not.toHaveBeenCalled();

    const { updates } = fakeDb(row({ appointmentDate: new Date(NOW.getTime() + 30 * HOUR) }));
    await expect(refundAppointmentPayment(stripe, { trackingId: "APTADMIN0001", reason: "Empêchement", initiator: "patient" }, NOW))
      .resolves.toMatchObject({ success: true, cancelled: true });
    // The patient's own reason is not written back to them.
    expect(queuedEmail(updates[0])).toEqual({ context: "refund" });
  });

  it("rembourse un paiement arrivé après l’expiration du créneau (non confirmable) depuis le tableau de bord", async () => {
    const { updates } = fakeDb(row({ paymentStatus: "pending", appointmentStatus: "cancelled", stripePaymentIntentId: "pi_test_late" }));
    const { stripe, refundsCreate } = fakeStripe();

    const result = await refundAppointmentPayment(stripe, { trackingId: "APTADMIN0001", reason: "Paiement tardif", initiator: "practitioner" }, NOW);

    expect(result).toMatchObject({ success: true, cancelled: false });
    expect(refundsCreate).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_test_late" }), expect.anything());
    expect(updates[0]).toMatchObject({ paymentStatus: "refunded" });
    expect(updates[0]).not.toHaveProperty("appointmentStatus");
    expect(queuedEmail(updates[0])).toEqual({ context: "unconfirmed_payment", reason: "Paiement tardif" });
  });

  it("garde le statut d’une consultation terminée remboursée à titre de geste", async () => {
    const { updates } = fakeDb(row({ appointmentStatus: "completed", appointmentDate: new Date(NOW.getTime() - 2 * HOUR) }));
    await refundAppointmentPayment(fakeStripe().stripe, { trackingId: "APTADMIN0001", reason: "Geste commercial", initiator: "practitioner" }, NOW);
    expect(updates[0]).toMatchObject({ paymentStatus: "refunded" });
    expect(updates[0]).not.toHaveProperty("appointmentStatus");
    // A refund confirmation, not a cancellation, with the practitioner's reason; kept even if the status changes later.
    expect(queuedEmail(updates[0])).toEqual({ context: "refund", reason: "Geste commercial" });
  });

  it("ne lit l’email d’un remboursement que sur un rendez-vous remboursé depuis le tableau de bord", () => {
    expect(dashboardRefundEmailOf({ paymentStatus: "completed", cancellationReason: "Annulation / remboursement par le praticien : x" })).toBeNull();
    expect(dashboardRefundEmailOf({ paymentStatus: "refunded", cancellationReason: null })).toBeNull();
    expect(dashboardRefundEmailOf({ paymentStatus: "refunded", cancellationReason: "Remboursement constaté chez Stripe (fait hors du tableau de bord du site, ou enregistrement interrompu)" })).toBeNull();
    // The reason itself may contain the separator.
    expect(dashboardRefundEmailOf({ paymentStatus: "refunded", cancellationReason: "Annulation / remboursement par le praticien : Absence : urgence" })).toEqual({ context: "practitioner_cancellation", reason: "Absence : urgence" });
  });

  it("termine l’enregistrement d’un paiement déjà remboursé chez Stripe au lieu d’échouer (DATA-03)", async () => {
    // Remboursement déjà fait chez Stripe (essai précédent interrompu après Stripe, clé d’idempotence expirée) : le rendez-vous est resté payé.
    const { updates } = fakeDb(row());
    const { stripe, refundsCreate, refundsList } = fakeStripe();
    refundsCreate.mockRejectedValueOnce(chargeAlreadyRefunded());
    refundsList.mockResolvedValueOnce({ data: [{ id: "re_test_existing", amount: 10000, status: "succeeded" }, { id: "re_test_failed", amount: 10000, status: "failed" }] });

    const result = await refundAppointmentPayment(stripe, { trackingId: "APTADMIN0001", reason: "Indisponibilité du médecin", initiator: "practitioner" }, NOW);

    expect(refundsList).toHaveBeenCalledWith({ payment_intent: "pi_test_paid", limit: 100 });
    expect(result).toMatchObject({ success: true, refundId: "re_test_existing", refundAmount: "100.00", cancelled: true, patientNotified: true });
    expect(updates[0]).toMatchObject({ paymentStatus: "refunded", appointmentStatus: "cancelled", slotKey: null, refundAmount: "100.00" });
    expect(fulfillment.sendAppointmentRefundEmail).toHaveBeenCalledWith(5);
    expect(queuedEmail(updates[0])).toEqual({ context: "practitioner_cancellation", reason: "Indisponibilité du médecin" });
  });

  it("échoue toujours sans rien écrire quand Stripe refuse le remboursement ou qu’aucun remboursement existant n’est retrouvé (DATA-03)", async () => {
    const { updates } = fakeDb(row());
    const declined = fakeStripe();
    declined.refundsCreate.mockRejectedValueOnce(Object.assign(new Error("Insufficient funds"), { code: "balance_insufficient" }));
    await expect(refundAppointmentPayment(declined.stripe, { trackingId: "APTADMIN0001", reason: "Motif", initiator: "practitioner" }, NOW))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: "Le remboursement Stripe a échoué" });
    expect(declined.refundsList).not.toHaveBeenCalled();

    const unlisted = fakeStripe();
    unlisted.refundsCreate.mockRejectedValueOnce(chargeAlreadyRefunded());
    unlisted.refundsList.mockRejectedValueOnce(new Error("Stripe unreachable"));
    await expect(refundAppointmentPayment(unlisted.stripe, { trackingId: "APTADMIN0001", reason: "Motif", initiator: "practitioner" }, NOW))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updates).toHaveLength(0);
    expect(fulfillment.sendAppointmentRefundEmail).not.toHaveBeenCalled();
  });

  it("refuse un double remboursement et un rendez-vous non payé", async () => {
    fakeDb(row({ paymentStatus: "refunded" }));
    await expect(refundAppointmentPayment(fakeStripe().stripe, { trackingId: "APTADMIN0001", reason: "x".repeat(5), initiator: "practitioner" }, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
    fakeDb(row({ paymentStatus: "pending", appointmentStatus: "held", stripePaymentIntentId: null }));
    await expect(refundAppointmentPayment(fakeStripe().stripe, { trackingId: "APTADMIN0001", reason: "x".repeat(5), initiator: "practitioner" }, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rembourse une session Stripe payée mais non rattachée, jamais le paiement confirmé du rendez-vous", async () => {
    fakeDb(row());
    const own = fakeStripe({ id: "cs_test_paid", payment_status: "paid", payment_intent: "pi_test_paid", metadata: { trackingId: "APTADMIN0001" }, amount_total: 10000 });
    await expect(refundUnconfirmedCheckoutSession(own.stripe, { sessionId: "cs_test_paid" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(own.refundsCreate).not.toHaveBeenCalled();

    fakeDb(row());
    const other = fakeStripe({ id: "cs_test_double", payment_status: "paid", payment_intent: "pi_test_double", metadata: { trackingId: "APTADMIN0001" }, amount_total: 10000, customer_email: "patient@example.test" });
    await expect(refundUnconfirmedCheckoutSession(other.stripe, { sessionId: "cs_test_double" })).resolves.toMatchObject({ success: true, refundAmount: "100.00", trackingId: "APTADMIN0001", patientNotified: true });
    expect(other.refundsCreate).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_test_double" }), { idempotencyKey: "refund_session_cs_test_double" });
    expect(notifications.sendRefundConfirmationEmail).toHaveBeenCalledWith("patient@example.test", "Patient Test", "APTADMIN0001", expect.any(Date), "100.00", expect.objectContaining({ context: "unconfirmed_payment", idempotencyKey: "appointment-refund-session-cs_test_double" }));

    // The email now throws its failure (RES-06): the refund is still done, and the toast says the patient was not told.
    fakeDb(row());
    notifications.sendRefundConfirmationEmail.mockRejectedValueOnce(new Error("refund_email_failed"));
    await expect(refundUnconfirmedCheckoutSession(other.stripe, { sessionId: "cs_test_double" })).resolves.toMatchObject({ success: true, patientNotified: false });
  });
});

describe("statuts depuis le tableau de bord", () => {
  it("n’annule jamais silencieusement un rendez-vous payé", async () => {
    const { updates } = fakeDb(row());
    await expect(updateAppointmentStatusByAdmin({ trackingId: "APTADMIN0001", appointmentStatus: "cancelled" }, NOW))
      .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("rembourser") });
    expect(updates).toHaveLength(0);
  });

  it("annule un rendez-vous non payé et libère son créneau", async () => {
    const { updates } = fakeDb(row({ paymentStatus: "pending", appointmentStatus: "confirmed", stripePaymentIntentId: null }));
    await expect(updateAppointmentStatusByAdmin({ trackingId: "APTADMIN0001", appointmentStatus: "cancelled" }, NOW)).resolves.toMatchObject({ success: true });
    expect(updates[0]).toMatchObject({ appointmentStatus: "cancelled", slotKey: null });
  });

  it("ne marque terminé ou absent qu’après l’heure du rendez-vous, et permet de remettre en confirmé", async () => {
    fakeDb(row());
    await expect(updateAppointmentStatusByAdmin({ trackingId: "APTADMIN0001", appointmentStatus: "completed" }, NOW))
      .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("pas encore commencé") });

    const past = { appointmentDate: new Date(NOW.getTime() - HOUR) };
    let { updates } = fakeDb(row(past));
    await updateAppointmentStatusByAdmin({ trackingId: "APTADMIN0001", appointmentStatus: "no_show" }, NOW);
    expect(updates[0]).toMatchObject({ appointmentStatus: "no_show" });

    ({ updates } = fakeDb(row({ ...past, appointmentStatus: "completed" })));
    await updateAppointmentStatusByAdmin({ trackingId: "APTADMIN0001", appointmentStatus: "confirmed" }, NOW);
    expect(updates[0]).toMatchObject({ appointmentStatus: "confirmed" });

    fakeDb(row({ appointmentStatus: "cancelled", paymentStatus: "refunded" }));
    await expect(updateAppointmentStatusByAdmin({ trackingId: "APTADMIN0001", appointmentStatus: "confirmed" }, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("signale une modification concurrente", async () => {
    fakeDb(row({ appointmentDate: new Date(NOW.getTime() - HOUR) }), 0);
    await expect(updateAppointmentStatusByAdmin({ trackingId: "APTADMIN0001", appointmentStatus: "completed" }, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("RGPD-12 — rendez-vous anonymisé (effacement ou conservation de 3 ans écoulée)", () => {
  const anonymised = { customerName: "Anonymisé", customerEmail: "", customerPhone: "", appointmentStatus: "completed", appointmentDate: new Date(NOW.getTime() - 400 * 24 * HOUR) };

  it("rembourse sans écrire à une adresse vide et dit que le patient n’est plus joignable", async () => {
    const { updates } = fakeDb(row(anonymised));
    const result = await refundAppointmentPayment(fakeStripe().stripe, { trackingId: "APTADMIN0001", reason: "Geste commercial", initiator: "practitioner" }, NOW);
    expect(result).toMatchObject({ success: true, refundAmount: "100.00", patientNotified: false, patientDataErased: true });
    expect(updates[0]).toMatchObject({ paymentStatus: "refunded" });
    // Neither sent right away nor queued (RES-06 refund queue).
    expect(notifications.sendRefundConfirmationEmail).not.toHaveBeenCalled();
    expect(fulfillment.sendAppointmentRefundEmail).not.toHaveBeenCalled();

    // A booking still holding its address is told as before, through the refund queue.
    fakeDb(row({ appointmentStatus: "completed", appointmentDate: anonymised.appointmentDate }));
    await expect(refundAppointmentPayment(fakeStripe().stripe, { trackingId: "APTADMIN0001", reason: "Geste commercial", initiator: "practitioner" }, NOW))
      .resolves.toMatchObject({ patientNotified: true, patientDataErased: false });
    expect(fulfillment.sendAppointmentRefundEmail).toHaveBeenCalledTimes(1);
  });

  it("ne relit pas chez Stripe l’adresse d’un patient effacé pour un paiement non rattaché", async () => {
    fakeDb(row({ ...anonymised, appointmentStatus: "confirmed" }));
    const other = fakeStripe({ id: "cs_test_double", payment_status: "paid", payment_intent: "pi_test_double", metadata: { trackingId: "APTADMIN0001" }, amount_total: 10000, customer_email: "patient@example.test" });
    await expect(refundUnconfirmedCheckoutSession(other.stripe, { sessionId: "cs_test_double" }))
      .resolves.toMatchObject({ success: true, refundAmount: "100.00", patientNotified: false, patientDataErased: true });
    expect(other.refundsCreate).toHaveBeenCalled();
    expect(notifications.sendRefundConfirmationEmail).not.toHaveBeenCalled();
  });

  it("refuse de remettre en confirmé un rendez-vous dont les données sont effacées", async () => {
    const { updates } = fakeDb(row(anonymised));
    await expect(updateAppointmentStatusByAdmin({ trackingId: "APTADMIN0001", appointmentStatus: "confirmed" }, NOW))
      .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("effacées") });
    expect(updates).toHaveLength(0);
  });

  it("le tableau de bord le signale, n’offre plus « Remettre en confirmé » mais garde le remboursement", () => {
    expect(getAppointmentAdminActions(row(anonymised), NOW.getTime())).toMatchObject({ patientDataErased: true, canReconfirm: false, canPractitionerRefund: true });
    expect(getAppointmentAdminActions(row({ appointmentStatus: "completed" }), NOW.getTime())).toMatchObject({ patientDataErased: false, canReconfirm: true });
  });
});

describe("boutons du tableau de bord alignés sur les règles serveur", () => {
  const now = NOW.getTime();
  it("propose Terminer/Absent seulement après le début, l’annulation praticien toujours, la règle des 24 h pour le patient", () => {
    const future = getAppointmentAdminActions(row(), now);
    expect(future).toMatchObject({ canComplete: false, canMarkNoShow: false, canPractitionerCancel: true, canPatientRefund: false, canReconfirm: false });
    expect(getAppointmentAdminActions(row({ appointmentDate: new Date(now + 30 * HOUR) }), now).canPatientRefund).toBe(true);
    const started = getAppointmentAdminActions(row({ appointmentDate: new Date(now - HOUR) }), now);
    expect(started).toMatchObject({ canComplete: true, canMarkNoShow: true });
    expect(getAppointmentAdminActions(row({ appointmentStatus: "completed" }), now)).toMatchObject({ canReconfirm: true, canPractitionerRefund: true, canComplete: false });
    expect(getAppointmentAdminActions(row({ paymentStatus: "pending", appointmentStatus: "cancelled", stripePaymentIntentId: "pi_late" }), now)).toMatchObject({ unconfirmedPayment: true, canPractitionerCancel: false });
  });
});
