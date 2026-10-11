import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ getDb: vi.fn() }));
const fulfillment = vi.hoisted(() => ({
  enqueueAppointmentFulfillment: vi.fn(async () => undefined),
  processAppointmentFulfillmentNow: vi.fn(async () => ({ processed: 2, results: [] })),
}));
const owner = vi.hoisted(() => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./appointmentFulfillment", () => fulfillment);
vi.mock("./_core/notification", () => owner);

import { buildUnconfirmablePaymentAlert, handleCheckoutSessionCompleted, processFulfillmentBestEffort } from "./appointmentPaymentWebhook";

const dialect = new PgDialect();

type Write = { values: Record<string, unknown>; where: SQL };

function fakeDatabase(reads: unknown[][], updateRowCounts: number[] = []) {
  const queue = [...reads];
  const rowCounts = [...updateRowCounts];
  const writes: Write[] = [];
  const db = {
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: async () => queue.shift() ?? [] }) }),
    })),
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => ({
        where: async (where: SQL) => {
          writes.push({ values, where });
          return { rowCount: rowCounts.length ? rowCounts.shift() : 1 };
        },
      }),
    })),
  };
  database.getDb.mockResolvedValue(db);
  return { db, writes };
}

function heldAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    trackingId: "APT-42",
    finalPrice: "100.00",
    paymentStatus: "pending",
    appointmentStatus: "held",
    stripeSessionId: "cs_test_1",
    stripePaymentIntentId: null,
    ...overrides,
  };
}

function paidSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_1",
    payment_status: "paid",
    amount_total: 10000,
    payment_intent: "pi_test_1",
    metadata: { trackingId: "APT-42" },
    ...overrides,
  };
}

const confirmingWrites = (writes: Write[]) => writes.filter(write => write.values.paymentStatus === "completed");

beforeEach(() => vi.clearAllMocks());

