import { eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointmentInvoices, appointments, securityEvents } from "../drizzle/schema";
import { createMemoryPg, pgTimestamp, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// EXPL-02 — envois après paiement visibles et renvoyables depuis l’admin,
// facture régénérée à l’identique, encart « À traiter » lu depuis la base.
// Vraies procédures, vraie file et vrai PDF ; seuls les envois Resend sont simulés.

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  down: new Set<string>(),
  // Emails the email service refuses for good (address refused): no automatic retry.
  refused: new Set<string>(),
  sent: [] as Array<{ kind: string; to: string; pdf?: Buffer; invoiceNumber?: string }>,
}));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
// Private Vercel Blob store held in memory, behind the real storage module;
// its objects are read through signed URLs (fetch below). `unreadable`: reads fail.
// `unavailable`: the service does not answer whether an object is stored;
// `unwritable`: it answers, but does not take a new object;
// `suspended`: the store is suspended.
const blobStore = vi.hoisted(() => ({ objects: new Map<string, Buffer>(), uploads: [] as string[], reads: [] as string[], unreadable: false, unavailable: false, unwritable: false, suspended: false }));
vi.mock("@vercel/blob", async importOriginal => {
  const { BlobNotFoundError, BlobServiceNotAvailable, BlobStoreSuspendedError } = await importOriginal<typeof import("@vercel/blob")>();
  return {
    BlobNotFoundError,
    head: vi.fn(async (pathname: string) => {
      if (blobStore.unavailable) throw new BlobServiceNotAvailable();
      if (blobStore.suspended) throw new BlobStoreSuspendedError();
      if (!blobStore.objects.has(pathname)) throw new BlobNotFoundError();
      return { pathname, url: `https://blob.test/${pathname}` };
    }),
    put: vi.fn(async (pathname: string, body: Buffer, options: { allowOverwrite?: boolean }) => {
      if (blobStore.unwritable) throw new BlobServiceNotAvailable();
      if (blobStore.objects.has(pathname) && options.allowOverwrite === false) throw new Error("Vercel Blob: This blob already exists");
      blobStore.objects.set(pathname, body);
      blobStore.uploads.push(pathname);
      return { pathname, url: `https://blob.test/${pathname}` };
    }),
    del: vi.fn(),
    issueSignedToken: vi.fn(async ({ pathname }: { pathname: string }) => `token-${pathname}`),
    list: vi.fn(),
    presignUrl: vi.fn(async (_token: string, { pathname }: { pathname: string }) => ({ presignedUrl: `https://blob.test/${pathname}?signed=1` })),
  };
});
// The real numbering; an invoice number allocated by the job is seeded by the
// test (the in-memory database does not run its INSERT … SELECT).
vi.mock("./invoiceNumbering", async importOriginal => {
  const actual = await importOriginal<typeof import("./invoiceNumbering")>();
  return { ...actual, allocateAppointmentInvoice: vi.fn(actual.allocateAppointmentInvoice) };
});
vi.mock("./_core/notifications", async importOriginal => {
  const send = (kind: string) => vi.fn(async (to: string, ...rest: unknown[]) => {
    if (state.refused.has(kind)) throw new Error(`${kind}_email_refused`);
    if (state.down.has(kind)) throw new Error(`${kind}_email_failed`);
    state.sent.push(kind === "invoice" ? { kind, to, pdf: rest[3] as Buffer, invoiceNumber: rest[4] as string } : { kind, to });
  });
  return {
    ...await importOriginal<typeof import("./_core/notifications")>(),
    // A refusal of the address (Resend 422), as the real senders report it; told apart in appointmentFulfillmentRefusal.test.ts.
    postPaymentEmailRefused: (error: unknown) => error instanceof Error && error.message.endsWith("_email_refused"),
    sendConfirmationEmail: send("confirmation"),
    sendInvoiceEmail: send("invoice"),
    sendOwnerNotificationEmail: vi.fn(async () => {
      if (state.down.has("owner")) throw new Error("owner_notification_failed");
      state.sent.push({ kind: "owner", to: "owner" });
    }),
    sendRefundConfirmationEmail: vi.fn(async (to: string) => {
      if (state.down.has("refund")) throw new Error("refund_email_failed");
      state.sent.push({ kind: "refund", to });
    }),
  };
});

