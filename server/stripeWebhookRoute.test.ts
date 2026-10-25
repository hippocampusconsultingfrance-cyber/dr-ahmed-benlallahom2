import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "./testSupport/candidateUploadApp";

const WEBHOOK_SECRET = "whsec_test_raw_body_signature_secret";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { completedSessions: [] as unknown[] };
});
// Both are read by the route on each request.
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_SECRET_KEY ||= "sk_test_51N9oXjDummyKeyForWebhookRouteTests000000";

vi.mock("./db", () => ({ getDb: async () => null }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./appointmentPaymentWebhook", () => ({
  handleCheckoutSessionCompleted: vi.fn(async (session: unknown) => {
    state.completedSessions.push(session);
    return { httpStatus: 200, body: { received: true, confirmed: true } };
  }),
}));

const { createApp } = await import("./_core/index");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const app = await createApp();
  const listening = await listen(app as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => { state.completedSessions.length = 0; });

// Indented JSON with accented text: any re-serialisation of the body would change its bytes.
const session = { id: "cs_test_raw_body", object: "checkout.session", payment_status: "paid", metadata: { trackingId: "RDV-ÉTÉ-2026", patient: "Zoé Müller" } };
const payload = JSON.stringify({ id: "evt_test_raw_body", object: "event", type: "checkout.session.completed", data: { object: session } }, null, 2);

async function postWebhook(body: string, signature: string) {
  const response = await fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body,
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("POST /api/stripe/webhook — corps brut et signature Stripe", () => {
  it("vérifie la signature sur les octets reçus et transmet la session payée", async () => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const result = await postWebhook(payload, signature);
    expect(result).toEqual({ status: 200, body: { received: true, confirmed: true } });
    expect(state.completedSessions).toEqual([session]);
  });

  it("refuse le même évènement dont le corps a été modifié ou mal signé", async () => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const reserialized = await postWebhook(JSON.stringify(JSON.parse(payload)), signature);
    expect(reserialized).toEqual({ status: 400, body: { error: "Invalid webhook" } });

    const wrongSecret = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_someone_else" });
    expect(await postWebhook(payload, wrongSecret)).toEqual({ status: 400, body: { error: "Invalid webhook" } });
    expect(state.completedSessions).toEqual([]);
  });

  it("accuse réception des autres évènements sans confirmer de rendez-vous", async () => {
    const other = JSON.stringify({ id: "evt_test_other", object: "event", type: "payment_intent.created", data: { object: { id: "pi_test" } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload: other, secret: WEBHOOK_SECRET });
    expect(await postWebhook(other, signature)).toEqual({ status: 200, body: { received: true } });
    expect(state.completedSessions).toEqual([]);
  });
});
