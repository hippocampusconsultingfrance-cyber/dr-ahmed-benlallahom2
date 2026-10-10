import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
