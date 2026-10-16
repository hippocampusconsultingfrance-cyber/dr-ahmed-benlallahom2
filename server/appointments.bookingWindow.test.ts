import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter, parseAppointmentDate } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  BOOKING_HORIZON_MS,
  BOOKING_INVALID_PHONE_MESSAGE,
  BOOKING_MIN_LEAD_TIME_MS,
  BOOKING_TOO_FAR_MESSAGE,
  BOOKING_TOO_SOON_MESSAGE,
  getBookingWindowIssue,
  isPlausiblePhoneNumber,
} from "../shared/bookingPolicy";

// M2 — BOOK-LEADTIME / BOOK-NO-HORIZON / BOOK-INVALIDCAL / BOOK-STRIPE-EXPIRY-MARGIN.

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  releaseExpiredAppointmentHolds: vi.fn(),
  stripeCreate: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./appointmentHolds", async importOriginal => ({
  ...await importOriginal<typeof import("./appointmentHolds")>(),
  releaseExpiredAppointmentHolds: mocks.releaseExpiredAppointmentHolds,
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mocks.stripeCreate, retrieve: vi.fn() } },
  })),
}));

const ALL_DAY_SLOTS = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: "00:00", endTime: "00:00" }));

function fakeDb() {
  const selectResults: unknown[][] = [[{ count: 0 }], [], ALL_DAY_SLOTS, []];
  const inserted: unknown[] = [];
  return {
    inserted,
    select: vi.fn(() => {
      const result = selectResults.shift() ?? [];
      const query = {
        from: () => query,
        where: () => query,
        limit: async () => result,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    }),
    execute: vi.fn(async (statement: unknown) => { inserted.push(statement); return { rowCount: 1 }; }),
    update: vi.fn(() => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) })),
  };
}

function publicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {}, ip: "192.0.2.1" } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

/** Next half-hour boundary at least `offsetMs` from now (slots are on :00/:30). */
function slotStartAfter(offsetMs: number): Date {
  const halfHour = 30 * 60 * 1000;
  return new Date(Math.ceil((Date.now() + offsetMs) / halfHour) * halfHour);
}

