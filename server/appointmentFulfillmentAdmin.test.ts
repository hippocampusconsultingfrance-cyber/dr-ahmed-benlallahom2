import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointmentInvoices, appointments } from "../drizzle/schema";
import { createMemoryPg, pgTimestamp, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// EXPL-02 — envois après paiement visibles et renvoyables depuis l’admin,
// facture régénérée à l’identique, encart « À traiter » lu depuis la base.
// Vraies procédures, vraie file et vrai PDF ; seuls les envois Resend sont simulés.

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  down: new Set<string>(),
  sent: [] as Array<{ kind: string; to: string; pdf?: Buffer; invoiceNumber?: string }>,
}));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
// Private Vercel Blob store held in memory, behind the real storage module.
const blobStore = vi.hoisted(() => ({ objects: new Map<string, Buffer>(), uploads: [] as string[] }));
vi.mock("@vercel/blob", async importOriginal => {
  const { BlobNotFoundError } = await importOriginal<typeof import("@vercel/blob")>();
  return {
    BlobNotFoundError,
    head: vi.fn(async (pathname: string) => {
      if (!blobStore.objects.has(pathname)) throw new BlobNotFoundError();
      return { pathname, url: `https://blob.test/${pathname}` };
    }),
    put: vi.fn(async (pathname: string, body: Buffer, options: { allowOverwrite?: boolean }) => {
      if (blobStore.objects.has(pathname) && options.allowOverwrite === false) throw new Error("Vercel Blob: This blob already exists");
      blobStore.objects.set(pathname, body);
      blobStore.uploads.push(pathname);
      return { pathname, url: `https://blob.test/${pathname}` };
    }),
    del: vi.fn(),
    issueSignedToken: vi.fn(),
    list: vi.fn(),
    presignUrl: vi.fn(),
  };
});
vi.mock("./_core/notifications", async importOriginal => {
  const send = (kind: string) => vi.fn(async (to: string, ...rest: unknown[]) => {
    if (state.down.has(kind)) throw new Error(`${kind}_email_failed`);
    state.sent.push(kind === "invoice" ? { kind, to, pdf: rest[3] as Buffer, invoiceNumber: rest[4] as string } : { kind, to });
  });
  return {
    ...await importOriginal<typeof import("./_core/notifications")>(),
    sendConfirmationEmail: send("confirmation"),
    sendInvoiceEmail: send("invoice"),
    sendOwnerNotificationEmail: vi.fn(async () => {
      if (state.down.has("owner")) throw new Error("owner_notification_failed");
      state.sent.push({ kind: "owner", to: "owner" });
    }),
    // Returns false instead of throwing, as the real one.
    sendRefundConfirmationEmail: vi.fn(async (to: string) => {
      if (state.down.has("refund")) return false;
      state.sent.push({ kind: "refund", to });
      return true;
    }),
  };
});

import { appRouter } from "./routers";
import { APPOINTMENT_INVOICE_SCHEMA_OBJECTS } from "./invoiceNumbering";
import { APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS, enqueueAppointmentFulfillment, processAppointmentFulfillmentNow } from "./appointmentFulfillment";

const dialect = new PgDialect();
let memory: MemoryPg;

function admin() {
  return appRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  }).admin;
}

function seedAppointment(trackingId: string, overrides: Record<string, unknown> = {}) {
  return memory.seed(appointments, [{
    tracking_id: trackingId,
    customer_name: "Patient Test",
    customer_email: `${trackingId.toLowerCase()}@example.test`,
    customer_phone: "+33600000000",
    request_details: "Demande d’avis",
    appointment_date: new Date(Date.now() + 10 * 24 * 3_600_000),
    base_price: "100.00",
    final_price: "150.00",
    is_night_rate: 1,
    payment_status: "completed",
    appointment_status: "confirmed",
    stripe_payment_intent_id: `pi_${trackingId}`,
    ...overrides,
  }])[0]!;
}

function seedJob(appointmentId: unknown, jobType: string, overrides: Record<string, unknown> = {}) {
  return memory.seed(appointmentFulfillmentJobs, [{
    appointment_id: appointmentId,
    job_type: jobType,
    status: "queued",
    attempts: 0,
    max_attempts: 3,
    scheduled_for: new Date(Date.now() - 1000),
    created_at: new Date("2026-10-12T07:59:00Z"),
    ...overrides,
  }])[0]!;
}

