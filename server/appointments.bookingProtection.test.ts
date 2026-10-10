import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  ACTIVE_APPOINTMENT_HOLDS_LIMIT_MESSAGE,
  BOOKING_RATE_LIMIT_MESSAGE,
  MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL,
  appRouter,
  parisDateKey,
  parseAppointmentDate,
} from "./routers";
import { requestIpHash } from "./candidateSecurity";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  enforcePersistentRateLimit: vi.fn(),
  logSecurityEvent: vi.fn(),
  releaseExpiredAppointmentHolds: vi.fn(),
  stripeCreate: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: mocks.enforcePersistentRateLimit,
  logSecurityEvent: mocks.logSecurityEvent,
}));
vi.mock("./appointmentHolds", async importOriginal => ({
  ...await importOriginal<typeof import("./appointmentHolds")>(),
  releaseExpiredAppointmentHolds: mocks.releaseExpiredAppointmentHolds,
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mocks.stripeCreate, retrieve: vi.fn() } },
  })),
}));

const dialect = new PgDialect();
const EVERY_DAY_SLOTS = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: "08:00", endTime: "20:00" }));

function futureAppointmentDate(): string {
  const dateKey = parisDateKey(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
  return parseAppointmentDate(`${dateKey}T10:00`).toISOString();
}

function bookingInput(overrides: Partial<{ customerEmail: string }> = {}) {
  return {
    customerName: "Patient Synthétique",
    customerEmail: "Patient@Example.com",
    customerPhone: "+33 6 00 00 00 00",
    appointmentDate: futureAppointmentDate(),
    requestDetails: "Demande de conseil santé synthétique.",
    ...overrides,
  };
}

function publicContext(headers: Record<string, string> = {}, ip?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers, ip } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function fakeDb(activeHoldCount: number | string) {
  const selectResults: unknown[][] = [[{ count: activeHoldCount }], [], EVERY_DAY_SLOTS, []];
  const whereClauses: SQL[] = [];
  const db = {
    whereClauses,
    select: vi.fn(() => {
      const result = selectResults.shift() ?? [];
      const query = {
        from: () => query,
        where: (clause: SQL) => {
          whereClauses.push(clause);
          return query;
        },
        limit: async () => result,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    }),
    execute: vi.fn(async () => ({ rowCount: 1 })),
    update: vi.fn(() => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) })),
  };
  return db;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Les refus métier attendus sont journalisés par la procédure ; inutile de les afficher ici.
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_booking_protection");
  mocks.releaseExpiredAppointmentHolds.mockResolvedValue({ released: 0 });
  mocks.enforcePersistentRateLimit.mockResolvedValue(undefined);
  mocks.logSecurityEvent.mockResolvedValue(undefined);
  mocks.stripeCreate.mockResolvedValue({ id: "cs_test_synthetic", url: "https://checkout.stripe.test/session" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleErrorSpy.mockRestore();
});

describe("appointments.create — plafond de créneaux retenus par email", () => {
  it("refuse un troisième créneau en attente pour la même adresse, sans toucher à l’agenda ni à Stripe", async () => {
    const db = fakeDb(MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL);
    mocks.getDb.mockResolvedValue(db);

    await expect(appRouter.createCaller(publicContext()).appointments.create(bookingInput()))
      .rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: ACTIVE_APPOINTMENT_HOLDS_LIMIT_MESSAGE });

    expect(db.execute).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("ne compte que les créneaux encore retenus, avec une comparaison d’email insensible à la casse", async () => {
    const db = fakeDb(MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL);
    mocks.getDb.mockResolvedValue(db);

    await expect(appRouter.createCaller(publicContext()).appointments.create(bookingInput())).rejects.toThrow();

    const { sql, params } = dialect.sqlToQuery(db.whereClauses[0]);
    expect(sql).toContain('LOWER("appointments"."customer_email") = $1');
    expect(params[0]).toBe("patient@example.com");
    expect(sql).toContain('"appointments"."payment_status" = $2');
    expect(sql).toContain('"appointments"."appointment_status" = $3');
    expect(params.slice(1, 3)).toEqual(["pending", "held"]);
    expect(sql).toContain('"appointments"."hold_expires_at" > NOW()');
  });

  it("laisse réserver sous le plafond et libelle la ligne Stripe en français", async () => {
    // Neon renvoie COUNT(*) sous forme de chaîne.
    const db = fakeDb(String(MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL - 1));
    mocks.getDb.mockResolvedValue(db);

    const result = await appRouter.createCaller(publicContext()).appointments.create(bookingInput());

    expect(result).toMatchObject({ success: true, checkoutUrl: "https://checkout.stripe.test/session" });
    expect(db.execute).toHaveBeenCalledTimes(1);
    const [stripeParams] = mocks.stripeCreate.mock.calls[0];
    expect(stripeParams.line_items[0].price_data.product_data).toEqual({
      name: "Consultation de conseil santé – 30 minutes",
      description: `Rendez-vous : ${result.trackingId}`,
    });
  });
});

