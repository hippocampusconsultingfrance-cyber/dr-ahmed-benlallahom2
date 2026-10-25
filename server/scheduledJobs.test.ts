import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ getDb: vi.fn() }));
const notifications = vi.hoisted(() => ({ sendReminderEmail: vi.fn(async () => undefined) }));
vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./_core/notifications", () => notifications);
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));

import {
  DAILY_REMINDER_WINDOW,
  HOURLY_REMINDER_WINDOW,
  drainInBatches,
  reminderWindowBounds,
  sendDueAppointmentReminders,
} from "./scheduledJobs";

const dialect = new PgDialect();
const HOUR = 60 * 60 * 1000;

function fakeDatabase(upcoming: unknown[], claimRowCounts: number[]) {
  const rowCounts = [...claimRowCounts];
  const writes: Array<{ values: Record<string, unknown>; where: SQL }> = [];
  const db = {
    select: vi.fn(() => ({ from: () => ({ where: async () => upcoming }) })),
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => {
          writes.push({ values, where });
          return Promise.resolve({ rowCount: values.reminderSent === 1 ? rowCounts.shift() ?? 1 : 1 });
        },
      }),
    })),
  };
  database.getDb.mockResolvedValue(db);
  return { writes };
}

const appointment = (id: number, language = "fr") => ({ id, customerEmail: `p${id}@example.com`, customerName: `Patient ${id}`, trackingId: `APT-${id}`, appointmentDate: new Date("2026-10-08T09:00:00Z"), language });

beforeEach(() => vi.clearAllMocks());

describe("fenêtres de rappel", () => {
  it("garde 22–26 h pour le Heartbeat horaire", () => {
    const now = new Date("2026-10-07T16:45:00Z");
    expect(reminderWindowBounds(HOURLY_REMINDER_WINDOW, now)).toEqual({ from: new Date("2026-10-08T14:45:00Z"), to: new Date("2026-10-08T18:45:00Z") });
  });

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
  it("revendique chaque rendez-vous avant l’envoi pour ne jamais doubler un rappel", async () => {
    const { writes } = fakeDatabase([appointment(1), appointment(2)], [1, 0]);

    const result = await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW);

    expect(result).toEqual({ reminded: 2, sent: 1, failed: 0 });
    expect(notifications.sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(notifications.sendReminderEmail).toHaveBeenCalledWith("p1@example.com", "Patient 1", "APT-1", expect.any(Date), { language: "fr" });
    const { sql, params } = dialect.sqlToQuery(writes[0].where);
    expect(sql).toContain('"reminder_sent" =');
    expect(params).toEqual([1, 0]);
  });

  it("envoie le rappel en anglais pour une réservation faite dans une autre langue que le français (EN-01)", async () => {
    fakeDatabase([appointment(4, "zh")], [1]);

    await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW);

    expect(notifications.sendReminderEmail).toHaveBeenCalledWith("p4@example.com", "Patient 4", "APT-4", expect.any(Date), { language: "en" });
  });

  it("libère la revendication quand l’email échoue, pour un nouvel essai", async () => {
    notifications.sendReminderEmail.mockRejectedValueOnce(new Error("reminder_email_failed"));
    const { writes } = fakeDatabase([appointment(3)], [1]);

    const result = await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW);

    expect(result).toEqual({ reminded: 1, sent: 0, failed: 1 });
    expect(writes.map(write => write.values)).toEqual([{ reminderSent: 1 }, { reminderSent: 0 }]);
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
