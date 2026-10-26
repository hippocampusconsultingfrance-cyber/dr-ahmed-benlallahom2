import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointments } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";

const database = vi.hoisted(() => ({ getDb: vi.fn() }));
const notifications = vi.hoisted(() => ({ sendReminderEmail: vi.fn(async (..._args: unknown[]) => undefined) }));
vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./_core/notifications", () => notifications);
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./appointmentFulfillment", () => ({
  recoverStaleAppointmentFulfillmentJobs: vi.fn(async () => ({ recovered: 0 })),
  processDueAppointmentFulfillmentJobs: vi.fn(async () => ({ processed: 0, results: [] })),
}));
const documentJobs = vi.hoisted(() => ({
  recreateMissingCandidateDocumentAnalysisJobs: vi.fn(async () => ({ recreated: 0 })),
  processDueCandidateDocumentAnalysisJobs: vi.fn(async () => ({ processed: 0, completed: 0, retried: 0, needsReview: 0 })),
}));
vi.mock("./candidateDocumentProcessing", () => documentJobs);

import {
  DAILY_REMINDER_WINDOW,
  drainInBatches,
  reminderWindowBounds,
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
  memory = createMemoryPg([appointments]);
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
  it("réserve chaque rendez-vous avant l’envoi : le cron quotidien et le Heartbeat horaire simultanés n’envoient qu’un rappel chacun, marqué envoyé", async () => {
    // About 24 h ahead: inside both windows.
    seedAppointment(1, { appointment_date: new Date("2026-10-08T17:00:00Z") });
    seedAppointment(2, { appointment_date: new Date("2026-10-08T17:00:00Z") });
    seedAppointment(3, { reminder_sent: 1 });
    seedAppointment(4, { appointment_date: new Date("2026-10-10T09:00:00Z") });

    const [daily, hourly] = await Promise.all([sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW), sendDueAppointmentReminders(HOURLY_REMINDER_WINDOW, NOW)]);

    expect(daily.sent + hourly.sent).toBe(2);
    expect(remindedTrackingIds().sort()).toEqual(["APT-1", "APT-2"]);
    expect(notifications.sendReminderEmail).toHaveBeenCalledWith("p1@example.com", "Patient 1", "APT-1", expect.any(Date), { language: "fr" });
    expect(memory.rows(appointments).map(row => row.reminder_sent)).toEqual([1, 1, 1, 0]);
  });

  it("envoie le rappel en anglais pour une réservation faite dans une autre langue que le français (EN-01)", async () => {
    seedAppointment(4, { language: "zh" });

    await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, NOW);

    expect(notifications.sendReminderEmail).toHaveBeenCalledWith("p4@example.com", "Patient 4", "APT-4", expect.any(Date), { language: "en" });
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

  it("un rappel parti dont l’enregistrement échoue reste réservé : un passage rapproché ne le renvoie pas, le travail d’après-paiement le reprend dans les 24 h (DATA-02)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    seedAppointment(1);
    // Marking the reminder sent is refused after Resend accepted it.
    memory.failNext(/^update "appointments" set "reminder_sent" = \$1 where/);
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

describe("traitement quotidien des documents du coffre", () => {
  it("analyse les documents en file même quand la recréation des tâches manquantes échoue (DATA-02)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    documentJobs.recreateMissingCandidateDocumentAnalysisJobs.mockRejectedValueOnce(new Error("candidate_document_database_unavailable"));
    documentJobs.processDueCandidateDocumentAnalysisJobs.mockResolvedValueOnce({ processed: 1, completed: 1, retried: 0, needsReview: 0 });

    await expect(runCandidateDocumentProcessingWorker({ batchSize: 1, maxBatches: 6, budgetMs: 20_000 }))
      .resolves.toEqual({ jobsRecreated: 0, processed: 1, completed: 1, retried: 0, needsReview: 0 });
    expect(documentJobs.processDueCandidateDocumentAnalysisJobs).toHaveBeenCalledTimes(2);
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
