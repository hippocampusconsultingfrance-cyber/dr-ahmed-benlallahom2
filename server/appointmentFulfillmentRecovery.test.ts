import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  adminMfaChallenges, adminMfaSessions, appointmentFulfillmentJobs, appointmentInvoices, appointments, candidateSessions, contactMessages, gdprRequests,
  medicalQuestionAuditLogs, medicalQuestions, securityEvents,
} from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";

// DATA-12 — un paiement enregistré dont la base a refusé les tâches d’après
// paiement (Stripe ne relivrant plus l’événement) reçoit ses envois du travail
// quotidien. Vraie file, vrais emails et vraie facture ; seuls Resend
// (transport) et les alertes au médecin sont simulés.

const resend = vi.hoisted(() => ({ calls: [] as Array<{ message: Record<string, unknown>; options?: { idempotencyKey?: string } }> }));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(async (message: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        resend.calls.push({ message, options });
        return { data: { id: `email_${resend.calls.length}` }, error: null };
      }),
    },
  })),
}));
const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
const owner = vi.hoisted(() => ({ notifyOwner: vi.fn(async (_payload: { title: string; content: string }, _options?: { idempotencyKey?: string }) => true) }));
vi.mock("./_core/notification", async importOriginal => ({ ...await importOriginal<typeof import("./_core/notification")>(), notifyOwner: owner.notifyOwner }));
// Numbering is SQL the in-memory database does not run (INSERT … SELECT MAX + 1): one number per appointment.
const invoices = vi.hoisted(() => ({ allocated: new Map<number, { paidAt: Date }>() }));
vi.mock("./invoiceNumbering", async importOriginal => ({
  ...await importOriginal<typeof import("./invoiceNumbering")>(),
  allocateAppointmentInvoice: vi.fn(async (input: { appointmentId: number; paidAt: Date }) => {
    const issuedNow = !invoices.allocated.has(input.appointmentId);
    if (issuedNow) invoices.allocated.set(input.appointmentId, { paidAt: input.paidAt });
    return { invoiceNumber: `FAC-2026-${String(input.appointmentId).padStart(6, "0")}`, issuedAt: new Date(), paidAt: invoices.allocated.get(input.appointmentId)!.paidAt, issuedNow };
  }),
}));

import { postPaymentDeliveryRetry } from "./_core/notifications";
import { appointmentFulfillmentPacing, enqueueAppointmentFulfillment } from "./appointmentFulfillment";
import { APPOINTMENT_INVOICE_SCHEMA_OBJECTS } from "./invoiceNumbering";
import { runPersonalDataRetention } from "./personalDataRetention";
import { PAID_APPOINTMENT_JOB_RECOVERY_SINCE, runAppointmentFulfillmentWorker } from "./scheduledJobs";

const DAY = 24 * 3_600_000;
const dialect = new PgDialect();
let memory: MemoryPg;
const worker = () => runAppointmentFulfillmentWorker({ batchSize: 5, maxBatches: 4, budgetMs: 35_000 });
const emailsTo = (to: string) => resend.calls.filter(call => (call.message.to as string[])[0] === to);

function seedPaidAppointment(trackingId: string, createdAt: Date, appointmentDate = new Date(Date.now() + 10 * DAY)) {
  return memory.seed(appointments, [{
    tracking_id: trackingId, customer_name: "Patient Test", customer_email: `${trackingId.toLowerCase()}@example.test`, customer_phone: "+33600000000",
    request_details: "Demande d’avis", appointment_date: appointmentDate, base_price: "100.00", final_price: "100.00",
    payment_status: "completed", appointment_status: "confirmed", stripe_session_id: `cs_${trackingId}`, stripe_payment_intent_id: `pi_${trackingId}`,
    createdAt, updatedAt: createdAt,
  }])[0]! as { id: number };
}

