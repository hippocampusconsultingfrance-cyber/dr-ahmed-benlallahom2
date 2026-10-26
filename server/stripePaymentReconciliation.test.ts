import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { listen } from "./testSupport/candidateUploadApp";

// EXPL-01 (paiement confirmé sans webhook), RES-06 (remboursements et
// contestations faits dans Stripe), à travers la vraie route du webhook
// (évènements signés), la vraie page d’état et la vraie tâche de nettoyage.

const WEBHOOK_SECRET = "whsec_test_payment_reconciliation";
const CRON_SECRET = "cron_test_payment_reconciliation_secret";

type FakeSession = { id: string; object: "checkout.session"; status: "open" | "complete" | "expired"; payment_status: "paid" | "unpaid"; amount_total: number; payment_intent: string | null; metadata: { trackingId: string } };

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return {
    db: null as unknown,
    // Faux Stripe : sessions Checkout et remboursements tenus en mémoire.
    stripe: {
      reachable: true,
      sessions: new Map<string, FakeSession>(),
      refunds: [] as Array<{ id: string; amount: number; payment_intent: string; status: string }>,
      expireCalls: [] as string[],
    },
  };
});
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_SECRET_KEY = "sk_test_payment_reconciliation_never_sent";
process.env.CRON_SECRET = CRON_SECRET;

vi.mock("stripe", async importOriginal => {
  const { default: RealStripe } = await importOriginal<typeof import("stripe")>();
  const unreachable = () => Object.assign(new Error("An error occurred with our connection to Stripe."), { name: "StripeConnectionError" });
  const fakeStripe = state.stripe;
  // Vraie vérification des signatures ; aucune requête vers Stripe.
  class FakeStripe extends RealStripe {
    constructor(key: string) {
      super(key);
      Object.assign(this, {
        checkout: {
          sessions: {
            retrieve: async (id: string) => {
              if (!fakeStripe.reachable) throw unreachable();
              const session = fakeStripe.sessions.get(id);
              if (!session) throw Object.assign(new Error("No such checkout session"), { name: "StripeInvalidRequestError" });
              return { ...session };
            },
            expire: async (id: string) => {
              if (!fakeStripe.reachable) throw unreachable();
              const session = fakeStripe.sessions.get(id);
              if (!session || session.status !== "open") throw Object.assign(new Error("Only open sessions can be expired"), { name: "StripeInvalidRequestError" });
              fakeStripe.expireCalls.push(id);
              session.status = "expired";
              return { ...session };
            },
          },
        },
        refunds: {
          create: async (params: { payment_intent: string }) => {
            const refund = { id: `re_test_${fakeStripe.refunds.length + 1}`, amount: 10000, payment_intent: params.payment_intent, status: "succeeded" };
            fakeStripe.refunds.push(refund);
            return refund;
          },
          list: async () => ({ data: fakeStripe.refunds }),
        },
      });
    }
  }
  return { default: FakeStripe };
});
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
const owner = vi.hoisted(() => ({ notifyOwner: vi.fn(async (_payload: { title: string; content: string }, _options?: { idempotencyKey?: string }) => true) }));
vi.mock("./_core/notification", () => owner);
const emails = vi.hoisted(() => ({
  sendConfirmationEmail: vi.fn(async () => undefined),
  sendInvoiceEmail: vi.fn(async () => undefined),
  sendOwnerNotificationEmail: vi.fn(async () => undefined),
  sendCustomerConfirmationSMS: vi.fn(async () => false),
  sendRefundConfirmationEmail: vi.fn(async () => true),
  sendUnconfirmablePaymentEmail: vi.fn(async () => true),
}));
vi.mock("./_core/notifications", async importOriginal => ({ ...await importOriginal<typeof import("./_core/notifications")>(), ...emails }));
vi.mock("./invoice", () => ({ generateInvoicePDF: vi.fn(async () => ({ buffer: Buffer.from("pdf") })) }));
vi.mock("./invoiceNumbering", () => ({
  allocateAppointmentInvoice: vi.fn(async () => ({ invoiceNumber: "FAC-2026-000042", issuedAt: new Date(), paidAt: new Date() })),
}));

const { createApp } = await import("./_core/index");
const { appRouter } = await import("./routers");
const { refundAppointmentPayment } = await import("./appointmentAdminActions");
const signer = new Stripe(process.env.STRIPE_SECRET_KEY!);

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;
beforeAll(async () => {
  const listening = await listen(await createApp() as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });

const db = () => state.db as InMemoryDrizzle;
const HOUR = 60 * 60 * 1000;
const TRACKING_ID = "APTRECON00001";
const SESSION_ID = "cs_test_reconciliation_1";
const PAYMENT_INTENT = "pi_test_reconciliation_1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  state.db = createInMemoryDrizzle([appointments, appointmentFulfillmentJobs]);
  state.stripe.reachable = true;
  state.stripe.sessions.clear();
  state.stripe.refunds.length = 0;
  state.stripe.expireCalls.length = 0;
});

