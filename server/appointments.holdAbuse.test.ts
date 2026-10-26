import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// ABUS-02 — appointments.create : sans anti-robot sur le parcours normal, avec
// lui seulement quand bookingChallengeRequired signale un abus (couvert par
// appointmentHoldAbuse.test.ts), avant de retenir le créneau et d’ouvrir Stripe.

const VALID_TOKEN = "turnstile-token-accepted-by-the-mock";
const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  stripeCreate: vi.fn(),
  enforcePersistentRateLimit: vi.fn(async () => undefined),
  logSecurityEvent: vi.fn(async () => undefined),
  bookingChallengeRequired: vi.fn(async () => false),
  recordBookingHold: vi.fn(async () => undefined),
  verifyCandidateTurnstile: vi.fn(async ({ token }: { token?: string }) => {
    if (token !== "turnstile-token-accepted-by-the-mock") throw new Error("candidate_turnstile_invalid");
  }),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./candidateSecurity", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateSecurity")>(),
  enforcePersistentRateLimit: mocks.enforcePersistentRateLimit,
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

const { appRouter, BOOKING_SECURITY_CHECK_MESSAGE } = await import("./routers");
const { requestIpHash } = await import("./candidateSecurity");

const ALL_DAY_SLOTS = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: "00:00", endTime: "00:00" }));
const IP = "198.51.100.91";

/** Lectures successives d'appointments.create : maintiens de l’adresse, date bloquée, plages ouvertes, chevauchement. */
function fakeDb() {
  const selectResults: unknown[][] = [[{ count: 0 }], [], ALL_DAY_SLOTS, []];
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
    execute: vi.fn(async () => ({ rowCount: 1 })),
    update: vi.fn(() => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) })),
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
  const [body] = await response.json() as Array<{ error?: { json: { message: string; data: { code: string; reason?: string } } }; result?: { data: { json: { checkoutUrl?: string; trackingId?: string } } } }>;
  return body;
}

let db: ReturnType<typeof fakeDb>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  // Les protections, neutralisées sous Vitest, sont rétablies comme en production.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VITEST", "false");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_hold_abuse");
  db = fakeDb();
  mocks.getDb.mockResolvedValue(db);
  mocks.stripeCreate.mockResolvedValue({ id: "cs_test_hold_abuse", url: "https://checkout.stripe.test/session" });
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
    expect(mocks.bookingChallengeRequired).toHaveBeenCalledWith(db, ipHash);
    expect(mocks.recordBookingHold).toHaveBeenCalledWith(ipHash, body.result?.data.json.trackingId);
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
    expect(mocks.stripeCreate).toHaveBeenCalledTimes(1);
  });

  it("refuse et journalise un jeton anti-robot invalide", async () => {
    mocks.bookingChallengeRequired.mockResolvedValue(true);

    const body = await postCreate({ turnstileToken: "x".repeat(40) });

    expect(body.error?.json.data.reason).toBe("security_check_required");
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ category: "public_booking_challenge", outcome: "blocked", severity: "warning" }));
  });
});
