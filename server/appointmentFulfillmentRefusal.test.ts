import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointments, securityEvents } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// EXPL-02 et RES-06 — un email refusé par le service d’envoi (adresse du
// patient refusée, 422) termine son envoi tout de suite, comme « refusé », au
// lieu d’être réessayé 7 fois ; l’écran, « À traiter » et les alertes au
// médecin le disent. Un refus de la configuration d’envoi (clé API, domaine
// d’expédition) bloque tous les emails jusqu’à sa correction : il garde ses
// essais automatiques. Le remboursement fait depuis le tableau de bord passe par
// la même file que celui fait dans Stripe. Vraies procédures, vraie file et
// vrais emails ; seuls Resend (transport) et les alertes au médecin sont simulés.

const resend = vi.hoisted(() => ({
  calls: [] as Array<{ message: Record<string, unknown>; options?: { idempotencyKey?: string } }>,
  // Adresses refusées par Resend (422) ou injoignables (503).
  rejected: new Set<string>(),
  down: new Set<string>(),
  // Configuration d’envoi refusée (clé API, domaine) : tous les emails.
  configuration: null as null | { name: string; statusCode: number },
}));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(async (message: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        resend.calls.push({ message, options });
        const to = (message.to as string[])[0]!;
        if (resend.configuration) return { data: null, error: { ...resend.configuration, message: "Sending configuration refused." } };
        if (resend.rejected.has(to)) return { data: null, error: { name: "validation_error", statusCode: 422, message: "Invalid `to` field." } };
        if (resend.down.has(to)) return { data: null, error: { name: "internal_server_error", statusCode: 503, message: "unavailable" } };
        return { data: { id: `email_${resend.calls.length}` }, error: null };
      }),
    },
  })),
}));
const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
const owner = vi.hoisted(() => ({ notifyOwner: vi.fn(async (_payload: { title: string; content: string }, _options?: { idempotencyKey?: string }) => true) }));
// The owner's booking notification is built for real, sent through the faked transport.
vi.mock("./_core/notification", async importOriginal => ({ ...await importOriginal<typeof import("./_core/notification")>(), notifyOwner: owner.notifyOwner }));

import { appRouter } from "./routers";
import { postPaymentDeliveryRetry } from "./_core/notifications";
import { appointmentFulfillmentPacing, enqueueStripeRefundNotices, patientEmailIdempotencyKey, processAppointmentFulfillmentNow, processDueAppointmentFulfillmentJobs } from "./appointmentFulfillment";
import { refundAppointmentPayment } from "./appointmentAdminActions";
import { STRIPE_REFUND_CANCELLATION_REASON } from "./appointmentPaymentWebhook";

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
    final_price: "100.00",
    payment_status: "completed",
    appointment_status: "confirmed",
    stripe_payment_intent_id: `pi_${trackingId}`,
    ...overrides,
  }])[0]! as { id: number };
}

function seedJob(appointmentId: number, jobType: string, overrides: Record<string, unknown> = {}) {
  return memory.seed(appointmentFulfillmentJobs, [{
    appointment_id: appointmentId,
    job_type: jobType,
    status: "queued",
    attempts: 0,
    max_attempts: 7,
    scheduled_for: new Date(Date.now() - 1000),
    created_at: new Date(Date.now() - 60_000),
    ...overrides,
  }])[0]!;
}

const job = (appointmentId: number, jobType: string) => memory.rows(appointmentFulfillmentJobs).find(row => row.appointment_id === appointmentId && row.job_type === jobType)!;
const emailsTo = (to: string) => resend.calls.filter(call => (call.message.to as string[])[0] === to);
const alerts = () => owner.notifyOwner.mock.calls.map(([payload, options]) => ({ ...payload, key: options?.idempotencyKey }));
const deliveriesOf = async (trackingId: string) => (await admin().appointments.list({ search: trackingId })).items.find(item => item.trackingId === trackingId)!.deliveries;

/** Stripe double: the refund succeeds. */
const stripe = { refunds: { create: vi.fn(async () => ({ id: "re_test_1", amount: 10000 })), list: vi.fn(async () => ({ data: [] })) } } as unknown as Stripe;

