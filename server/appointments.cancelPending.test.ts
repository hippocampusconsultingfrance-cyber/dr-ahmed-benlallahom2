import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter, PUBLIC_FORM_RATE_LIMITS } from "./routers";
import { createTestContext } from "./testSupport/trpcContext";
import { appointments } from "../drizzle/schema";
import { hashSecurityValue } from "./candidateSecurity";
import { createInMemoryDrizzle } from "./testSupport/inMemoryDrizzle";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  stripeRetrieve: vi.fn(),
  stripeExpire: vi.fn(),
  // Compteurs persistants simulés (RES-08) : un essai compté, puis rendu, par action et par sujet.
  attempts: new Map<string, number>(),
  enforcePersistentRateLimit: vi.fn(
    async ({
      action,
      subject,
      maxAttempts,
    }: {
      action: string;
      subject: string;
      maxAttempts: number;
    }) => {
      const count = (mocks.attempts.get(`${action}|${subject}`) ?? 0) + 1;
      mocks.attempts.set(`${action}|${subject}`, count);
      if (count > maxAttempts)
        throw new Error("candidate_security_rate_limited");
    }
  ),
  releasePersistentRateLimitAttempt: vi.fn(
    async ({ action, subject }: { action: string; subject: string }) => {
      mocks.attempts.set(
        `${action}|${subject}`,
        Math.max((mocks.attempts.get(`${action}|${subject}`) ?? 0) - 1, 0)
      );
    }
  ),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...(await importOriginal<typeof import("./candidateSecurity")>()),
  enforcePersistentRateLimit: mocks.enforcePersistentRateLimit,
  releasePersistentRateLimitAttempt: mocks.releasePersistentRateLimitAttempt,
  logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: mocks.stripeRetrieve,
        expire: mocks.stripeExpire,
      },
    },
  })),
}));

const publicContext = (req: Record<string, unknown> = {}) =>
  createTestContext({ req });

function fakeDb() {
  const db = {
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ customerEmail: "patient@example.test" }],
        }),
      }),
    })),
  };
  mocks.getDb.mockResolvedValue(db);
  return db;
}

function checkoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_back",
    status: "open",
    payment_status: "unpaid",
    metadata: { trackingId: "APT-42" },
    ...overrides,
  };
}

