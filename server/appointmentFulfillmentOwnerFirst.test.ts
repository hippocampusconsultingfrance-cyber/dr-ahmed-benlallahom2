import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";

const dialect = new PgDialect();

// M1 — BOOK-FULFILL-RETRY / BOOK-OWNER-DUP : notification du propriétaire en job
// indépendant et prioritaire, essais courts avec clé d’idempotence, alerte dès
// le premier échec d’envoi au patient, plus d’email « SMS » en double.
// Les vrais gabarits et la vraie notification propriétaire sont exécutés ; seul
// le transport Resend est simulé.

const resend = vi.hoisted(() => {
  vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.test");
  return {
    calls: [] as Array<{ message: Record<string, unknown>; options?: { idempotencyKey?: string }; at: number }>,
    // Réponse par appel : "ok", "5xx", "422" ou "throw" ; "ok" quand la file est vide.
    script: [] as string[],
    failFor: new Set<string>(),
  };
});
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(async (message: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        resend.calls.push({ message, options, at: Date.now() });
        const to = (message.to as string[])[0];
        const outcome = resend.failFor.has(to) ? "5xx" : resend.script.shift() ?? "ok";
        if (outcome === "throw") throw new Error("socket hang up");
        if (outcome === "5xx") return { data: null, error: { name: "internal_server_error", statusCode: 503, message: "unavailable" } };
        if (outcome === "422") return { data: null, error: { name: "validation_error", statusCode: 422, message: "invalid recipient" } };
        return { data: { id: `email_${resend.calls.length}` }, error: null };
      }),
    },
  })),
}));
const database = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./storage.js", () => ({ storagePutOnce: vi.fn(async (key: string) => ({ key, url: "https://storage.test/invoice.pdf", uploaded: true })) }));
vi.mock("./invoiceNumbering", () => ({
  allocateAppointmentInvoice: vi.fn(async () => ({
    invoiceNumber: "FAC-2026-000007",
    issuedAt: new Date("2026-10-12T08:00:00Z"),
    paidAt: new Date("2026-10-12T07:59:00Z"),
  })),
}));

import { appointmentFulfillmentPacing, enqueueAppointmentFulfillment, processDueAppointmentFulfillmentJobs } from "./appointmentFulfillment";
import { postPaymentDeliveryRetry, sendConfirmationEmail, sendOwnerNotificationEmail } from "./_core/notifications";
import * as notificationsModule from "./_core/notifications";
import { drainInBatches } from "./scheduledJobs";

type Job = { id: number; appointmentId: number; jobType: string; status: string; attempts: number; maxAttempts: number; scheduledFor: Date; createdAt?: Date };

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    trackingId: "APTOWNER0001",
    customerEmail: "patient@example.test",
    customerName: "Patient Test",
    customerPhone: "+33600000000",
    appointmentDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    finalPrice: "100.00",
    basePrice: "100.00",
    requestDetails: "Demande d’avis",
    consultationType: "health_advice",
    duration: 30,
    isNightRate: 0,
    paymentStatus: "completed",
    appointmentStatus: "confirmed",
    emailSent: 0,
    ...overrides,
  };
}

/**
 * In-memory jobs table. The due-list query is the one with an ORDER BY; every
 * job UPDATE (claim or status) targets the id bound first in its WHERE clause.
 */
function memoryDatabase(initialJobs: Job[], appointment = appointmentRow()) {
  const jobs = initialJobs.map(row => ({ ...row }));
  const inserts: Array<{ jobType: string; conflict: string }> = [];
  let nextId = 100;
  const db = {
    insert: vi.fn(() => ({
      values: (values: Job) => {
        const store = async (conflict: string) => {
          inserts.push({ jobType: values.jobType, conflict });
          if (!jobs.some(row => row.appointmentId === values.appointmentId && row.jobType === values.jobType)) {
            jobs.push({ ...values, id: nextId++, createdAt: new Date() });
          }
          return { rowCount: 1 };
        };
        return { onConflictDoUpdate: () => store("update"), onConflictDoNothing: () => store("nothing") };
      },
    })),
    select: vi.fn(() => ({
      from: (table: unknown) => {
        let ordered = false;
        let where: SQL | undefined;
        const chain = {
          where: (clause: SQL) => { where = clause; return chain; },
          orderBy: () => { ordered = true; return chain; },
          limit: async (count: number) => {
            if (table === appointments) return [appointment];
            if (ordered) {
              return jobs
                .filter(row => ["queued", "retry"].includes(row.status) && row.scheduledFor.getTime() <= Date.now() && row.attempts < row.maxAttempts)
                .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime() || a.id - b.id)
                .slice(0, count)
                .map(row => ({ ...row }));
            }
            const id = where ? dialect.sqlToQuery(where).params[0] : undefined;
            return jobs.filter(row => row.id === id).map(row => ({ ...row }));
          },
        };
        return chain;
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (clause: SQL) => {
          if (table !== appointmentFulfillmentJobs) return { rowCount: 1 };
          const id = dialect.sqlToQuery(clause).params[0];
          const target = jobs.find(row => row.id === id);
          if (!target || (values.status === "running" && !["queued", "retry"].includes(target.status))) return { rowCount: 0 };
          Object.assign(target, values);
          return { rowCount: 1 };
        },
      }),
    })),
  };
  database.getDb.mockResolvedValue(db);
  return { db, jobs, inserts };
}