function seedInvoice(appointmentId: unknown, sequence: number) {
  return memory.seed(appointmentInvoices, [{
    appointment_id: appointmentId,
    invoice_series: "FAC-2026",
    invoice_sequence: sequence,
    invoice_number: `FAC-2026-${String(sequence).padStart(6, "0")}`,
    issued_at: new Date("2026-10-12T08:00:00Z"),
    paid_at: new Date("2026-10-12T07:59:00Z"),
  }])[0]!;
}

const job = (appointmentId: unknown, jobType: string) => memory.rows(appointmentFulfillmentJobs).find(row => row.appointment_id === appointmentId && row.job_type === jobType)!;

beforeEach(() => {
  memory = createMemoryPg([appointments, appointmentFulfillmentJobs, appointmentInvoices]);
  // appointment_invoices exists, as in production: the runtime DDL check finds every object.
  const execute = memory.db.execute.bind(memory.db);
  Object.assign(memory.db, {
    execute: (query: Parameters<typeof execute>[0]) => dialect.sqlToQuery(query as never).sql.includes("to_regclass")
      ? Promise.resolve({ rows: APPOINTMENT_INVOICE_SCHEMA_OBJECTS.map(name => ({ name })) })
      : execute(query),
  });
  state.memory = memory;
  state.down.clear();
  state.sent = [];
  blobStore.objects.clear();
  blobStore.uploads = [];
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-test-token");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("EXPL-02 — état des envois sur chaque rendez-vous", () => {
  it("donne, rendez-vous par rendez-vous, l’état de la confirmation, de la facture et de la notification, et le numéro de facture", async () => {
    const paid = seedAppointment("APTSTATE0001");
    seedJob(paid.id, "owner", { status: "completed", attempts: 1 });
    seedJob(paid.id, "confirmation", { status: "failed", attempts: 3, last_error: "confirmation_email_failed" });
    seedJob(paid.id, "invoice", { status: "retry", attempts: 2, max_attempts: 6, scheduled_for: new Date("2026-10-27T06:20:00Z") });
    seedInvoice(paid.id, 7);
    const past = seedAppointment("APTSTATE0002", { appointment_date: new Date(Date.now() - 3_600_000) });
    seedJob(past.id, "confirmation", { status: "completed", attempts: 1, last_error: "appointment_already_past_confirmation_skipped" });
    seedAppointment("APTSTATE0003", { payment_status: "pending", appointment_status: "held", stripe_payment_intent_id: null });
    // Still "running" 20 minutes after its worker started: interrupted, not being sent.
    const frozen = seedAppointment("APTSTATE0004");
    seedJob(frozen.id, "confirmation", { status: "running", attempts: 1, started_at: new Date(Date.now() - 20 * 60_000) });
    seedJob(frozen.id, "invoice", { status: "running", attempts: 1, started_at: new Date(Date.now() - 60_000) });

    const list = await admin().appointments.list({});

    expect(list.total).toBe(4);
    const byId = new Map(list.items.map(item => [item.trackingId, item]));
    expect(byId.get("APTSTATE0001")?.deliveries.map(({ jobType, state, attempts, maxAttempts }) => ({ jobType, state, attempts, maxAttempts }))).toEqual([
      { jobType: "owner", state: "sent", attempts: 1, maxAttempts: 3 },
      { jobType: "confirmation", state: "failed", attempts: 3, maxAttempts: 3 },
      { jobType: "invoice", state: "retrying", attempts: 2, maxAttempts: 6 },
    ]);
    expect(byId.get("APTSTATE0001")?.deliveries[2]?.nextAttemptAt).toEqual(new Date("2026-10-27T06:20:00Z"));
    expect(byId.get("APTSTATE0001")?.invoiceNumber).toBe("FAC-2026-000007");
    expect(byId.get("APTSTATE0002")?.deliveries.map(delivery => delivery.state)).toEqual(["not_sent"]);
    expect(byId.get("APTSTATE0003")).toMatchObject({ deliveries: [], invoiceNumber: null });
    expect(byId.get("APTSTATE0004")?.deliveries.map(delivery => delivery.state)).toEqual(["interrupted", "sending"]);
  });
});

