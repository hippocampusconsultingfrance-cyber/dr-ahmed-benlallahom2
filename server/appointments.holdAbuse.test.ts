import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// ABUS-02 — appointments.create : sans anti-robot sur le parcours normal, avec
// lui seulement quand bookingChallengeRequired signale un abus (couvert par
// appointmentHoldAbuse.test.ts), avant de retenir le créneau et d’ouvrir Stripe,
// puis de nouveau une fois le maintien écrit (réservations simultanées). Le
// contrôle tourne sous Vitest comme en production : seuls ses seuils
// (bookingChallengeRequired) et Cloudflare sont simulés.

const VALID_TOKEN = "turnstile-token-accepted-by-the-mock";
const DOWN_TOKEN = "turnstile-token-while-siteverify-is-down";
const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  stripeCreate: vi.fn(),
  // Compteurs persistants simulés : un essai compté, puis rendu, par action et par sujet.
  attempts: new Map<string, number>(),
  enforcePersistentRateLimit: vi.fn(async (_policy: { action: string; subject: string; maxAttempts: number }) => undefined),
  releasePersistentRateLimitAttempt: vi.fn(async (_policy: { action: string; subject: string }) => undefined),
  logSecurityEvent: vi.fn(async (_event: Record<string, unknown>) => undefined),
  bookingChallengeRequired: vi.fn(async (_db: unknown, _ipHash: string | null, _options?: { afterOwnHold?: boolean }) => false),
  recordBookingHold: vi.fn(async () => undefined),
  verifyCandidateTurnstile: vi.fn(async ({ token }: { token?: string }) => {
    if (!token) throw new Error("candidate_turnstile_required");
    // Siteverify injoignable : fetch échoue avant toute réponse de Cloudflare.
    if (token === "turnstile-token-while-siteverify-is-down") throw new TypeError("fetch failed");
    if (token !== "turnstile-token-accepted-by-the-mock") throw new Error("candidate_turnstile_invalid");
  }),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: mocks.enforcePersistentRateLimit,
  releasePersistentRateLimitAttempt: mocks.releasePersistentRateLimitAttempt,
  logSecurityEvent: mocks.logSecurityEvent,
}));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: mocks.verifyCandidateTurnstile }));
vi.mock("./appointmentHoldAbuse", () => ({ bookingChallengeRequired: mocks.bookingChallengeRequired, recordBookingHold: mocks.recordBookingHold }));
vi.mock("./appointmentHolds", async importOriginal => ({
  ...await importOriginal<typeof import("./appointmentHolds")>(),
  releaseExpiredAppointmentHolds: vi.fn(async () => ({ released: 0 })),
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({ checkout: { sessions: { create: mocks.stripeCreate, retrieve: vi.fn() } } })),
}));

const { appRouter, BOOKING_SECURITY_CHECK_MESSAGE, BOOKING_SECURITY_CHECK_UNAVAILABLE_MESSAGE, PUBLIC_FORM_RATE_LIMITS } = await import("./routers");
const { requestIpHash } = await import("./candidateSecurity");

const ALL_DAY_SLOTS = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: "00:00", endTime: "00:00" }));
const IP = "198.51.100.91";

/** Lectures successives d'appointments.create : maintiens de l’adresse, date bloquée, plages ouvertes, chevauchement. */
function fakeDb() {
  const selectResults: unknown[][] = [[{ count: 0 }], [], ALL_DAY_SLOTS, []];
  const updateSet = vi.fn((_values: Record<string, unknown>) => ({ where: async () => ({ rowCount: 1 }) }));
  return {
    updateSet,
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
    execute: vi.fn(async () => ({ rowCount: 1 })),
    update: vi.fn(() => ({ set: updateSet })),
  };
}

function inThreeDays() {
  const halfHour = 30 * 60 * 1000;
  return new Date(Math.ceil((Date.now() + 3 * 24 * 60 * 60 * 1000) / halfHour) * halfHour).toISOString();
}