function job(id: number, jobType: string, overrides: Partial<Job> = {}): Job {
  return { id, appointmentId: 42, jobType, status: "queued", attempts: 0, maxAttempts: 3, scheduledFor: new Date(Date.now() - 1000), createdAt: new Date("2026-10-12T07:59:00Z"), ...overrides };
}

const subjects = () => resend.calls.map(call => String(call.message.subject));

afterAll(() => vi.unstubAllEnvs());

beforeEach(() => {
  resend.calls.length = 0;
  resend.script.length = 0;
  resend.failFor.clear();
  postPaymentDeliveryRetry.delaysMs = [0, 0];
  appointmentFulfillmentPacing.delayMs = 0;
  vi.stubEnv("RESEND_API_KEY", "re_test_owner_first");
});

describe("envois après paiement — propriétaire d’abord, essais courts, alerte immédiate", () => {
  it("met en file la notification du propriétaire avant la confirmation et la facture", async () => {
    const { jobs } = memoryDatabase([]);
    await enqueueAppointmentFulfillment(42);
    expect(jobs.map(row => row.jobType)).toEqual(["owner", "confirmation", "invoice"]);
  });

  it("prévient le propriétaire (un seul email, sans doublon « SMS ») même quand l’email patient échoue, puis l’alerte dès ce premier échec", async () => {
    resend.failFor.add("patient@example.test");
    const { jobs } = memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    const result = await processDueAppointmentFulfillmentJobs();

    expect(result.processed).toBe(3);
    const ownerEmails = resend.calls.filter(call => (call.message.to as string[])[0] === "owner@example.test");
    expect(ownerEmails[0].message.subject).toMatch(/^Nouvelle réservation payée/);
    expect(ownerEmails.filter(call => String(call.message.subject).startsWith("Nouvelle réservation payée"))).toHaveLength(1);
    expect(subjects().some(subject => subject.includes("Réservation APT") || subject.includes("📱"))).toBe(false);
    // Email patient : 3 essais (1 + 2 essais courts) avec la même clé d’idempotence.
    const patientConfirmations = resend.calls.filter(call => String(call.message.subject).startsWith("Confirmation de réservation"));
    expect(patientConfirmations).toHaveLength(3);
    expect(new Set(patientConfirmations.map(call => call.options?.idempotencyKey))).toEqual(new Set(["appointment-confirmation-APTOWNER0001"]));
    // Alerte au propriétaire dès le premier échec, avec les coordonnées du patient.
    const alert = ownerEmails.find(call => String(call.message.subject).startsWith("Échec d’envoi après paiement"));
    expect(alert).toBeDefined();
    expect(String(alert?.message.text)).toContain("tentative 1 sur 3");
    expect(String(alert?.message.text)).toContain("Un nouvel essai automatique aura lieu");
    expect(String(alert?.message.text)).toContain("+33600000000");
    expect(jobs.find(row => row.jobType === "owner")?.status).toBe("completed");
    expect(jobs.find(row => row.jobType === "confirmation")?.status).toBe("retry");
  });

  it("réessaie brièvement une panne passagère et n’envoie qu’une fois", async () => {
    resend.script.push("5xx", "throw", "ok");
    await sendConfirmationEmail("patient@example.test", "Patient Test", "APTOWNER0001", new Date("2026-10-20T08:00:00Z"), 100, undefined, { idempotencyKey: "appointment-confirmation-APTOWNER0001" });
    expect(resend.calls).toHaveLength(3);
    expect(resend.calls.every(call => call.options?.idempotencyKey === "appointment-confirmation-APTOWNER0001")).toBe(true);
  });

  it("au premier refus définitif (adresse du patient refusée), l’alerte ne promet pas de nouvel essai automatique", async () => {
    resend.script.push("ok", "422");
    memoryDatabase([job(1, "owner"), job(2, "confirmation")]);

    await processDueAppointmentFulfillmentJobs();

    expect(subjects().filter(subject => subject.startsWith("Confirmation de réservation"))).toHaveLength(1);
    const alert = resend.calls.find(call => String(call.message.subject).startsWith("Échec d’envoi après paiement"));
    const text = String(alert?.message.text);
    expect(text).toContain("a été refusé par le service d’envoi (adresse email du patient refusée ou invalide");
    expect(text).toContain("Ce refus n’est pas passager : vérifiez l’adresse du patient et contactez-le directement.");
    expect(text).not.toContain("nouvel essai automatique");
    expect(text).toContain("+33600000000");
  });

  it("ne réessaie pas un refus définitif du fournisseur", async () => {
    resend.script.push("422");
    await expect(sendConfirmationEmail("patient@example.test", "Patient Test", "APTOWNER0001", new Date("2026-10-20T08:00:00Z"), 100))
      .rejects.toMatchObject({ message: "confirmation_email_failed", cause: expect.objectContaining({ message: expect.stringContaining("confirmation_email_rejected") }) });
    expect(resend.calls).toHaveLength(1);
  });

  it("signale l’échec de la notification propriétaire pour que son job soit réessayé", async () => {
    resend.failFor.add("owner@example.test");
    await expect(sendOwnerNotificationEmail("Patient Test", "patient@example.test", "+33600000000", "APTOWNER0001", new Date(), 100, { idempotencyKey: "appointment-owner-APTOWNER0001" }))
      .rejects.toThrow("owner_notification_failed");
    expect(resend.calls).toHaveLength(3);
    expect(resend.calls.every(call => call.options?.idempotencyKey === "appointment-owner-APTOWNER0001")).toBe(true);
    expect("sendOwnerNotificationSMS" in notificationsModule).toBe(false);
  });

  it("crée la notification propriétaire manquante d’un rendez-vous payé avant ce changement", async () => {
    const { inserts, jobs } = memoryDatabase([job(2, "confirmation")]);

    await processDueAppointmentFulfillmentJobs();

    expect(inserts).toEqual([{ jobType: "owner", conflict: "nothing" }]);
    expect(jobs.map(row => row.jobType)).toEqual(["confirmation", "owner"]);
    // Le job propriétaire créé est traité au passage suivant.
    await processDueAppointmentFulfillmentJobs();
    expect(subjects().filter(subject => subject.startsWith("Nouvelle réservation payée"))).toHaveLength(1);
  });

  it("espace les trois envois d’un même paiement pour rester sous la limite de débit de Resend (ABUS-03)", async () => {
    appointmentFulfillmentPacing.delayMs = 40;
    memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    await processDueAppointmentFulfillmentJobs();

    expect(subjects().map(subject => subject.split(" ")[0])).toEqual(["Nouvelle", "Confirmation", "Facture"]);
    const [owner, confirmation, invoice] = resend.calls.map(call => call.at);
    // setTimeout may fire a millisecond early on some platforms.
    expect(confirmation - owner).toBeGreaterThanOrEqual(38);
    expect(invoice - confirmation).toBeGreaterThanOrEqual(38);
  });

  it("garde cet espacement entre deux lots du passage planifié", async () => {
    appointmentFulfillmentPacing.delayMs = 40;
    memoryDatabase([job(1, "owner"), job(2, "confirmation"), job(3, "invoice")]);

    // The cron drains one job per batch here: each batch starts right after the previous one.
    const { processed } = await drainInBatches(() => processDueAppointmentFulfillmentJobs(1), { maxBatches: 5, budgetMs: 10_000 });

    expect(processed).toBe(3);
    const [owner, confirmation, invoice] = resend.calls.map(call => call.at);
    expect(confirmation - owner).toBeGreaterThanOrEqual(38);
    expect(invoice - confirmation).toBeGreaterThanOrEqual(38);
  });
});
