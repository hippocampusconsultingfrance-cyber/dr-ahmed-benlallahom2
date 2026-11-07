import { NeonDbError } from "@neondatabase/serverless";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { DrizzleQueryError, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import superjson from "superjson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { BOOKING_INVALID_NAME_MESSAGE, BOOKING_INVALID_PHONE_MESSAGE, BOOKING_REFUSAL_REASONS, BOOKING_TOO_SOON_MESSAGE } from "../shared/bookingPolicy";

// EN-06 — refus de réservation : un motif stable accompagne le message français
// jusqu'au navigateur, pour que la page affiche son propre texte traduit.

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  releaseExpiredAppointmentHolds: vi.fn(),
  stripeCreate: vi.fn(),
  stripeRetrieve: vi.fn(),
  stripeExpire: vi.fn(),
  enforcePersistentRateLimit: vi.fn(),
  releasePersistentRateLimitAttempt: vi.fn(async (_policy: { action: string; subject: string }) => undefined),
  // Compteurs persistants simulés (RES-08) : un essai compté, puis rendu, par action et par sujet.
  attempts: new Map<string, number>(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: mocks.enforcePersistentRateLimit,
  releasePersistentRateLimitAttempt: mocks.releasePersistentRateLimitAttempt,
  logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock("./appointmentHolds", async importOriginal => ({
  ...await importOriginal<typeof import("./appointmentHolds")>(),
  releaseExpiredAppointmentHolds: mocks.releaseExpiredAppointmentHolds,
}));
// Few holds awaiting payment: no anti-robot check (ABUS-02, covered by appointments.holdAbuse.test.ts).
vi.mock("./appointmentHoldAbuse", () => ({ bookingChallengeRequired: vi.fn(async () => false), recordBookingHold: vi.fn(async () => undefined) }));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mocks.stripeCreate, retrieve: mocks.stripeRetrieve, expire: mocks.stripeExpire } },
  })),
}));

import { ACTIVE_APPOINTMENT_HOLDS_LIMIT_MESSAGE, appRouter, BOOKING_PAYMENT_UNAVAILABLE_MESSAGE, BOOKING_RATE_LIMIT_MESSAGE, PUBLIC_FORM_RATE_LIMITS } from "./routers";

/**
 * Error of the INSERT as drizzle-orm 0.45 throws it with neon-http: a
 * DrizzleQueryError (« Failed query: … ») whose cause is the PostgreSQL error.
 */
function failedInsert(code: string, message: string, constraint?: string) {
  const postgresError = Object.assign(new NeonDbError(message), { code, constraint });
  return new DrizzleQueryError("INSERT INTO appointments (tracking_id, slot_key) VALUES ($1, $2)", ["APT000000000001", "2026-11-11T13:00:00.000Z"], postgresError);
}

const ALL_DAY_SLOTS = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: "00:00", endTime: "00:00" }));