/** Vraie requête tRPC (batch HTTP, superjson, errorFormatter), comme celle de la page de réservation. */
async function postCreate(extra: Record<string, unknown> = {}) {
  const input = { customerName: "Patient Synthétique", customerEmail: "patient@example.com", customerPhone: "+33 6 12 34 56 78", appointmentDate: inThreeDays(), requestDetails: "Demande d’avis", ...extra };
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req: new Request("http://localhost/api/trpc/appointments.create?batch=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ 0: superjson.serialize(input) }) }),
    createContext: (): TrpcContext => ({
      user: null,
      req: { protocol: "https", headers: { "x-forwarded-for": IP }, ip: IP } as unknown as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    }),
  });
  const [body] = await response.json() as Array<{ error?: { json: { message: string; data: { code: string; httpStatus: number; reason?: string } } }; result?: { data: { json: { checkoutUrl?: string; trackingId?: string } } } }>;
  return body;
}

/** Essais encore comptés pour une action (« public_booking_create_ip »…). */
const counted = (action: string) => Array.from(mocks.attempts.entries()).filter(([key]) => key.startsWith(`${action}|`)).reduce((total, [, count]) => total + count, 0);

let db: ReturnType<typeof fakeDb>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_hold_abuse");
  db = fakeDb();
  mocks.getDb.mockResolvedValue(db);
  mocks.stripeCreate.mockResolvedValue({ id: "cs_test_hold_abuse", url: "https://checkout.stripe.test/session" });
  mocks.attempts.clear();
  mocks.enforcePersistentRateLimit.mockImplementation(async ({ action, subject, maxAttempts }) => {
    const count = (mocks.attempts.get(`${action}|${subject}`) ?? 0) + 1;
    mocks.attempts.set(`${action}|${subject}`, count);
    if (count > maxAttempts) throw new Error("candidate_security_rate_limited");
  });
  mocks.releasePersistentRateLimitAttempt.mockImplementation(async ({ action, subject }) => {
    mocks.attempts.set(`${action}|${subject}`, Math.max((mocks.attempts.get(`${action}|${subject}`) ?? 0) - 1, 0));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleErrorSpy.mockRestore();
});

