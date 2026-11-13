import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";

const database = vi.hoisted(() => ({ getDb: vi.fn() }));
const notifications = vi.hoisted(() => ({ sendReminderEmail: vi.fn(async (..._args: unknown[]) => undefined) }));
vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./_core/notifications", () => notifications);
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
const fulfillment = vi.hoisted(() => ({
  recoverStaleAppointmentFulfillmentJobs: vi.fn(async () => ({ recovered: 0 })),
  processDueAppointmentFulfillmentJobs: vi.fn(async () => ({ processed: 0, results: [] })),
  enqueueAppointmentFulfillment: vi.fn(async (_appointmentId: number) => undefined),
}));
vi.mock("./appointmentFulfillment", async importOriginal => ({
  ...fulfillment,
  // The reminder takes its key from the real helper of the patient emails.
  patientEmailIdempotencyKey: (await importOriginal<typeof import("./appointmentFulfillment")>()).patientEmailIdempotencyKey,
}));
const documentJobs = vi.hoisted(() => ({
  recoverStaleCandidateDocumentJobs: vi.fn(async () => ({ recovered: 0, exhausted: 0, closed: 0 })),
  recreateMissingCandidateDocumentAnalysisJobs: vi.fn(async () => ({ recreated: 0 })),
  processDueCandidateDocumentAnalysisJobs: vi.fn(async () => ({ processed: 0, completed: 0, retried: 0, needsReview: 0, released: 0 })),
}));
vi.mock("./candidateDocumentProcessing", () => documentJobs);
// The Resend transport, for the one test that sends a reminder through the real notifications module.
const resend = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: resend.send } })) }));
const security = vi.hoisted(() => ({ logSecurityEvent: vi.fn(async (_event: Record<string, unknown>) => undefined) }));
vi.mock("./candidateSecurity", () => security);

import { patientEmailIdempotencyKey } from "./appointmentFulfillment";
import {
  DAILY_REMINDER_WINDOW,
  drainInBatches,
  PAID_APPOINTMENT_JOB_RECOVERY_SINCE,
  reminderWindowBounds,
  requeuePaidAppointmentsWithoutFulfillment,
  runAppointmentFulfillmentWorker,
  runCandidateDocumentProcessingWorker,
  sendDueAppointmentReminders,
} from "./scheduledJobs";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-10-07T16:45:00Z");
let memory: MemoryPg;

function seedAppointment(id: number, extra: Record<string, unknown> = {}) {
  return memory.seed(appointments, [{
    id, tracking_id: `APT-${id}`, customer_name: `Patient ${id}`, customer_email: `p${id}@example.com`, customer_phone: "+33600000000",
    request_details: "Consultation", appointment_date: new Date("2026-10-08T09:00:00Z"), base_price: "100.00", final_price: "100.00",
    payment_status: "completed", appointment_status: "confirmed", createdAt: "2026-10-01 10:00:00.000", updatedAt: "2026-10-01 10:00:00.000", ...extra,
  }])[0]!;
}

const remindedTrackingIds = () => notifications.sendReminderEmail.mock.calls.map(call => call[2]);