function booking(appointmentDate: string, overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Patient Synthétique",
    customerEmail: "patient@example.com",
    customerPhone: "+33 6 12 34 56 78",
    appointmentDate,
    requestDetails: "Demande d’avis",
    ...overrides,
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_booking_window");
  mocks.releaseExpiredAppointmentHolds.mockResolvedValue({ released: 0 });
  mocks.stripeCreate.mockResolvedValue({ id: "cs_test_window", url: "https://checkout.stripe.test/window" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleErrorSpy.mockRestore();
});

describe("règles partagées de fenêtre de réservation", () => {
  it("impose 2 h de délai minimal (passé compris) et 90 jours d’horizon", () => {
    const now = Date.UTC(2026, 9, 16, 8, 0);
    expect(BOOKING_MIN_LEAD_TIME_MS).toBe(2 * 60 * 60 * 1000);
    expect(BOOKING_HORIZON_MS).toBe(90 * 24 * 60 * 60 * 1000);
    expect(getBookingWindowIssue(new Date(now - 60_000), now)).toBe("too_soon");
    expect(getBookingWindowIssue(new Date(now + BOOKING_MIN_LEAD_TIME_MS - 1), now)).toBe("too_soon");
    expect(getBookingWindowIssue(new Date(now + BOOKING_MIN_LEAD_TIME_MS), now)).toBeNull();
    expect(getBookingWindowIssue(new Date(now + BOOKING_HORIZON_MS), now)).toBeNull();
    expect(getBookingWindowIssue(new Date(now + BOOKING_HORIZON_MS + 1), now)).toBe("too_far");
  });

  it("valide un numéro de téléphone plausible", () => {
    for (const valid of ["+33 6 12 34 56 78", "06.12.34.56.78", "0612345678", "+1 (415) 555-0100", "+971 50 123 4567"]) {
      expect(isPlausiblePhoneNumber(valid), valid).toBe(true);
    }
    for (const invalid of ["abc", "123", "+33 6 12 34 56 78 90 12 34", "06 12 34 56 78 ext", "++33612345678", "-0612345678"]) {
      expect(isPlausiblePhoneNumber(invalid), invalid).toBe(false);
    }
  });
});

describe("parseAppointmentDate — dates impossibles", () => {
  it("refuse une date calendaire impossible au lieu de la décaler", () => {
    for (const value of ["2027-02-30T10:00", "2027-02-30T10:00:00.000Z", "2026-13-01T10:00", "2026-04-31", "2026-10-20T25:00", "2026-10-20T10:60"]) {
      expect(() => parseAppointmentDate(value), value).toThrow("Invalid appointment date");
    }
  });

  it("refuse une heure de Paris inexistante (passage à l’heure d’été)", () => {
    expect(() => parseAppointmentDate("2026-03-29T02:30")).toThrow("Invalid appointment date");
    expect(parseAppointmentDate("2026-03-29T03:30").toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("accepte toujours les formats envoyés par le client et l’heure de Paris", () => {
    expect(parseAppointmentDate("2026-10-20T08:00:00.000Z").toISOString()).toBe("2026-10-20T08:00:00.000Z");
    expect(parseAppointmentDate("2026-10-20T10:00").toISOString()).toBe("2026-10-20T08:00:00.000Z");
    expect(parseAppointmentDate("2026-10-20T10:00+02:00").toISOString()).toBe("2026-10-20T08:00:00.000Z");
    expect(parseAppointmentDate("2027-02-28T10:00").toISOString()).toBe("2027-02-28T09:00:00.000Z");
  });

  it("refuse aussi une date impossible dans le calcul du tarif", async () => {
    await expect(appRouter.createCaller(publicContext()).appointments.calculatePrice({ appointmentDate: "2026-02-30T10:00" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("appointments.create — délai, horizon, téléphone et expiration Stripe", () => {
  it("refuse un créneau qui commence dans moins de 2 h, sans retenir de créneau", async () => {
    const db = fakeDb();
    mocks.getDb.mockResolvedValue(db);

    await expect(appRouter.createCaller(publicContext()).appointments.create(booking(slotStartAfter(60 * 60 * 1000).toISOString())))
      .rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT", message: BOOKING_TOO_SOON_MESSAGE });
    await expect(appRouter.createCaller(publicContext()).appointments.create(booking(new Date(Date.now() - 60 * 60 * 1000).toISOString())))
      .rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT", message: BOOKING_TOO_SOON_MESSAGE });

    expect(db.execute).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("refuse un créneau au-delà de 90 jours (ex. 2099)", async () => {
    const db = fakeDb();
    mocks.getDb.mockResolvedValue(db);

    await expect(appRouter.createCaller(publicContext()).appointments.create(booking("2099-06-15T10:00")))
      .rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT", message: BOOKING_TOO_FAR_MESSAGE });
    await expect(appRouter.createCaller(publicContext()).appointments.create(booking(slotStartAfter(91 * 24 * 60 * 60 * 1000).toISOString())))
      .rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("refuse un téléphone invalide et une date impossible", async () => {
    mocks.getDb.mockResolvedValue(fakeDb());
    const caller = appRouter.createCaller(publicContext());

    await expect(caller.appointments.create(booking(slotStartAfter(3 * 24 * 60 * 60 * 1000).toISOString(), { customerPhone: "abc" })))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining(BOOKING_INVALID_PHONE_MESSAGE) });
    await expect(caller.appointments.create(booking("2027-02-30T10:00")))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("ouvre une session Stripe qui expire au moins 31 min après sa création et avant le début du créneau", async () => {
    const db = fakeDb();
    mocks.getDb.mockResolvedValue(db);
    const start = slotStartAfter(BOOKING_MIN_LEAD_TIME_MS + 5 * 60 * 1000);
    const before = Math.floor(Date.now() / 1000);

    const result = await appRouter.createCaller(publicContext()).appointments.create(booking(start.toISOString()));

    // Session et fin du maintien renvoyées pour « Reprendre le paiement » après un retour arrière.
    expect(result).toMatchObject({ success: true, checkoutSessionId: "cs_test_window" });
    const [params] = mocks.stripeCreate.mock.calls[0];
    expect(Math.floor(new Date(result.holdExpiresAt).getTime() / 1000)).toBe(params.expires_at);
    expect(params.expires_at - before).toBeGreaterThanOrEqual(31 * 60);
    expect(params.expires_at).toBeLessThanOrEqual(Math.floor(start.getTime() / 1000));
  });
});