beforeEach(() => {
  memory = createMemoryPg([appointments, appointmentFulfillmentJobs, securityEvents]);
  state.memory = memory;
  resend.calls.length = 0;
  resend.rejected.clear();
  resend.down.clear();
  resend.configuration = null;
  owner.notifyOwner.mockClear();
  postPaymentDeliveryRetry.delaysMs = [0, 0];
  appointmentFulfillmentPacing.delayMs = 0;
  vi.stubEnv("RESEND_API_KEY", "re_test_refusal");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("EXPL-02 — un refus du service d’envoi termine l’envoi tout de suite", () => {
  it("confirmation refusée : « refusée » sur le rendez-vous et dans « À traiter », alerte sans promesse, aucun essai automatique, « Renvoyer » après correction", async () => {
    const { id } = seedAppointment("APTREFUSE001");
    seedJob(id, "owner", { status: "completed", attempts: 1 });
    seedJob(id, "confirmation");
    resend.rejected.add("aptrefuse001@example.test");

    await processAppointmentFulfillmentNow(id);

    // One attempt, no short retries: the refusal is not passing.
    expect(emailsTo("aptrefuse001@example.test")).toHaveLength(1);
    expect(job(id, "confirmation")).toMatchObject({ status: "failed", attempts: 1 });
    expect((await deliveriesOf("APTREFUSE001")).map(({ jobType, state, nextAttemptAt }) => ({ jobType, state, nextAttemptAt }))).toEqual([
      { jobType: "owner", state: "sent", nextAttemptAt: null },
      { jobType: "confirmation", state: "refused", nextAttemptAt: null },
    ]);
    const attention = await admin().attention();
    expect(attention.refusedDeliveries).toEqual({ total: 1, items: [expect.objectContaining({ trackingId: "APTREFUSE001", jobTypes: ["confirmation"] })] });
    expect(attention.retryingDeliveries.total).toBe(0);
    expect(attention.failedDeliveries.total).toBe(0);
    // The alert says the same as the screen.
    expect(alerts()).toHaveLength(1);
    const [alert] = alerts();
    expect(alert.title).toBe("Échec d’envoi après paiement (APTREFUSE001)");
    expect(alert.content).toContain("a été refusé par le service d’envoi");
    expect(alert.content).toContain("Ce refus n’est pas passager");
    expect(alert.content).toContain("corrigez l’adresse sur le rendez-vous (onglet Réservations, « Corriger l’email du patient »), puis « Renvoyer » l’envoie à la nouvelle adresse");
    expect(alert.content).not.toContain("nouvel essai automatique");
    expect(alert.content).not.toMatch(/tentative \d sur/);
    expect(alert.key).toBe("appointment-confirmation-failure-APTREFUSE001-refused");

    // The next scheduled runs, days later, try nothing more.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 3 * 24 * 3_600_000));
    await expect(processDueAppointmentFulfillmentJobs()).resolves.toMatchObject({ processed: 0 });
    expect(emailsTo("aptrefuse001@example.test")).toHaveLength(1);

    // Address corrected: « Renvoyer » sends it.
    resend.rejected.clear();
    const retry = await admin().appointments.retryFulfillment({ trackingId: "APTREFUSE001" });
    expect(retry.requeuedJobTypes).toEqual(["confirmation"]);
    expect(retry.deliveries.map(delivery => delivery.state)).toEqual(["sent", "sent"]);
    expect(emailsTo("aptrefuse001@example.test")).toHaveLength(2);
    await expect(admin().attention()).resolves.toMatchObject({ refusedDeliveries: { total: 0 }, failedDeliveries: { total: 0 }, retryingDeliveries: { total: 0 } });
  });

  it("garde un nouvel essai automatique pour une panne passagère", async () => {
    const { id } = seedAppointment("APTREFUSE002");
    seedJob(id, "owner", { status: "completed", attempts: 1 });
    seedJob(id, "confirmation");
    resend.down.add("aptrefuse002@example.test");

    await processAppointmentFulfillmentNow(id);

    expect(job(id, "confirmation")).toMatchObject({ status: "retry", attempts: 1 });
    expect((await deliveriesOf("APTREFUSE002"))[1]).toMatchObject({ jobType: "confirmation", state: "retrying", attempts: 1, maxAttempts: 7 });
    expect(alerts()[0].content).toContain("tentative 1 sur 7");
  });

  it.each([
    ["clé API absente", { name: "missing_api_key", statusCode: 401 }],
    ["clé API restreinte", { name: "restricted_api_key", statusCode: 401 }],
    ["clé API invalide", { name: "invalid_api_key", statusCode: 403 }],
    ["domaine d’expédition non vérifié", { name: "validation_error", statusCode: 403 }],
    ["adresse d’expédition refusée", { name: "invalid_from_address", statusCode: 422 }],
  ] as const)("garde les essais automatiques pour une configuration d’envoi refusée (%s), et tout repart une fois corrigée", async (_case, refusal) => {
    const { id } = seedAppointment("APTREFUSE004");
    seedJob(id, "owner");
    seedJob(id, "confirmation");
    resend.configuration = refusal;

    await processAppointmentFulfillmentNow(id);

    // The practitioner's booking notification and the patient's confirmation
    // both wait for their next automatic attempt; nothing is « refusée ».
    expect(job(id, "owner")).toMatchObject({ status: "retry", attempts: 1 });
    expect(job(id, "confirmation")).toMatchObject({ status: "retry", attempts: 1 });
    expect((await deliveriesOf("APTREFUSE004")).map(({ jobType, state }) => [jobType, state])).toEqual([["owner", "retrying"], ["confirmation", "retrying"]]);
    const attention = await admin().attention();
    expect(attention.refusedDeliveries.total).toBe(0);
    expect(attention.retryingDeliveries.items).toEqual([expect.objectContaining({ trackingId: "APTREFUSE004", jobTypes: ["owner", "confirmation"] })]);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0].content).toContain("tentative 1 sur 7");
    expect(alerts()[0].key).toBe("appointment-confirmation-failure-APTREFUSE004-first");

    // Configuration corrected: the next scheduled run sends both, with no « Renvoyer ».
    resend.configuration = null;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Math.max(...["owner", "confirmation"].map(jobType => new Date(`${job(id, jobType).scheduled_for}Z`).getTime()))));
    await processDueAppointmentFulfillmentJobs();
    expect(job(id, "owner")).toMatchObject({ status: "completed", attempts: 2, last_error: null });
    expect(job(id, "confirmation")).toMatchObject({ status: "completed", attempts: 2, last_error: null });
    expect(emailsTo("aptrefuse004@example.test")).toHaveLength(2);
  });
});

