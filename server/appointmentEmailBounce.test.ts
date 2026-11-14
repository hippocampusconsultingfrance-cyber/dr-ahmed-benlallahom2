import { eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Webhook } from "svix";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  appointmentFulfillmentJobs,
  appointmentInvoices,
  appointments,
  cvApplications,
  recruitmentCampaignRecipients,
  recruitmentEmailEvents,
  securityEvents,
} from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import { listen } from "./testSupport/candidateUploadApp";
import type { TrpcContext } from "./_core/context";

// EXPL-13 — un email patient accepté par Resend puis refusé par la messagerie
// du patient (rebond, plainte, échec, adresse bloquée) est rattaché à son
// rendez-vous par ses étiquettes : la carte et « À traiter » le disent, le
// médecin reçoit une seule alerte par adresse refusée, avec le téléphone du
// patient, et « Renvoyer » l’envoie de nouveau une fois l’adresse corrigée.
// Vraie route du webhook, vraie file d’envoi et vrais emails ; seul Resend est
// simulé.

const WEBHOOK_SECRET = `whsec_${Buffer.from("appointment-bounce-test-secret").toString("base64")}`;

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return {
    memory: null as null | { db: unknown },
    sent: [] as Array<{
      to: string[];
      subject: string;
      tags?: Array<{ name: string; value: string }>;
    }>,
    alerts: [] as Array<{
      title: string;
      content: string;
      idempotencyKey?: string;
    }>,
  };
});
process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({
  ...(await importOriginal<typeof import("./adminMfa")>()),
  isAdminMfaVerified: vi.fn(async () => true),
}));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(
        async (message: {
          to: string[];
          subject: string;
          tags?: Array<{ name: string; value: string }>;
        }) => {
          state.sent.push(message);
          return { data: { id: `email-${state.sent.length}` }, error: null };
        }
      ),
    },
  })),
}));
vi.mock("./_core/notification", async importOriginal => ({
  ...(await importOriginal<typeof import("./_core/notification")>()),
  notifyOwner: vi.fn(
    async (
      payload: { title: string; content: string },
      options?: { idempotencyKey?: string }
    ) => {
      state.alerts.push({
        ...payload,
        idempotencyKey: options?.idempotencyKey,
      });
      return true;
    }
  ),
}));

const { createApp } = await import("./_core/index");
const { appRouter } = await import("./routers");
const {
  appointmentFulfillmentPacing,
  closeErasedPatientFulfillment,
  processAppointmentFulfillmentNow,
} = await import("./appointmentFulfillment");
const {
  postPaymentDeliveryRetry,
  sendInvoiceEmail,
  sendRefundConfirmationEmail,
  sendReminderEmail,
} = await import("./_core/notifications");
const { anonymisedAppointmentFields } = await import("./personalDataRetention");
const { APPOINTMENT_INVOICE_SCHEMA_OBJECTS } = await import(
  "./invoiceNumbering"
);

const dialect = new PgDialect();
let memory: MemoryPg;
let baseUrl = "";
let close: () => Promise<void> = async () => undefined;
const PACING_DELAY_MS = appointmentFulfillmentPacing.delayMs;
const SHORT_RETRY_DELAYS_MS = [...postPaymentDeliveryRetry.delaysMs];

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => {
  await close();
});
beforeEach(() => {
  memory = createMemoryPg([
    appointments,
    appointmentFulfillmentJobs,
    appointmentInvoices,
    recruitmentEmailEvents,
    recruitmentCampaignRecipients,
    cvApplications,
    securityEvents,
  ]);
  // appointment_invoices exists, as in production: the runtime DDL check finds every object.
  const execute = memory.db.execute.bind(memory.db);
  Object.assign(memory.db, {
    execute: (query: Parameters<typeof execute>[0]) =>
      dialect.sqlToQuery(query as never).sql.includes("to_regclass")
        ? Promise.resolve({
            rows: APPOINTMENT_INVOICE_SCHEMA_OBJECTS.map(name => ({ name })),
          })
        : execute(query),
  });
  state.memory = memory;
  state.sent = [];
  state.alerts = [];
  appointmentFulfillmentPacing.delayMs = 0;
  postPaymentDeliveryRetry.delaysMs = [0, 0];
  vi.stubEnv("RESEND_API_KEY", "re_test_appointment_bounce");
});
afterEach(() => {
  appointmentFulfillmentPacing.delayMs = PACING_DELAY_MS;
  postPaymentDeliveryRetry.delaysMs = SHORT_RETRY_DELAYS_MS;
  vi.unstubAllEnvs();
});

