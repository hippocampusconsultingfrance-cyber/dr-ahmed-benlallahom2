import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// ADM-18 — l’agenda des consultations lu par le serveur, par date de
// consultation et par journées entières de Paris, quelle que soit la date de
// réservation ; la liste masque par défaut les réservations abandonnées.

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));

const { appRouter } = await import("./routers");

let memory: MemoryPg;

function admin() {
  return appRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  }).admin.appointments;
}

let seeded = 0;
function seedAppointment(appointmentDate: string, overrides: Record<string, unknown> = {}) {
  seeded += 1;
  return memory.seed(appointments, [{
    tracking_id: `APTAGENDA${String(seeded).padStart(3, "0")}`,
    customer_name: `Patient ${seeded}`,
    customer_email: `patient${seeded}@test.local`,
    customer_phone: "+33600000000",
    request_details: "Demande d’avis",
    appointment_date: new Date(appointmentDate),
    base_price: "100.00",
    final_price: "100.00",
    payment_status: "completed",
    appointment_status: "confirmed",
    stripe_payment_intent_id: `pi_${seeded}`,
    ...overrides,
  }])[0]!;
}

beforeEach(() => {
  memory = createMemoryPg([appointments, appointmentFulfillmentJobs]);
  state.memory = memory;
  seeded = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("ADM-18 — agenda des consultations", () => {
  it("lit les journées entières de Paris, de minuit à minuit, en hiver comme en été", async () => {
    // Winter (UTC+1): 20 November in Paris runs from 19 Nov 23:00 to 20 Nov 23:00 UTC.
    seedAppointment("2026-11-19T22:30:00.000Z"); // 23:30 on the 19th in Paris
    seedAppointment("2026-11-19T23:00:00.000Z"); // 00:00 on the 20th
    seedAppointment("2026-11-20T22:30:00.000Z"); // 23:30 on the 20th
    seedAppointment("2026-11-20T23:00:00.000Z"); // 00:00 on the 21st
    // Summer (UTC+2): 1 July in Paris starts at 30 June 22:00 UTC.
    seedAppointment("2026-06-30T21:30:00.000Z"); // 23:30 on 30 June
    seedAppointment("2026-06-30T22:00:00.000Z"); // 00:00 on 1 July

    const winter = await admin().agenda({ from: "2026-11-20", to: "2026-11-20" });
    expect(winter.items.map(item => item.appointmentDate.toISOString())).toEqual(["2026-11-19T23:00:00.000Z", "2026-11-20T22:30:00.000Z"]);
    const summer = await admin().agenda({ from: "2026-07-01", to: "2026-07-01" });
    expect(summer.items.map(item => item.appointmentDate.toISOString())).toEqual(["2026-06-30T22:00:00.000Z"]);
  });

  it("trie par date de consultation, quel que soit l’ordre des réservations, et ne garde que les rendez-vous payés et maintenus", async () => {
    // Booked last, for the earliest consultation: first in the agenda.
    seedAppointment("2026-11-24T09:00:00.000Z", { customer_name: "Confirmé tard" });
    seedAppointment("2026-11-23T15:00:00.000Z", { customer_name: "Terminé", appointment_status: "completed" });
    seedAppointment("2026-11-23T16:00:00.000Z", { customer_name: "Absent", appointment_status: "no_show" });
    seedAppointment("2026-11-23T08:00:00.000Z", { customer_name: "Confirmé tôt" });
    // Never a slot held without payment, a payment to regularise, a failed payment, a refund or a cancellation.
    seedAppointment("2026-11-23T10:00:00.000Z", { payment_status: "pending", appointment_status: "held", stripe_payment_intent_id: null });
    seedAppointment("2026-11-23T10:30:00.000Z", { payment_status: "pending", appointment_status: "cancelled" });
    seedAppointment("2026-11-23T11:00:00.000Z", { payment_status: "failed", appointment_status: "cancelled" });
    seedAppointment("2026-11-23T11:30:00.000Z", { payment_status: "refunded", appointment_status: "cancelled" });
    seedAppointment("2026-11-23T12:00:00.000Z", { payment_status: "refunded", appointment_status: "confirmed" });

    const agenda = await admin().agenda({ from: "2026-11-23", to: "2026-11-29" });

    expect(agenda.truncated).toBe(false);
    expect(agenda.items.map(item => [item.customerName, item.appointmentStatus])).toEqual([
      ["Confirmé tôt", "confirmed"],
      ["Terminé", "completed"],
      ["Absent", "no_show"],
      ["Confirmé tard", "confirmed"],
    ]);
    expect(agenda.items[0]).toMatchObject({ trackingId: "APTAGENDA004", customerPhone: "+33600000000", duration: 30 });
  });

  it("refuse une période à l’envers ou de plus de 31 jours", async () => {
    await expect(admin().agenda({ from: "2026-11-23", to: "2026-11-22" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin().agenda({ from: "2026-11-01", to: "2026-12-02" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin().agenda({ from: "2026-11-01", to: "2026-12-01" })).resolves.toMatchObject({ items: [] });
  });
});

describe("ADM-18 — liste des réservations sans les abandons", () => {
  it("masque par défaut les créneaux tenus sans paiement, les paiements échoués ou jamais commencés ; « Tout afficher » les montre", async () => {
    seedAppointment("2026-11-23T08:00:00.000Z", { customer_name: "Payé" });
    seedAppointment("2026-11-23T09:00:00.000Z", { customer_name: "Remboursé", payment_status: "refunded", appointment_status: "cancelled" });
    seedAppointment("2026-11-23T10:00:00.000Z", { customer_name: "À régulariser", payment_status: "pending", appointment_status: "cancelled" });
    seedAppointment("2026-11-23T11:00:00.000Z", { customer_name: "Créneau tenu", payment_status: "pending", appointment_status: "held", stripe_payment_intent_id: null });
    seedAppointment("2026-11-23T12:00:00.000Z", { customer_name: "Jamais payé", payment_status: "pending", appointment_status: "cancelled", stripe_payment_intent_id: null });
    seedAppointment("2026-11-23T13:00:00.000Z", { customer_name: "Échoué", payment_status: "failed", appointment_status: "cancelled", stripe_payment_intent_id: null });

    const useful = await admin().list({ excludeAbandoned: true });
    expect(useful.total).toBe(3);
    expect(useful.items.map(item => item.customerName).sort()).toEqual(["Payé", "Remboursé", "À régulariser"].sort());
    const all = await admin().list({});
    expect(all.total).toBe(6);
  });
});