describe("RES-06 — email de remboursement refusé", () => {
  it("remboursement constaté chez Stripe : l’email refusé n’est pas réessayé, et les deux alertes au médecin le disent", async () => {
    const { id } = seedAppointment("APTREFUSE003", { payment_status: "refunded", appointment_status: "cancelled", cancellation_reason: STRIPE_REFUND_CANCELLATION_REASON, refund_amount: "100.00" });
    resend.rejected.add("aptrefuse003@example.test");

    await enqueueStripeRefundNotices(id);
    await processAppointmentFulfillmentNow(id);

    expect(emailsTo("aptrefuse003@example.test")).toHaveLength(1);
    expect(job(id, "refund")).toMatchObject({ status: "failed", attempts: 1 });
    expect(job(id, "refund_owner")).toMatchObject({ status: "completed", last_error: null });
    const [failure, stripeAlert] = alerts();
    expect(failure.title).toBe("Échec d’envoi après remboursement (APTREFUSE003)");
    expect(failure.content).toContain("L’envoi de l’email de remboursement au patient du rendez-vous APTREFUSE003 a été refusé par le service d’envoi");
    expect(failure.content).toContain("Le remboursement est bien enregistré");
    expect(failure.content).not.toContain("nouvel essai automatique");
    expect(stripeAlert.title).toBe("Remboursement constaté chez Stripe (APTREFUSE003)");
    expect(stripeAlert.content).toContain("L’email de remboursement au patient a été refusé par le service d’envoi");
    expect(stripeAlert.content).not.toContain("le renvoie automatiquement");
    expect(stripeAlert.key).toBe("appointment-stripe-refund-APTREFUSE003-cancelled-refused");
    expect((await deliveriesOf("APTREFUSE003")).map(({ jobType, state }) => [jobType, state])).toEqual([["refund", "refused"], ["refund_owner", "sent"]]);
    expect((await admin().attention()).refusedDeliveries.items).toEqual([expect.objectContaining({ trackingId: "APTREFUSE003", jobTypes: ["refund"] })]);
  });
});