describe("appointments.create — anti-robot seulement en cas d’abus (ABUS-02)", () => {
  it("laisse le parcours normal sans vérification et note l’IP qui retient le créneau", async () => {
    const body = await postCreate();

    expect(body.result?.data.json.checkoutUrl).toBe("https://checkout.stripe.test/session");
    expect(mocks.verifyCandidateTurnstile).not.toHaveBeenCalled();
    const ipHash = requestIpHash({ "x-forwarded-for": IP });
    // Contrôle avant d’écrire le maintien, puis après, ce maintien noté et compté, avant Stripe.
    expect(mocks.bookingChallengeRequired.mock.calls).toEqual([[db, ipHash], [db, ipHash, { afterOwnHold: true }]]);
    expect(mocks.recordBookingHold).toHaveBeenCalledWith(ipHash, body.result?.data.json.trackingId);
    expect(db.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordBookingHold.mock.invocationCallOrder[0]);
    expect(mocks.recordBookingHold.mock.invocationCallOrder[0]).toBeLessThan(mocks.bookingChallengeRequired.mock.invocationCallOrder[1]);
    expect(mocks.bookingChallengeRequired.mock.invocationCallOrder[1]).toBeLessThan(mocks.stripeCreate.mock.invocationCallOrder[0]);
    expect(db.updateSet).not.toHaveBeenCalledWith(expect.objectContaining({ appointmentStatus: "cancelled" }));
  });

  it("refuse, avec un motif stable traduit par la page, de retenir un créneau sans la vérification demandée", async () => {
    mocks.bookingChallengeRequired.mockResolvedValue(true);

    const body = await postCreate();

    expect(body.error?.json).toMatchObject({ message: BOOKING_SECURITY_CHECK_MESSAGE, data: { code: "PRECONDITION_FAILED", reason: "security_check_required" } });
    expect(db.execute).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
    expect(mocks.recordBookingHold).not.toHaveBeenCalled();
  });

  it("ouvre la session Stripe une fois la vérification faite", async () => {
    mocks.bookingChallengeRequired.mockResolvedValue(true);

    const body = await postCreate({ turnstileToken: VALID_TOKEN });

    expect(body.result?.data.json.checkoutUrl).toBe("https://checkout.stripe.test/session");
    expect(mocks.verifyCandidateTurnstile).toHaveBeenCalledWith({ token: VALID_TOKEN, remoteIp: IP });
    // Le jeton, à usage unique, n’est vérifié qu’une fois : pas de second contrôle après le maintien.
    expect(mocks.verifyCandidateTurnstile).toHaveBeenCalledTimes(1);
    expect(mocks.bookingChallengeRequired).toHaveBeenCalledTimes(1);
    expect(mocks.recordBookingHold).toHaveBeenCalledWith(requestIpHash({ "x-forwarded-for": IP }), body.result?.data.json.trackingId);
    expect(mocks.stripeCreate).toHaveBeenCalledTimes(1);
  });

  it("libère le maintien et demande la vérification quand des réservations simultanées dépassent le seuil", async () => {
    // Avant l’écriture, la vague n’est pas encore visible ; après, ce maintien compris, elle l’est.
    mocks.bookingChallengeRequired.mockImplementation(async (_db, _ipHash, options) => Boolean(options?.afterOwnHold));

    const body = await postCreate();

    expect(body.error?.json).toMatchObject({ message: BOOKING_SECURITY_CHECK_MESSAGE, data: { code: "PRECONDITION_FAILED", reason: "security_check_required" } });
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.updateSet).toHaveBeenCalledWith(expect.objectContaining({ appointmentStatus: "cancelled", slotKey: null, holdExpiresAt: null }));
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
    expect(mocks.verifyCandidateTurnstile).toHaveBeenCalledWith({ token: undefined, remoteIp: IP });
    expect(mocks.logSecurityEvent).not.toHaveBeenCalledWith(expect.objectContaining({ category: "public_booking_challenge" }));
  });

  it("garde le maintien et ouvre Stripe si un jeton valide accompagne une réservation de la vague", async () => {
    mocks.bookingChallengeRequired.mockImplementation(async (_db, _ipHash, options) => Boolean(options?.afterOwnHold));

    const body = await postCreate({ turnstileToken: VALID_TOKEN });

    expect(body.result?.data.json.checkoutUrl).toBe("https://checkout.stripe.test/session");
    expect(mocks.verifyCandidateTurnstile).toHaveBeenCalledTimes(1);
    expect(db.updateSet).not.toHaveBeenCalledWith(expect.objectContaining({ appointmentStatus: "cancelled" }));
    expect(mocks.stripeCreate).toHaveBeenCalledTimes(1);
  });

  it("refuse et journalise un jeton anti-robot invalide", async () => {
    mocks.bookingChallengeRequired.mockResolvedValue(true);

    const body = await postCreate({ turnstileToken: "x".repeat(40) });

    expect(body.error?.json.data.reason).toBe("security_check_required");
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ category: "public_booking_challenge", outcome: "blocked", severity: "warning" }));
  });

  it("répond par un refus distinct, sans redemander la vérification, quand Cloudflare ne peut pas juger le jeton", async () => {
    mocks.bookingChallengeRequired.mockResolvedValue(true);

    const body = await postCreate({ turnstileToken: DOWN_TOKEN });

    expect(body.error?.json).toMatchObject({ message: BOOKING_SECURITY_CHECK_UNAVAILABLE_MESSAGE, data: { code: "SERVICE_UNAVAILABLE", httpStatus: 503, reason: "security_check_unavailable" } });
    expect(db.execute).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ category: "public_booking_challenge_unavailable", outcome: "failed" }));
    expect(mocks.logSecurityEvent).not.toHaveBeenCalledWith(expect.objectContaining({ category: "public_booking_challenge" }));

    // Même refus, maintien libéré, pour une réservation de la vague contrôlée après l’écriture.
    db = fakeDb();
    mocks.getDb.mockResolvedValue(db);
    mocks.bookingChallengeRequired.mockImplementation(async (_db, _ipHash, options) => Boolean(options?.afterOwnHold));
    expect((await postCreate({ turnstileToken: DOWN_TOKEN })).error?.json.data.reason).toBe("security_check_unavailable");
    expect(db.updateSet).toHaveBeenCalledWith(expect.objectContaining({ appointmentStatus: "cancelled", slotKey: null }));
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });
});

