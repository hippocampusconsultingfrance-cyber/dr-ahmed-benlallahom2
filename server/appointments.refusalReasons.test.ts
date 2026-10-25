import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { BOOKING_REFUSAL_REASONS, BOOKING_TOO_SOON_MESSAGE } from "../shared/bookingPolicy";

// EN-06 — refus de réservation : un motif stable accompagne le message français
// jusqu'au navigateur, pour que la page affiche son propre texte traduit.

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

import { appRouter } from "./routers";

const ALL_DAY_SLOTS = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: "00:00", endTime: "00:00" }));

/** Lectures successives d'appointments.create : maintiens actifs, date bloquée, plages ouvertes, chevauchement. */
function fakeDb({ blocked = [] as unknown[], slots = ALL_DAY_SLOTS as unknown[], overlapping = [] as unknown[], insertError = null as Error | null } = {}) {
  const selectResults: unknown[][] = [[{ count: 0 }], blocked, slots, overlapping];
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
    update: vi.fn(() => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) })),
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
async function postCreate(input: Record<string, unknown>) {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req: new Request("http://localhost/api/trpc/appointments.create?batch=1", {
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

    // Course perdue sur l'index unique du créneau : même motif, sans texte SQL.
    mocks.getDb.mockResolvedValue(fakeDb({ insertError: new Error('duplicate key value violates unique constraint "appointments_active_slot_unique"') }));
    const raced = await postCreate(booking(inThreeDays()));
    expect(raced).toMatchObject({ data: { code: "CONFLICT", reason: "slot_taken" } });
    expect(raced?.message).not.toContain("duplicate");
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("n'ajoute aucun motif aux autres erreurs", async () => {
    mocks.getDb.mockResolvedValue(fakeDb({ insertError: new Error("connection reset") }));
    const failure = await postCreate(booking(inThreeDays()));
    expect(failure?.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(failure?.data.reason).toBeUndefined();
    expect((await postCreate(booking(inThreeDays(), { customerPhone: "abc" })))?.data.reason).toBeUndefined();
    expect(BOOKING_REFUSAL_REASONS).toEqual(["slot_taken", "too_soon", "too_far", "outside_schedule", "no_availability", "date_blocked"]);
  });

  it("accepte la langue affichée par la page, français par défaut, et refuse une langue inconnue", async () => {
    mocks.getDb.mockResolvedValue(fakeDb());
    expect(await postCreate(booking(inThreeDays(), { language: "en" }))).toBeNull();
    mocks.getDb.mockResolvedValue(fakeDb());
    expect(await postCreate(booking(inThreeDays()))).toBeNull();
    expect(await postCreate(booking(inThreeDays(), { language: "it" }))).toMatchObject({ data: { code: "BAD_REQUEST" } });
  });
});
