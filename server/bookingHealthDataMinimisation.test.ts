import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";

// B4 / LEGAL-09 / BOOK-HEALTHDATA : l’objet libre de la réservation reste en base
// (tableau de bord) mais n’est recopié dans aucun email, ni patient ni propriétaire,
// ni dans le rappel ni dans la facture. Les vrais gabarits sont exécutés ; seul
// le transport Resend est remplacé par une capture.

const sent = vi.hoisted(() => {
  // Lu au chargement du module de notification.
  vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.test");
  return { emails: [] as Array<Record<string, unknown>> };
});
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(async (message: Record<string, unknown>) => {
        sent.emails.push(message);
        return { data: { id: `email_${sent.emails.length}` }, error: null };
      }),
    },
  })),
}));
const database = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./storage.js", () => ({ storagePut: vi.fn(async (key: string) => ({ key, url: "https://storage.test/invoice.pdf" })) }));
vi.mock("./invoiceNumbering", () => ({
  allocateAppointmentInvoice: vi.fn(async () => ({
    invoiceNumber: "FAC-2026-000001",
    issuedAt: new Date("2026-10-12T08:00:00Z"),
    paidAt: new Date("2026-10-12T07:59:00Z"),
  })),
}));

import { processDueAppointmentFulfillmentJobs } from "./appointmentFulfillment";
import { sendDueAppointmentReminders, DAILY_REMINDER_WINDOW } from "./scheduledJobs";

const HEALTH_DETAILS = "Je suis diabétique de type 2 et j’ai une chirurgie du genou prévue";

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    trackingId: "APTHEALTH0001",
    customerEmail: "patient@example.test",
    customerName: "Patient Test",
    customerPhone: "+33600000000",
    appointmentDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    finalPrice: "100.00",
    basePrice: "100.00",
    requestDetails: HEALTH_DETAILS,
    consultationType: "health_advice",
    duration: 30,
    isNightRate: 0,
    paymentStatus: "completed",
    appointmentStatus: "confirmed",
    emailSent: 0,
    reminderSent: 0,
    ...overrides,
  };
}

function fakeDatabase(input: { jobs?: unknown[][]; appointments?: unknown[][] }) {
  const queues = new Map<unknown, unknown[][]>([
    [appointmentFulfillmentJobs, [...(input.jobs ?? [])]],
    [appointments, [...(input.appointments ?? [])]],
  ]);
  const db = {
    select: vi.fn(() => ({
      from: (table: unknown) => {
        const next = () => queues.get(table)?.shift() ?? [];
        const chain = {
          where: () => chain,
          orderBy: () => chain,
          limit: async () => next(),
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(next()).then(resolve, reject),
        };
        return chain;
      },
    })),
    update: vi.fn(() => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) })),
    insert: vi.fn(() => ({ values: () => ({ onConflictDoUpdate: async () => ({ rowCount: 1 }), onConflictDoNothing: async () => ({ rowCount: 0 }) }) })),
  };
  database.getDb.mockResolvedValue(db);
  return db;
}

async function pdfText(base64: string): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: Buffer.from(base64, "base64") });
  try {
    return (await parser.getText()).text.replace(/\s+/g, " ");
  } finally {
    await parser.destroy();
  }
}

function serialized(message: Record<string, unknown>) {
  return JSON.stringify({ ...message, attachments: undefined });
}

afterAll(() => vi.unstubAllEnvs());

beforeEach(() => {
  sent.emails.length = 0;
  vi.stubEnv("RESEND_API_KEY", "re_test_minimisation");
});

describe("minimisation des données de santé à la réservation", () => {
  it("n’envoie l’objet de la demande ni au patient ni au propriétaire lors de la confirmation", async () => {
    const ownerJob = { id: 6, appointmentId: 42, jobType: "owner", status: "queued", attempts: 0, maxAttempts: 3, scheduledFor: new Date(0) };
    const job = { id: 7, appointmentId: 42, jobType: "confirmation", status: "queued", attempts: 0, maxAttempts: 3, scheduledFor: new Date(0) };
    fakeDatabase({
      jobs: [[ownerJob, job], [{ ...ownerJob, status: "running", attempts: 1 }], [{ ...job, status: "running", attempts: 1 }]],
      appointments: [[appointmentRow()], [appointmentRow()]],
    });

    const result = await processDueAppointmentFulfillmentJobs();

    expect(result.results).toEqual([{ completed: true }, { completed: true }]);
    const recipients = sent.emails.map(message => (message.to as string[])[0]);
    expect(recipients).toEqual(expect.arrayContaining(["patient@example.test", "owner@example.test"]));
    for (const message of sent.emails) {
      expect(serialized(message)).not.toContain("diabétique");
      expect(serialized(message)).not.toContain("genou");
    }
    const ownerMessage = sent.emails.find(message => (message.to as string[])[0] === "owner@example.test");
    expect(String(ownerMessage?.text)).toContain("tableau de bord");
  });

  it("n’imprime pas l’objet de la demande sur la facture PDF ni dans son email", async () => {
    const job = { id: 8, appointmentId: 42, jobType: "invoice", status: "queued", attempts: 0, maxAttempts: 3, scheduledFor: new Date(0), createdAt: new Date("2026-10-12T07:59:00Z") };
    fakeDatabase({ jobs: [[job], [{ ...job, status: "running", attempts: 1 }]], appointments: [[appointmentRow()]] });

    const result = await processDueAppointmentFulfillmentJobs();

    expect(result.results).toEqual([{ completed: true }]);
    expect(sent.emails).toHaveLength(1);
    expect(serialized(sent.emails[0])).not.toContain("diabétique");
    const [attachment] = sent.emails[0].attachments as Array<{ content: string }>;
    const text = await pdfText(attachment.content);
    expect(text).toContain("FAC-2026-000001");
    expect(text).not.toContain("diabétique");
    expect(text).not.toContain("genou");
  });

  it("n’inclut pas l’objet de la demande dans le rappel", async () => {
    fakeDatabase({ appointments: [[appointmentRow({ appointmentDate: new Date(Date.now() + 20 * 60 * 60 * 1000) })]] });

    const result = await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW);

    expect(result.sent).toBe(1);
    expect(sent.emails).toHaveLength(1);
    expect(serialized(sent.emails[0])).not.toContain("diabétique");
  });

  it("présente le champ comme un objet sans information médicale, avec un avertissement explicite", async () => {
    const { bookingContent } = await import("../client/src/pages/BookingPage");
    expect(bookingContent.fr.form.details).toBe("Objet de la demande (sans information médicale)");
    expect(bookingContent.fr.form.detailsWarning).toMatch(/aucune information de santé/);
    for (const language of ["en", "de", "zh"] as const) {
      expect(bookingContent[language].form.details).toBeTruthy();
      expect(bookingContent[language].form.detailsWarning.length).toBeGreaterThan(20);
    }
    const source = readFileSync(new URL("../client/src/pages/BookingPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-describedby="booking-details-warning"');
    expect(source).toContain("maxLength={BOOKING_REQUEST_SUBJECT_MAX_LENGTH}");
  });
});