describe("appointments.create — essais comptés quand la vérification est demandée (ABUS-02)", () => {
  beforeEach(() => {
    // Les compteurs par IP et par email, neutralisés sous Vitest, sont rétablis comme en production.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "false");
    mocks.bookingChallengeRequired.mockResolvedValue(true);
    // Each booking reads the agenda afresh.
    mocks.getDb.mockImplementation(async () => fakeDb());
  });

  it("ne compte pas le refus qui demande la vérification : la réservation refaite avec son jeton compte une fois", async () => {
    expect((await postCreate()).error?.json.data.reason).toBe("security_check_required");
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingIp.action)).toBe(0);
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingEmail.action)).toBe(0);
    // Les mêmes compteurs (action et sujet) que ceux qui ont compté l’essai ; le refus compte à part.
    expect(mocks.releasePersistentRateLimitAttempt.mock.calls.map(([policy]) => policy)).toEqual(mocks.enforcePersistentRateLimit.mock.calls.slice(0, 2).map(([policy]) => policy));
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingChallengeIp.action)).toBe(1);

    expect((await postCreate({ turnstileToken: VALID_TOKEN })).result?.data.json.checkoutUrl).toBe("https://checkout.stripe.test/session");
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingIp.action)).toBe(1);
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingEmail.action)).toBe(1);
  });

  it("ne compte pas non plus le refus d’une vague contrôlée après l’écriture du maintien", async () => {
    mocks.bookingChallengeRequired.mockImplementation(async (_db, _ipHash, options) => Boolean(options?.afterOwnHold));

    expect((await postCreate()).error?.json.data.reason).toBe("security_check_required");
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingIp.action)).toBe(0);
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingEmail.action)).toBe(0);
  });

  it("compte un jeton refusé, et rend l’essai quand Cloudflare ne répond pas", async () => {
    await postCreate({ turnstileToken: "x".repeat(40) });
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingIp.action)).toBe(1);
    expect(mocks.releasePersistentRateLimitAttempt).not.toHaveBeenCalled();

    await postCreate({ turnstileToken: DOWN_TOKEN });
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingIp.action)).toBe(1);
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingEmail.action)).toBe(1);
  });

  it("borne à part les refus sans jeton d’une même IP : au-delà de 30 par heure, la réservation est limitée", async () => {
    const { maxAttempts, action } = PUBLIC_FORM_RATE_LIMITS.bookingChallengeIp;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      expect((await postCreate({ customerEmail: `patient${attempt}@example.com` })).error?.json.data.reason).toBe("security_check_required");
    }
    expect(counted(action)).toBe(maxAttempts);
    // Les compteurs de réservation, eux, n’ont rien retenu : ils n’ont pas arrêté ce script.
    expect(counted(PUBLIC_FORM_RATE_LIMITS.bookingIp.action)).toBe(0);

    expect((await postCreate({ customerEmail: "patient-next@example.com" })).error?.json).toMatchObject({ data: { code: "TOO_MANY_REQUESTS", reason: "rate_limited" } });
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ category: `${action}_rate_limit`, outcome: "blocked" }));
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("refuse quand même la vérification si le compteur ne peut pas rendre l’essai", async () => {
    mocks.releasePersistentRateLimitAttempt.mockRejectedValue(new Error("candidate_security_database_unavailable"));

    expect((await postCreate()).error?.json).toMatchObject({ data: { code: "PRECONDITION_FAILED", reason: "security_check_required" } });
    expect(consoleErrorSpy).toHaveBeenCalledWith("Booking attempt could not be given back:", "Error");
  });
});
