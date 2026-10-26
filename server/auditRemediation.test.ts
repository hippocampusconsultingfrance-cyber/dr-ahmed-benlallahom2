import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appointments } from "../drizzle/schema";
import {
  getMissingCriticalProductionEnvironment,
  isConfiguredAdminOpenId,
  PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES,
} from "./_core/env";
import { secureMfaHashEquals } from "./adminMfa";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { listen } from "./testSupport/candidateUploadApp";

const WEBHOOK_SECRET = "whsec_test_audit_remediation_secret";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { db: null as unknown };
});
// Both are read by the webhook route on each request.
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_SECRET_KEY ||= "sk_test_51N9oXjDummyKeyForAuditRemediationTests000";

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./appointmentPaymentWebhook", () => ({
  handleCheckoutSessionCompleted: vi.fn(async () => { throw new Error("connection reset while confirming APT-SECRET-42 for zoe@example.test"); }),
}));

const { createApp } = await import("./_core/index");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const listening = await listen((await createApp()) as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
beforeEach(() => { state.db = createInMemoryDrizzle(); });

function db() { return state.db as InMemoryDrizzle; }

async function postEvent(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const response = await fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) },
    body: payload,
  });
  return { status: response.status, text: await response.text(), headers: response.headers };
}

function seedAppointment(values: Partial<typeof appointments.$inferInsert>) {
  return db().seed(appointments, {
    customerName: "Zoé Müller",
    customerEmail: "zoe@example.test",
    customerPhone: "+33600000000",
    requestDetails: "",
    appointmentDate: new Date("2026-11-05T17:00:00.000Z"),
    basePrice: "100.00",
    finalPrice: "150.00",
    ...values,
  } as Record<string, unknown>);
}

describe("remédiations de l’audit externe", () => {
  it("identifie les secrets et configurations critiques manquants en production", () => {
    const completeEnvironment = Object.fromEntries(
      PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES.map(name => [name, `${name}-configured-value`])
    );

    expect(getMissingCriticalProductionEnvironment(completeEnvironment)).toEqual([]);
    expect(getMissingCriticalProductionEnvironment({ ...completeEnvironment, JWT_SECRET: "" })).toEqual(["JWT_SECRET"]);
  });

  it("compare les condensats MFA de manière défensive", () => {
    const expected = "a".repeat(64);
    expect(secureMfaHashEquals(expected, expected)).toBe(true);
    expect(secureMfaHashEquals(expected, "b".repeat(64))).toBe(false);
    expect(secureMfaHashEquals(expected, "short")).toBe(false);
  });

  it("réserve le rôle administrateur au seul propriétaire Clerk configuré", () => {
    const environment = { CLERK_OWNER_USER_ID: "user_owner" } as NodeJS.ProcessEnv;

    expect(isConfiguredAdminOpenId("user_owner", environment)).toBe(true);
    expect(isConfiguredAdminOpenId("user_previous_account", environment)).toBe(false);
    expect(isConfiguredAdminOpenId("user_owner", {})).toBe(false);
  });

  it("répond 500 sans le détail de l’exception quand un évènement Stripe signé ne peut être traité, pour que Stripe le renvoie", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const result = await postEvent({ id: "evt_audit_completed", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_audit", object: "checkout.session", payment_status: "paid" } } });
      expect(result.status).toBe(500);
      expect(JSON.parse(result.text)).toEqual({ received: false });
      expect(consoleError).toHaveBeenCalledWith("Stripe webhook processing failed", "Error");
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain("zoe@example.test");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("libère le créneau retenu d’une session Checkout expirée, et seulement celui-là", async () => {
    const held = seedAppointment({ trackingId: "APTEXPIRED01", stripeSessionId: "cs_expired", slotKey: "2026-11-05T17:00", holdExpiresAt: new Date("2026-10-26T10:00:00.000Z") });
    const paid = seedAppointment({ trackingId: "APTPAID00001", stripeSessionId: "cs_paid", slotKey: "2026-11-06T17:00", paymentStatus: "completed", appointmentStatus: "confirmed" });

    const expired = { id: "evt_audit_expired", object: "event", type: "checkout.session.expired", data: { object: { id: "cs_expired", object: "checkout.session", status: "expired", metadata: { trackingId: "APTEXPIRED01" } } } };
    expect((await postEvent(expired)).status).toBe(200);
    expect(held).toMatchObject({ appointmentStatus: "cancelled", slotKey: null, holdExpiresAt: null, cancelledAt: expect.any(Date) });

    // An expiry event naming a paid appointment (or another session of it) changes nothing.
    expect((await postEvent({ ...expired, id: "evt_audit_paid", data: { object: { ...expired.data.object, id: "cs_paid", metadata: { trackingId: "APTPAID00001" } } } })).status).toBe(200);
    expect(paid).toMatchObject({ appointmentStatus: "confirmed", paymentStatus: "completed", slotKey: "2026-11-06T17:00" });
  });

  it("fixe explicitement HSTS sur les réponses de l’API, même refusées", async () => {
    const response = await fetch(`${baseUrl}/api/scheduled/reminder`);
    expect(response.status).toBe(403);
    expect(response.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
  });
});