beforeEach(() => {
  vi.clearAllMocks();
  memory = createMemoryPg([appointments, appointmentFulfillmentJobs]);
  database.getDb.mockResolvedValue(memory.db);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("fenêtres de rappel", () => {
  it("couvre tout rendez-vous confirmé au moins 30 h à l’avance avec un seul passage par jour", () => {
    // Hobby crons fire anywhere inside their hour: alternate the earliest and
    // latest firing to get the widest possible gap between two runs (~25 h).
    const start = Date.parse("2026-10-01T16:00:00Z");
    const runs = Array.from({ length: 12 }, (_, day) => start + day * 24 * HOUR + (day % 2 === 0 ? 0 : 59 * 60 * 1000));
    for (let appointmentAt = start + 30 * HOUR; appointmentAt < start + 10 * 24 * HOUR; appointmentAt += 7 * 60 * 1000) {
      const covered = runs.some(run => {
        const { from, to } = reminderWindowBounds(DAILY_REMINDER_WINDOW, new Date(run));
        return appointmentAt >= from.getTime() && appointmentAt <= to.getTime();
      });
      expect(covered).toBe(true);
    }
  });

  it("n’envoie jamais de rappel moins d’une heure avant la consultation", () => {
    const now = new Date("2026-10-07T16:45:00Z");
    expect(reminderWindowBounds(DAILY_REMINDER_WINDOW, now).from.getTime() - now.getTime()).toBe(HOUR);
  });
});

describe("envoi des rappels", () => {
  it("réserve chaque rendez-vous avant l’envoi : deux passages simultanés (cron relancé) n’envoient qu’un rappel chacun, marqué envoyé", async () => {
    // About 24 h ahead: inside the window.
    seedAppointment(1, { appointment_date: new Date("2026-10-08T17:00:00Z") });
    seedAppointment(2, { appointment_date: new Date("2026-10-08T17:00:00Z") });
    seedAppointment(3, { reminder_sent: 1 });
    seedAppointment(4, { appointment_date: new Date("2026-10-10T09:00:00Z") });

    const [first, second] = await Promise.all([sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW), sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW)]);

    expect(first.sent + second.sent).toBe(2);
    expect(remindedTrackingIds().sort()).toEqual(["APT-1", "APT-2"]);
    expect(notifications.sendReminderEmail).toHaveBeenCalledWith("p1@example.com", "Patient 1", "APT-1", expect.any(Date), { language: "fr", idempotencyKey: patientEmailIdempotencyKey("appointment-reminder-APT-1", "p1@example.com") });
    expect(memory.rows(appointments).map(row => row.reminder_sent)).toEqual([1, 1, 1, 0]);
  });

  it("n’envoie pas le rappel d’une réservation faite moins de 12 h avant le passage, qui vient d’en recevoir la confirmation (RES-12)", async () => {
    // For tomorrow 09:00 UTC; the run is at 16:45 UTC.
    seedAppointment(1, { createdAt: "2026-10-07 15:00:00.000", updatedAt: "2026-10-07 15:00:00.000" });
    seedAppointment(2, { createdAt: "2026-10-07 04:46:00.000", updatedAt: "2026-10-07 04:46:00.000" });
    seedAppointment(3, { createdAt: "2026-10-07 04:45:00.000", updatedAt: "2026-10-07 04:45:00.000" });

    expect(await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW)).toEqual({ reminded: 1, sent: 1, failed: 0 });

    expect(remindedTrackingIds()).toEqual(["APT-3"]);
    expect(memory.rows(appointments).map(row => row.reminder_sent)).toEqual([0, 0, 1]);
  });

  it("garde le rappel d’une réservation faite le matin pour le lendemain soir, et reporte au passage suivant celui d’une réservation qu’il atteint encore (RES-12)", async () => {
    // Booked at 05:00 for tomorrow 17:00, 36 h ahead: the next run (window from tomorrow 17:45) no longer reaches it.
    seedAppointment(1, { appointment_date: new Date("2026-10-08T17:00:00Z"), createdAt: "2026-10-07 05:00:00.000", updatedAt: "2026-10-07 05:00:00.000" });
    // Booked at 16:00 for tomorrow 21:00 (29 h ahead) and at 16:40 for tomorrow 22:40 (30 h ahead): the next run reaches both.
    seedAppointment(2, { appointment_date: new Date("2026-10-08T21:00:00Z"), createdAt: "2026-10-07 16:00:00.000", updatedAt: "2026-10-07 16:00:00.000" });
    seedAppointment(3, { appointment_date: new Date("2026-10-08T22:40:00Z"), createdAt: "2026-10-07 16:40:00.000", updatedAt: "2026-10-07 16:40:00.000" });

    expect(await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW)).toEqual({ reminded: 1, sent: 1, failed: 0 });
    expect(remindedTrackingIds()).toEqual(["APT-1"]);

    // The next day's run, as late in its hour as a Hobby cron fires.
    expect(await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, new Date(NOW.getTime() + 24 * HOUR + 59 * 60 * 1000))).toEqual({ reminded: 2, sent: 2, failed: 0 });
    expect(remindedTrackingIds()).toEqual(["APT-1", "APT-2", "APT-3"]);
    expect(memory.rows(appointments).map(row => row.reminder_sent)).toEqual([1, 1, 1]);
  });

  it("envoie le rappel en anglais pour une réservation faite dans une autre langue que le français (EN-01)", async () => {
    seedAppointment(4, { language: "zh" });

    await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW);

    expect(notifications.sendReminderEmail).toHaveBeenCalledWith("p4@example.com", "Patient 4", "APT-4", expect.any(Date), { language: "en", idempotencyKey: patientEmailIdempotencyKey("appointment-reminder-APT-4", "p4@example.com") });
  });

  it("libère la réservation quand l’email échoue, pour un nouvel essai", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    notifications.sendReminderEmail.mockRejectedValueOnce(new Error("reminder_email_failed"));
    seedAppointment(3);

    expect(await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW)).toEqual({ reminded: 1, sent: 0, failed: 1 });
    expect(memory.rows(appointments)[0]).toMatchObject({ reminder_sent: 0 });

    expect(await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, new Date(NOW.getTime() + 60_000))).toEqual({ reminded: 1, sent: 1, failed: 0 });
    expect(memory.rows(appointments)[0]).toMatchObject({ reminder_sent: 1 });
  });

  it("journalise le refus de Resend pour quota sur une ligne JSON portant son code, sans l’adresse du patient (EXPL-11)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_reminder_quota");
    const { sendReminderEmail } = await vi.importActual<typeof import("./_core/notifications")>("./_core/notifications");
    notifications.sendReminderEmail.mockImplementationOnce(async (...args) => {
      await sendReminderEmail(...args as Parameters<typeof sendReminderEmail>);
      return undefined;
    });
    resend.send.mockResolvedValueOnce({ data: null, error: { name: "daily_quota_exceeded", statusCode: 429, message: "You have reached your daily email sending quota for camille.patient@example.test." }, headers: {} });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    seedAppointment(6, { customer_email: "camille.patient@example.test" });
    try {
      expect(await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW)).toEqual({ reminded: 1, sent: 0, failed: 1 });
    } finally {
      vi.unstubAllEnvs();
    }

    expect(resend.send).toHaveBeenCalledWith(expect.objectContaining({ to: ["camille.patient@example.test"] }), expect.anything());
    expect(consoleError.mock.calls).toEqual([[expect.any(String)]]);
    expect(JSON.parse(consoleError.mock.calls[0]![0] as string)).toEqual({
      label: "[Reminder] Delivery failed",
      name: "Error",
      code: "daily_quota_exceeded",
      message: "reminder_email_failed",
      cause: "PostPaymentEmailError: reminder_email_rejected:You have reached your daily email sending quota for [email].",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("camille");
    // The first sign the owner reads: the security event of the « Sécurité » tab.
    expect(security.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ category: "resend_quota_exceeded", metadata: { quota: "daily", emailKind: "post_payment" } }));
    expect(memory.rows(appointments)[0]).toMatchObject({ reminder_sent: 0 });
  });

  it("essaie de nouveau un rappel refusé sous une autre clé une fois l’adresse corrigée, même de sa seule casse : Resend refuserait sinon la clé réutilisée avec un autre destinataire (409, ABUS-03)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    notifications.sendReminderEmail.mockRejectedValueOnce(new Error("reminder_email_failed"));
    seedAppointment(5, { customer_email: "Patient.Cinq@Example.com" });
    await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW);

    // « Corriger l’email du patient » after a refused confirmation: the same mailbox in lower case.
    memory.rows(appointments)[0]!.customer_email = "patient.cinq@example.com";
    await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, new Date(NOW.getTime() + 60_000));
    // Run again with the same address: the same key, which Resend recognises.
    memory.rows(appointments)[0]!.reminder_sent = 0;
    await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, new Date(NOW.getTime() + 120_000));

    const sends = notifications.sendReminderEmail.mock.calls.map(call => ({ to: call[0], key: (call[4] as { idempotencyKey: string }).idempotencyKey }));
    expect(sends.map(send => send.to)).toEqual(["Patient.Cinq@Example.com", "patient.cinq@example.com", "patient.cinq@example.com"]);
    expect(sends[1]!.key).not.toBe(sends[0]!.key);
    expect(sends[2]!.key).toBe(sends[1]!.key);
  });

  it("un rappel parti dont l’enregistrement échoue reste réservé : un passage rapproché ne le renvoie pas, le travail d’après-paiement le reprend dans les 24 h (DATA-02)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    seedAppointment(1);
    // Marking the reminder sent is refused after Resend accepted it (the
    // reservation before it writes the same columns: updatedAt follows every change).
    notifications.sendReminderEmail.mockImplementationOnce(async () => { memory.failNext(/^update "appointments" set "reminder_sent" = \$1/); });
    expect(await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW)).toEqual({ reminded: 1, sent: 1, failed: 0 });
    expect(memory.rows(appointments)[0]).toMatchObject({ reminder_sent: 2, updatedAt: "2026-10-07 16:45:00.000" });

    // Another run a few minutes later leaves the reservation to the run that may still be sending.
    expect(await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, new Date(NOW.getTime() + 5 * 60_000))).toEqual({ reminded: 0, sent: 0, failed: 0 });

    // The next morning, the post-payment job takes it back: same reminder, so the same Resend key.
    seedAppointment(2, { appointment_date: new Date("2026-10-08T15:00:00Z") });
    const recovery = await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, new Date("2026-10-08T06:20:00Z"), { onlyReserved: true });
    expect(recovery).toEqual({ reminded: 1, sent: 1, failed: 0 });
    expect(remindedTrackingIds()).toEqual(["APT-1", "APT-1"]);
    // The never-reserved appointment waits for the reminder run.
    expect(memory.rows(appointments).map(row => row.reminder_sent)).toEqual([1, 0]);
  });

  it("reprend une réservation laissée par un passage arrêté avant l’envoi, jamais une plus vieille que la mémoire de la clé (24 h)", async () => {
    seedAppointment(1, { reminder_sent: 2, updatedAt: "2026-10-07 15:45:00.000" });
    seedAppointment(2, { reminder_sent: 2, updatedAt: "2026-10-06 17:00:00.000" });

    expect(await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW)).toEqual({ reminded: 1, sent: 1, failed: 0 });
    expect(remindedTrackingIds()).toEqual(["APT-1"]);
    expect(memory.rows(appointments).map(row => row.reminder_sent)).toEqual([1, 2]);
  });

  it("le travail quotidien d’après-paiement reprend les rappels réservés et non enregistrés (DATA-02)", async () => {
    const now = Date.now();
    seedAppointment(1, { appointment_date: new Date(now + 10 * HOUR), reminder_sent: 2, updatedAt: new Date(now - 13 * HOUR) });
    seedAppointment(2, { appointment_date: new Date(now + 10 * HOUR) });

    const result = await runAppointmentFulfillmentWorker({ batchSize: 5, maxBatches: 4, budgetMs: 35_000 });

    expect(result.reminderRecovery).toEqual({ reminded: 1, sent: 1, failed: 0 });
    expect(remindedTrackingIds()).toEqual(["APT-1"]);
    expect(memory.rows(appointments).map(row => row.reminder_sent)).toEqual([1, 0]);
  });
});

