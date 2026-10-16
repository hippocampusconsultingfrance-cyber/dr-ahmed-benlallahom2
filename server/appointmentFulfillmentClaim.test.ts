import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";

const database = vi.hoisted(() => ({ getDb: vi.fn() }));
const notifications = vi.hoisted(() => ({
  sendConfirmationEmail: vi.fn(async () => undefined),
  sendCustomerConfirmationSMS: vi.fn(async () => true),
  sendInvoiceEmail: vi.fn(async () => undefined),
  sendOwnerNotificationEmail: vi.fn(async () => undefined),
}));
const owner = vi.hoisted(() => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./_core/notifications", () => notifications);
vi.mock("./_core/notification", () => owner);
const invoicing = vi.hoisted(() => ({
  generateInvoicePDF: vi.fn(async () => ({ buffer: Buffer.from("pdf") })),
  allocateAppointmentInvoice: vi.fn(async () => ({
    invoiceNumber: "FAC-2026-000003",
    issuedAt: new Date("2026-10-12T08:00:00Z"),
    paidAt: new Date("2026-10-12T07:59:00Z"),
  })),
}));
vi.mock("./invoice", () => ({ generateInvoicePDF: invoicing.generateInvoicePDF }));
vi.mock("./invoiceNumbering", () => ({ allocateAppointmentInvoice: invoicing.allocateAppointmentInvoice }));

import {
  processAppointmentFulfillmentNow,
  processDueAppointmentFulfillmentJobs,
  recoverStaleAppointmentFulfillmentJobs,
} from "./appointmentFulfillment";

const dialect = new PgDialect();

type Write = { table: unknown; values: Record<string, unknown>; where: SQL };

/** Minimal drizzle-like double: select results are served per table, updates return queued rowCounts. */
function fakeDatabase(input: { jobs: unknown[][]; appointments?: unknown[][]; updateRowCounts?: number[] }) {
  const selectQueues = new Map<unknown, unknown[][]>([
    [appointmentFulfillmentJobs, [...input.jobs]],
    [appointments, [...(input.appointments ?? [])]],
  ]);
  const rowCounts = [...(input.updateRowCounts ?? [])];
  const selectWheres: Array<{ table: unknown; where: SQL }> = [];
  const writes: Write[] = [];
  const inserts: Array<{ table: unknown; values: Record<string, unknown>; conflict: "update" | "nothing" }> = [];
  const db = {
    insert: vi.fn((table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => { inserts.push({ table, values, conflict: "update" }); return { rowCount: 1 }; },
        onConflictDoNothing: async () => { inserts.push({ table, values, conflict: "nothing" }); return { rowCount: 0 }; },
      }),
    })),
    select: vi.fn(() => ({
      from: (table: unknown) => {
        const chain = {
          where: (where: SQL) => { selectWheres.push({ table, where }); return chain; },
          orderBy: () => chain,
          limit: async () => selectQueues.get(table)?.shift() ?? [],
        };
        return chain;
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (where: SQL) => {
          writes.push({ table, values, where });
          return { rowCount: rowCounts.length ? rowCounts.shift() : 1 };
        },
      }),
    })),
  };
  database.getDb.mockResolvedValue(db);
  return { db, writes, selectWheres, inserts };
}

const futureDate = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

function paidAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    trackingId: "APT-42",
    customerEmail: "patient@example.com",
    customerName: "Patient Test",
    customerPhone: "+33600000000",
    appointmentDate: futureDate(),
    finalPrice: "100.00",
    basePrice: "100.00",
    requestDetails: "Demande",
    consultationType: "health_advice",
    duration: 30,
    isNightRate: 0,
    paymentStatus: "completed",
    appointmentStatus: "confirmed",
    ...overrides,
  };
}

const queuedJob = { id: 7, appointmentId: 42, jobType: "confirmation", status: "queued", attempts: 0, maxAttempts: 3 };

beforeEach(() => vi.clearAllMocks());