describe("EXPL-02 — « Renvoyer »", () => {
  it("remet en file les envois en échec avec un budget neuf, les traite tout de suite et ne renvoie pas ce qui est parti", async () => {
    const paid = seedAppointment("APTRETRY0001");
    seedJob(paid.id, "owner", { status: "completed", attempts: 1 });
    seedJob(paid.id, "confirmation", { status: "failed", attempts: 3, last_error: "confirmation_email_failed", finished_at: new Date() });
    seedJob(paid.id, "invoice", { status: "failed", attempts: 3, last_error: "invoice_email_failed", finished_at: new Date() });
    seedInvoice(paid.id, 3);

    const result = await admin().appointments.retryFulfillment({ trackingId: "APTRETRY0001" });

    expect(result.requeued).toBe(2);
    expect([...result.requeuedJobTypes].sort()).toEqual(["confirmation", "invoice"]);
    expect(result.deliveries.map(delivery => delivery.state)).toEqual(["sent", "sent", "sent"]);
    expect(state.sent.map(email => email.kind)).toEqual(["confirmation", "invoice"]);
    expect(state.sent[1]).toMatchObject({ to: "aptretry0001@example.test", invoiceNumber: "FAC-2026-000003" });
    expect(job(paid.id, "confirmation")).toMatchObject({ status: "completed", attempts: 1, max_attempts: APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS, last_error: null });
    expect(job(paid.id, "owner")).toMatchObject({ status: "completed", attempts: 1 });
    expect(memory.rows(appointments)[0]).toMatchObject({ email_sent: 1 });
  });

  it("laisse un envoi qui échoue encore en attente du prochain essai automatique", async () => {
    const paid = seedAppointment("APTRETRY0002");
    seedJob(paid.id, "confirmation", { status: "failed", attempts: 3 });
    seedJob(paid.id, "owner", { status: "completed", attempts: 1 });
    state.down.add("confirmation");

    const result = await admin().appointments.retryFulfillment({ trackingId: "APTRETRY0002" });

    expect(result.deliveries.find(delivery => delivery.jobType === "confirmation")).toMatchObject({ state: "retrying", attempts: 1, maxAttempts: APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS });
    expect(state.sent).toEqual([]);
  });

  it("ne touche pas un envoi déjà parti ou en cours, et refuse un rendez-vous inconnu ou non payé", async () => {
    const paid = seedAppointment("APTRETRY0003");
    seedJob(paid.id, "confirmation", { status: "completed", attempts: 1 });
    seedJob(paid.id, "invoice", { status: "running", attempts: 1, started_at: new Date() });
    const result = await admin().appointments.retryFulfillment({ trackingId: "APTRETRY0003" });
    expect(result.requeued).toBe(0);
    expect(result.requeuedJobTypes).toEqual([]);
    expect(result.deliveries.map(delivery => delivery.state)).toEqual(["sent", "sending"]);
    expect(state.sent).toEqual([]);
    expect(job(paid.id, "invoice")).toMatchObject({ status: "running", attempts: 1 });

    seedAppointment("APTRETRY0004", { payment_status: "refunded" });
    await expect(admin().appointments.retryFulfillment({ trackingId: "APTRETRY0004" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(admin().appointments.retryFulfillment({ trackingId: "APTUNKNOWN01" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("dit pourquoi un envoi relancé n’est pas parti : la confirmation d’une consultation déjà passée est sautée, la facture part", async () => {
    const past = seedAppointment("APTRETRY0006", { appointment_date: new Date(Date.now() - 3_600_000) });
    seedJob(past.id, "owner", { status: "completed", attempts: 1 });
    seedJob(past.id, "confirmation", { status: "failed", attempts: 3 });
    seedJob(past.id, "invoice", { status: "failed", attempts: 3 });
    seedInvoice(past.id, 6);

    const result = await admin().appointments.retryFulfillment({ trackingId: "APTRETRY0006" });

    expect(result.requeued).toBe(2);
    // The doctor notification had gone out before: not one of the emails this retry sent or skipped.
    expect([...result.requeuedJobTypes].sort()).toEqual(["confirmation", "invoice"]);
    expect(result.deliveries.map(({ jobType, state, notSentReason }) => ({ jobType, state, notSentReason }))).toEqual([
      { jobType: "owner", state: "sent", notSentReason: null },
      { jobType: "confirmation", state: "not_sent", notSentReason: "appointment_past" },
      { jobType: "invoice", state: "sent", notSentReason: null },
    ]);
    expect(state.sent.map(email => email.kind)).toEqual(["invoice"]);
  });

  it("relance un envoi resté « en cours » après l’arrêt de son exécution, sans attendre le prochain passage planifié", async () => {
    const paid = seedAppointment("APTRETRY0005");
    seedJob(paid.id, "owner", { status: "completed", attempts: 1 });
    seedJob(paid.id, "confirmation", { status: "running", attempts: 1, started_at: new Date(Date.now() - 16 * 60_000) });
    seedJob(paid.id, "invoice", { status: "failed", attempts: 3 });
    seedInvoice(paid.id, 5);

    const result = await admin().appointments.retryFulfillment({ trackingId: "APTRETRY0005" });

    expect(result.requeued).toBe(2);
    expect(result.deliveries.map(delivery => delivery.state)).toEqual(["sent", "sent", "sent"]);
    expect(state.sent.map(email => email.kind)).toEqual(["confirmation", "invoice"]);
    expect(job(paid.id, "confirmation")).toMatchObject({ status: "completed", attempts: 1, max_attempts: APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS });
  });
});

describe("EXPL-02 — « Télécharger la facture »", () => {
  it("régénère, octet pour octet, la facture envoyée au patient, sous le même numéro", async () => {
    const paid = seedAppointment("APTINVOICE01", { customer_name: "Łukasz Kowalski" });
    seedJob(paid.id, "invoice");
    seedInvoice(paid.id, 42);
    await processAppointmentFulfillmentNow(paid.id as number);
    const emailed = state.sent.find(email => email.kind === "invoice")!;
    expect(emailed.pdf).toBeInstanceOf(Buffer);

    // A day later, from the dashboard.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 24 * 3_600_000));
    const download = await admin().appointments.invoicePdf({ trackingId: "APTINVOICE01" });

    expect(download).toMatchObject({ invoiceNumber: "FAC-2026-000042", filename: "Facture-FAC-2026-000042.pdf" });
    expect(Buffer.from(download.contentBase64, "base64").equals(emailed.pdf!)).toBe(true);
    expect(memory.rows(appointmentInvoices)).toHaveLength(1);
  });

  it("ne stocke qu’une copie de la facture, quel que soit le nombre de tentatives d’envoi, et c’est celle envoyée", async () => {
    const paid = seedAppointment("APTINVOICE03");
    seedJob(paid.id, "invoice", { max_attempts: APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS });
    seedInvoice(paid.id, 43);
    state.down.add("invoice");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T10:00:00Z"));
    for (let attempt = 1; attempt < APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS; attempt += 1) {
      await processAppointmentFulfillmentNow(paid.id as number);
      vi.setSystemTime(new Date(`${job(paid.id, "invoice").scheduled_for}Z`));
    }
    expect(job(paid.id, "invoice")).toMatchObject({ status: "retry", attempts: APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS - 1 });
    state.down.delete("invoice");
    await processAppointmentFulfillmentNow(paid.id as number);

    expect(job(paid.id, "invoice")).toMatchObject({ status: "completed", attempts: APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS });
    expect(blobStore.uploads).toEqual(["invoices/FAC-2026-000043-APTINVOICE03.pdf"]);
    const emailed = state.sent.find(email => email.kind === "invoice")!;
    expect(blobStore.objects.get("invoices/FAC-2026-000043-APTINVOICE03.pdf")!.equals(emailed.pdf!)).toBe(true);
  });

  it("n’attribue jamais de numéro : sans facture émise, rien n’est créé", async () => {
    seedAppointment("APTINVOICE02");
    await expect(admin().appointments.invoicePdf({ trackingId: "APTINVOICE02" })).rejects.toMatchObject({ code: "NOT_FOUND", message: expect.stringContaining("Aucune facture") });
    expect(memory.rows(appointmentInvoices)).toEqual([]);
  });
});

describe("EXPL-02 — encart « À traiter »", () => {
  it("lit en base les envois en échec des rendez-vous payés et les paiements à régulariser", async () => {
    const failed = seedAppointment("APTTODO00001", { customer_name: "Alice Martin" });
    seedJob(failed.id, "confirmation", { status: "failed", attempts: 6 });
    seedJob(failed.id, "invoice", { status: "failed", attempts: 6 });
    seedJob(failed.id, "owner", { status: "completed", attempts: 1 });
    const refunded = seedAppointment("APTTODO00002", { payment_status: "refunded", appointment_status: "cancelled" });
    seedJob(refunded.id, "confirmation", { status: "failed", attempts: 3 });
    seedAppointment("APTTODO00004", { customer_name: "Bruno Weber", payment_status: "pending", appointment_status: "cancelled" });
    seedAppointment("APTTODO00005", { payment_status: "pending", appointment_status: "held" });

    const attention = await admin().attention();

    expect(attention.failedDeliveries).toEqual({
      total: 1,
      items: [{ trackingId: "APTTODO00001", customerName: "Alice Martin", appointmentDate: expect.any(Date), jobTypes: ["confirmation", "invoice"] }],
    });
    expect(attention.retryingDeliveries).toEqual({ total: 0, items: [] });
    expect(attention.unconfirmedPayments).toEqual({
      total: 1,
      items: [{ trackingId: "APTTODO00004", customerName: "Bruno Weber", appointmentDate: expect.any(Date) }],
    });
  });

  it("signale dès le premier échec un envoi en attente de son prochain essai, ou interrompu", async () => {
    const retrying = seedAppointment("APTTODO00007", { customer_name: "Chloé Durand" });
    seedJob(retrying.id, "confirmation", { status: "retry", attempts: 1, scheduled_for: new Date("2026-10-27T06:20:00Z") });
    seedJob(retrying.id, "invoice", { status: "retry", attempts: 2, scheduled_for: new Date("2026-10-26T18:00:00Z") });
    seedJob(retrying.id, "owner", { status: "completed", attempts: 1 });
    const frozen = seedAppointment("APTTODO00008", { customer_name: "David Roux" });
    seedJob(frozen.id, "confirmation", { status: "running", attempts: 1, started_at: new Date(Date.now() - 20 * 60_000) });
    // Being sent right now, refunded meanwhile, or still to be attempted: nothing to handle.
    const sending = seedAppointment("APTTODO00009");
    seedJob(sending.id, "confirmation", { status: "running", attempts: 1, started_at: new Date() });
    const refunded = seedAppointment("APTTODO00010", { payment_status: "refunded", appointment_status: "cancelled" });
    seedJob(refunded.id, "confirmation", { status: "retry", attempts: 1 });
    const queued = seedAppointment("APTTODO00011");
    seedJob(queued.id, "confirmation");

    const attention = await admin().attention();

    expect(attention.failedDeliveries).toEqual({ total: 0, items: [] });
    expect(attention.retryingDeliveries).toEqual({
      total: 2,
      items: [
        { trackingId: "APTTODO00007", customerName: "Chloé Durand", appointmentDate: expect.any(Date), jobTypes: ["confirmation", "invoice"], nextAttemptAt: new Date("2026-10-26T18:00:00Z") },
        { trackingId: "APTTODO00008", customerName: "David Roux", appointmentDate: expect.any(Date), jobTypes: ["confirmation"], nextAttemptAt: null },
      ],
    });
  });

  it("compte tous les échecs des rendez-vous payés, même derrière de nombreux échecs de rendez-vous remboursés", async () => {
    for (let index = 0; index < 205; index += 1) {
      const refunded = seedAppointment(`APTREF${String(index).padStart(6, "0")}`, { payment_status: "refunded", appointment_status: "cancelled" });
      seedJob(refunded.id, "invoice", { status: "failed", attempts: 3, updated_at: new Date("2026-01-01T00:00:00Z") });
    }
    const paid = seedAppointment("APTTODO00012");
    seedJob(paid.id, "invoice", { status: "failed", attempts: 7 });

    const attention = await admin().attention();

    expect(attention.failedDeliveries).toEqual({ total: 1, items: [expect.objectContaining({ trackingId: "APTTODO00012" })] });
  });

  it("est vide quand tout est parti", async () => {
    const paid = seedAppointment("APTTODO00006");
    seedJob(paid.id, "confirmation", { status: "completed", attempts: 1 });
    await expect(admin().attention()).resolves.toEqual({ failedDeliveries: { total: 0, items: [] }, retryingDeliveries: { total: 0, items: [] }, unconfirmedPayments: { total: 0, items: [] } });
  });
});

describe("RES-06 — envois d’un remboursement constaté chez Stripe", () => {
  it("les montre dans « À traiter » et « Renvoyer » ne relance qu’eux sur le rendez-vous remboursé", async () => {
    const { STRIPE_REFUND_CANCELLATION_REASON } = await import("./appointmentPaymentWebhook");
    const refunded = seedAppointment("APTREFUND001", { payment_status: "refunded", appointment_status: "cancelled", cancellation_reason: STRIPE_REFUND_CANCELLATION_REASON, refund_amount: "150.00" });
    seedJob(refunded.id, "invoice", { status: "failed", attempts: 7, max_attempts: 7 });
    seedJob(refunded.id, "refund", { status: "failed", attempts: 7, max_attempts: 7, last_error: "refund_email_failed" });
    seedJob(refunded.id, "refund_owner", { status: "retry", attempts: 1, max_attempts: 7, scheduled_for: new Date("2026-10-27T06:20:00Z") });

    const attention = await admin().attention();
    expect(attention.failedDeliveries.items).toEqual([expect.objectContaining({ trackingId: "APTREFUND001", jobTypes: ["refund"] })]);
    expect(attention.retryingDeliveries.items).toEqual([expect.objectContaining({ trackingId: "APTREFUND001", jobTypes: ["refund_owner"] })]);

    const result = await admin().appointments.retryFulfillment({ trackingId: "APTREFUND001" });
    expect(result.requeued).toBe(2);
    expect(state.sent).toEqual([{ kind: "refund", to: "aptrefund001@example.test" }]);
    expect(result.deliveries.map(delivery => [delivery.jobType, delivery.state])).toEqual([["invoice", "failed"], ["refund", "sent"], ["refund_owner", "sent"]]);
    await expect(admin().attention()).resolves.toMatchObject({ failedDeliveries: { total: 0 }, retryingDeliveries: { total: 0 } });
  });

  it("n’envoie rien pour un remboursement fait depuis le tableau de bord, qui prévient lui-même le patient", async () => {
    const refunded = seedAppointment("APTREFUND002", { payment_status: "refunded", appointment_status: "cancelled", cancellation_reason: "Annulation / remboursement par le praticien : indisponibilité" });
    seedJob(refunded.id, "refund");

    await expect(admin().appointments.retryFulfillment({ trackingId: "APTREFUND002" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await processAppointmentFulfillmentNow(refunded.id as number);
    expect(state.sent).toEqual([]);
    expect(job(refunded.id, "refund")).toMatchObject({ status: "completed", last_error: "appointment_not_refunded_from_stripe_or_missing" });
  });
});

describe("EXPL-02 — tentatives automatiques", () => {
  it("met en file chaque envoi avec 7 tentatives, espacées de 10 min, 1 h, 4 h, 12 h, 20 h puis 20 h", async () => {
    const paid = seedAppointment("APTSPACING01");
    await enqueueAppointmentFulfillment(paid.id as number);
    expect(memory.rows(appointmentFulfillmentJobs).map(row => [row.job_type, row.max_attempts])).toEqual([["owner", 7], ["confirmation", 7], ["invoice", 7]]);
    for (const row of memory.rows(appointmentFulfillmentJobs)) if (row.job_type !== "confirmation") row.status = "completed";

    state.down.add("confirmation");
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = new Date("2026-10-26T10:00:00Z");
    vi.setSystemTime(start);
    const delays: number[] = [];
    for (let attempt = 1; attempt <= 7; attempt += 1) {
      await processAppointmentFulfillmentNow(paid.id as number);
      const confirmation = job(paid.id, "confirmation");
      if (confirmation.status !== "retry") break;
      const next = new Date(`${confirmation.scheduled_for}Z`);
      delays.push((next.getTime() - Date.now()) / 60_000);
      vi.setSystemTime(next);
    }

    expect(delays).toEqual([10, 60, 240, 720, 1200, 1200]);
    expect(job(paid.id, "confirmation")).toMatchObject({ status: "failed", attempts: 7 });
    // More than two days of outage covered, even by a worker that runs often.
    const span = (10 + 60 + 240 + 720 + 1200 + 1200) * 60_000;
    expect(span).toBeGreaterThan(48 * 3_600_000);
    expect(pgTimestamp(new Date())).toBe(pgTimestamp(new Date(start.getTime() + span)));
  });
});