beforeEach(() => {
  memory = createMemoryPg([
    appointments, appointmentFulfillmentJobs, appointmentInvoices, securityEvents,
    // Read by the retention run.
    adminMfaChallenges, adminMfaSessions, candidateSessions, contactMessages, gdprRequests, medicalQuestionAuditLogs, medicalQuestions,
  ]);
  // appointment_invoices exists, as in production: the runtime DDL check finds every object.
  const execute = memory.db.execute.bind(memory.db);
  Object.assign(memory.db, {
    execute: (query: Parameters<typeof execute>[0]) => dialect.sqlToQuery(query as never).sql.includes("to_regclass")
      ? Promise.resolve({ rows: APPOINTMENT_INVOICE_SCHEMA_OBJECTS.map(name => ({ name })) })
      : execute(query),
  });
  state.memory = memory;
  invoices.allocated.clear();
  resend.calls.length = 0;
  owner.notifyOwner.mockClear();
  postPaymentDeliveryRetry.delaysMs = [0, 0];
  appointmentFulfillmentPacing.delayMs = 0;
  vi.stubEnv("RESEND_API_KEY", "re_test_recovery");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("DATA-12 — rendez-vous payé resté sans tâche de confirmation ni de facture", () => {
  it("le travail quotidien envoie au patient sa confirmation et sa facture, une seule fois, sans renvoyer la notification déjà partie au médecin", async () => {
    // Booked within the last hour (never before the recovery went live).
    const createdAt = new Date(Math.max(PAID_APPOINTMENT_JOB_RECOVERY_SINCE.getTime(), Date.now() - 3_600_000));
    const { id } = seedPaidAppointment("APTRECOVER01", createdAt);
    // The webhook stored the owner job, then the database refused the confirmation job (answer 500, Stripe gave up).
    memory.seed(appointmentFulfillmentJobs, [{ appointment_id: id, job_type: "owner", status: "completed", attempts: 1, max_attempts: 7, finished_at: createdAt }]);

    await expect(worker()).resolves.toMatchObject({ missingJobs: { requeued: 1 } });

    const patientEmails = emailsTo("aptrecover01@example.test");
    expect(patientEmails.map(call => call.options?.idempotencyKey?.replace(/-[0-9a-f]{16}$/, ""))).toEqual(["appointment-confirmation-APTRECOVER01", "appointment-invoice-FAC-2026-000001"]);
    expect(memory.rows(appointmentFulfillmentJobs).map(row => [row.job_type, row.status])).toEqual([["owner", "completed"], ["confirmation", "completed"], ["invoice", "completed"]]);
    expect(invoices.allocated.size).toBe(1);
    expect(resend.calls.filter(call => call.options?.idempotencyKey === "appointment-owner-APTRECOVER01")).toHaveLength(0);

    // The next day: nothing is missing any more, nothing leaves again.
    resend.calls.length = 0;
    await expect(worker()).resolves.toMatchObject({ missingJobs: { requeued: 0 } });
    expect(resend.calls).toHaveLength(0);
  });

  it("ne renvoie rien d’un rendez-vous servi normalement quand la purge supprime ses tâches terminées, 30 jours après", async () => {
    vi.useFakeTimers({ now: new Date(PAID_APPOINTMENT_JOB_RECOVERY_SINCE.getTime() + 3_600_000), toFake: ["Date"] });
    // Paid for a consultation in 40 days: its confirmation would still be sent again.
    const { id } = seedPaidAppointment("APTRECOVER03", new Date(), new Date(Date.now() + 40 * DAY));
    await enqueueAppointmentFulfillment(id);
    await worker();
    expect(memory.rows(appointmentFulfillmentJobs).map(row => [row.job_type, row.status])).toEqual([["owner", "completed"], ["confirmation", "completed"], ["invoice", "completed"]]);
    expect(resend.calls).toHaveLength(3);

    // 31 days later: the retention run at 04:50 deletes the three completed jobs, then the post-payment run at 06:20.
    resend.calls.length = 0;
    vi.setSystemTime(new Date(Date.now() + 31 * DAY));
    await expect(runPersonalDataRetention({ now: new Date() })).resolves.toMatchObject({ fulfillmentJobs: 3 });
    vi.setSystemTime(new Date(Date.now() + 90 * 60_000));
    await expect(worker()).resolves.toMatchObject({ missingJobs: { requeued: 0 }, processed: 0 });
    expect(resend.calls).toHaveLength(0);
    expect(owner.notifyOwner).not.toHaveBeenCalled();
    expect(memory.rows(appointmentFulfillmentJobs)).toHaveLength(0);
  });

  it("ne rejoue jamais un rendez-vous payé avant la mise en service de la reprise", async () => {
    seedPaidAppointment("APTRECOVER02", new Date(PAID_APPOINTMENT_JOB_RECOVERY_SINCE.getTime() - 24 * 3_600_000));

    await expect(worker()).resolves.toMatchObject({ missingJobs: { requeued: 0 }, processed: 0 });
    expect(resend.calls).toHaveLength(0);
    expect(memory.rows(appointmentFulfillmentJobs)).toHaveLength(0);
  });
});