describe("EXPL-02 — remboursement depuis le tableau de bord par la file des remboursements", () => {
  it.each([
    ["annulation par le praticien", { initiator: "practitioner", reason: "Indisponibilité du médecin" }, {}, "Annulation de votre consultation - APTREFUND010", "Motif : Indisponibilité du médecin"],
    ["geste après la consultation", { initiator: "practitioner", reason: "Geste commercial" }, { appointment_status: "completed", appointment_date: new Date(Date.now() - 2 * 3_600_000) }, "Remboursement confirmé - APTREFUND010", "Motif : Geste commercial"],
    ["demande du patient", { initiator: "patient", reason: "Empêchement" }, {}, "Remboursement confirmé - APTREFUND010", null],
    ["paiement reçu sans créneau confirmé", { initiator: "practitioner", reason: "Paiement tardif" }, { payment_status: "pending", appointment_status: "cancelled" }, "Remboursement de votre paiement - APTREFUND010", "Motif : Paiement tardif"],
    ["réservation faite en anglais", { initiator: "practitioner", reason: "Doctor unavailable" }, { language: "en" }, "Cancellation of your consultation - APTREFUND010", "Reason: Doctor unavailable"],
  ] as const)("envoie tout de suite le même email qu’avant (%s), une seule fois", async (_case, input, overrides, subject, reasonLine) => {
    const { id } = seedAppointment("APTREFUND010", overrides);

    const result = await refundAppointmentPayment(stripe, { trackingId: "APTREFUND010", ...input });

    expect(result).toMatchObject({ success: true, patientNotified: true, patientEmail: "sent" });
    const [email] = emailsTo("aptrefund010@example.test");
    expect(emailsTo("aptrefund010@example.test")).toHaveLength(1);
    expect(email.message.subject).toBe(subject);
    expect(email.options).toEqual({ idempotencyKey: patientEmailIdempotencyKey("appointment-refund-APTREFUND010", "aptrefund010@example.test") });
    if (reasonLine) expect(String(email.message.text)).toContain(reasonLine);
    else expect(String(email.message.text)).not.toMatch(/Motif|Reason/);
    expect(job(id, "refund")).toMatchObject({ status: "completed", attempts: 1, last_error: null });
    // The owner made the refund: no « constaté chez Stripe » alert.
    expect(memory.rows(appointmentFulfillmentJobs).map(row => row.job_type)).toEqual(["refund"]);
    expect(alerts()).toEqual([]);
  });

  it("pendant une panne : un essai, nouvel essai automatique visible dans « À traiter », puis le même email une seule fois", async () => {
    const { id } = seedAppointment("APTREFUND011");
    resend.down.add("aptrefund011@example.test");

    const result = await refundAppointmentPayment(stripe, { trackingId: "APTREFUND011", initiator: "practitioner", reason: "Indisponibilité du médecin" });

    expect(result).toMatchObject({ success: true, patientNotified: false, patientEmail: "retrying" });
    expect(job(id, "refund")).toMatchObject({ status: "retry", attempts: 1, max_attempts: 7 });
    expect((await admin().attention()).retryingDeliveries.items).toEqual([expect.objectContaining({ trackingId: "APTREFUND011", jobTypes: ["refund"] })]);
    expect((await deliveriesOf("APTREFUND011"))[0]).toMatchObject({ jobType: "refund", state: "retrying", attempts: 1, maxAttempts: 7 });

    resend.down.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${job(id, "refund").scheduled_for}Z`));
    await processDueAppointmentFulfillmentJobs();
    await processDueAppointmentFulfillmentJobs();

    const sent = emailsTo("aptrefund011@example.test");
    // 3 tries in the first attempt (short retries), then the one that went out: same key, same email.
    expect(sent).toHaveLength(4);
    expect(new Set(sent.map(call => call.options?.idempotencyKey))).toEqual(new Set([patientEmailIdempotencyKey("appointment-refund-APTREFUND011", "aptrefund011@example.test")]));
    expect(new Set(sent.map(call => call.message.text)).size).toBe(1);
    expect(job(id, "refund")).toMatchObject({ status: "completed", last_error: null });
    await expect(admin().attention()).resolves.toMatchObject({ retryingDeliveries: { total: 0 }, refusedDeliveries: { total: 0 } });
  });

  it("adresse refusée : le toast le sait, l’email n’est pas réessayé", async () => {
    const { id } = seedAppointment("APTREFUND012");
    resend.rejected.add("aptrefund012@example.test");

    await expect(refundAppointmentPayment(stripe, { trackingId: "APTREFUND012", initiator: "practitioner", reason: "Indisponibilité du médecin" }))
      .resolves.toMatchObject({ success: true, patientNotified: false, patientEmail: "refused" });
    expect(emailsTo("aptrefund012@example.test")).toHaveLength(1);
    expect(job(id, "refund")).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("clé API refusée : l’email attend son nouvel essai automatique, il n’est pas « refusé »", async () => {
    const { id } = seedAppointment("APTREFUND013");
    resend.configuration = { name: "invalid_api_key", statusCode: 403 };

    await expect(refundAppointmentPayment(stripe, { trackingId: "APTREFUND013", initiator: "practitioner", reason: "Indisponibilité du médecin" }))
      .resolves.toMatchObject({ success: true, patientNotified: false, patientEmail: "retrying" });
    expect(job(id, "refund")).toMatchObject({ status: "retry", attempts: 1, max_attempts: 7 });
  });
});

describe("EXPL-02 — adresse du patient corrigée depuis la fiche du rendez-vous après un refus", () => {
  const corrections = () => memory.rows(securityEvents).filter(event => event.category === "admin_appointment_email_corrected");

  it("« Renvoyer » écrit ensuite à la nouvelle adresse, sous une nouvelle clé, une seule fois ; la correction est tracée sans les adresses", async () => {
    const { id } = seedAppointment("APTFIXMAIL01");
    seedJob(id, "owner", { status: "completed", attempts: 1 });
    seedJob(id, "confirmation");
    resend.rejected.add("aptfixmail01@example.test");
    await processAppointmentFulfillmentNow(id);
    expect(job(id, "confirmation")).toMatchObject({ status: "failed", attempts: 1 });

    // Typed with surrounding spaces, as pasted from an email.
    await expect(admin().appointments.updateCustomerEmail({ trackingId: "APTFIXMAIL01", customerEmail: "  patient.corrige@example.test " }))
      .resolves.toEqual({ success: true, unchanged: false });

    expect(memory.rows(appointments)[0]).toMatchObject({ customer_email: "patient.corrige@example.test" });
    // Nothing is sent by the correction itself: the refusal stays on screen until « Renvoyer ».
    expect((await deliveriesOf("APTFIXMAIL01")).map(delivery => delivery.state)).toEqual(["sent", "refused"]);
    expect(resend.calls).toHaveLength(1);
    expect(corrections()).toEqual([expect.objectContaining({ security_event_actor_kind: "admin", actor_reference: "user_owner", security_event_outcome: "allowed" })]);
    const trace = JSON.stringify(corrections()[0]);
    expect(trace).toContain("APTFIXMAIL01");
    expect(trace).not.toContain("example.test");

    const retry = await admin().appointments.retryFulfillment({ trackingId: "APTFIXMAIL01" });

    expect(retry.deliveries.map(delivery => delivery.state)).toEqual(["sent", "sent"]);
    const [refused] = emailsTo("aptfixmail01@example.test");
    const sent = emailsTo("patient.corrige@example.test");
    expect(sent).toHaveLength(1);
    expect(sent[0].message.subject).toBe(refused.message.subject);
    // A new key for the new address: the one of the refused send would be refused as reused with another content.
    expect(sent[0].options?.idempotencyKey).toBe(patientEmailIdempotencyKey("appointment-confirmation-APTFIXMAIL01", "patient.corrige@example.test"));
    expect(sent[0].options?.idempotencyKey).not.toBe(refused.options?.idempotencyKey);
    await expect(admin().attention()).resolves.toMatchObject({ refusedDeliveries: { total: 0 } });
  });

  it("vaut aussi pour l’email d’un remboursement refusé", async () => {
    const { id } = seedAppointment("APTFIXMAIL02");
    resend.rejected.add("aptfixmail02@example.test");
    await expect(refundAppointmentPayment(stripe, { trackingId: "APTFIXMAIL02", initiator: "practitioner", reason: "Indisponibilité du médecin" }))
      .resolves.toMatchObject({ patientEmail: "refused" });

    await admin().appointments.updateCustomerEmail({ trackingId: "APTFIXMAIL02", customerEmail: "bonne.adresse@example.test" });
    const retry = await admin().appointments.retryFulfillment({ trackingId: "APTFIXMAIL02" });

    expect(retry.requeuedJobTypes).toEqual(["refund"]);
    expect(emailsTo("bonne.adresse@example.test").map(call => call.message.subject)).toEqual(["Annulation de votre consultation - APTFIXMAIL02"]);
    expect(job(id, "refund")).toMatchObject({ status: "completed", last_error: null });
  });

  it("refuse une adresse que la réservation refuserait, un rendez-vous anonymisé (RGPD) ou inconnu, et ne trace qu’un vrai changement", async () => {
    seedAppointment("APTFIXMAIL03");
    seedAppointment("APTFIXMAIL04", { customer_email: "", customer_name: "Patient effacé" });

    // Longer than 400 characters too: the same clear message, not Zod's raw report.
    for (const customerEmail of ["pas-une-adresse", "patient@", "a b@example.test", `${"x".repeat(320)}@example.test`, `${"x".repeat(400)}@example.test`, "y".repeat(5_000)]) {
      await expect(admin().appointments.updateCustomerEmail({ trackingId: "APTFIXMAIL03", customerEmail }))
        .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Adresse email invalide") });
    }
    await expect(admin().appointments.updateCustomerEmail({ trackingId: "APTFIXMAIL04", customerEmail: "retour@example.test" }))
      .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("effacées (RGPD)") });
    await expect(admin().appointments.updateCustomerEmail({ trackingId: "APTUNKNOWN99", customerEmail: "retour@example.test" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(admin().appointments.updateCustomerEmail({ trackingId: "APTFIXMAIL03", customerEmail: "aptfixmail03@example.test" }))
      .resolves.toEqual({ success: true, unchanged: true });

    expect(memory.rows(appointments).map(row => row.customer_email)).toEqual(["aptfixmail03@example.test", ""]);
    expect(corrections()).toEqual([]);
  });

  it("ne corrige l’adresse qu’après le refus d’un email au patient que « Renvoyer » renvoie, comme la fiche", async () => {
    const refusal = { status: "failed", attempts: 1, last_error: "provider_rejected:confirmation_email_failed" };
    const { id: sent } = seedAppointment("APTFIXMAIL05");
    seedJob(sent, "owner", { status: "completed", attempts: 1 });
    seedJob(sent, "confirmation", { status: "completed", attempts: 1 });
    // Only the doctor's notification was refused: the patient's address is not the one at fault.
    const { id: ownerRefused } = seedAppointment("APTFIXMAIL06");
    seedJob(ownerRefused, "owner", { ...refusal, last_error: "provider_rejected:owner_notification_failed" });
    // Failed after all its attempts, not refused: the address was not refused either.
    const { id: failed } = seedAppointment("APTFIXMAIL07");
    seedJob(failed, "confirmation", { status: "failed", attempts: 7, last_error: "confirmation_email_failed" });
    // A paid appointment's confirmation refused before it was refunded: « Renvoyer » no longer sends it.
    const { id: refunded } = seedAppointment("APTFIXMAIL08", { payment_status: "refunded", appointment_status: "cancelled" });
    seedJob(refunded, "confirmation", refusal);
    seedAppointment("APTFIXMAIL09");

    for (const trackingId of ["APTFIXMAIL05", "APTFIXMAIL06", "APTFIXMAIL07", "APTFIXMAIL08", "APTFIXMAIL09"]) {
      await expect(admin().appointments.updateCustomerEmail({ trackingId, customerEmail: "autre@example.test" }))
        .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("ne se corrige qu’après un tel refus") });
    }
    expect(memory.rows(appointments).every(row => row.customer_email !== "autre@example.test")).toBe(true);
    expect(corrections()).toEqual([]);

    // Once the confirmation is refused, the correction goes through.
    const { id: refused } = seedAppointment("APTFIXMAIL10");
    seedJob(refused, "confirmation", refusal);
    await expect(admin().appointments.updateCustomerEmail({ trackingId: "APTFIXMAIL10", customerEmail: "autre@example.test" })).resolves.toEqual({ success: true, unchanged: false });
    expect(corrections()).toHaveLength(1);
  });
});