function admin() {
  return appRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  }).admin;
}

function seedAppointment(
  trackingId: string,
  overrides: Record<string, unknown> = {}
) {
  return memory.seed(appointments, [
    {
      tracking_id: trackingId,
      customer_name: "Jeanne Martin",
      customer_email: "jeanne.typo@test.local",
      customer_phone: "+33611223344",
      request_details: "Demande d’avis",
      appointment_date: new Date(Date.now() + 2 * 24 * 3_600_000),
      base_price: "100.00",
      final_price: "100.00",
      payment_status: "completed",
      appointment_status: "confirmed",
      stripe_payment_intent_id: `pi_${trackingId}`,
      ...overrides,
    },
  ])[0]!;
}

function seedJob(
  appointmentId: unknown,
  jobType: string,
  overrides: Record<string, unknown> = {}
) {
  return memory.seed(appointmentFulfillmentJobs, [
    {
      appointment_id: appointmentId,
      job_type: jobType,
      status: "queued",
      attempts: 0,
      max_attempts: 7,
      scheduled_for: new Date(Date.now() - 1000),
      ...overrides,
    },
  ])[0]!;
}

const job = (appointmentId: unknown, jobType: string) =>
  memory
    .rows(appointmentFulfillmentJobs)
    .find(
      row => row.appointment_id === appointmentId && row.job_type === jobType
    );
/** The owner's alerts that an address of this appointment bounced: one per address. */
const bounceAlerts = (appointmentId: unknown) =>
  memory
    .rows(appointmentFulfillmentJobs)
    .filter(
      row =>
        row.appointment_id === appointmentId &&
        String(row.job_type).startsWith("bounce_alert:")
    );