describe("appointments.create — limitation de débit persistante", () => {
  beforeEach(() => {
    // Le limiteur est volontairement neutralisé sous Vitest ; on simule ici un
    // environnement réel pour vérifier son câblage.
    vi.stubEnv("VITEST", "false");
    vi.stubEnv("NODE_ENV", "production");
  });

  it("compte chaque tentative par IP puis par email avant tout accès à l’agenda", async () => {
    const db = fakeDb(MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL);
    mocks.getDb.mockResolvedValue(db);
    const headers = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" };

    await expect(appRouter.createCaller(publicContext(headers)).appointments.create(bookingInput()))
      .rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: ACTIVE_APPOINTMENT_HOLDS_LIMIT_MESSAGE });

    expect(mocks.enforcePersistentRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.enforcePersistentRateLimit).toHaveBeenNthCalledWith(1, {
      action: "public_booking_create_ip",
      subject: `ip:${requestIpHash(headers)}`,
      maxAttempts: 6,
      windowMs: 60 * 60 * 1000,
      blockMs: 60 * 60 * 1000,
    });
    expect(mocks.enforcePersistentRateLimit).toHaveBeenNthCalledWith(2, {
      action: "public_booking_create_email",
      subject: "email:patient@example.com",
      maxAttempts: 5,
      windowMs: 60 * 60 * 1000,
      blockMs: 60 * 60 * 1000,
    });
  });

  it("bloque une IP trop active avec un message français, sans retenir de créneau", async () => {
    const db = fakeDb(0);
    mocks.getDb.mockResolvedValue(db);
    mocks.enforcePersistentRateLimit.mockRejectedValueOnce(new Error("candidate_security_rate_limited"));

    await expect(appRouter.createCaller(publicContext({ "x-forwarded-for": "203.0.113.8" })).appointments.create(bookingInput()))
      .rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: BOOKING_RATE_LIMIT_MESSAGE });

    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
      category: "public_booking_create_ip_rate_limit",
      outcome: "blocked",
    }));
    expect(mocks.enforcePersistentRateLimit).toHaveBeenCalledTimes(1);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("bloque aussi une adresse email qui multiplie les tentatives depuis plusieurs IP", async () => {
    const db = fakeDb(0);
    mocks.getDb.mockResolvedValue(db);
    mocks.enforcePersistentRateLimit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("candidate_security_rate_limited"));

    await expect(appRouter.createCaller(publicContext({ "x-forwarded-for": "198.51.100.4" })).appointments.create(bookingInput()))
      .rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: BOOKING_RATE_LIMIT_MESSAGE });

    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ category: "public_booking_create_email_rate_limit" }));
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("se rabat sur l’IP de la connexion et ne regroupe jamais les patients sans IP dans un compteur commun", async () => {
    mocks.getDb.mockResolvedValue(fakeDb(MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL));

    await expect(appRouter.createCaller(publicContext({}, "192.0.2.10")).appointments.create(bookingInput())).rejects.toThrow();
    expect(mocks.enforcePersistentRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.enforcePersistentRateLimit.mock.calls[0][0].subject).toMatch(/^ip:[0-9a-f]{64}$/);

    mocks.enforcePersistentRateLimit.mockClear();
    mocks.getDb.mockResolvedValue(fakeDb(MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL));
    await expect(appRouter.createCaller(publicContext()).appointments.create(bookingInput())).rejects.toThrow();
    expect(mocks.enforcePersistentRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.enforcePersistentRateLimit.mock.calls[0][0]).toMatchObject({ action: "public_booking_create_email" });
  });
});
