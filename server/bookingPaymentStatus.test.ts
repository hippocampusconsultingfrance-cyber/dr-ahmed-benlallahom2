import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// BOOK-SUCCESS-UNVERIFIED (état réel sur la page de retour + email au patient),
// BOOK-ERROR-MSG (Stripe indisponible), SEC-01 (aucun texte SQL/fournisseur au client).

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  stripeRetrieve: vi.fn(),
  stripeCreate: vi.fn(),
  releaseExpiredAppointmentHolds: vi.fn(async () => ({ released: 0 })),
  notifyOwner: vi.fn(async () => true),
  sendUnconfirmablePaymentEmail: vi.fn(async () => true),
}));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mocks.stripeCreate, retrieve: mocks.stripeRetrieve } },
  })),
}));
vi.mock("./appointmentHolds", async importOriginal => ({
  ...await importOriginal<typeof import("./appointmentHolds")>(),
  releaseExpiredAppointmentHolds: mocks.releaseExpiredAppointmentHolds,
}));
vi.mock("./_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendUnconfirmablePaymentEmail: mocks.sendUnconfirmablePaymentEmail,
}));
vi.mock("./appointmentFulfillment", () => ({ enqueueAppointmentFulfillment: vi.fn(), processAppointmentFulfillmentNow: vi.fn(async () => ({ processed: 0 })) }));

import { appRouter, BOOKING_PAYMENT_UNAVAILABLE_MESSAGE, parisDateKey, parseAppointmentDate } from "./routers";
import { handleCheckoutSessionCompleted } from "./appointmentPaymentWebhook";
import { formatTrpcErrorShape, GENERIC_INTERNAL_ERROR_MESSAGE } from "./_core/trpc";

function caller() {
  return appRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: {}, ip: "192.0.2.9" } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}

function dbReturning(appointment: Record<string, unknown> | null) {
  mocks.getDb.mockResolvedValue({
    select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => (appointment ? [appointment] : []) }) }) })),
    update: vi.fn(() => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) })),
  });
}

const status = (sessionId = "cs_test_own") => caller().appointments.publicStatus({ trackingId: "APTSTATUS0001", sessionId });
const row = (overrides: Record<string, unknown> = {}) => ({ trackingId: "APTSTATUS0001", paymentStatus: "completed", appointmentStatus: "confirmed", stripeSessionId: "cs_test_own", ...overrides });

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_status");
});
afterEach(() => {
  vi.unstubAllEnvs();
  consoleErrorSpy.mockRestore();
});

describe("appointments.publicStatus — état réel affiché après Stripe", () => {
  it("confirme seulement un rendez-vous payé et confirmé avec cette session", async () => {
    dbReturning(row());
    await expect(status()).resolves.toEqual({ state: "confirmed" });
    expect(mocks.stripeRetrieve).not.toHaveBeenCalled();
  });

  it("affiche « en cours de validation » tant que le webhook n’a pas confirmé un paiement reçu", async () => {
    dbReturning(row({ paymentStatus: "pending", appointmentStatus: "held" }));
    mocks.stripeRetrieve.mockResolvedValue({ id: "cs_test_own", payment_status: "paid", status: "complete", metadata: { trackingId: "APTSTATUS0001" } });
    await expect(status()).resolves.toEqual({ state: "processing" });
  });

  it("affiche « à régulariser » pour un paiement reçu après la libération du créneau ou par une autre session", async () => {
    dbReturning(row({ paymentStatus: "pending", appointmentStatus: "cancelled" }));
    mocks.stripeRetrieve.mockResolvedValue({ id: "cs_test_own", payment_status: "paid", status: "complete", metadata: { trackingId: "APTSTATUS0001" } });
    await expect(status()).resolves.toEqual({ state: "attention" });

    dbReturning(row());
    mocks.stripeRetrieve.mockResolvedValue({ id: "cs_test_other", payment_status: "paid", status: "complete", metadata: { trackingId: "APTSTATUS0001" } });
    await expect(status("cs_test_other")).resolves.toEqual({ state: "attention" });
  });

  it("ne révèle rien pour une session qui n’appartient pas au rendez-vous ou un paiement non effectué", async () => {
    dbReturning(row({ paymentStatus: "pending", appointmentStatus: "held" }));
    mocks.stripeRetrieve.mockResolvedValue({ id: "cs_test_foreign", payment_status: "paid", status: "complete", metadata: { trackingId: "APTOTHER00001" } });
    await expect(status("cs_test_foreign")).resolves.toEqual({ state: "unknown" });

    mocks.stripeRetrieve.mockResolvedValue({ id: "cs_test_own", payment_status: "unpaid", status: "expired", metadata: { trackingId: "APTSTATUS0001" } });
    await expect(status()).resolves.toEqual({ state: "not_paid" });

    dbReturning(null);
    await expect(status()).resolves.toEqual({ state: "unknown" });
    await expect(caller().appointments.publicStatus({ trackingId: "' OR 1=1", sessionId: "cs_test_own" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("paiement non confirmable : le patient est prévenu", () => {
  it("envoie au patient un email « réservation à régulariser » une fois le propriétaire alerté", async () => {
    const released = { id: 42, trackingId: "APTSTATUS0001", finalPrice: "100.00", paymentStatus: "pending", appointmentStatus: "cancelled", stripeSessionId: "cs_test_own", stripePaymentIntentId: null, customerEmail: "patient@example.test", customerName: "Patient Test", appointmentDate: new Date("2026-10-20T08:00:00Z") };
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [released] }) }) })),
      update: vi.fn(() => ({ set: () => ({ where: async () => ({ rowCount: 0 }) }) })),
    });
    const result = await handleCheckoutSessionCompleted({ id: "cs_test_own", payment_status: "paid", amount_total: 10000, payment_intent: "pi_test_late", metadata: { trackingId: "APTSTATUS0001" } });
    expect(result.outcome).toBe("unconfirmable");
    expect(mocks.sendUnconfirmablePaymentEmail).toHaveBeenCalledWith("patient@example.test", expect.objectContaining({ trackingId: "APTSTATUS0001", amountCents: 10000 }), "appointment-unconfirmable-cs_test_own");

    mocks.sendUnconfirmablePaymentEmail.mockClear();
    mocks.notifyOwner.mockResolvedValueOnce(false);
    const retry = await handleCheckoutSessionCompleted({ id: "cs_test_own", payment_status: "paid", amount_total: 10000, payment_intent: "pi_test_late", metadata: { trackingId: "APTSTATUS0001" } });
    expect(retry.httpStatus).toBe(500);
    expect(mocks.sendUnconfirmablePaymentEmail).not.toHaveBeenCalled();
  });
});