/** A signed delivery of Resend's webhook, as Svix sends it (and sends again after an error). */
async function deliver(id: string, event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const sentAt = new Date();
  const response = await fetch(`${baseUrl}/api/webhooks/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(sentAt.getTime() / 1000)),
      "svix-signature": new Webhook(WEBHOOK_SECRET).sign(id, sentAt, payload),
    },
    body: payload,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: response.headers.get("content-type")?.includes("json")
      ? (JSON.parse(text) as unknown)
      : text,
  };
}

/** The tags of a sent email as Resend echoes them in its webhook events: one object. */
const echoed = (tags: Array<{ name: string; value: string }> = []) =>
  Object.fromEntries(tags.map(tag => [tag.name, tag.value]));

describe("EXPL-13 — email patient refusé après acceptation", () => {
  it("rebond de la confirmation livré deux fois : tâche marquée, une seule alerte avec le téléphone, carte et « À traiter », « Renvoyer » à l’adresse corrigée, puis une nouvelle alerte quand elle est refusée à son tour", async () => {
    const paid = seedAppointment("APTBOUNCE001");
    seedJob(paid.id, "owner", { status: "completed", attempts: 1 });
    seedJob(paid.id, "confirmation");
    await processAppointmentFulfillmentNow(paid.id as number);
    const [confirmation] = state.sent;
    expect(confirmation).toMatchObject({
      to: ["jeanne.typo@test.local"],
      tags: [
        { name: "email_kind", value: "appointment_confirmation" },
        { name: "appointment_ref", value: "APTBOUNCE001" },
      ],
    });
    expect(job(paid.id, "confirmation")).toMatchObject({
      status: "completed",
      last_error: null,
    });

    const bounce = {
      type: "email.bounced",
      created_at: "2026-11-06T09:00:00.000Z",
      data: {
        email_id: "email-1",
        to: ["Jeanne.Typo@test.local"],
        bounce: { message: "Mailbox does not exist" },
        tags: echoed(confirmation!.tags),
      },
    };
    expect(await deliver("msg_bounce_1", bounce)).toEqual({
      status: 200,
      body: { received: true },
    });
    // The job keeps its status; its last error says it bounced after acceptance.
    expect(job(paid.id, "confirmation")).toMatchObject({
      status: "completed",
      last_error: expect.stringMatching(
        /^bounced_after_acceptance:[0-9a-f]{16}$/
      ),
    });
    // The owner's alert went out before the webhook answered, through the queue, with the patient's phone.
    expect(bounceAlerts(paid.id)).toEqual([
      expect.objectContaining({
        status: "completed",
        attempts: 1,
        last_error: null,
      }),
    ]);
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]!.title).toBe(
      "Email non reçu par le patient (APTBOUNCE001)"
    );
    expect(state.alerts[0]!.content).toContain(
      "Appelez-le au +33611223344 pour vérifier son adresse et lui rappeler la date et l’heure de sa consultation"
    );
    expect(state.alerts[0]!.content).toContain(
      "« Corriger l’email du patient », puis « Renvoyer » lui envoie de nouveau la confirmation et la facture"
    );
    // ADM-09: the link opens the booking itself in the dashboard.
    expect(state.alerts[0]!.content).toContain(
      "Pour lui écrire à une autre adresse : https://drahmedbenlallahom.com/admin?tab=appointments&ref=APTBOUNCE001, onglet « Réservations »"
    );

    // The same event delivered again, then another report about the same email: nothing more.
    expect(await deliver("msg_bounce_1", bounce)).toEqual({
      status: 200,
      body: { received: true, duplicate: true },
    });
    expect(
      await deliver("msg_suppressed_1", { ...bounce, type: "email.suppressed" })
    ).toEqual({ status: 200, body: { received: true } });
    expect(state.alerts).toHaveLength(1);
    expect(bounceAlerts(paid.id)).toHaveLength(1);

    // The appointment's card and « À traiter ».
    const card = (await admin().appointments.list({})).items.find(
      item => item.trackingId === "APTBOUNCE001"
    )!;
    expect(
      card.deliveries.map(({ jobType, state: deliveryState }) => [
        jobType,
        deliveryState,
      ])
    ).toEqual([
      ["owner", "sent"],
      ["confirmation", "bounced"],
    ]);
    const attention = await admin().attention();
    expect(attention.bouncedDeliveries).toEqual({
      total: 1,
      items: [
        {
          trackingId: "APTBOUNCE001",
          customerName: "Jeanne Martin",
          appointmentDate: expect.any(Date),
          customerPhone: "+33611223344",
          jobTypes: ["confirmation"],
        },
      ],
    });
    expect(
      attention.failedDeliveries.total +
        attention.refusedDeliveries.total +
        attention.retryingDeliveries.total +
        attention.waitingDeliveries.total
    ).toBe(0);

    // « Renvoyer » to the same address would send nothing new (Resend answers its key): not before the address is corrected.
    expect(
      await admin().appointments.retryFulfillment({
        trackingId: "APTBOUNCE001",
      })
    ).toMatchObject({ requeued: 0 });
    expect(state.sent).toHaveLength(1);
    await admin().appointments.updateCustomerEmail({
      trackingId: "APTBOUNCE001",
      customerEmail: "jeanne@test.local",
    });
    const retried = await admin().appointments.retryFulfillment({
      trackingId: "APTBOUNCE001",
    });
    expect(retried).toMatchObject({
      requeued: 1,
      requeuedJobTypes: ["confirmation"],
    });
    expect(state.sent.map(email => email.to)).toEqual([
      ["jeanne.typo@test.local"],
      ["jeanne@test.local"],
    ]);
    expect(retried.deliveries.map(delivery => delivery.state)).toEqual([
      "sent",
      "sent",
    ]);
    expect((await admin().attention()).bouncedDeliveries.total).toBe(0);

    // A late report about the old address no longer marks anything.
    expect(
      await deliver("msg_bounce_late", {
        ...bounce,
        data: { ...bounce.data, email_id: "email-1-late" },
      })
    ).toEqual({ status: 200, body: { received: true } });
    expect(job(paid.id, "confirmation")).toMatchObject({
      status: "completed",
      last_error: null,
    });
    expect(state.alerts).toHaveLength(1);

    // The corrected address bounces in turn: marked again, and the doctor, told « sent », is alerted again, under a new key.
    expect(
      await deliver("msg_bounce_corrected", {
        ...bounce,
        data: {
          ...bounce.data,
          email_id: "email-2",
          to: ["jeanne@test.local"],
          tags: echoed(state.sent[1]!.tags),
        },
      })
    ).toEqual({ status: 200, body: { received: true } });
    expect(job(paid.id, "confirmation")).toMatchObject({
      status: "completed",
      last_error: expect.stringMatching(/^bounced_after_acceptance:/),
    });
    expect(bounceAlerts(paid.id)).toHaveLength(2);
    expect(state.alerts).toHaveLength(2);
    expect(state.alerts[1]!.content).toContain(
      "Patient : Jeanne Martin — jeanne@test.local — +33611223344."
    );
    expect(state.alerts[1]!.idempotencyKey).not.toBe(
      state.alerts[0]!.idempotencyKey
    );
  });

  it("confirmation et facture refusées à la même adresse, puis le rappel de la veille : une seule alerte", async () => {
    const paid = seedAppointment("APTBOUNCE004");
    seedJob(paid.id, "confirmation", { status: "completed", attempts: 1 });
    seedJob(paid.id, "invoice", { status: "completed", attempts: 1 });
    const bounced = (id: string, email: string) =>
      deliver(id, {
        type: "email.bounced",
        created_at: "2026-11-06T09:00:00.000Z",
        data: {
          email_id: id,
          to: ["jeanne.typo@test.local"],
          tags: { email_kind: email, appointment_ref: "APTBOUNCE004" },
        },
      });

    expect(
      await bounced("msg_confirmation", "appointment_confirmation")
    ).toEqual({ status: 200, body: { received: true } });
    expect(await bounced("msg_invoice", "appointment_invoice")).toEqual({
      status: 200,
      body: { received: true },
    });
    expect(await bounced("msg_reminder", "appointment_reminder")).toEqual({
      status: 200,
      body: { received: true },
    });

    expect(job(paid.id, "confirmation")).toMatchObject({
      last_error: expect.stringMatching(/^bounced_after_acceptance:/),
    });
    expect(job(paid.id, "invoice")).toMatchObject({
      last_error: expect.stringMatching(/^bounced_after_acceptance:/),
    });
    expect(bounceAlerts(paid.id)).toEqual([
      expect.objectContaining({ status: "completed", attempts: 1 }),
    ]);
    expect(state.alerts.map(alert => alert.title)).toEqual([
      "Email non reçu par le patient (APTBOUNCE004)",
    ]);
    const card = (await admin().appointments.list({})).items.find(
      item => item.trackingId === "APTBOUNCE004"
    )!;
    expect(card.deliveries.map(delivery => delivery.state)).toEqual([
      "bounced",
      "bounced",
    ]);
  });

  it("étiquette la facture, le rappel et l’email de remboursement ; un rappel refusé alerte le médecin, sans tâche à renvoyer", async () => {
    await sendInvoiceEmail(
      "jeanne.typo@test.local",
      "Jeanne Martin",
      "APTBOUNCE002",
      100,
      Buffer.from("%PDF-1.4"),
      "FAC-2026-000002"
    );
    await sendReminderEmail(
      "jeanne.typo@test.local",
      "Jeanne Martin",
      "APTBOUNCE002",
      new Date(Date.now() + 24 * 3_600_000)
    );
    await sendRefundConfirmationEmail(
      "jeanne.typo@test.local",
      "Jeanne Martin",
      "APTBOUNCE002",
      new Date(Date.now() + 24 * 3_600_000),
      "100.00"
    );
    expect(state.sent.map(email => echoed(email.tags))).toEqual([
      { email_kind: "appointment_invoice", appointment_ref: "APTBOUNCE002" },
      { email_kind: "appointment_reminder", appointment_ref: "APTBOUNCE002" },
      { email_kind: "appointment_refund", appointment_ref: "APTBOUNCE002" },
    ]);

    const paid = seedAppointment("APTBOUNCE002");
    seedJob(paid.id, "confirmation", { status: "completed", attempts: 1 });
    expect(
      await deliver("msg_reminder_complaint", {
        type: "email.complained",
        created_at: "2026-11-06T09:00:00.000Z",
        data: {
          email_id: "email-2",
          to: ["jeanne.typo@test.local"],
          tags: echoed(state.sent[1]!.tags),
        },
      })
    ).toEqual({ status: 200, body: { received: true } });
    expect(bounceAlerts(paid.id)).toEqual([
      expect.objectContaining({ status: "completed", last_error: null }),
    ]);
    expect(job(paid.id, "confirmation")).toMatchObject({ last_error: null });
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]!.content).toContain(
      "Un email du rendez-vous APTBOUNCE002"
    );
    expect(state.alerts[0]!.content).toContain(
      "Appelez-le au +33611223344 pour vérifier son adresse et lui rappeler la date et l’heure de sa consultation"
    );

    // Another recipient than the booking's (or an unknown reference): nothing is linked.
    expect(
      await deliver("msg_other_recipient", {
        type: "email.bounced",
        created_at: "2026-11-06T09:05:00.000Z",
        data: {
          email_id: "email-9",
          to: ["quelquun@test.local"],
          tags: {
            email_kind: "appointment_invoice",
            appointment_ref: "APTBOUNCE002",
          },
        },
      })
    ).toEqual({ status: 200, body: { received: true } });
    expect(
      await deliver("msg_unknown_ref", {
        type: "email.bounced",
        created_at: "2026-11-06T09:05:00.000Z",
        data: {
          email_id: "email-10",
          to: ["jeanne.typo@test.local"],
          tags: {
            email_kind: "appointment_invoice",
            appointment_ref: "APTUNKNOWN99",
          },
        },
      })
    ).toEqual({ status: 200, body: { received: true } });
    expect(bounceAlerts(paid.id)).toHaveLength(1);
    expect(state.alerts).toHaveLength(1);
  });

  it("l’alerte qui n’a pas pu partir avant la réponse reste en file, et l’effacement RGPD la ferme avec l’envoi refusé", async () => {
    const paid = seedAppointment("APTBOUNCE003");
    seedJob(paid.id, "invoice", { status: "completed", attempts: 1 });
    vi.mocked(
      (await import("./_core/notification")).notifyOwner
    ).mockResolvedValueOnce(false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(
      await deliver("msg_invoice_failed", {
        type: "email.failed",
        created_at: "2026-11-06T09:00:00.000Z",
        data: {
          email_id: "email-3",
          to: ["jeanne.typo@test.local"],
          tags: {
            email_kind: "appointment_invoice",
            appointment_ref: "APTBOUNCE003",
          },
        },
      })
    ).toEqual({ status: 200, body: { received: true } });
    expect(job(paid.id, "invoice")).toMatchObject({
      status: "completed",
      last_error: expect.stringMatching(/^bounced_after_acceptance:/),
    });
    expect(bounceAlerts(paid.id)).toEqual([
      expect.objectContaining({
        status: "retry",
        attempts: 1,
        last_error: "owner_bounce_alert_failed",
      }),
    ]);

    // The patient's data is erased (RGPD-12): the email and its alert are closed, « À traiter » no longer lists them.
    await memory.db
      .update(appointments)
      .set(anonymisedAppointmentFields())
      .where(eq(appointments.trackingId, "APTBOUNCE003"));
    expect(await closeErasedPatientFulfillment([paid.id as number])).toBe(2);
    expect(job(paid.id, "invoice")).toMatchObject({
      status: "completed",
      last_error: "patient_data_erased",
    });
    expect(bounceAlerts(paid.id)).toEqual([
      expect.objectContaining({
        status: "completed",
        last_error: "patient_data_erased",
      }),
    ]);
    expect((await admin().attention()).bouncedDeliveries.total).toBe(0);
  });

  it("l’alerte restée en file n’est plus envoyée une fois l’adresse corrigée, et un remboursement ne la ferme pas", async () => {
    const paid = seedAppointment("APTBOUNCE005");
    seedJob(paid.id, "confirmation", { status: "completed", attempts: 1 });
    const notifyOwner = vi.mocked(
      (await import("./_core/notification")).notifyOwner
    );
    notifyOwner.mockResolvedValueOnce(false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bounce = {
      type: "email.bounced",
      created_at: "2026-11-06T09:00:00.000Z",
      data: {
        email_id: "email-5",
        to: ["jeanne.typo@test.local"],
        tags: {
          email_kind: "appointment_confirmation",
          appointment_ref: "APTBOUNCE005",
        },
      },
    };
    expect(await deliver("msg_confirmation_5", bounce)).toEqual({
      status: 200,
      body: { received: true },
    });
    const [alert] = bounceAlerts(paid.id);
    expect(alert).toMatchObject({ status: "retry", attempts: 1 });

    // Refunded meanwhile: the address still bounces, the alert stays queued and says so.
    await memory.db
      .update(appointments)
      .set({ paymentStatus: "refunded", appointmentStatus: "cancelled" })
      .where(eq(appointments.trackingId, "APTBOUNCE005"));
    const { closeUnsentAppointmentFulfillment } = await import(
      "./appointmentFulfillment"
    );
    await closeUnsentAppointmentFulfillment(paid.id as number);
    await memory.db
      .update(appointmentFulfillmentJobs)
      .set({ scheduledFor: new Date(Date.now() - 1000) })
      .where(eq(appointmentFulfillmentJobs.id, alert!.id as number));
    await processAppointmentFulfillmentNow(paid.id as number);
    expect(bounceAlerts(paid.id)).toEqual([
      expect.objectContaining({
        status: "completed",
        attempts: 2,
        last_error: null,
      }),
    ]);
    expect(state.alerts[0]!.content).toContain(
      "pour vérifier son adresse et le prévenir de son remboursement"
    );

    // Another appointment whose address is corrected before its alert could go out: nothing is sent.
    const other = seedAppointment("APTBOUNCE006");
    seedJob(other.id, "confirmation", { status: "completed", attempts: 1 });
    notifyOwner.mockResolvedValueOnce(false);
    expect(
      await deliver("msg_confirmation_6", {
        ...bounce,
        data: {
          ...bounce.data,
          email_id: "email-6",
          tags: {
            email_kind: "appointment_confirmation",
            appointment_ref: "APTBOUNCE006",
          },
        },
      })
    ).toEqual({ status: 200, body: { received: true } });
    await admin().appointments.updateCustomerEmail({
      trackingId: "APTBOUNCE006",
      customerEmail: "jeanne@test.local",
    });
    await memory.db
      .update(appointmentFulfillmentJobs)
      .set({ scheduledFor: new Date(Date.now() - 1000) })
      .where(
        eq(
          appointmentFulfillmentJobs.id,
          bounceAlerts(other.id)[0]!.id as number
        )
      );
    await processAppointmentFulfillmentNow(other.id as number);
    expect(bounceAlerts(other.id)).toEqual([
      expect.objectContaining({
        status: "completed",
        last_error: "bounce_alert_outdated",
      }),
    ]);
    expect(state.alerts).toHaveLength(1);
  });
});
