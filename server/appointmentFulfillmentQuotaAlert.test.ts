import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointments, candidateSecurityRateLimits, securityEvents } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import { TEST_PEPPER } from "./testSupport/candidatePortal";

// ABUS-03 — quota Resend épuisé pendant les envois qui suivent un paiement :
// l’email « Alerte sécurité — resend_quota_exceeded » prend le créneau d’envoi
// du traitement, une pause après l’alerte refusée, au lieu de partir quelques
// millisecondes après elle ; quand ce créneau tomberait après la fin du budget
// d’un traitement immédiat, il ne part pas alors, et l’événement suivant de la
// même catégorie l’envoie. Vraies procédures, vraie file, vraies alertes ;
// seul Resend (transport) est simulé.

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const resend = vi.hoisted(() => ({
  calls: [] as Array<{ subject: string; to: string; at: number }>,
  // Adresses refusées par Resend (422).
  rejected: new Set<string>(),
}));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(async (message: { subject: string; to: string[] }) => {
        resend.calls.push({ subject: message.subject, to: message.to[0]!, at: Date.now() });
        if (resend.rejected.has(message.to[0]!)) return { data: null, error: { name: "validation_error", statusCode: 422, message: "Invalid `to` field." } };
        // The owner's « Échec d’envoi » alerts meet the used-up daily quota.
        if (message.subject.startsWith("Échec d’envoi")) return { data: null, error: { name: "daily_quota_exceeded", statusCode: 429, message: "You have reached your daily quota." } };
        return { data: { id: `email_${resend.calls.length}` }, error: null };
      }),
    },
  })),
}));
const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));

import { postPaymentDeliveryRetry } from "./_core/notifications";
import { appointmentFulfillmentPacing, processAppointmentFulfillmentNow, processDueAppointmentFulfillmentJobs } from "./appointmentFulfillment";

const PAUSE_MS = 300;
const SECURITY_ALERT = "Alerte sécurité — resend_quota_exceeded — Hippocampus Consulting";
let memory: MemoryPg;

function seedRefusedConfirmation(trackingId: string) {
  const [{ id }] = memory.seed(appointments, [{
    tracking_id: trackingId,
    customer_name: "Patient Test",
    customer_email: `${trackingId.toLowerCase()}@example.test`,
    customer_phone: "+33600000000",
    request_details: "Demande d’avis",
    appointment_date: new Date(Date.now() + 10 * 24 * 3_600_000),
    base_price: "100.00",
    final_price: "100.00",
    payment_status: "completed",
    appointment_status: "confirmed",
    stripe_payment_intent_id: `pi_${trackingId}`,
  }]) as Array<{ id: number }>;
  const job = { appointment_id: id, attempts: 0, max_attempts: 7, scheduled_for: new Date(Date.now() - 1000), created_at: new Date(Date.now() - 60_000) };
  memory.seed(appointmentFulfillmentJobs, [{ ...job, job_type: "owner", status: "completed", attempts: 1 }, { ...job, job_type: "confirmation", status: "queued" }]);
  resend.rejected.add(`${trackingId.toLowerCase()}@example.test`);
  return id;
}

const sent = (subject: string) => resend.calls.filter(call => call.subject.startsWith(subject));
const quotaEvents = () => memory.rows(securityEvents).filter(event => event.category === "resend_quota_exceeded");

beforeEach(async () => {
  memory = createMemoryPg([appointments, appointmentFulfillmentJobs, securityEvents, candidateSecurityRateLimits]);
  state.memory = memory;
  resend.calls.length = 0;
  resend.rejected.clear();
  postPaymentDeliveryRetry.delaysMs = [0, 0];
  appointmentFulfillmentPacing.delayMs = PAUSE_MS;
  vi.stubEnv("RESEND_API_KEY", "re_test_quota_alert");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  // The last send of an earlier test is a pause away.
  await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ABUS-03 — l’alerte « quota Resend épuisé » levée pendant les envois après paiement", () => {
  it("part dans le créneau d’envoi du traitement, une pause après l’alerte refusée faute de quota", async () => {
    seedRefusedConfirmation("APTQUOTA0001");
    const start = Date.now();

    await processDueAppointmentFulfillmentJobs();

    const [confirmation, refusedAlert, securityAlert] = resend.calls;
    expect(resend.calls.map(call => call.subject)).toEqual([confirmation.subject, "Échec d’envoi après paiement (APTQUOTA0001)", SECURITY_ALERT]);
    // Each send takes its slot a pause after the one before and reaches Resend at that slot or later. A
    // call that starts late in its slot (the confirmation, built on a busy machine) shortens the gap to the
    // next call by as much, so the slots are counted from the start of the run: one pause, then two.
    expect(refusedAlert.at - start).toBeGreaterThanOrEqual(PAUSE_MS - 5);
    // Before, a few milliseconds after the refused alert, about one pause in: three requests to Resend in one pause.
    expect(securityAlert.at - start).toBeGreaterThanOrEqual(2 * PAUSE_MS - 5);
    expect(quotaEvents()).toHaveLength(1);
  }, 10_000);

  it("ne part pas après la fin du budget d’un traitement immédiat, sans être perdue : l’événement suivant l’envoie", async () => {
    const id = seedRefusedConfirmation("APTQUOTA0002");

    // Room for the confirmation and its failure alert, a pause later, not for one more pause.
    await processAppointmentFulfillmentNow(id, { deadlineAt: Date.now() + PAUSE_MS * 1.5 });

    expect(resend.calls.map(call => call.subject)).toEqual([expect.stringContaining("APTQUOTA0002"), "Échec d’envoi après paiement (APTQUOTA0002)"]);
    expect(sent(SECURITY_ALERT)).toEqual([]);
    expect(quotaEvents()).toHaveLength(1);

    // The failure alert, queued, meets the quota again at the next run: that event sends the security alert.
    await processDueAppointmentFulfillmentJobs();

    expect(sent("Échec d’envoi")).toHaveLength(2);
    expect(sent(SECURITY_ALERT)).toHaveLength(1);
    expect(sent(SECURITY_ALERT)[0].at - sent("Échec d’envoi")[1].at).toBeGreaterThanOrEqual(PAUSE_MS - 5);
    expect(quotaEvents()).toHaveLength(2);
  }, 10_000);
});
