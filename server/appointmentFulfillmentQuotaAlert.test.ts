import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointments, candidateSecurityRateLimits, securityEvents } from "../drizzle/schema";
import { createMemoryPg, pgTimestamp, type MemoryPg } from "./testing/memoryPgProxy";
import { TEST_PEPPER } from "./testSupport/candidatePortal";

// ABUS-03 — quota Resend épuisé pendant les envois qui suivent un paiement :
// l’email « Alerte sécurité — Quota d’envoi d’emails (Resend) épuisé » prend le créneau d’envoi
// du traitement, une pause après l’alerte refusée, au lieu de partir quelques
// millisecondes après elle ; quand ce créneau tomberait après la fin du budget
// d’un traitement immédiat, il ne part pas alors : il est mis en file et le
// passage suivant l’envoie, même si le quota est revenu entre-temps, une seule
// fois par période. Vraies procédures, vraie file, vraies alertes ; seul
// Resend (transport) est simulé.

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

const resend = vi.hoisted(() => ({
  calls: [] as Array<{ subject: string; to: string; at: number; text?: string }>,
  // Adresses refusées par Resend (422).
  rejected: new Set<string>(),
  // Quota quotidien épuisé pour les alertes « Échec d’envoi » au médecin.
  quotaUsedUp: true,
  // Et pour l’alerte de sécurité elle-même.
  quotaRefusesSecurityAlert: false,
}));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(async (message: { subject: string; to: string[]; text?: string }) => {
        resend.calls.push({ subject: message.subject, to: message.to[0]!, at: Date.now(), text: message.text });
        if (resend.rejected.has(message.to[0]!)) return { data: null, error: { name: "validation_error", statusCode: 422, message: "Invalid `to` field." } };
        // The owner's « Échec d’envoi » alerts meet the used-up daily quota.
        if (resend.quotaUsedUp && (message.subject.startsWith("Échec d’envoi") || (resend.quotaRefusesSecurityAlert && message.subject.startsWith("Alerte sécurité")))) return { data: null, error: { name: "daily_quota_exceeded", statusCode: 429, message: "You have reached your daily quota." } };
        return { data: { id: `email_${resend.calls.length}` }, error: null };
      }),
    },
  })),
}));
const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));

import { postPaymentDeliveryRetry } from "./_core/notifications";
import { appointmentFulfillmentPacing, processAppointmentFulfillmentNow, processDueAppointmentFulfillmentJobs } from "./appointmentFulfillment";
import { logSecurityEvent } from "./candidateSecurity";

const PAUSE_MS = 300;
const SECURITY_ALERT = "Alerte sécurité — Quota d’envoi d’emails (Resend) épuisé : emails refusés — Hippocampus Consulting";
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
const quotaAlertJobs = () => memory.rows(appointmentFulfillmentJobs).filter(row => row.job_type === "quota_alert");
/** The window of the security alerts of a used-up quota: one alert email per period (sendOwnerAlertOncePerWindow). */
const alertWindow = () => memory.rows(candidateSecurityRateLimits).find(row => row.action === "security_alert_email")!;
/** Room for the confirmation and its failure alert, a pause later, not for one more pause: the security alert misses its slot. */
const tightBudget = () => ({ deadlineAt: Date.now() + PAUSE_MS * 1.5 });