/** Lectures successives d'appointments.create : maintiens actifs, date bloquée, plages ouvertes, chevauchement. */
function fakeDb({ activeHolds = 0, blocked = [] as unknown[], slots = ALL_DAY_SLOTS as unknown[], overlapping = [] as unknown[], insertError = null as Error | null } = {}) {
  const selectResults: unknown[][] = [[{ count: activeHolds }], blocked, slots, overlapping];
  return {
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
    execute: vi.fn(async () => {
      if (insertError) throw insertError;
      return { rowCount: 1 };
    }),
    // UPDATE … WHERE, attendu tel quel ou suivi de RETURNING (annulation par le patient).
    update: vi.fn(() => ({ set: () => ({ where: () => Object.assign(Promise.resolve({ rowCount: 1 }), { returning: async () => [{ customerEmail: "Patient@Example.com" }] }) }) })),
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

/** Vraie requête tRPC (batch HTTP, superjson, errorFormatter), comme celle de la page de réservation. */
async function postCreate(input: Record<string, unknown>, procedure = "appointments.create") {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req: new Request(`http://localhost/api/trpc/${procedure}?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 0: superjson.serialize(input) }),
    }),
    createContext: (): TrpcContext => ({
      user: null,
      req: { protocol: "https", headers: {}, ip: "192.0.2.1" } as unknown as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    }),
  });
  const [body] = await response.json() as Array<{ error?: { json: { message: string; data: { code: string; reason?: string } } }; result?: unknown }>;
  return body.error?.json ?? null;
}

const inThreeDays = () => slotStartAfter(3 * 24 * 60 * 60 * 1000).toISOString();

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_refusal_reasons");
  mocks.releaseExpiredAppointmentHolds.mockResolvedValue({ released: 0 });
  mocks.stripeCreate.mockResolvedValue({ id: "cs_test_reasons", url: "https://checkout.stripe.test/reasons" });
  mocks.enforcePersistentRateLimit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleErrorSpy.mockRestore();
});

describe("appointments.create — motifs de refus stables (EN-06)", () => {
  it("envoie le motif avec le code tRPC et garde le message français", async () => {
    mocks.getDb.mockResolvedValue(fakeDb());
    expect(await postCreate(booking(slotStartAfter(60 * 60 * 1000).toISOString())))
      .toMatchObject({ message: BOOKING_TOO_SOON_MESSAGE, data: { code: "UNPROCESSABLE_CONTENT", reason: "too_soon" } });
    expect(await postCreate(booking(slotStartAfter(91 * 24 * 60 * 60 * 1000).toISOString())))
      .toMatchObject({ data: { code: "UNPROCESSABLE_CONTENT", reason: "too_far" } });
  });

  it("distingue date bloquée, hors horaires, aucun horaire ouvert et créneau déjà pris", async () => {
    mocks.getDb.mockResolvedValue(fakeDb({ blocked: [{ id: 1 }] }));
    expect(await postCreate(booking(inThreeDays()))).toMatchObject({ data: { code: "CONFLICT", reason: "date_blocked" } });

    // Une plage décalée d'un quart d'heure ne contient jamais un début à :00 ou :30.
    mocks.getDb.mockResolvedValue(fakeDb({ slots: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: "10:15", endTime: "10:45" })) }));
    expect(await postCreate(booking(inThreeDays()))).toMatchObject({ data: { code: "CONFLICT", reason: "outside_schedule" } });

    mocks.getDb.mockResolvedValue(fakeDb({ slots: [] }));
    expect(await postCreate(booking(inThreeDays()))).toMatchObject({ data: { code: "CONFLICT", reason: "no_availability" } });

    mocks.getDb.mockResolvedValue(fakeDb({ overlapping: [{ id: 7 }] }));
    expect(await postCreate(booking(inThreeDays()))).toMatchObject({ data: { code: "CONFLICT", reason: "slot_taken" } });

    // Course perdue sur l'index unique du créneau (erreur PostgreSQL dans la
    // cause de celle de drizzle) : même motif, sans texte SQL.
    mocks.getDb.mockResolvedValue(fakeDb({ insertError: failedInsert("23505", 'duplicate key value violates unique constraint "appointments_active_slot_unique"', "appointments_active_slot_unique") }));
    const raced = await postCreate(booking(inThreeDays()));
    expect(raced).toMatchObject({ message: "Ce créneau vient d’être réservé par un autre patient. Veuillez en choisir un autre.", data: { code: "CONFLICT", reason: "slot_taken" } });
    expect(raced?.message).not.toContain("duplicate");
    // Sans le champ « constraint », le nom de l'index est lu dans le message PostgreSQL.
    mocks.getDb.mockResolvedValue(fakeDb({ insertError: failedInsert("23505", 'duplicate key value violates unique constraint "appointments_active_slot_unique"') }));
    expect(await postCreate(booking(inThreeDays()))).toMatchObject({ data: { code: "CONFLICT", reason: "slot_taken" } });
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("ne confond pas avec un créneau pris un autre doublon ni une autre erreur PostgreSQL", async () => {
    // Doublon sur une autre contrainte (numéro de suivi).
    mocks.getDb.mockResolvedValue(fakeDb({ insertError: failedInsert("23505", 'duplicate key value violates unique constraint "appointments_tracking_id_unique"', "appointments_tracking_id_unique") }));
    expect(await postCreate(booking(inThreeDays()))).toMatchObject({ data: { code: "INTERNAL_SERVER_ERROR" } });
    mocks.getDb.mockResolvedValue(fakeDb({ insertError: failedInsert("57P01", "terminating connection due to administrator command") }));
    const failure = await postCreate(booking(inThreeDays()));
    expect(failure).toMatchObject({ message: "La réservation n’a pas pu être enregistrée. Veuillez réessayer dans quelques instants.", data: { code: "INTERNAL_SERVER_ERROR" } });
    expect(failure?.data.reason).toBeUndefined();
    expect(JSON.stringify(failure)).not.toContain("Failed query");
  });

  it("n'ajoute aucun motif aux autres erreurs", async () => {
    mocks.getDb.mockResolvedValue(fakeDb({ insertError: new Error("connection reset") }));
    const failure = await postCreate(booking(inThreeDays()));
    expect(failure?.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(failure?.data.reason).toBeUndefined();
    expect((await postCreate(booking(inThreeDays(), { customerPhone: "abc" })))?.data.reason).toBeUndefined();
    expect(BOOKING_REFUSAL_REASONS).toEqual([
      "slot_taken", "too_soon", "too_far", "outside_schedule", "no_availability", "date_blocked",
      "rate_limited", "too_many_holds", "payment_unavailable", "invalid_name", "security_check_required", "security_check_unavailable",
      "invalid_characters",
    ]);
  });

  it("joint aussi un motif aux limites anti-abus et au paiement indisponible, sans retirer le message français", async () => {
    // Le limiteur, neutralisé sous Vitest, est rétabli comme en production pour ce refus.
    vi.stubEnv("VITEST", "false");
    vi.stubEnv("NODE_ENV", "production");
    mocks.getDb.mockResolvedValue(fakeDb());
    mocks.enforcePersistentRateLimit.mockRejectedValueOnce(new Error("candidate_security_rate_limited"));
    expect(await postCreate(booking(inThreeDays())))
      .toMatchObject({ message: BOOKING_RATE_LIMIT_MESSAGE, data: { code: "TOO_MANY_REQUESTS", reason: "rate_limited" } });
    vi.unstubAllEnvs();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_refusal_reasons");

    mocks.getDb.mockResolvedValue(fakeDb({ activeHolds: 2 }));
    expect(await postCreate(booking(inThreeDays())))
      .toMatchObject({ message: ACTIVE_APPOINTMENT_HOLDS_LIMIT_MESSAGE, data: { code: "TOO_MANY_REQUESTS", reason: "too_many_holds" } });

    mocks.getDb.mockResolvedValue(fakeDb());
    mocks.stripeCreate.mockRejectedValueOnce(Object.assign(new Error("connection to Stripe failed"), { name: "StripeConnectionError" }));
    const paymentDown = await postCreate(booking(inThreeDays()));
    expect(paymentDown).toMatchObject({ message: BOOKING_PAYMENT_UNAVAILABLE_MESSAGE, data: { code: "SERVICE_UNAVAILABLE", reason: "payment_unavailable" } });
    expect(JSON.stringify(paymentDown)).not.toContain("Stripe");
  });

  it("donne le même motif quand la reprise d'un paiement ne peut pas ouvrir Stripe", async () => {
    const held = {
      trackingId: "APTREASONS0001",
      customerEmail: "patient@example.com",
      customerName: "Patient Synthétique",
      finalPrice: "150.00",
      paymentStatus: "pending",
      appointmentStatus: "held",
      stripeSessionId: "cs_test_resume",
      holdExpiresAt: new Date(Date.now() + 40 * 60 * 1000),
    };
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [held] }) }) })) });
    mocks.stripeRetrieve.mockRejectedValueOnce(Object.assign(new Error("connection to Stripe failed"), { name: "StripeConnectionError" }));
    const input = { trackingId: held.trackingId, finalPrice: 150, customerEmail: held.customerEmail, customerName: held.customerName };
    expect(await postCreate(input, "appointments.createCheckoutSession"))
      .toMatchObject({ message: BOOKING_PAYMENT_UNAVAILABLE_MESSAGE, data: { code: "SERVICE_UNAVAILABLE", reason: "payment_unavailable" } });
  });

  it("refuse un nom sans lettre ni chiffre visible, avec un motif, avant tout accès à l'agenda et au compteur anti-abus", async () => {
    // Limiteur actif comme en production : un nom refusé ne consomme pas de tentative.
    vi.stubEnv("VITEST", "false");
    vi.stubEnv("NODE_ENV", "production");
    mocks.getDb.mockResolvedValue(fakeDb());
    const invisibleNames = [
      "   ", " ", "　", // espaces, espace insécable, espace idéographique
      "‍", "​​", "⠀", "ㅤ", "ﾠ", // ZWJ, ZWSP, braille vide, remplissages hangul (des « lettres »)
      "‎😀‏", "😀😀", "👩‍⚕️ 🇫🇷", "́", // emoji seuls, marque combinante seule
    ];
    for (const customerName of invisibleNames) {
      expect(await postCreate(booking(inThreeDays(), { customerName })), JSON.stringify(customerName))
        .toMatchObject({ message: BOOKING_INVALID_NAME_MESSAGE, data: { code: "BAD_REQUEST", reason: "invalid_name" } });
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.enforcePersistentRateLimit).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();

    // Any script, a single letter or a digit is a name the invoice can print,
    // and so are enclosed or squared letters (printed as Ali, JOHN).
    for (const customerName of ["Łukasz Kowalski", "王小明", "محمد العتيبي", "  Zoë Ørsted  ", "Nguyễn Văn An", "J", "Ahmed 2", "😀 Kim", "Ⓐⓛⓘ", "🄹🄾🄷🄽"]) {
      mocks.getDb.mockResolvedValue(fakeDb());
      expect(await postCreate(booking(inThreeDays(), { customerName })), customerName).toBeNull();
    }
    expect(mocks.stripeCreate).toHaveBeenCalledTimes(10);
    // Par IP puis par email, pour chacune des 10 réservations.
    expect(mocks.enforcePersistentRateLimit).toHaveBeenCalledTimes(20);
  });

  it("accepte la langue affichée par la page, français par défaut, et refuse une langue inconnue", async () => {
    mocks.getDb.mockResolvedValue(fakeDb());
    expect(await postCreate(booking(inThreeDays(), { language: "en" }))).toBeNull();
    mocks.getDb.mockResolvedValue(fakeDb());
    expect(await postCreate(booking(inThreeDays()))).toBeNull();
    expect(await postCreate(booking(inThreeDays(), { language: "it" }))).toMatchObject({ data: { code: "BAD_REQUEST" } });
  });
});

/** Essais encore comptés pour une action (« public_booking_create_ip »…), tous sujets confondus. */
const counted = (action: string) => Array.from(mocks.attempts.entries()).filter(([key]) => key.startsWith(`${action}|`)).reduce((total, [, count]) => total + count, 0);

describe("appointments.create — un refus métier ne consomme pas d’essai (RES-08)", () => {
  const bookingIp = PUBLIC_FORM_RATE_LIMITS.bookingIp;
  const bookingEmail = PUBLIC_FORM_RATE_LIMITS.bookingEmail;

  beforeEach(() => {
    // Les compteurs par IP et par email, neutralisés sous Vitest, sont rétablis comme en production.
    vi.stubEnv("VITEST", "false");
    vi.stubEnv("NODE_ENV", "production");
    mocks.attempts.clear();
    mocks.enforcePersistentRateLimit.mockImplementation(async ({ action, subject, maxAttempts }: { action: string; subject: string; maxAttempts: number }) => {
      const count = (mocks.attempts.get(`${action}|${subject}`) ?? 0) + 1;
      mocks.attempts.set(`${action}|${subject}`, count);
      if (count > maxAttempts) throw new Error("candidate_security_rate_limited");
    });
    mocks.releasePersistentRateLimitAttempt.mockImplementation(async ({ action, subject }) => {
      mocks.attempts.set(`${action}|${subject}`, Math.max((mocks.attempts.get(`${action}|${subject}`) ?? 0) - 1, 0));
    });
  });

  it("rend l’essai par IP et par email de chaque refus métier et d’un paiement indisponible", async () => {
    const refusals: Array<[string, Parameters<typeof fakeDb>[0]]> = [
      ["too_many_holds", { activeHolds: 2 }],
      ["date_blocked", { blocked: [{ id: 1 }] }],
      ["outside_schedule", { slots: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: "10:15", endTime: "10:45" })) }],
      ["no_availability", { slots: [] }],
      ["slot_taken", { overlapping: [{ id: 7 }] }],
      // Course perdue sur l’index unique du créneau.
      ["slot_taken", { insertError: failedInsert("23505", 'duplicate key value violates unique constraint "appointments_active_slot_unique"', "appointments_active_slot_unique") }],
    ];
    for (const [reason, db] of refusals) {
      mocks.getDb.mockResolvedValue(fakeDb(db));
      expect(await postCreate(booking(inThreeDays())), reason).toMatchObject({ data: { reason } });
      expect(counted(bookingIp.action), reason).toBe(0);
      expect(counted(bookingEmail.action), reason).toBe(0);
    }

    mocks.getDb.mockResolvedValue(fakeDb());
    mocks.stripeCreate.mockRejectedValueOnce(Object.assign(new Error("connection to Stripe failed"), { name: "StripeConnectionError" }));
    expect(await postCreate(booking(inThreeDays()))).toMatchObject({ data: { reason: "payment_unavailable" } });
    expect(counted(bookingIp.action)).toBe(0);
    expect(counted(bookingEmail.action)).toBe(0);

    // Une réservation qui aboutit compte toujours son essai.
    mocks.getDb.mockResolvedValue(fakeDb());
    expect(await postCreate(booking(inThreeDays()))).toBeNull();
    expect(counted(bookingIp.action)).toBe(1);
    expect(counted(bookingEmail.action)).toBe(1);
  });

  it("ne bloque pas un patient après sept créneaux pris d’affilée", async () => {
    mocks.getDb.mockImplementation(async () => fakeDb({ overlapping: [{ id: 7 }] }));
    for (let attempt = 1; attempt <= bookingIp.maxAttempts + 1; attempt += 1) {
      expect(await postCreate(booking(inThreeDays())), `essai ${attempt}`).toMatchObject({ data: { code: "CONFLICT", reason: "slot_taken" } });
    }

    // Le créneau libre qu’il choisit ensuite se réserve normalement.
    mocks.getDb.mockImplementation(async () => fakeDb());
    expect(await postCreate(booking(inThreeDays()))).toBeNull();
    expect(mocks.stripeCreate).toHaveBeenCalledTimes(1);
  });

  it("ne bloque pas le patient indécis qui réserve puis annule son paiement en attente plusieurs fois avec le même email", async () => {
    const session = { id: "cs_test_reasons", status: "open", payment_status: "unpaid", metadata: { trackingId: "APTUNDECIDED01" } };
    mocks.stripeRetrieve.mockResolvedValue(session);
    mocks.stripeExpire.mockResolvedValue({ ...session, status: "expired" });
    mocks.getDb.mockImplementation(async () => fakeDb());
    // Plus de cycles que n’en admet le compteur par email (5 par heure), le plus bas des deux.
    for (let cycle = 1; cycle <= bookingIp.maxAttempts; cycle += 1) {
      expect(await postCreate(booking(inThreeDays())), `réservation ${cycle}`).toBeNull();
      expect(await postCreate({ sessionId: session.id }, "appointments.cancelPending"), `annulation ${cycle}`).toBeNull();
    }

    // Chaque annulation a rendu l’essai par IP et par email : le créneau choisi ensuite se réserve.
    expect(await postCreate(booking(inThreeDays()))).toBeNull();
    expect(mocks.stripeCreate).toHaveBeenCalledTimes(bookingIp.maxAttempts + 1);
    expect(counted(bookingIp.action)).toBe(1);
    expect(counted(bookingEmail.action)).toBe(1);
  });

  it("garde l’essai compté au-delà du plafond des essais rendus, sans changer le refus ni entamer celui des refus anti-robot", async () => {
    const { action, maxAttempts } = PUBLIC_FORM_RATE_LIMITS.bookingGiveBackIp;
    mocks.getDb.mockImplementation(async () => fakeDb({ overlapping: [{ id: 7 }] }));
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) await postCreate(booking(inThreeDays(), { customerEmail: `patient${attempt}@example.com` }));
    expect(counted(action)).toBe(maxAttempts);
    expect(counted(bookingIp.action)).toBe(0);

    expect(await postCreate(booking(inThreeDays(), { customerEmail: "patient-next@example.com" }))).toMatchObject({ data: { code: "CONFLICT", reason: "slot_taken" } });
    expect(counted(bookingIp.action)).toBe(1);
    expect(counted(bookingEmail.action)).toBe(1);
    // La vérification anti-robot (ABUS-02) reste demandée normalement à cette IP.
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingChallengeIp.action)).toBe(0);
  });
});

describe("appointments.create — téléphone saisi ou collé depuis un répertoire étranger (INTL-09)", () => {
  /** Numéro enregistré par l’INSERT du rendez-vous (4ᵉ valeur). */
  const storedPhone = (db: ReturnType<typeof fakeDb>) => new PgDialect().sqlToQuery((db.execute.mock.calls as unknown as Array<[SQL]>)[0][0]).params[3];

  it("accepte les chiffres arabes, persans ou pleine chasse, les marques de direction et les caractères de largeur nulle, et enregistre le numéro au format E.164", async () => {
    const pasted = {
      "\u202A+٩٧١ ٥٠ ١٢٣ ٤٥٦٧\u202C": "+971501234567",
      "\u200E+۹۷۱\u00A0۵۰\u00A0۱۲۳\u00A0۴۵۶۷\u200F": "+971501234567",
      "＋８６ １３８ ００１３ ８０００": "+8613800138000",
      "\u2066+33\u202F6\u202F12\u202F34\u202F56\u202F78\u2069": "+33612345678",
      "+33 6 12 34 56 78\u200B": "+33612345678",
      "\uFEFF+33612345678\u2060": "+33612345678",
      // Indicatif écrit 00, « (0) » national après l’indicatif : le même numéro.
      "0033 6 12 34 56 78": "+33612345678",
      "+33 (0)6 12 34 56 78": "+33612345678",
      "+1 (415) 555-0100": "+14155550100",
    };
    for (const [customerPhone, expected] of Object.entries(pasted)) {
      const db = fakeDb();
      mocks.getDb.mockResolvedValue(db);
      expect(await postCreate(booking(inThreeDays(), { customerPhone })), JSON.stringify(customerPhone)).toBeNull();
      expect(storedPhone(db)).toBe(expected);
    }
  });

  it("refuse un numéro sans indicatif de pays, avant toute réservation", async () => {
    // Aucun indicatif ne commence par 0 : « +06… » est un numéro français auquel on a ajouté « + ».
    for (const customerPhone of ["0612345678", "06 12 34 56 78", "٠٥٠١٢٣٤٥٦٧", "+0612345678", "00 06 12 34 56 78"]) {
      const db = fakeDb();
      mocks.getDb.mockResolvedValue(db);
      const refused = await postCreate(booking(inThreeDays(), { customerPhone }));
      expect(refused, customerPhone).toMatchObject({ data: { code: "BAD_REQUEST" } });
      expect(refused?.message).toContain(BOOKING_INVALID_PHONE_MESSAGE);
      expect(db.execute).not.toHaveBeenCalled();
    }
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });
});