describe("rendez-vous payés restés sans leurs envois (DATA-12)", () => {
  // Ten days after the recovery went live.
  const recoveryNow = new Date(PAID_APPOINTMENT_JOB_RECOVERY_SINCE.getTime() + 240 * HOUR);
  const yesterday = new Date(recoveryNow.getTime() - 24 * HOUR);
  const seedJob = (appointmentId: number, jobType: string) => memory.seed(appointmentFulfillmentJobs, [{ appointment_id: appointmentId, job_type: jobType, status: "completed", attempts: 1 }]);

  it("remet en file les envois d’un rendez-vous payé et confirmé de la dernière semaine sans tâche de confirmation ou de facture, créé depuis la mise en service de la reprise", async () => {
    const onlyOwner = seedAppointment(1, { createdAt: yesterday });
    seedJob(1, "owner");
    seedAppointment(2, { createdAt: yesterday });
    seedAppointment(3, { createdAt: new Date(recoveryNow.getTime() - 6 * 24 * HOUR) });
    seedJob(3, "confirmation");
    seedAppointment(4, { createdAt: yesterday });
    for (const jobType of ["owner", "confirmation", "invoice"]) seedJob(4, jobType);
    // Older than the recovery, refunded, unpaid, cancelled: never replayed.
    seedAppointment(5, { createdAt: new Date(PAID_APPOINTMENT_JOB_RECOVERY_SINCE.getTime() - HOUR) });
    seedAppointment(6, { createdAt: yesterday, payment_status: "refunded" });
    seedAppointment(7, { createdAt: yesterday, payment_status: "pending", appointment_status: "held" });
    seedAppointment(8, { createdAt: yesterday, appointment_status: "cancelled" });
    // Booked eight days ago, after the go-live: past the window, its completed jobs may already be purged.
    seedAppointment(9, { createdAt: new Date(recoveryNow.getTime() - 8 * 24 * HOUR) });

    await expect(requeuePaidAppointmentsWithoutFulfillment(25, recoveryNow)).resolves.toEqual({ requeued: 3 });
    expect(fulfillment.enqueueAppointmentFulfillment.mock.calls.map(([id]) => id)).toEqual([onlyOwner.id, 2, 3]);
  });

  it("le travail quotidien les remet en file avant de traiter la file, et traite la file même quand la reprise échoue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    seedAppointment(1, { createdAt: new Date(Math.max(PAID_APPOINTMENT_JOB_RECOVERY_SINCE.getTime(), Date.now() - HOUR)) });
    const order: string[] = [];
    fulfillment.enqueueAppointmentFulfillment.mockImplementationOnce(async () => { order.push("enqueue"); });
    fulfillment.processDueAppointmentFulfillmentJobs.mockImplementationOnce(async () => { order.push("process"); return { processed: 0, results: [] }; });

    await expect(runAppointmentFulfillmentWorker({ batchSize: 5, maxBatches: 4, budgetMs: 35_000 })).resolves.toMatchObject({ missingJobs: { requeued: 1 } });
    expect(order).toEqual(["enqueue", "process"]);

    memory.failNext(/^select "id" from "appointments"/);
    await expect(runAppointmentFulfillmentWorker({ batchSize: 5, maxBatches: 4, budgetMs: 35_000 })).resolves.toMatchObject({ missingJobs: null });
    expect(fulfillment.processDueAppointmentFulfillmentJobs).toHaveBeenCalledTimes(2);
  });
});