function seedAppointment(overrides: Record<string, unknown> = {}) {
  const appointmentDate = new Date(Date.now() + 72 * HOUR);
  return db().seed(appointments, {
    trackingId: TRACKING_ID,
    customerName: "Patient Test",
    customerEmail: "patient@example.test",
    customerPhone: "+33600000000",
    requestDetails: "Conseil",
    appointmentDate,
    slotKey: appointmentDate.toISOString(),
    basePrice: "100.00",
    finalPrice: "100.00",
    paymentStatus: "pending",
    appointmentStatus: "held",
    holdExpiresAt: new Date(Date.now() + 20 * 60 * 1000),
    stripeSessionId: SESSION_ID,
    ...overrides,
  });
}

function stripeSession(overrides: Partial<FakeSession> = {}): FakeSession {
  const session: FakeSession = { id: SESSION_ID, object: "checkout.session", status: "complete", payment_status: "paid", amount_total: 10000, payment_intent: PAYMENT_INTENT, metadata: { trackingId: TRACKING_ID }, ...overrides };
  state.stripe.sessions.set(session.id, session);
  return session;
}

const appointmentRow = () => db().rows(appointments).find(row => row.trackingId === TRACKING_ID)!;

async function postEvent(type: string, object: Record<string, unknown>, id = `evt_test_${type}`) {
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  const response = await fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) },
    body: payload,
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function publicStatus() {
  return appRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: {}, ip: "192.0.2.10" } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  }).appointments.publicStatus({ trackingId: TRACKING_ID, sessionId: SESSION_ID });
}