describe("revendication atomique des envois post-paiement", () => {
  it("n’envoie rien quand un autre worker a déjà revendiqué le job", async () => {
    const { writes } = fakeDatabase({ jobs: [[queuedJob]], updateRowCounts: [0] });

    const result = await processDueAppointmentFulfillmentJobs();

    expect(result.processed).toBe(0);
    expect(notifications.sendConfirmationEmail).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toMatchObject({ status: "running", attempts: 1 });
    const { sql, params } = dialect.sqlToQuery(writes[0].where);
    expect(sql).toContain('"status" in');
    expect(sql).toContain('"attempts" =');
    expect(sql).toContain('"scheduled_for" <=');
    expect(params).toEqual(expect.arrayContaining([queuedJob.id, queuedJob.attempts]));
  });

  it("envoie la confirmation une seule fois quand la revendication réussit", async () => {
    const { writes } = fakeDatabase({
      jobs: [[queuedJob], [{ ...queuedJob, status: "running", attempts: 1 }]],
      appointments: [[paidAppointment()]],
      updateRowCounts: [1],
    });

    const result = await processDueAppointmentFulfillmentJobs();

    expect(result).toEqual({ processed: 1, results: [{ completed: true }] });
    expect(notifications.sendConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(writes.at(-1)).toMatchObject({ table: appointmentFulfillmentJobs, values: { status: "completed", lastError: null } });
  });

  it("restreint le traitement immédiat au rendez-vous payé, avec la même revendication", async () => {
    const { selectWheres, writes } = fakeDatabase({ jobs: [[queuedJob]], updateRowCounts: [0] });

    await processAppointmentFulfillmentNow(42);

    const { sql, params } = dialect.sqlToQuery(selectWheres[0].where);
    expect(sql).toContain('"appointment_id" =');
    expect(params).toContain(42);
    expect(writes[0].values).toMatchObject({ status: "running" });
    expect(notifications.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("ne confirme pas a posteriori une consultation déjà passée", async () => {
    const { writes } = fakeDatabase({
      jobs: [[queuedJob], [{ ...queuedJob, status: "running", attempts: 1 }]],
      appointments: [[paidAppointment({ appointmentDate: new Date(Date.now() - 24 * 60 * 60 * 1000) })]],
      updateRowCounts: [1],
    });

    const result = await processDueAppointmentFulfillmentJobs();

    expect(result.results).toEqual([{ skipped: true }]);
    expect(notifications.sendConfirmationEmail).not.toHaveBeenCalled();
    // Le propriétaire reste prévenu par son propre job (créé s’il manque), jamais en double.
    expect(notifications.sendOwnerNotificationEmail).not.toHaveBeenCalled();
    expect(writes.at(-1)?.values).toMatchObject({ status: "completed", lastError: "appointment_already_past_confirmation_skipped" });
    expect(owner.notifyOwner).toHaveBeenCalledTimes(1);
    expect(owner.notifyOwner).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("APT-42") }));
  });

  it("n’alerte pas le propriétaire pour une consultation passée dont la confirmation était déjà partie", async () => {
    fakeDatabase({
      jobs: [[queuedJob], [{ ...queuedJob, status: "running", attempts: 1 }]],
      appointments: [[paidAppointment({ appointmentDate: new Date(Date.now() - 24 * 60 * 60 * 1000), emailSent: 1 })]],
      updateRowCounts: [1],
    });

    const result = await processDueAppointmentFulfillmentJobs();

    expect(result.results).toEqual([{ skipped: true }]);
    expect(owner.notifyOwner).not.toHaveBeenCalled();
  });

  it("alerte le propriétaire après le dernier échec d’envoi", async () => {
    notifications.sendConfirmationEmail.mockRejectedValueOnce(new Error("confirmation_email_failed"));
    const { writes } = fakeDatabase({
      jobs: [[{ ...queuedJob, status: "retry", attempts: 2 }], [{ ...queuedJob, status: "running", attempts: 3 }]],
      appointments: [[paidAppointment()]],
      updateRowCounts: [1],
    });

    const result = await processDueAppointmentFulfillmentJobs();

    expect(result.results).toEqual([{ completed: false, retry: false }]);
    expect(writes.at(-1)?.values).toMatchObject({ status: "failed" });
    expect(owner.notifyOwner).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("APT-42") }), expect.anything());
  });

  it("facture sous un numéro séquentiel attribué une fois, datée du paiement (création du job)", async () => {
    const createdAt = new Date("2026-10-12T07:59:00Z");
    const invoiceJob = { ...queuedJob, id: 8, jobType: "invoice", createdAt };
    fakeDatabase({
      jobs: [[invoiceJob], [{ ...invoiceJob, status: "running", attempts: 1 }]],
      appointments: [[paidAppointment()]],
      updateRowCounts: [1],
    });

    const result = await processDueAppointmentFulfillmentJobs();

    expect(result.results).toEqual([{ completed: true }]);
    expect(invoicing.allocateAppointmentInvoice).toHaveBeenCalledWith({ appointmentId: 42, paidAt: createdAt });
    expect(invoicing.generateInvoicePDF).toHaveBeenCalledWith(expect.objectContaining({
      invoiceNumber: "FAC-2026-000003",
      issueDate: new Date("2026-10-12T08:00:00Z"),
      paymentDate: new Date("2026-10-12T07:59:00Z"),
      trackingId: "APT-42",
    }));
    expect(notifications.sendInvoiceEmail).toHaveBeenCalledWith("patient@example.com", "Patient Test", "APT-42", 100, expect.any(Buffer), "FAC-2026-000003", { idempotencyKey: "appointment-invoice-FAC-2026-000003" });
  });

  it("remet en file un job interrompu (instance gelée après la réponse à Stripe)", async () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const { writes } = fakeDatabase({ jobs: [[{ id: 9, status: "running", attempts: 1, maxAttempts: 3 }]] });

    const result = await recoverStaleAppointmentFulfillmentJobs(15 * 60_000, now);

    expect(result).toEqual({ recovered: 1, exhausted: 0 });
    expect(writes[0].values).toMatchObject({ status: "retry", lastError: "worker_interrupted", startedAt: null });
    const { sql, params } = dialect.sqlToQuery(writes[0].where);
    expect(sql).toContain('"started_at" <=');
    expect(params).toEqual(expect.arrayContaining([9, "running", 1]));
  });
});