describe("messages d’erreur de la réservation", () => {
  it("donne une consigne claire quand Stripe est indisponible, libère le créneau et n’expose pas le texte Stripe", async () => {
    const slots = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: "00:00", endTime: "00:00" }));
    const reads: unknown[][] = [[{ count: 0 }], [], slots, []];
    const updates: Array<Record<string, unknown>> = [];
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => {
        const result = reads.shift() ?? [];
        const query = { from: () => query, where: () => query, limit: async () => result, then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) };
        return query;
      }),
      execute: vi.fn(async () => ({ rowCount: 1 })),
      update: vi.fn(() => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updates.push(values); return { rowCount: 1 }; } }) })),
    });
    mocks.stripeCreate.mockRejectedValue(Object.assign(new Error("An error occurred with our connection to Stripe. sk_test_secret"), { name: "StripeConnectionError" }));
    const date = parseAppointmentDate(`${parisDateKey(new Date(Date.now() + 3 * 86_400_000))}T10:00`).toISOString();

    const error = await caller().appointments.create({ customerName: "Patient", customerEmail: "p@example.test", customerPhone: "+33612345678", appointmentDate: date, requestDetails: "Demande" }).catch(e => e);

    expect(error).toMatchObject({ code: "SERVICE_UNAVAILABLE", message: BOOKING_PAYMENT_UNAVAILABLE_MESSAGE });
    expect(String(error.message)).not.toContain("Stripe");
    expect(updates[0]).toMatchObject({ appointmentStatus: "cancelled", slotKey: null });
  });

  it("refuse les caractères de contrôle (octet NUL) avant toute requête SQL", async () => {
    const error = await caller().appointments.create({ customerName: "Leak\u0000Test", customerEmail: "p@example.test", customerPhone: "+33612345678", appointmentDate: "2027-01-10T10:00", requestDetails: "Demande" }).catch(e => e);
    expect(error).toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("remplace le texte d’une erreur inattendue (SQL, fournisseur) par un message générique avec référence", () => {
    const shape = { message: "Failed query: INSERT INTO appointments (tracking_id) VALUES ($1) params: APT1", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: "appointments.create", stack: "Error: at db" } };
    const formatted = formatTrpcErrorShape(shape, { code: "INTERNAL_SERVER_ERROR", cause: new Error("Failed query: INSERT INTO appointments") }, () => "ref12345");
    expect(formatted.message).toBe(`${GENERIC_INTERNAL_ERROR_MESSAGE} (réf. ref12345)`);
    expect(JSON.stringify(formatted)).not.toContain("INSERT");
    expect(formatted.data.stack).toBeUndefined();
    // Une erreur métier délibérée garde son message.
    const deliberate = { ...shape, message: "Base de données indisponible." };
    expect(formatTrpcErrorShape(deliberate, { code: "INTERNAL_SERVER_ERROR" }).message).toBe("Base de données indisponible.");
    const conflict = { ...shape, message: "Ce créneau chevauche une réservation existante", data: { ...shape.data, code: "CONFLICT" } };
    expect(formatTrpcErrorShape(conflict, { code: "CONFLICT", cause: new Error("x") })).toBe(conflict);
  });
});