describe("webhook Stripe checkout.session.completed", () => {
  it("accuse réception sans confirmer une session non payée", async () => {
    fakeDatabase([]);
    const result = await handleCheckoutSessionCompleted(paidSession({ payment_status: "unpaid" }));

    expect(result).toMatchObject({ httpStatus: 200, outcome: "payment_not_paid" });
    expect(database.getDb).not.toHaveBeenCalled();
    expect(fulfillment.enqueueAppointmentFulfillment).not.toHaveBeenCalled();
  });

  it("rejette un événement sans référence de rendez-vous", async () => {
    const result = await handleCheckoutSessionCompleted(paidSession({ metadata: {} }));
    expect(result).toEqual({ httpStatus: 400, body: { error: "Invalid webhook" }, outcome: "missing_reference" });
  });

  it("confirme uniquement un créneau encore réservé et envoie immédiatement confirmation et facture", async () => {
    const { writes } = fakeDatabase([[heldAppointment()]], [1]);

    const result = await handleCheckoutSessionCompleted(paidSession(), { fulfillmentTimeoutMs: 1_000 });

    expect(result).toMatchObject({ httpStatus: 200, outcome: "confirmed" });
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toMatchObject({ paymentStatus: "completed", appointmentStatus: "confirmed", stripePaymentIntentId: "pi_test_1", stripeSessionId: "cs_test_1" });
    const { sql, params } = dialect.sqlToQuery(writes[0].where);
    expect(sql).toContain('"payment_status" =');
    expect(sql).toContain('"appointment_status" =');
    expect(sql).toContain('"stripe_session_id" is null');
    expect(params).toEqual(expect.arrayContaining([42, "pending", "held", "cs_test_1"]));
    expect(fulfillment.enqueueAppointmentFulfillment).toHaveBeenCalledWith(42);
    expect(fulfillment.processAppointmentFulfillmentNow).toHaveBeenCalledWith(42);
    expect(owner.notifyOwner).not.toHaveBeenCalled();
  });

  it("ne reconfirme jamais un créneau libéré : trace le paiement et alerte le propriétaire", async () => {
    const released = heldAppointment({ appointmentStatus: "cancelled" });
    const { writes } = fakeDatabase([[released], [released]], [0, 1]);

    const result = await handleCheckoutSessionCompleted(paidSession());

    expect(result).toMatchObject({ httpStatus: 200, outcome: "unconfirmable", body: { received: true, confirmed: false, manualReviewRequired: true } });
    expect(writes).toHaveLength(2);
    expect(writes[1].values).toEqual({ stripePaymentIntentId: "pi_test_1" });
    const { sql } = dialect.sqlToQuery(writes[1].where);
    expect(sql).toContain('"stripe_payment_intent_id" is null');
    expect(sql).toContain('"appointment_status" <>');
    expect(owner.notifyOwner).toHaveBeenCalledTimes(1);
    const alert = owner.notifyOwner.mock.calls[0][0] as { title: string; content: string };
    expect(alert.title).toContain("non confirmable");
    expect(alert.title).toContain("APT-42");
    expect(alert.content).toContain("Remboursement ou reprogrammation manuelle requis");
    expect(alert.content).toContain("pi_test_1");
    expect(fulfillment.enqueueAppointmentFulfillment).not.toHaveBeenCalled();
  });

  it("demande à Stripe de relivrer tant que l’alerte au propriétaire n’est pas partie, sans tracer le paiement", async () => {
    owner.notifyOwner.mockResolvedValueOnce(false);
    const released = heldAppointment({ appointmentStatus: "cancelled" });
    const { writes } = fakeDatabase([[released], [released]], [0]);

    const result = await handleCheckoutSessionCompleted(paidSession());

    expect(result).toMatchObject({ httpStatus: 500, outcome: "unconfirmable", body: { received: false } });
    expect(owner.notifyOwner).toHaveBeenCalledTimes(1);
    // Seule la tentative de confirmation conditionnelle a écrit : aucun
    // stripePaymentIntentId ne vient transformer la relivraison en doublon muet.
    expect(writes).toHaveLength(1);
    expect(writes.some(write => "stripePaymentIntentId" in write.values && !("paymentStatus" in write.values))).toBe(false);
  });

  it("répond aussi 5xx pour un double paiement si l’alerte échoue", async () => {
    owner.notifyOwner.mockRejectedValueOnce(new Error("resend_down"));
    fakeDatabase([[heldAppointment({ paymentStatus: "completed", appointmentStatus: "confirmed", stripeSessionId: "cs_first", stripePaymentIntentId: "pi_first" })]]);

    const result = await handleCheckoutSessionCompleted(paidSession());

    expect(result).toMatchObject({ httpStatus: 500, outcome: "unconfirmable" });
  });

  it("ne confirme pas automatiquement une session différente de celle enregistrée", async () => {
    const { writes } = fakeDatabase([[heldAppointment({ stripeSessionId: "cs_other" })]]);

    const result = await handleCheckoutSessionCompleted(paidSession());

    expect(result).toMatchObject({ httpStatus: 200, outcome: "unconfirmable" });
    expect(confirmingWrites(writes)).toHaveLength(0);
    expect(owner.notifyOwner).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("ne correspond pas") }));
    expect(fulfillment.enqueueAppointmentFulfillment).not.toHaveBeenCalled();
  });

  it("reste idempotent pour une nouvelle livraison du même paiement", async () => {
    const { writes } = fakeDatabase([[heldAppointment({ paymentStatus: "completed", appointmentStatus: "confirmed", stripePaymentIntentId: "pi_test_1" })]]);

    const result = await handleCheckoutSessionCompleted(paidSession());

    expect(result).toMatchObject({ httpStatus: 200, outcome: "duplicate", body: { received: true, duplicate: true } });
    expect(writes).toHaveLength(0);
    expect(fulfillment.enqueueAppointmentFulfillment).toHaveBeenCalledWith(42);
    expect(owner.notifyOwner).not.toHaveBeenCalled();
  });

  it("signale un second paiement sur un rendez-vous déjà réglé par une autre session", async () => {
    fakeDatabase([[heldAppointment({ paymentStatus: "completed", appointmentStatus: "confirmed", stripeSessionId: "cs_first", stripePaymentIntentId: "pi_first" })]]);

    const result = await handleCheckoutSessionCompleted(paidSession());

    expect(result).toMatchObject({ httpStatus: 200, outcome: "unconfirmable" });
    expect(owner.notifyOwner).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("double paiement") }));
    expect(fulfillment.enqueueAppointmentFulfillment).not.toHaveBeenCalled();
  });

  it("traite une livraison concurrente qui a déjà confirmé le même paiement comme un doublon", async () => {
    fakeDatabase([[heldAppointment()], [heldAppointment({ paymentStatus: "completed", appointmentStatus: "confirmed" })]], [0]);

    const result = await handleCheckoutSessionCompleted(paidSession());

    expect(result).toMatchObject({ httpStatus: 200, outcome: "duplicate" });
    expect(owner.notifyOwner).not.toHaveBeenCalled();
  });

  it("conserve le contrôle du montant", async () => {
    const { writes } = fakeDatabase([[heldAppointment()]]);

    const result = await handleCheckoutSessionCompleted(paidSession({ amount_total: 100 }));

    expect(result).toEqual({ httpStatus: 400, body: { error: "Invalid webhook" }, outcome: "amount_mismatch" });
    expect(writes).toHaveLength(0);
  });

  it("répond à Stripe même si l’envoi immédiat échoue", async () => {
    fakeDatabase([[heldAppointment()]], [1]);
    fulfillment.processAppointmentFulfillmentNow.mockRejectedValueOnce(new Error("Database connection failed"));

    const result = await handleCheckoutSessionCompleted(paidSession(), { fulfillmentTimeoutMs: 1_000 });

    expect(result).toMatchObject({ httpStatus: 200, outcome: "confirmed" });
  });
});

describe("envoi immédiat borné dans le temps", () => {
  it("rend la main après le délai sans attendre l’envoi", async () => {
    const outcome = await processFulfillmentBestEffort(1, 5, () => new Promise(() => undefined));
    expect(outcome).toEqual({ processed: 0, timedOut: true, failed: false });
  });

  it("n’émet pas de rejet non géré quand l’envoi échoue après le délai", async () => {
    const outcome = await processFulfillmentBestEffort(1, 5, () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("late")), 20)));
    expect(outcome.timedOut).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 40));
  });

  it("retourne le nombre de jobs traités quand l’envoi aboutit à temps", async () => {
    const outcome = await processFulfillmentBestEffort(1, 1_000, async () => ({ processed: 2 }));
    expect(outcome).toEqual({ processed: 2, timedOut: false, failed: false });
  });
});

describe("alerte de paiement non confirmable", () => {
  it("rédige une alerte française exploitable avec la référence de suivi", () => {
    const alert = buildUnconfirmablePaymentAlert({
      trackingId: "APT-9",
      reason: "hold_released",
      amountCents: 12000,
      sessionId: "cs_9",
      paymentIntentId: "pi_9",
      paymentStatus: "pending",
      appointmentStatus: "cancelled",
    });
    expect(alert.title).toBe("Paiement reçu pour un rendez-vous non confirmable (APT-9)");
    expect(alert.content).toContain("120.00 €");
    expect(alert.content).toContain("Remboursement ou reprogrammation manuelle requis");
  });
});