async function runHoldCleanup() {
  const response = await fetch(`${baseUrl}/api/scheduled/appointment-hold-cleanup`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function expectPostPaymentEmailsSentOnce() {
  expect(emails.sendOwnerNotificationEmail).toHaveBeenCalledTimes(1);
  expect(emails.sendConfirmationEmail).toHaveBeenCalledTimes(1);
  expect(emails.sendInvoiceEmail).toHaveBeenCalledTimes(1);
  expect(db().rows(appointmentFulfillmentJobs).map(job => job.status)).toEqual(["completed", "completed", "completed"]);
}

describe("EXPL-01 — un paiement reçu est confirmé même sans webhook", () => {
  it("confirme depuis la page de retour le paiement que Stripe dit reçu, une seule fois, puis ignore le webhook tardif", async () => {
    const seeded = seedAppointment();
    stripeSession();

    await expect(publicStatus()).resolves.toEqual({
      state: "confirmed",
      appointment: { appointmentDate: (seeded.appointmentDate as Date).toISOString(), durationMinutes: 30, amountEur: 100 },
    });
    expect(appointmentRow()).toMatchObject({ paymentStatus: "completed", appointmentStatus: "confirmed", stripePaymentIntentId: PAYMENT_INTENT, holdExpiresAt: null, slotKey: seeded.slotKey });
    expectPostPaymentEmailsSentOnce();

    // Nouvelle vérification de la page, puis le webhook qui arrive enfin.
    await expect(publicStatus()).resolves.toMatchObject({ state: "confirmed" });
    expect(await postEvent("checkout.session.completed", stripeSession())).toEqual({ status: 200, body: { received: true, duplicate: true } });
    expectPostPaymentEmailsSentOnce();
    expect(owner.notifyOwner).not.toHaveBeenCalled();
  });

  it("ne confirme qu’une fois quand le webhook (et sa relivraison) croise les vérifications de la page", async () => {
    seedAppointment();
    const session = stripeSession();

    const [webhook, redelivery, ...pages] = await Promise.all([
      postEvent("checkout.session.completed", session),
      postEvent("checkout.session.completed", session),
      publicStatus(),
      publicStatus(),
      publicStatus(),
    ]);

    expect([webhook.status, redelivery.status]).toEqual([200, 200]);
    for (const page of pages) expect(page).toMatchObject({ state: "confirmed" });
    expect(appointmentRow()).toMatchObject({ paymentStatus: "completed", appointmentStatus: "confirmed" });
    expectPostPaymentEmailsSentOnce();
    expect(owner.notifyOwner).not.toHaveBeenCalled();
  });

  it("la tâche de nettoyage confirme une réservation expirée dont la session a été payée, au lieu de libérer le créneau", async () => {
    const seeded = seedAppointment({ holdExpiresAt: new Date(Date.now() - 60 * 1000) });
    stripeSession();

    expect(await runHoldCleanup()).toEqual({ status: 200, body: { ok: true, scheduler: "vercel-cron", released: 0, confirmed: 1, kept: 0 } });
    expect(appointmentRow()).toMatchObject({ paymentStatus: "completed", appointmentStatus: "confirmed", slotKey: seeded.slotKey });
    expectPostPaymentEmailsSentOnce();
  });

  it("garde le créneau tant que Stripe ne répond pas, puis le libère quand la session a expiré sans paiement", async () => {
    const seeded = seedAppointment({ holdExpiresAt: new Date(Date.now() - 60 * 1000) });
    stripeSession({ status: "expired", payment_status: "unpaid", payment_intent: null });
    state.stripe.reachable = false;

    expect((await runHoldCleanup()).body).toMatchObject({ released: 0, confirmed: 0, kept: 1 });
    expect(appointmentRow()).toMatchObject({ paymentStatus: "pending", appointmentStatus: "held", slotKey: seeded.slotKey });

    state.stripe.reachable = true;
    expect((await runHoldCleanup()).body).toMatchObject({ released: 1, confirmed: 0, kept: 0 });
    expect(appointmentRow()).toMatchObject({ paymentStatus: "pending", appointmentStatus: "cancelled", slotKey: null, holdExpiresAt: null });
    expect(emails.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("ferme chez Stripe une session encore ouverte avant de libérer le créneau, et ne touche pas une réservation en cours", async () => {
    seedAppointment({ holdExpiresAt: new Date(Date.now() - 60 * 1000) });
    stripeSession({ status: "open", payment_status: "unpaid", payment_intent: null });
    const ongoing = db().seed(appointments, { ...appointmentRow(), id: undefined, trackingId: "APTRECON00002", slotKey: "2030-01-01T10:00:00.000Z", holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000), stripeSessionId: "cs_test_reconciliation_2", appointmentStatus: "held", cancelledAt: null });
    const withoutSession = db().seed(appointments, { ...appointmentRow(), id: undefined, trackingId: "APTRECON00003", slotKey: "2030-01-01T11:00:00.000Z", holdExpiresAt: new Date(Date.now() - 60 * 1000), stripeSessionId: null });

    expect((await runHoldCleanup()).body).toMatchObject({ released: 2, confirmed: 0, kept: 0 });
    expect(state.stripe.expireCalls).toEqual([SESSION_ID]);
    expect(appointmentRow()).toMatchObject({ appointmentStatus: "cancelled", slotKey: null });
    expect(withoutSession).toMatchObject({ appointmentStatus: "cancelled", slotKey: null });
    expect(ongoing).toMatchObject({ appointmentStatus: "held", slotKey: "2030-01-01T10:00:00.000Z" });
  });
});

describe("RES-06 — remboursements et contestations faits dans Stripe", () => {
  const paid = { paymentStatus: "completed", appointmentStatus: "confirmed", holdExpiresAt: null, stripePaymentIntentId: PAYMENT_INTENT } as const;
  const charge = (overrides: Record<string, unknown> = {}) => ({ id: "ch_test_reconciliation_1", object: "charge", amount: 10000, amount_refunded: 10000, refunded: true, payment_intent: PAYMENT_INTENT, ...overrides });

  it("enregistre un remboursement intégral fait dans Stripe : annulé, créneau libéré, patient et médecin prévenus une fois, rejeu sans effet", async () => {
    seedAppointment(paid);

    const [first, concurrent] = await Promise.all([postEvent("charge.refunded", charge()), postEvent("charge.refunded", charge())]);
    expect([first, concurrent].map(result => result.status)).toEqual([200, 200]);
    expect([first.body, concurrent.body]).toEqual(expect.arrayContaining([{ received: true, refunded: true }, { received: true, duplicate: true }]));
    expect(await postEvent("charge.refunded", charge())).toEqual({ status: 200, body: { received: true, duplicate: true } });

    expect(appointmentRow()).toMatchObject({ paymentStatus: "refunded", appointmentStatus: "cancelled", slotKey: null, refundAmount: "100.00" });
    expect(appointmentRow().refundedAt).toBeInstanceOf(Date);
    expect(emails.sendRefundConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(emails.sendRefundConfirmationEmail).toHaveBeenCalledWith("patient@example.test", "Patient Test", TRACKING_ID, expect.any(Date), "100.00", { context: "refund", idempotencyKey: `appointment-refund-${TRACKING_ID}`, language: "fr" });
    expect(owner.notifyOwner).toHaveBeenCalledTimes(1);
    const [alert] = owner.notifyOwner.mock.calls[0];
    expect(alert.title).toBe(`Remboursement constaté chez Stripe (${TRACKING_ID})`);
    expect(alert.content).toContain("annulé et son créneau libéré");
    expect(alert.content).toContain("Le patient a été prévenu");
  });

  it("ne renvoie rien pour le remboursement que le tableau de bord du site vient d’enregistrer", async () => {
    seedAppointment(paid);
    await refundAppointmentPayment(new Stripe(process.env.STRIPE_SECRET_KEY!), { trackingId: TRACKING_ID, reason: "Indisponibilité du médecin", initiator: "practitioner" });
    expect(emails.sendRefundConfirmationEmail).toHaveBeenCalledTimes(1);

    expect(await postEvent("charge.refunded", charge())).toEqual({ status: 200, body: { received: true, duplicate: true } });
    expect(emails.sendRefundConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(owner.notifyOwner).not.toHaveBeenCalled();
    expect(String(appointmentRow().cancellationReason)).toContain("Indisponibilité du médecin");
  });

  it("laisse payé un rendez-vous remboursé en partie et prévient seulement le médecin", async () => {
    seedAppointment(paid);

    expect(await postEvent("charge.refunded", charge({ amount_refunded: 3000, refunded: false }))).toEqual({ status: 200, body: { received: true, partial: true } });
    expect(appointmentRow()).toMatchObject({ paymentStatus: "completed", appointmentStatus: "confirmed", refundAmount: null });
    expect(emails.sendRefundConfirmationEmail).not.toHaveBeenCalled();
    expect(owner.notifyOwner).toHaveBeenCalledTimes(1);
    expect(owner.notifyOwner.mock.calls[0][0].content).toContain("30.00 € remboursés au total, sur 100.00 € payés");
  });

  it("marque remboursé un paiement arrivé après la libération du créneau, sans changer son statut", async () => {
    seedAppointment({ paymentStatus: "pending", appointmentStatus: "cancelled", slotKey: null, holdExpiresAt: null, stripePaymentIntentId: PAYMENT_INTENT });

    expect((await postEvent("charge.refunded", charge())).body).toEqual({ received: true, refunded: true });
    expect(appointmentRow()).toMatchObject({ paymentStatus: "refunded", appointmentStatus: "cancelled" });
    expect(emails.sendRefundConfirmationEmail).toHaveBeenCalledWith(expect.anything(), expect.anything(), TRACKING_ID, expect.any(Date), "100.00", expect.objectContaining({ context: "unconfirmed_payment" }));
  });

  it("ignore le remboursement d’un paiement qu’aucun rendez-vous ne porte", async () => {
    seedAppointment(paid);
    expect(await postEvent("charge.refunded", charge({ payment_intent: "pi_test_someone_else" }))).toEqual({ status: 200, body: { received: true } });
    expect(appointmentRow()).toMatchObject({ paymentStatus: "completed", appointmentStatus: "confirmed" });
    expect(emails.sendRefundConfirmationEmail).not.toHaveBeenCalled();
    expect(owner.notifyOwner).not.toHaveBeenCalled();
  });

  it("alerte le médecin d’une contestation avec sa date limite, une fois par litige, et redemande l’évènement tant que l’alerte n’est pas partie", async () => {
    seedAppointment(paid);
    const dueBy = Math.floor(new Date("2026-11-12T22:59:00.000Z").getTime() / 1000);
    const dispute = { id: "dp_test_reconciliation_1", object: "dispute", amount: 10000, reason: "fraudulent", status: "needs_response", payment_intent: PAYMENT_INTENT, evidence_details: { due_by: dueBy } };

    owner.notifyOwner.mockResolvedValueOnce(false);
    expect(await postEvent("charge.dispute.created", dispute)).toEqual({ status: 500, body: { received: false } });
    expect(await postEvent("charge.dispute.created", dispute)).toEqual({ status: 200, body: { received: true } });

    expect(owner.notifyOwner).toHaveBeenCalledTimes(2);
    for (const [, options] of owner.notifyOwner.mock.calls) expect(options).toEqual({ idempotencyKey: "stripe-dispute-dp_test_reconciliation_1" });
    const [alert] = owner.notifyOwner.mock.calls[1];
    expect(alert.title).toBe(`Contestation bancaire d’un paiement (${TRACKING_ID})`);
    expect(alert.content).toContain("Motif indiqué par la banque : fraudulent.");
    expect(alert.content).toContain("avant le 12 novembre 2026");
    expect(alert.content).toContain("100.00 €");
    // Le litige peut être gagné : le rendez-vous n’est pas modifié.
    expect(appointmentRow()).toMatchObject({ paymentStatus: "completed", appointmentStatus: "confirmed" });
    expect(emails.sendRefundConfirmationEmail).not.toHaveBeenCalled();
  });
});
