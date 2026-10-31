import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appointments } from "../drizzle/schema";
import { listen } from "./testSupport/candidateUploadApp";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";

const WEBHOOK_SECRET = "whsec_test_end_to_end_confirmation_secret";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { db: null as unknown, fulfilled: [] as number[] };
});
// Both are read by the route on each request.
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_SECRET_KEY ||= "sk_test_51N9oXjDummyKeyForWebhookRouteTests000000";

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
// The confirmation email and the invoice have their own tests: here only the hand-over counts.
vi.mock("./appointmentFulfillment", () => ({
  enqueueAppointmentFulfillment: vi.fn(async (appointmentId: number) => { state.fulfilled.push(appointmentId); }),
  processAppointmentFulfillmentNow: vi.fn(async () => ({ processed: 0, results: [] })),
}));

const { createApp } = await import("./_core/index");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

function db() { return state.db as InMemoryDrizzle; }

beforeAll(async () => {
  const app = await createApp();
  const listening = await listen(app as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });

let appointmentId = 0;
beforeEach(() => {
  state.db = createInMemoryDrizzle();
  state.fulfilled.length = 0;
  appointmentId = Number(db().seed(appointments, {
    trackingId: "APT-WEBHOOK-2026",
    customerName: "Zoé Müller",
    customerEmail: "zoe@example.test",
    customerPhone: "+33600000000",
    requestDetails: "Conseil avant une anesthésie",
    appointmentDate: new Date("2026-11-20T09:00:00.000Z"),
    slotKey: "2026-11-20T09:00",
    basePrice: "100.00",
    finalPrice: "100.00",
    stripeSessionId: "cs_test_webhook_paid",
    paymentStatus: "pending",
    appointmentStatus: "held",
    holdExpiresAt: new Date(Date.now() + 30 * 60_000),
  }).id);
});

const payload = JSON.stringify({
  id: "evt_test_webhook_paid",
  object: "event",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_webhook_paid",
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 10000,
      payment_intent: "pi_test_webhook_paid",
      metadata: { trackingId: "APT-WEBHOOK-2026" },
    },
  },
});

async function postWebhook(body: string, signature?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== undefined) headers["stripe-signature"] = signature;
  const response = await fetch(`${baseUrl}/api/stripe/webhook`, { method: "POST", headers, body });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function appointment() {
  return db().rows(appointments).find(row => row.id === appointmentId)!;
}

describe("POST /api/stripe/webhook — de la signature Stripe au rendez-vous confirmé", () => {
  it("refuse un paiement annoncé sans signature ou mal signé, sans toucher au rendez-vous", async () => {
    expect(await postWebhook(payload)).toEqual({ status: 400, body: { error: "Invalid webhook" } });
    expect(await postWebhook(payload, "")).toEqual({ status: 400, body: { error: "Invalid webhook" } });
    const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_not_the_configured_secret" });
    expect(await postWebhook(payload, forged)).toEqual({ status: 400, body: { error: "Invalid webhook" } });

    expect(appointment()).toMatchObject({ paymentStatus: "pending", appointmentStatus: "held", stripePaymentIntentId: null });
    expect(state.fulfilled).toEqual([]);
  });

  it("confirme le rendez-vous et lance l’envoi de la confirmation pour un paiement correctement signé", async () => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    expect(await postWebhook(payload, signature)).toEqual({ status: 200, body: { received: true } });

    expect(appointment()).toMatchObject({
      paymentStatus: "completed",
      appointmentStatus: "confirmed",
      holdExpiresAt: null,
      stripeSessionId: "cs_test_webhook_paid",
      stripePaymentIntentId: "pi_test_webhook_paid",
    });
    expect(state.fulfilled).toEqual([appointmentId]);
  });
});