import { appRouter } from "./routers";
import { allocateAppointmentInvoice, APPOINTMENT_INVOICE_SCHEMA_OBJECTS } from "./invoiceNumbering";
import { APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS, enqueueAppointmentFulfillment, processAppointmentFulfillmentNow } from "./appointmentFulfillment";
import { anonymisedAppointmentFields } from "./personalDataRetention";
import { notifyOwner } from "./_core/notification";

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

/** The next whole minute of the clock: the jobs seeded until now are due, and the retry delays stay whole minutes. */
function nextWholeMinute() {
  return new Date(Math.floor(Date.now() / 60_000) * 60_000 + 60_000);
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
  memory = createMemoryPg([appointments, appointmentFulfillmentJobs, appointmentInvoices, securityEvents]);
  // appointment_invoices exists, as in production: the runtime DDL check finds every object.
  const execute = memory.db.execute.bind(memory.db);
  Object.assign(memory.db, {
    execute: (query: Parameters<typeof execute>[0]) => dialect.sqlToQuery(query as never).sql.includes("to_regclass")
      ? Promise.resolve({ rows: APPOINTMENT_INVOICE_SCHEMA_OBJECTS.map(name => ({ name })) })
      : execute(query),
  });
  state.memory = memory;
  state.down.clear();
  state.refused.clear();
  state.sent = [];
  blobStore.objects.clear();
  blobStore.uploads = [];
  blobStore.reads = [];
  blobStore.unreadable = false;
  blobStore.unavailable = false;
  blobStore.unwritable = false;
  blobStore.suspended = false;
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-test-token");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const pathname = decodeURIComponent(new URL(url).pathname.slice(1));
    blobStore.reads.push(pathname);
    const object = blobStore.unreadable ? undefined : blobStore.objects.get(pathname);
    return object ? new Response(new Uint8Array(object)) : new Response("unavailable", { status: blobStore.unreadable ? 503 : 404 });
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    vi.setSystemTime(nextWholeMinute());
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

  /** Lines of the PDF, as pdf.js reads them. */
  async function pdfLines(pdf: Buffer) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: pdf });
    try {
      return (await parser.getText()).text.split("\n").map(line => line.trim()).filter(Boolean);
    } finally {
      await parser.destroy();
    }
  }

  /** Lines printed under « Facturé à : » (name, email, phone). */
  async function billedTo(pdf: Buffer) {
    const lines = await pdfLines(pdf);
    return lines.slice(lines.indexOf("Facturé à :") + 1, lines.indexOf("Facturé à :") + 4);
  }

  it("facture refusée puis adresse corrigée : l’email envoyé après correction et le téléchargement sont la facture émise, octet pour octet, à l’adresse d’origine", async () => {
    const paid = seedAppointment("APTINVFIX001");
    seedJob(paid.id, "owner", { status: "completed", attempts: 1 });
    seedJob(paid.id, "confirmation", { status: "completed", attempts: 1 });
    seedJob(paid.id, "invoice");
    seedInvoice(paid.id, 51);
    state.refused.add("invoice");
    await processAppointmentFulfillmentNow(paid.id as number);
    expect(job(paid.id, "invoice")).toMatchObject({ status: "failed", attempts: 1 });
    // Issued at its first attempt: stored once, with the address of the booking then.
    expect(blobStore.uploads).toEqual(["invoices/FAC-2026-000051-APTINVFIX001.pdf"]);
    const issued = blobStore.objects.get("invoices/FAC-2026-000051-APTINVFIX001.pdf")!;
    expect(await billedTo(issued)).toEqual(["Patient Test", "aptinvfix001@example.test", "+33600000000"]);

    await admin().appointments.updateCustomerEmail({ trackingId: "APTINVFIX001", customerEmail: "patient.corrige@example.test" });
    state.refused.clear();
    await admin().appointments.retryFulfillment({ trackingId: "APTINVFIX001" });

    // Sent to the new address, but the invoice issued under this number does not change.
    const emailed = state.sent.find(email => email.kind === "invoice")!;
    expect(emailed).toMatchObject({ to: "patient.corrige@example.test", invoiceNumber: "FAC-2026-000051" });
    expect(emailed.pdf!.equals(issued)).toBe(true);
    const download = Buffer.from((await admin().appointments.invoicePdf({ trackingId: "APTINVFIX001" })).contentBase64, "base64");
    expect(download.equals(issued)).toBe(true);
    expect(await billedTo(download)).toEqual(["Patient Test", "aptinvfix001@example.test", "+33600000000"]);
    expect(blobStore.uploads).toHaveLength(1);
  });

  it("facture déjà partie, confirmation refusée puis adresse corrigée : « Télécharger la facture » donne toujours la facture reçue par le patient", async () => {
    const paid = seedAppointment("APTINVFIX002");
    seedJob(paid.id, "owner", { status: "completed", attempts: 1 });
    seedJob(paid.id, "confirmation");
    seedJob(paid.id, "invoice");
    seedInvoice(paid.id, 52);
    state.refused.add("confirmation");
    await processAppointmentFulfillmentNow(paid.id as number);
    const received = state.sent.find(email => email.kind === "invoice")!;
    expect(received.to).toBe("aptinvfix002@example.test");

    await admin().appointments.updateCustomerEmail({ trackingId: "APTINVFIX002", customerEmail: "patient.corrige@example.test" });
    const download = Buffer.from((await admin().appointments.invoicePdf({ trackingId: "APTINVFIX002" })).contentBase64, "base64");

    expect(download.equals(received.pdf!)).toBe(true);
    expect((await billedTo(download))[1]).toBe("aptinvfix002@example.test");
    expect(blobStore.objects.get("invoices/FAC-2026-000052-APTINVFIX002.pdf")!.equals(received.pdf!)).toBe(true);
  });

  it("sans copie archivée, le téléchargement émet la facture une fois avec les données du moment ; l’email l’envoie ensuite telle quelle", async () => {
    const paid = seedAppointment("APTINVFIX003");
    seedInvoice(paid.id, 53);

    const first = Buffer.from((await admin().appointments.invoicePdf({ trackingId: "APTINVFIX003" })).contentBase64, "base64");
    expect(blobStore.uploads).toEqual(["invoices/FAC-2026-000053-APTINVFIX003.pdf"]);
    expect(blobStore.objects.get("invoices/FAC-2026-000053-APTINVFIX003.pdf")!.equals(first)).toBe(true);

    seedJob(paid.id, "invoice");
    await processAppointmentFulfillmentNow(paid.id as number);
    const second = Buffer.from((await admin().appointments.invoicePdf({ trackingId: "APTINVFIX003" })).contentBase64, "base64");

    expect(state.sent.find(email => email.kind === "invoice")!.pdf!.equals(first)).toBe(true);
    expect(second.equals(first)).toBe(true);
    expect(blobStore.uploads).toHaveLength(1);
  });

  it("ne remplace pas une facture archivée illisible par une autre : le téléchargement échoue et l’envoi attend son nouvel essai", async () => {
    const paid = seedAppointment("APTINVFIX004");
    seedInvoice(paid.id, 54);
    await admin().appointments.invoicePdf({ trackingId: "APTINVFIX004" });
    blobStore.unreadable = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(admin().appointments.invoicePdf({ trackingId: "APTINVFIX004" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    seedJob(paid.id, "invoice");
    await processAppointmentFulfillmentNow(paid.id as number);

    expect(state.sent).toEqual([]);
    expect(job(paid.id, "invoice")).toMatchObject({ status: "retry", attempts: 1 });
    expect(blobStore.uploads).toHaveLength(1);
  });

  it("stockage indisponible après correction de l’adresse : ni l’email ni le téléchargement ne reconstruisent la facture avec la nouvelle adresse ; au retour du stockage, ils donnent la facture émise", async () => {
    const paid = seedAppointment("APTINVFIX006");
    seedJob(paid.id, "owner", { status: "completed", attempts: 1 });
    seedJob(paid.id, "confirmation", { status: "completed", attempts: 1 });
    seedJob(paid.id, "invoice");
    seedInvoice(paid.id, 56);
    state.refused.add("invoice");
    await processAppointmentFulfillmentNow(paid.id as number);
    const issued = blobStore.objects.get("invoices/FAC-2026-000056-APTINVFIX006.pdf")!;
    await admin().appointments.updateCustomerEmail({ trackingId: "APTINVFIX006", customerEmail: "patient.corrige@example.test" });
    state.refused.clear();
    // Vercel Blob does not answer whether the invoice is stored (BlobServiceNotAvailable).
    blobStore.unavailable = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(admin().appointments.invoicePdf({ trackingId: "APTINVFIX006" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: expect.stringContaining("le stockage des factures (Vercel Blob) ne répond pas pour l’instant ; réessayez dans un instant") });
    const retried = await admin().appointments.retryFulfillment({ trackingId: "APTINVFIX006" });
    expect(state.sent).toEqual([]);
    expect(job(paid.id, "invoice")).toMatchObject({ status: "retry", attempts: 1 });
    // The storage, not the email service, kept it from going out: the card and the owner alert say so.
    expect(retried.deliveries.find(delivery => delivery.jobType === "invoice")).toMatchObject({ state: "retrying", failureCause: "invoice_storage" });
    expect(vi.mocked(notifyOwner)).toHaveBeenLastCalledWith(expect.objectContaining({
      content: expect.stringContaining("vient d’échouer (tentative 1 sur 7) : sa copie archivée dans le stockage des factures (Vercel Blob) n’a pas pu être vérifiée ou lue, et elle n’est pas refaite à sa place"),
    }), { idempotencyKey: "appointment-invoice-failure-APTINVFIX006-first-storage" });
    expect(blobStore.uploads).toHaveLength(1);

    blobStore.unavailable = false;
    await admin().appointments.retryFulfillment({ trackingId: "APTINVFIX006" });
    const emailed = state.sent.find(email => email.kind === "invoice")!;
    expect(emailed).toMatchObject({ to: "patient.corrige@example.test", invoiceNumber: "FAC-2026-000056" });
    expect(emailed.pdf!.equals(issued)).toBe(true);
    const download = Buffer.from((await admin().appointments.invoicePdf({ trackingId: "APTINVFIX006" })).contentBase64, "base64");
    expect(download.equals(issued)).toBe(true);
    expect((await billedTo(download))[1]).toBe("aptinvfix006@example.test");
    expect(blobStore.uploads).toHaveLength(1);
  });

  it("store suspendu : le téléchargement d’une facture émise le dit, à corriger dans Vercel, sans la reconstruire", async () => {
    const paid = seedAppointment("APTINVFIX008");
    seedInvoice(paid.id, 58);
    blobStore.suspended = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(admin().appointments.invoicePdf({ trackingId: "APTINVFIX008" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: expect.stringContaining("le stockage des factures (Vercel Blob) refuse l’accès (store suspendu ou introuvable") });
    expect(error).toHaveBeenCalledWith("[AppointmentFulfillment] Invoice download failed", { message: "storage_check_failed", code: "storage_store_suspended" });
    expect(blobStore.uploads).toEqual([]);
  });

  it("première émission pendant une panne de Vercel Blob : la facture, dont aucune copie ne peut encore être archivée, est envoyée ; le téléchargement suivant l’archive à l’identique", async () => {
    const paid = seedAppointment("APTINVFIX007");
    seedJob(paid.id, "owner", { status: "completed", attempts: 1 });
    seedJob(paid.id, "confirmation", { status: "completed", attempts: 1 });
    seedJob(paid.id, "invoice");
    // The job allocates the appointment's number now.
    vi.mocked(allocateAppointmentInvoice).mockImplementationOnce(async ({ appointmentId }) => {
      seedInvoice(appointmentId, 57);
      return { invoiceNumber: "FAC-2026-000057", issuedAt: new Date("2026-10-12T08:00:00Z"), paidAt: new Date("2026-10-12T07:59:00Z"), issuedNow: true };
    });
    blobStore.unavailable = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await processAppointmentFulfillmentNow(paid.id as number);

    const emailed = state.sent.find(email => email.kind === "invoice")!;
    expect(emailed).toMatchObject({ to: "aptinvfix007@example.test", invoiceNumber: "FAC-2026-000057" });
    expect(job(paid.id, "invoice")).toMatchObject({ status: "completed", last_error: null });
    expect(blobStore.uploads).toEqual([]);

    blobStore.unavailable = false;
    const download = Buffer.from((await admin().appointments.invoicePdf({ trackingId: "APTINVFIX007" })).contentBase64, "base64");
    expect(download.equals(emailed.pdf!)).toBe(true);
    expect(blobStore.uploads).toEqual(["invoices/FAC-2026-000057-APTINVFIX007.pdf"]);
  });

  it("facture envoyée sans archive (panne de Vercel Blob au paiement) : l’adresse n’est corrigée qu’une fois la facture archivée telle que le patient l’a reçue ; tant que le stockage ne répond pas, rien ne change", async () => {
    const paid = seedAppointment("APTINVFIX009");
    seedJob(paid.id, "owner", { status: "completed", attempts: 1 });
    seedJob(paid.id, "confirmation");
    seedJob(paid.id, "invoice");
    vi.mocked(allocateAppointmentInvoice).mockImplementationOnce(async ({ appointmentId }) => {
      seedInvoice(appointmentId, 59);
      return { invoiceNumber: "FAC-2026-000059", issuedAt: new Date("2026-10-12T08:00:00Z"), paidAt: new Date("2026-10-12T07:59:00Z"), issuedNow: true };
    });
    state.refused.add("confirmation");
    blobStore.unavailable = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await processAppointmentFulfillmentNow(paid.id as number);
    const received = state.sent.find(email => email.kind === "invoice")!;
    expect(received).toMatchObject({ to: "aptinvfix009@example.test", invoiceNumber: "FAC-2026-000059" });
    expect(blobStore.uploads).toEqual([]);
    const corrections = () => memory.rows(securityEvents).filter(event => event.category === "admin_appointment_email_corrected");
    const correct = () => admin().appointments.updateCustomerEmail({ trackingId: "APTINVFIX009", customerEmail: "patient.corrige@example.test" });

    // Vercel Blob does not say whether a copy is stored, then says none is but takes none, then is suspended.
    await expect(correct()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: expect.stringContaining("le stockage des factures (Vercel Blob) ne répond pas pour l’instant. Réessayez quand le stockage répond.") });
    blobStore.unavailable = false;
    blobStore.unwritable = true;
    await expect(correct()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: expect.stringContaining("Réessayez quand le stockage répond.") });
    blobStore.unwritable = false;
    blobStore.suspended = true;
    await expect(correct()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: expect.stringContaining("refuse l’accès (store suspendu ou introuvable") });
    expect(memory.rows(appointments).find(row => row.id === paid.id)).toMatchObject({ customer_email: "aptinvfix009@example.test" });
    expect(corrections()).toEqual([]);
    expect(blobStore.uploads).toEqual([]);

    // Back: the invoice the patient received is stored first, with the address it was issued to.
    blobStore.suspended = false;
    await expect(correct()).resolves.toEqual({ success: true, unchanged: false });
    expect(memory.rows(appointments).find(row => row.id === paid.id)).toMatchObject({ customer_email: "patient.corrige@example.test" });
    expect(corrections()).toHaveLength(1);
    expect(blobStore.uploads).toEqual(["invoices/FAC-2026-000059-APTINVFIX009.pdf"]);
    expect(blobStore.objects.get("invoices/FAC-2026-000059-APTINVFIX009.pdf")!.equals(received.pdf!)).toBe(true);
    const download = Buffer.from((await admin().appointments.invoicePdf({ trackingId: "APTINVFIX009" })).contentBase64, "base64");
    expect(download.equals(received.pdf!)).toBe(true);
    expect((await billedTo(download))[1]).toBe("aptinvfix009@example.test");
  });

  it("sans facture émise, ou avec sa copie déjà archivée, la correction ne réécrit rien dans le stockage", async () => {
    const unpaidInvoice = seedAppointment("APTINVFIX010");
    seedJob(unpaidInvoice.id, "confirmation", { status: "failed", attempts: 1, last_error: "provider_rejected:confirmation_email_refused" });
    const archived = seedAppointment("APTINVFIX011");
    seedJob(archived.id, "confirmation", { status: "failed", attempts: 1, last_error: "provider_rejected:confirmation_email_refused" });
    seedInvoice(archived.id, 61);
    await admin().appointments.invoicePdf({ trackingId: "APTINVFIX011" });
    const stored = blobStore.objects.get("invoices/FAC-2026-000061-APTINVFIX011.pdf")!;
    blobStore.unwritable = true;

    await expect(admin().appointments.updateCustomerEmail({ trackingId: "APTINVFIX010", customerEmail: "a.corrige@example.test" })).resolves.toEqual({ success: true, unchanged: false });
    await expect(admin().appointments.updateCustomerEmail({ trackingId: "APTINVFIX011", customerEmail: "b.corrige@example.test" })).resolves.toEqual({ success: true, unchanged: false });

    expect(blobStore.uploads).toEqual(["invoices/FAC-2026-000061-APTINVFIX011.pdf"]);
    expect(blobStore.objects.get("invoices/FAC-2026-000061-APTINVFIX011.pdf")).toBe(stored);
  });

  it("rendez-vous effacé (RGPD) : le téléchargement reconstruit la facture sans l’identité, sans lire ni remplacer la copie archivée", async () => {
    const paid = seedAppointment("APTINVFIX005");
    seedInvoice(paid.id, 55);
    // Issued and stored before the erasure, with the patient's identity.
    await admin().appointments.invoicePdf({ trackingId: "APTINVFIX005" });
    const issued = blobStore.objects.get("invoices/FAC-2026-000055-APTINVFIX005.pdf")!;
    expect(await billedTo(issued)).toEqual(["Patient Test", "aptinvfix005@example.test", "+33600000000"]);

    // Reduced to its accounting record, as an erasure leaves it.
    await memory.db.update(appointments).set(anonymisedAppointmentFields()).where(eq(appointments.trackingId, "APTINVFIX005"));
    const download = await admin().appointments.invoicePdf({ trackingId: "APTINVFIX005" });

    expect(download.invoiceNumber).toBe("FAC-2026-000055");
    const lines = await pdfLines(Buffer.from(download.contentBase64, "base64"));
    expect(lines[lines.indexOf("Facturé à :") + 1]).toBe("Anonymisé");
    expect(lines.join("\n")).not.toMatch(/Patient Test|aptinvfix005@example\.test|\+33600000000/);
    // The stored copy, kept for the accounting, is neither read nor replaced.
    expect(blobStore.reads).toEqual([]);
    expect(blobStore.uploads).toHaveLength(1);
    expect(blobStore.objects.get("invoices/FAC-2026-000055-APTINVFIX005.pdf")!.equals(issued)).toBe(true);
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
      items: [{ trackingId: "APTTODO00001", customerName: "Alice Martin", appointmentDate: expect.any(Date), jobTypes: ["confirmation", "invoice"], storageJobTypes: [] }],
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
    // Kept from going out by the invoice storage (Vercel Blob), not the email service.
    const storage = seedAppointment("APTTODO00013", { customer_name: "Emma Petit" });
    seedJob(storage.id, "invoice", { status: "retry", attempts: 1, last_error: "storage_check_failed", scheduled_for: new Date("2026-10-27T06:20:00Z") });

    const attention = await admin().attention();

    expect(attention.failedDeliveries).toEqual({ total: 0, items: [] });
    expect(attention.retryingDeliveries).toEqual({
      total: 3,
      items: [
        { trackingId: "APTTODO00007", customerName: "Chloé Durand", appointmentDate: expect.any(Date), jobTypes: ["confirmation", "invoice"], nextAttemptAt: new Date("2026-10-26T18:00:00Z"), storageJobTypes: [] },
        { trackingId: "APTTODO00008", customerName: "David Roux", appointmentDate: expect.any(Date), jobTypes: ["confirmation"], nextAttemptAt: null, storageJobTypes: [] },
        { trackingId: "APTTODO00013", customerName: "Emma Petit", appointmentDate: expect.any(Date), jobTypes: ["invoice"], nextAttemptAt: new Date("2026-10-27T06:20:00Z"), storageJobTypes: ["invoice"] },
      ],
    });
  });

  it("ne dit retenu par le stockage des factures que l’envoi qu’il a retenu, pas un autre envoi du rendez-vous (EXPL-02)", async () => {
    // Confirmation out of attempts on the email service, invoice waiting for the storage:
    // a job cut by the immediate budget does not count its attempt, so they may fall in different groups.
    const split = seedAppointment("APTTODO00017", { customer_name: "Hugo Morel" });
    seedJob(split.id, "owner", { status: "completed", attempts: 1 });
    seedJob(split.id, "confirmation", { status: "failed", attempts: 7, max_attempts: 7, last_error: "resend_send_failed: 500" });
    seedJob(split.id, "invoice", { status: "retry", attempts: 6, max_attempts: 7, last_error: "storage_check_failed", scheduled_for: new Date("2026-10-27T06:20:00Z") });
    // Both waiting for a new attempt, one on the email service, the other on the storage.
    const together = seedAppointment("APTTODO00018", { customer_name: "Inès Faure" });
    seedJob(together.id, "confirmation", { status: "retry", attempts: 1, max_attempts: 7, last_error: "resend_send_failed: 500", scheduled_for: new Date("2026-10-27T06:20:00Z") });
    seedJob(together.id, "invoice", { status: "retry", attempts: 1, max_attempts: 7, last_error: "storage_upload_failed", scheduled_for: new Date("2026-10-27T06:20:00Z") });

    const attention = await admin().attention();

    expect(attention.failedDeliveries.items).toEqual([expect.objectContaining({ trackingId: "APTTODO00017", jobTypes: ["confirmation"], storageJobTypes: [] })]);
    expect(attention.retryingDeliveries.items).toEqual([
      expect.objectContaining({ trackingId: "APTTODO00017", jobTypes: ["invoice"], storageJobTypes: ["invoice"] }),
      expect.objectContaining({ trackingId: "APTTODO00018", jobTypes: ["confirmation", "invoice"], storageJobTypes: ["invoice"] }),
    ]);
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
    await expect(admin().attention()).resolves.toEqual({ failedDeliveries: { total: 0, items: [] }, refusedDeliveries: { total: 0, items: [] }, retryingDeliveries: { total: 0, items: [] }, waitingDeliveries: { total: 0, items: [] }, unconfirmedPayments: { total: 0, items: [] } });
  });

  it("liste les envois pas encore partis quelques minutes après le paiement (traitement immédiat à court de temps), sans les compter en échec (ABUS-03)", async () => {
    // As a payment's processing leaves them when its time budget runs out: due, not attempted.
    const cut = seedAppointment("APTTODO00013", { customer_name: "Élise Moreau" });
    const dueSince = new Date(Date.now() - 7 * 60_000);
    seedJob(cut.id, "owner", { status: "completed", attempts: 1 });
    seedJob(cut.id, "confirmation", { scheduled_for: new Date(Date.now() - 6 * 60_000) });
    seedJob(cut.id, "invoice", { scheduled_for: dueSince });
    seedInvoice(cut.id, 8);
    // Paid a minute ago: its processing may still be sending them.
    const fresh = seedAppointment("APTTODO00014");
    seedJob(fresh.id, "confirmation", { scheduled_for: new Date(Date.now() - 60_000) });
    // Refunded meanwhile: nothing left to send.
    const refunded = seedAppointment("APTTODO00015", { payment_status: "refunded", appointment_status: "cancelled" });
    seedJob(refunded.id, "invoice", { scheduled_for: new Date(Date.now() - 60 * 60_000) });

    const attention = await admin().attention();

    expect(attention.waitingDeliveries).toEqual({
      total: 1,
      items: [{ trackingId: "APTTODO00013", customerName: "Élise Moreau", appointmentDate: expect.any(Date), jobTypes: ["confirmation", "invoice"], dueSince }],
    });
    expect([attention.failedDeliveries.total, attention.refusedDeliveries.total, attention.retryingDeliveries.total]).toEqual([0, 0, 0]);
    expect((await admin().appointments.list({ search: "APTTODO00013" })).items[0]?.deliveries.map(delivery => [delivery.state, delivery.attempts])).toEqual([["sent", 1], ["pending", 0], ["pending", 0]]);

    // Updated in another order than they are sent: still listed in sending order.
    const scrambled = seedAppointment("APTTODO00016");
    const updatedAt = (minutes: number) => ({ scheduled_for: dueSince, updated_at: new Date(Date.now() - minutes * 60_000) });
    seedJob(scrambled.id, "invoice", updatedAt(9));
    seedJob(scrambled.id, "owner", updatedAt(8));
    seedJob(scrambled.id, "confirmation", updatedAt(7));
    expect((await admin().attention()).waitingDeliveries.items.find(item => item.trackingId === "APTTODO00016")?.jobTypes).toEqual(["owner", "confirmation", "invoice"]);

    // « Renvoyer » sends them right away; the panel empties.
    await admin().appointments.retryFulfillment({ trackingId: "APTTODO00016" });
    state.sent = [];
    await admin().appointments.retryFulfillment({ trackingId: "APTTODO00013" });
    expect(state.sent.map(email => email.kind)).toEqual(["confirmation", "invoice"]);
    await expect(admin().attention()).resolves.toMatchObject({ waitingDeliveries: { total: 0, items: [] } });
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

  it("renvoie l’email au patient d’un remboursement fait depuis le tableau de bord, jamais d’alerte « constaté chez Stripe » (EXPL-02)", async () => {
    const refunded = seedAppointment("APTREFUND002", { payment_status: "refunded", appointment_status: "cancelled", cancellation_reason: "Annulation / remboursement par le praticien : indisponibilité", refund_amount: "150.00" });
    seedJob(refunded.id, "refund", { status: "failed", attempts: 7, max_attempts: 7, last_error: "refund_email_failed" });
    seedJob(refunded.id, "refund_owner");

    const result = await admin().appointments.retryFulfillment({ trackingId: "APTREFUND002" });

    expect(result.requeuedJobTypes).toEqual(["refund", "refund_owner"]);
    expect(state.sent).toEqual([{ kind: "refund", to: "aptrefund002@example.test" }]);
    expect(job(refunded.id, "refund")).toMatchObject({ status: "completed", last_error: null });
    // The owner made this refund: its alert is closed as not sent.
    expect(job(refunded.id, "refund_owner")).toMatchObject({ status: "completed", last_error: "appointment_refund_not_recorded_or_missing" });
  });

  it("n’envoie rien pour un rendez-vous remboursé sans remboursement reconnu (ancien ou anonymisé)", async () => {
    const refunded = seedAppointment("APTREFUND003", { payment_status: "refunded", appointment_status: "cancelled", cancellation_reason: null });
    seedJob(refunded.id, "refund");

    await expect(admin().appointments.retryFulfillment({ trackingId: "APTREFUND003" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await processAppointmentFulfillmentNow(refunded.id as number);
    expect(state.sent).toEqual([]);
    expect(job(refunded.id, "refund")).toMatchObject({ status: "completed", last_error: "appointment_refund_not_recorded_or_missing" });
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
    const start = nextWholeMinute();
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