const cancel = () =>
  appRouter
    .createCaller(publicContext())
    .appointments.cancelPending({ sessionId: "cs_test_back" });

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
    expect(mocks.stripeExpire.mock.invocationCallOrder[0]).toBeLessThan(
      db.update.mock.invocationCallOrder[0]
    );
  });

  it("garde le créneau si Stripe refuse d’expirer la session (paiement en cours d’aboutir)", async () => {
    const db = fakeDb();
    mocks.stripeRetrieve.mockResolvedValue(checkoutSession());
    mocks.stripeExpire.mockRejectedValueOnce(
      new Error("Only Checkout Sessions with a status of open can be expired")
    );

    await expect(cancel()).resolves.toEqual({
      success: true,
      cancelled: false,
    });

    expect(db.update).not.toHaveBeenCalled();
  });

  it("ne touche ni à Stripe ni au créneau pour une session déjà terminée", async () => {
    const db = fakeDb();
    mocks.stripeRetrieve.mockResolvedValue(
      checkoutSession({ status: "complete", payment_status: "paid" })
    );

    await expect(cancel()).resolves.toEqual({
      success: true,
      cancelled: false,
    });

    expect(mocks.stripeExpire).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("libère le créneau sans rappeler Stripe quand la session a déjà expiré", async () => {
    const db = fakeDb();
    mocks.stripeRetrieve.mockResolvedValue(
      checkoutSession({ status: "expired" })
    );

    await expect(cancel()).resolves.toEqual({ success: true, cancelled: true });

    expect(mocks.stripeExpire).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});

describe("appointments.cancelPending — créneau libéré dans la base", () => {
  function seed(
    db: ReturnType<typeof createInMemoryDrizzle>,
    values: Record<string, unknown>
  ) {
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
    const held = seed(db, {
      trackingId: "APT-42",
      stripeSessionId: "cs_test_back",
      appointmentStatus: "held",
      slotKey: "2026-11-05T17:00:00.000Z",
      holdExpiresAt: new Date("2026-10-26T10:30:00.000Z"),
    });
    mocks.stripeRetrieve.mockResolvedValue(checkoutSession());

    await expect(cancel()).resolves.toEqual({ success: true, cancelled: true });

    expect(held).toMatchObject({
      appointmentStatus: "cancelled",
      slotKey: null,
      holdExpiresAt: null,
      cancelledAt: expect.any(Date),
    });
  });

  it("rend au patient qui annule l’essai de réservation compté pour son IP et pour son email, une fois, dans la limite du plafond des essais rendus (RES-08)", async () => {
    // Le limiteur, neutralisé sous Vitest, est rétabli comme en production.
    vi.stubEnv("VITEST", "false");
    vi.stubEnv("NODE_ENV", "production");
    const ip = "203.0.113.42";
    const bookingIp = `${PUBLIC_FORM_RATE_LIMITS.bookingIp.action}|ip:${hashSecurityValue(ip)}`;
    const bookingEmail = `${PUBLIC_FORM_RATE_LIMITS.bookingEmail.action}|email:patient@example.test`;
    const givenBack = `${PUBLIC_FORM_RATE_LIMITS.bookingGiveBackIp.action}|ip:${hashSecurityValue(ip)}`;
    const cancelFrom = (sessionId = "cs_test_back") =>
      appRouter
        .createCaller(publicContext({ ip }))
        .appointments.cancelPending({ sessionId });
    mocks.attempts.clear();
    mocks.attempts.set(bookingIp, 3);
    mocks.attempts.set(bookingEmail, 3);
    const db = createInMemoryDrizzle();
    mocks.getDb.mockResolvedValue(db);
    // Adresse enregistrée telle que saisie : le compteur, lui, la lit en minuscules.
    seed(db, {
      trackingId: "APT-42",
      stripeSessionId: "cs_test_back",
      customerEmail: "Patient@Example.test",
      appointmentStatus: "held",
      slotKey: "2026-11-05T17:00:00.000Z",
      holdExpiresAt: new Date("2026-10-26T10:30:00.000Z"),
    });
    mocks.stripeRetrieve.mockResolvedValue(checkoutSession());

    await expect(cancelFrom()).resolves.toEqual({
      success: true,
      cancelled: true,
    });
    expect(mocks.attempts.get(bookingIp)).toBe(2);
    expect(mocks.attempts.get(bookingEmail)).toBe(2);
    expect(mocks.attempts.get(givenBack)).toBe(1);
    // Le plafond des refus anti-robot (ABUS-02) n’est pas entamé.
    expect(
      mocks.attempts.has(
        `${PUBLIC_FORM_RATE_LIMITS.bookingChallengeIp.action}|ip:${hashSecurityValue(ip)}`
      )
    ).toBe(false);

    // Déjà annulée : rien n’est rendu une seconde fois.
    await expect(cancelFrom()).resolves.toEqual({
      success: true,
      cancelled: false,
    });
    expect(mocks.attempts.get(bookingIp)).toBe(2);
    expect(mocks.attempts.get(bookingEmail)).toBe(2);

    // Plafond des essais rendus atteint : l’annulation aboutit, les essais restent comptés.
    seed(db, {
      trackingId: "APT-43",
      stripeSessionId: "cs_test_back2",
      appointmentStatus: "held",
      slotKey: "2026-11-05T17:30:00.000Z",
      holdExpiresAt: new Date("2026-10-26T10:30:00.000Z"),
    });
    mocks.stripeRetrieve.mockResolvedValue(
      checkoutSession({
        id: "cs_test_back2",
        metadata: { trackingId: "APT-43" },
      })
    );
    mocks.attempts.set(
      givenBack,
      PUBLIC_FORM_RATE_LIMITS.bookingGiveBackIp.maxAttempts
    );
    await expect(cancelFrom("cs_test_back2")).resolves.toEqual({
      success: true,
      cancelled: true,
    });
    expect(mocks.attempts.get(bookingIp)).toBe(2);
    expect(mocks.attempts.get(bookingEmail)).toBe(2);
  });

  it("ne libère jamais un rendez-vous déjà confirmé, même encore marqué en attente de paiement", async () => {
    const db = createInMemoryDrizzle();
    mocks.getDb.mockResolvedValue(db);
    const confirmed = seed(db, {
      trackingId: "APT-42",
      stripeSessionId: "cs_test_back",
      appointmentStatus: "confirmed",
      slotKey: "2026-11-05T17:00:00.000Z",
    });
    mocks.stripeRetrieve.mockResolvedValue(checkoutSession());

    await expect(cancel()).resolves.toEqual({
      success: true,
      cancelled: false,
    });

    expect(confirmed).toMatchObject({
      appointmentStatus: "confirmed",
      slotKey: "2026-11-05T17:00:00.000Z",
      cancelledAt: null,
    });
  });
});
