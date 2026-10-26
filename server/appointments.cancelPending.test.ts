import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { appointments } from "../drizzle/schema";
import { createInMemoryDrizzle } from "./testSupport/inMemoryDrizzle";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  stripeRetrieve: vi.fn(),
  stripeExpire: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: vi.fn(), retrieve: mocks.stripeRetrieve, expire: mocks.stripeExpire } },
  })),
}));

function publicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function fakeDb() {
  const db = { update: vi.fn(() => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) })) };
  mocks.getDb.mockResolvedValue(db);
  return db;
}

function checkoutSession(overrides: Record<string, unknown> = {}) {
  return { id: "cs_test_back", status: "open", payment_status: "unpaid", metadata: { trackingId: "APT-42" }, ...overrides };
}

const cancel = () => appRouter.createCaller(publicContext()).appointments.cancelPending({ sessionId: "cs_test_back" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_cancel_pending");
  mocks.stripeExpire.mockResolvedValue(checkoutSession({ status: "expired" }));
});

afterEach(() => vi.unstubAllEnvs());

describe("appointments.cancelPending — retour depuis Stripe Checkout", () => {
  it("expire la session Stripe encore ouverte avant de libérer le créneau", async () => {
    const db = fakeDb();
    mocks.stripeRetrieve.mockResolvedValue(checkoutSession());

    await expect(cancel()).resolves.toEqual({ success: true, cancelled: true });

    expect(mocks.stripeExpire).toHaveBeenCalledWith("cs_test_back");
    expect(mocks.stripeExpire.mock.invocationCallOrder[0]).toBeLessThan(db.update.mock.invocationCallOrder[0]);
  });

  it("garde le créneau si Stripe refuse d’expirer la session (paiement en cours d’aboutir)", async () => {
    const db = fakeDb();
    mocks.stripeRetrieve.mockResolvedValue(checkoutSession());
    mocks.stripeExpire.mockRejectedValueOnce(new Error("Only Checkout Sessions with a status of open can be expired"));

    await expect(cancel()).resolves.toEqual({ success: true, cancelled: false });

    expect(db.update).not.toHaveBeenCalled();
  });

  it("ne touche ni à Stripe ni au créneau pour une session déjà terminée", async () => {
    const db = fakeDb();
    mocks.stripeRetrieve.mockResolvedValue(checkoutSession({ status: "complete", payment_status: "paid" }));

    await expect(cancel()).resolves.toEqual({ success: true, cancelled: false });

    expect(mocks.stripeExpire).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("libère le créneau sans rappeler Stripe quand la session a déjà expiré", async () => {
    const db = fakeDb();
    mocks.stripeRetrieve.mockResolvedValue(checkoutSession({ status: "expired" }));

    await expect(cancel()).resolves.toEqual({ success: true, cancelled: true });

    expect(mocks.stripeExpire).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});

describe("appointments.cancelPending — créneau libéré dans la base", () => {
  function seed(db: ReturnType<typeof createInMemoryDrizzle>, values: Record<string, unknown>) {
    return db.seed(appointments, {
      customerName: "Patient Test",
      customerEmail: "patient@example.test",
      customerPhone: "+33600000000",
      requestDetails: "",
      appointmentDate: new Date("2026-11-05T17:00:00.000Z"),
      basePrice: "100.00",
      finalPrice: "100.00",
      paymentStatus: "pending",
      ...values,
    });
  }

  it("annule immédiatement un checkout abandonné encore retenu, et seulement lui", async () => {
    const db = createInMemoryDrizzle();
    mocks.getDb.mockResolvedValue(db);
    const held = seed(db, { trackingId: "APT-42", stripeSessionId: "cs_test_back", appointmentStatus: "held", slotKey: "2026-11-05T17:00:00.000Z", holdExpiresAt: new Date("2026-10-26T10:30:00.000Z") });
    mocks.stripeRetrieve.mockResolvedValue(checkoutSession());

    await expect(cancel()).resolves.toEqual({ success: true, cancelled: true });

    expect(held).toMatchObject({ appointmentStatus: "cancelled", slotKey: null, holdExpiresAt: null, cancelledAt: expect.any(Date) });
  });

  it("ne libère jamais un rendez-vous déjà confirmé, même encore marqué en attente de paiement", async () => {
    const db = createInMemoryDrizzle();
    mocks.getDb.mockResolvedValue(db);
    const confirmed = seed(db, { trackingId: "APT-42", stripeSessionId: "cs_test_back", appointmentStatus: "confirmed", slotKey: "2026-11-05T17:00:00.000Z" });
    mocks.stripeRetrieve.mockResolvedValue(checkoutSession());

    await expect(cancel()).resolves.toEqual({ success: true, cancelled: false });

    expect(confirmed).toMatchObject({ appointmentStatus: "confirmed", slotKey: "2026-11-05T17:00:00.000Z", cancelledAt: null });
  });
});