describe("traitement quotidien des documents du coffre", () => {
  it("analyse les documents en file même quand la recréation des tâches manquantes échoue (DATA-02)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    documentJobs.recreateMissingCandidateDocumentAnalysisJobs.mockRejectedValueOnce(new Error("candidate_document_database_unavailable"));
    documentJobs.processDueCandidateDocumentAnalysisJobs.mockResolvedValueOnce({ processed: 1, completed: 1, retried: 0, needsReview: 0, released: 0 });

    await expect(runCandidateDocumentProcessingWorker({ batchSize: 1, maxBatches: 6, budgetMs: 20_000 }))
      .resolves.toEqual({ jobsRecovered: 0, jobsExhausted: 0, jobsClosed: 0, jobsRecreated: 0, processed: 1, completed: 1, retried: 0, needsReview: 0, released: 0 });
    expect(documentJobs.processDueCandidateDocumentAnalysisJobs).toHaveBeenCalledTimes(2);
  });

  it("analyse les documents en file même quand la reprise des tâches interrompues échoue (EXPL-12)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    documentJobs.recoverStaleCandidateDocumentJobs.mockRejectedValueOnce(new Error("candidate_document_database_unavailable"));
    documentJobs.recreateMissingCandidateDocumentAnalysisJobs.mockResolvedValueOnce({ recreated: 1 });
    documentJobs.processDueCandidateDocumentAnalysisJobs.mockResolvedValueOnce({ processed: 1, completed: 0, retried: 1, needsReview: 0, released: 0 });

    await expect(runCandidateDocumentProcessingWorker({ batchSize: 1, maxBatches: 6, budgetMs: 20_000 }))
      .resolves.toEqual({ jobsRecovered: 0, jobsExhausted: 0, jobsClosed: 0, jobsRecreated: 1, processed: 1, completed: 0, retried: 1, needsReview: 0, released: 0 });
  });
});

describe("vidage quotidien par lots", () => {
  it("s’arrête dès qu’un lot est vide", async () => {
    const runBatch = vi.fn().mockResolvedValueOnce({ processed: 5 }).mockResolvedValueOnce({ processed: 0 });
    const result = await drainInBatches(runBatch, { maxBatches: 4, budgetMs: 60_000 });
    expect(runBatch).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(5);
  });

  it("respecte le nombre maximal de lots et le budget de temps", async () => {
    const runBatch = vi.fn(async () => ({ processed: 1 }));
    expect((await drainInBatches(runBatch, { maxBatches: 3, budgetMs: 60_000 })).processed).toBe(3);
    runBatch.mockClear();
    await drainInBatches(runBatch, { maxBatches: 3, budgetMs: 0 });
    expect(runBatch).toHaveBeenCalledTimes(1);
  });
});