beforeEach(async () => {
  memory = createMemoryPg([appointments, appointmentFulfillmentJobs, securityEvents, candidateSecurityRateLimits]);
  state.memory = memory;
  resend.calls.length = 0;
  resend.rejected.clear();
  resend.quotaUsedUp = true;
  resend.quotaRefusesSecurityAlert = false;
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

  it("ne part pas après la fin du budget d’un traitement immédiat, sans être perdue : mise en file, le passage suivant l’envoie dans son créneau, une seule fois", async () => {
    const id = seedRefusedConfirmation("APTQUOTA0002");

    await processAppointmentFulfillmentNow(id, tightBudget());

    expect(resend.calls.map(call => call.subject)).toEqual([expect.stringContaining("APTQUOTA0002"), "Échec d’envoi après paiement (APTQUOTA0002)"]);
    expect(sent(SECURITY_ALERT)).toEqual([]);
    expect(quotaEvents()).toHaveLength(1);
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ appointment_id: id, status: "queued", attempts: 0 })]);

    // The next run sends the queued security alert; the failure alert, queued too, meets the quota again
    // within that alert's window: no second security alert.
    await processDueAppointmentFulfillmentJobs();

    expect(sent(SECURITY_ALERT)).toHaveLength(1);
    expect(sent("Échec d’envoi")).toHaveLength(2);
    expect(Math.abs(sent("Échec d’envoi")[1].at - sent(SECURITY_ALERT)[0].at)).toBeGreaterThanOrEqual(PAUSE_MS - 5);
    expect(quotaEvents()).toHaveLength(2);
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ status: "completed", last_error: null })]);
  }, 10_000);

  it("part au passage suivant même si le quota est revenu entre-temps, sans nouvel événement de quota pour la relancer", async () => {
    const id = seedRefusedConfirmation("APTQUOTA0003");
    await processAppointmentFulfillmentNow(id, tightBudget());
    expect(sent(SECURITY_ALERT)).toEqual([]);

    // The quota resets before the scheduled run: nothing meets it any more.
    resend.quotaUsedUp = false;
    await processDueAppointmentFulfillmentJobs();

    expect(quotaEvents()).toHaveLength(1);
    expect(sent("Échec d’envoi")).toHaveLength(2);
    const [alert] = sent(SECURITY_ALERT);
    // Said to have waited, with the quota events of the day, not only of the last hour.
    expect(alert.text).toContain("Alerte reportée : levée pendant les envois qui suivent un paiement");
    expect(alert.text).toContain("1 évènement « Quota d’envoi d’emails (Resend) épuisé : emails refusés » sur les dernières 24 heures, le dernier le ");
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ status: "completed", attempts: 1, last_error: null })]);

    // Nothing is left for the run after.
    await processDueAppointmentFulfillmentJobs();
    expect(sent(SECURITY_ALERT)).toHaveLength(1);
  }, 10_000);

  it("est mise en file aussi quand le même quota la refuse dans son créneau : le passage suivant l’envoie une fois le quota revenu", async () => {
    resend.quotaRefusesSecurityAlert = true;
    const id = seedRefusedConfirmation("APTQUOTA0008");

    await processAppointmentFulfillmentNow(id);

    // Tried in its slot, refused by the quota as well: queued rather than left to the next quota event.
    expect(sent(SECURITY_ALERT)).toHaveLength(1);
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ appointment_id: id, status: "queued", attempts: 0 })]);

    // Before the new try after that failure, the queued alert waits.
    resend.quotaUsedUp = false;
    await processDueAppointmentFulfillmentJobs();
    expect(sent(SECURITY_ALERT)).toHaveLength(1);
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ status: "retry", attempts: 1, last_error: "quota_alert_not_sent" })]);

    // Then the quota is back and the next run sends it, once.
    alertWindow().blocked_until = pgTimestamp(new Date(Date.now() - 1000));
    quotaAlertJobs()[0]!.scheduled_for = pgTimestamp(new Date(Date.now() - 1000));
    await processDueAppointmentFulfillmentJobs();
    expect(sent(SECURITY_ALERT)).toHaveLength(2);
    expect(sent(SECURITY_ALERT)[1]!.text).toContain("Alerte reportée");
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ status: "completed", attempts: 2, last_error: null })]);
    await processDueAppointmentFulfillmentJobs();
    expect(sent(SECURITY_ALERT)).toHaveLength(2);
  }, 10_000);

  it("une seule en file par période, quel que soit le rendez-vous dont l’email a rencontré le quota", async () => {
    const first = seedRefusedConfirmation("APTQUOTA0004");
    const second = seedRefusedConfirmation("APTQUOTA0005");
    await processAppointmentFulfillmentNow(first, tightBudget());
    await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
    await processAppointmentFulfillmentNow(second, tightBudget());

    expect(quotaEvents()).toHaveLength(2);
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ appointment_id: first, status: "queued" })]);

    resend.quotaUsedUp = false;
    await processDueAppointmentFulfillmentJobs();
    expect(sent(SECURITY_ALERT)).toHaveLength(1);
  }, 10_000);

  it("n’envoie rien de plus quand une alerte de la même période est partie aussitôt entre-temps", async () => {
    const id = seedRefusedConfirmation("APTQUOTA0006");
    await processAppointmentFulfillmentNow(id, tightBudget());

    // Another email meets the quota outside a processing that spaces its sends: its alert leaves at once.
    await logSecurityEvent({ actorKind: "system", category: "resend_quota_exceeded", outcome: "failed", severity: "high", metadata: { quota: "daily", emailKind: "cv_confirmation" } });
    expect(sent(SECURITY_ALERT)).toHaveLength(1);

    resend.quotaUsedUp = false;
    await processDueAppointmentFulfillmentJobs();

    expect(sent(SECURITY_ALERT)).toHaveLength(1);
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ status: "completed", last_error: "quota_alert_covered" })]);
  }, 10_000);

  it("ne se croit pas couverte par une alerte de la période encore en cours d’envoi : elle part au passage suivant si celle-ci échoue", async () => {
    const id = seedRefusedConfirmation("APTQUOTA0007");
    await processAppointmentFulfillmentNow(id, tightBudget());
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ status: "queued" })]);

    // Another processing has just taken the window for its own alert, which Resend has not answered yet.
    const now = pgTimestamp(new Date());
    Object.assign(alertWindow(), { attempt_count: 1, blocked_until: null, window_started_at: now, last_attempt_at: now });
    resend.quotaUsedUp = false;
    await processDueAppointmentFulfillmentJobs();

    expect(sent(SECURITY_ALERT)).toEqual([]);
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ status: "retry", attempts: 1, last_error: "quota_alert_not_sent" })]);

    // That alert failed: once the new try after a failure is due, the queued one leaves.
    Object.assign(alertWindow(), { attempt_count: 2, blocked_until: pgTimestamp(new Date(Date.now() - 1000)) });
    quotaAlertJobs()[0]!.scheduled_for = pgTimestamp(new Date(Date.now() - 1000));
    await processDueAppointmentFulfillmentJobs();

    expect(sent(SECURITY_ALERT)).toHaveLength(1);
    expect(quotaAlertJobs()).toEqual([expect.objectContaining({ status: "completed", attempts: 2, last_error: null })]);
  }, 10_000);
});
