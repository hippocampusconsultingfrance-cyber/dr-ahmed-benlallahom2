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
import { createTestContext } from "./testSupport/trpcContext";

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
// Few holds awaiting payment: no anti-robot check (ABUS-02, covered by appointments.holdAbuse.test.ts).
vi.mock("./appointmentHoldAbuse", () => ({ bookingChallengeRequired: vi.fn(async () => false), recordBookingHold: vi.fn(async () => undefined) }));
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

const publicContext = (headers: Record<string, string> = {}, ip?: string) => createTestContext({ req: { headers, ip } });

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

describe("appointments.create — maintien avant paiement et session Checkout (P0/P1)", () => {
  const confirmationUrl = (status: "success" | "canceled", trackingId: string) => status === "success"
    ? `https://drahmedbenlallahom.com/booking/confirmation?status=success&trackingId=${trackingId}&session_id={CHECKOUT_SESSION_ID}`
    : "https://drahmedbenlallahom.com/booking/confirmation?status=canceled&session_id={CHECKOUT_SESSION_ID}";

  it("retient le créneau sans le confirmer, et la session Stripe expire avec ce maintien, sans code promotionnel", async () => {
    const db = fakeDb(0);
    mocks.getDb.mockResolvedValue(db);
    // A forged Host or Origin never chooses where Stripe sends the patient back.
    const result = await appRouter.createCaller(publicContext({ host: "evil.example", origin: "https://evil.example" })).appointments.create(bookingInput());

    const [insert] = db.execute.mock.calls[0] as unknown as [SQL];
    const { sql, params } = dialect.sqlToQuery(insert);
    expect(sql).toMatch(/payment_status, appointment_status, hold_expires_at, language\) VALUES/);
    // DATA-13: the end of the hold as an ISO-8601 UTC string, not a Date.
    expect(params.slice(-4)).toEqual(["pending", "held", result.holdExpiresAt, "fr"]);

    const [stripeParams] = mocks.stripeCreate.mock.calls[0];
    expect(stripeParams.expires_at).toBe(Math.floor(Date.parse(result.holdExpiresAt) / 1000));
    expect(stripeParams).not.toHaveProperty("allow_promotion_codes");
    expect(stripeParams.success_url).toBe(confirmationUrl("success", result.trackingId));
    expect(stripeParams.cancel_url).toBe(confirmationUrl("canceled", result.trackingId));
  });

  it("reprend le paiement avec le même libellé, la même expiration et le même retour", async () => {
    const holdExpiresAt = new Date(Date.now() + 45 * 60 * 1000 + 789);
    const held = { trackingId: "APTRESUME0001", customerEmail: "patient@example.com", customerName: "Patient Synthétique", finalPrice: "150.00", paymentStatus: "pending", appointmentStatus: "held", stripeSessionId: null, holdExpiresAt };
    const update = vi.fn(() => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) }));
    mocks.getDb.mockResolvedValue({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [held] }) }) }), update });

    await appRouter.createCaller(publicContext({ origin: "https://evil.example" })).appointments.createCheckoutSession({
      trackingId: held.trackingId, finalPrice: 150, customerEmail: held.customerEmail, customerName: held.customerName,
    });

    const [stripeParams] = mocks.stripeCreate.mock.calls[0];
    expect(stripeParams.line_items[0].price_data).toMatchObject({ unit_amount: 15000, product_data: { name: "Consultation de conseil santé – 30 minutes", description: "Rendez-vous : APTRESUME0001" } });
    expect(stripeParams.expires_at).toBe(Math.floor(holdExpiresAt.getTime() / 1000));
    expect(stripeParams).not.toHaveProperty("allow_promotion_codes");
    expect(stripeParams.success_url).toBe(confirmationUrl("success", held.trackingId));
    expect(stripeParams.cancel_url).toBe(confirmationUrl("canceled", held.trackingId));
  });

  it("reprend le paiement avec le nom tel que la page l’a gardé, alors qu’il est enregistré nettoyé (INTL-05)", async () => {
    // Espaces finaux (suggestion du clavier), RLM collés autour d’un nom arabe, forme NFD.
    const typedNames: Array<[string, string]> = [
      ["Patient Synthétique  ", "Patient Synthétique"],
      ["‏محمد العتيبي‏", "محمد العتيبي"],
      ["Zoë Ørsted", "Zoë Ørsted"],
    ];
    for (const [typedName, storedName] of typedNames) {
      const db = fakeDb(0);
      mocks.getDb.mockResolvedValue(db);
      const booked = await appRouter.createCaller(publicContext()).appointments.create({ ...bookingInput(), customerName: typedName });
      const [insert] = db.execute.mock.calls[0] as unknown as [SQL];
      expect(dialect.sqlToQuery(insert).params[1], JSON.stringify(typedName)).toBe(storedName);

      // Retour arrière depuis Stripe : la page renvoie le nom et l’adresse qu’elle a gardés.
      const held = { trackingId: booked.trackingId, customerEmail: "Patient@Example.com", customerName: storedName, finalPrice: "100.00", paymentStatus: "pending", appointmentStatus: "held", stripeSessionId: null, holdExpiresAt: new Date(Date.now() + 45 * 60 * 1000) };
      mocks.getDb.mockResolvedValue({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [held] }) }) }), update: vi.fn(() => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) })) });
      const resume = { trackingId: held.trackingId, finalPrice: 100, customerEmail: "Patient@Example.com" };
      await expect(appRouter.createCaller(publicContext()).appointments.createCheckoutSession({ ...resume, customerName: typedName }), JSON.stringify(typedName))
        .resolves.toMatchObject({ success: true, checkoutUrl: "https://checkout.stripe.test/session" });
      // Un autre nom reste refusé.
      await expect(appRouter.createCaller(publicContext()).appointments.createCheckoutSession({ ...resume, customerName: "Patient Autre" }))
        .rejects.toMatchObject({ code: "BAD_REQUEST", message: "Les informations du paiement ne correspondent pas au rendez-vous" });
    }
  });

  it("refuse une adresse email invalide ou trop longue avant tout accès à l’agenda", async () => {
    mocks.getDb.mockResolvedValue(fakeDb(0));
    for (const customerEmail of ["pas-une-adresse", `${"a".repeat(310)}@example.com`]) {
      await expect(appRouter.createCaller(publicContext()).appointments.create(bookingInput({ customerEmail }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});

describe("appointments.create — langue de la réservation (EN-01)", () => {
  async function storedLanguage(input: Record<string, unknown>) {
    const db = fakeDb(0);
    mocks.getDb.mockResolvedValue(db);
    await appRouter.createCaller(publicContext()).appointments.create({ ...bookingInput(), ...input } as ReturnType<typeof bookingInput>);
    const [insert] = db.execute.mock.calls[0] as unknown as [SQL];
    const { sql, params } = dialect.sqlToQuery(insert);
    expect(sql).toMatch(/hold_expires_at, language\) VALUES/);
    return params.at(-1);
  }

  it("enregistre la langue affichée par la page de réservation", async () => {
    await expect(storedLanguage({ language: "en" })).resolves.toBe("en");
    await expect(storedLanguage({ language: "zh" })).resolves.toBe("zh");
  });

  it("garde le français quand la page ne l’envoie pas, et refuse une langue inconnue", async () => {
    await expect(storedLanguage({})).resolves.toBe("fr");
    mocks.getDb.mockResolvedValue(fakeDb(0));
    await expect(appRouter.createCaller(publicContext()).appointments.create({ ...bookingInput(), language: "es" } as unknown as ReturnType<typeof bookingInput>))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
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

    // Puis, ce refus métier rendant ses essais (RES-08), le plafond par IP des essais rendus.
    expect(mocks.enforcePersistentRateLimit).toHaveBeenCalledTimes(3);
    expect(mocks.enforcePersistentRateLimit.mock.invocationCallOrder[1]).toBeLessThan(db.select.mock.invocationCallOrder[0]);
    expect(mocks.enforcePersistentRateLimit).toHaveBeenNthCalledWith(3, expect.objectContaining({ action: "public_booking_give_back_ip", subject: `ip:${requestIpHash(headers)}` }));
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
    // Par IP, par email, puis le plafond par IP des essais rendus après ce refus métier (RES-08).
    expect(mocks.enforcePersistentRateLimit).toHaveBeenCalledTimes(3);
    expect(mocks.enforcePersistentRateLimit.mock.calls[0][0].subject).toMatch(/^ip:[0-9a-f]{64}$/);
    expect(mocks.enforcePersistentRateLimit.mock.calls[2][0].subject).toBe(mocks.enforcePersistentRateLimit.mock.calls[0][0].subject);

    mocks.enforcePersistentRateLimit.mockClear();
    mocks.getDb.mockResolvedValue(fakeDb(MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL));
    await expect(appRouter.createCaller(publicContext()).appointments.create(bookingInput())).rejects.toThrow();
    expect(mocks.enforcePersistentRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.enforcePersistentRateLimit.mock.calls[0][0]).toMatchObject({ action: "public_booking_create_email" });
  });
});

// DATA-13 — a Date passed to the raw INSERT would be sent in the process's
// local time with an offset PostgreSQL drops for a `timestamp` column: from a
// process at Paris time, the hold would end 1 to 2 hours late, and the cap of
// holds per email (hold_expires_at > NOW()) would count expired ones.
describe("appointments.create — fin du maintien en UTC (DATA-13)", () => {
  const timeZone = process.env.TZ;
  afterEach(() => {
    if (timeZone === undefined) delete process.env.TZ;
    else process.env.TZ = timeZone;
  });

  it("passe hold_expires_at en chaîne ISO UTC, même quand le processus est à l’heure de Paris", async () => {
    process.env.TZ = "Europe/Paris";
    // The process is indeed at Paris time (UTC+1 or UTC+2).
    expect(new Date().getTimezoneOffset()).toBeLessThan(0);
    const db = fakeDb(0);
    mocks.getDb.mockResolvedValue(db);

    const before = Date.now();
    const result = await appRouter.createCaller(publicContext()).appointments.create(bookingInput());

    const [insert] = db.execute.mock.calls[0] as unknown as [SQL];
    const holdExpiresAt = dialect.sqlToQuery(insert).params.at(-2);
    expect(holdExpiresAt).toBe(result.holdExpiresAt);
    expect(holdExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Some thirty minutes from now in UTC, not one or two hours more.
    const minutesAhead = (Date.parse(String(holdExpiresAt)) - before) / 60_000;
    expect(minutesAhead).toBeGreaterThan(0);
    expect(minutesAhead).toBeLessThanOrEqual(60);
  });

  it("passe les bornes du contrôle de chevauchement en chaînes ISO UTC, même quand le processus est à l’heure de Paris", async () => {
    process.env.TZ = "Europe/Paris";
    const db = fakeDb(0);
    mocks.getDb.mockResolvedValue(db);
    const input = bookingInput();

    await appRouter.createCaller(publicContext()).appointments.create(input);

    const overlap = db.whereClauses.map(clause => dialect.sqlToQuery(clause)).find(query => query.sql.includes("appointment_date <"));
    const start = new Date(input.appointmentDate);
    // The window of the slot itself, [start, start + 30 min), in UTC: a Date would be sent at Paris time.
    expect(overlap?.params.slice(0, 2)).toEqual([new Date(start.getTime() + 30 * 60_000).toISOString(), start.toISOString()]);
  });
});
