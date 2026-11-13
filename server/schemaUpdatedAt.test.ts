import { eq } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";
import { appointments, candidateAccounts, gdprRequests, medicalQuestions } from "../drizzle/schema";
import { createMemoryPg } from "./testing/memoryPgProxy";

// DATA-09: a row's last modification date follows every change Drizzle
// writes, whatever the code sets, except on candidate_accounts, where a failed
// sign-in must not look like activity.

const NOW = new Date("2026-11-13T10:00:00.000Z");
const CREATED = "2026-01-05 08:00:00";

const tablesWithUpdatedAt = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => value instanceof PgTable)
  .filter(table => "updatedAt" in table);

describe("date de dernière modification (updatedAt)", () => {
  it("avance à chaque modification écrite par Drizzle, sur toutes les tables sauf les comptes candidats", async () => {
    expect(tablesWithUpdatedAt.length).toBeGreaterThanOrEqual(18);
    const memory = createMemoryPg(tablesWithUpdatedAt, { now: () => NOW });
    const moved: string[] = [];
    for (const table of tablesWithUpdatedAt) {
      const { name, columns } = getTableConfig(table);
      const updatedAtColumn = columns.find(column => column.name === "updatedAt" || column.name === "updated_at")!.name;
      const [row] = memory.seed(table, [{ [updatedAtColumn]: CREATED }]);
      const id = (table as unknown as { id: Parameters<typeof eq>[0] }).id;
      // A change that names nothing but the row itself.
      await memory.db.update(table).set({ id: row!.id } as never).where(eq(id, row!.id));
      if (memory.rows(table)[0]![updatedAtColumn] !== CREATED) moved.push(name);
    }
    expect(moved).toHaveLength(tablesWithUpdatedAt.length - 1);
    expect(moved).not.toContain("candidate_accounts");
  });

  it("date un rendez-vous remboursé, une question répondue et une demande RGPD traitée, sans que le code l’écrive", async () => {
    const memory = createMemoryPg([appointments, medicalQuestions, gdprRequests, candidateAccounts], { now: () => NOW });
    const [appointment] = memory.seed(appointments, [{ updatedAt: CREATED, payment_status: "completed" }]);
    const [question] = memory.seed(medicalQuestions, [{ updated_at: CREATED, status: "submitted" }]);
    const [request] = memory.seed(gdprRequests, [{ updatedAt: CREATED, status: "pending" }]);
    const [account] = memory.seed(candidateAccounts, [{ updated_at: CREATED, failed_login_count: 0 }]);

    await memory.db.update(appointments).set({ paymentStatus: "refunded" }).where(eq(appointments.id, appointment!.id as number));
    await memory.db.update(medicalQuestions).set({ status: "answered" }).where(eq(medicalQuestions.id, question!.id as number));
    await memory.db.update(gdprRequests).set({ status: "in_progress" }).where(eq(gdprRequests.id, request!.id as number));
    // A failed sign-in.
    await memory.db.update(candidateAccounts).set({ failedLoginCount: 1 }).where(eq(candidateAccounts.id, account!.id as number));

    const [refunded] = await memory.db.select({ updatedAt: appointments.updatedAt }).from(appointments);
    const [answered] = await memory.db.select({ updatedAt: medicalQuestions.updatedAt }).from(medicalQuestions);
    const [handled] = await memory.db.select({ updatedAt: gdprRequests.updatedAt }).from(gdprRequests);
    const [signInFailed] = await memory.db.select({ updatedAt: candidateAccounts.updatedAt }).from(candidateAccounts);
    expect([refunded!.updatedAt, answered!.updatedAt, handled!.updatedAt].map(date => date.getTime()).every(time => Math.abs(time - Date.now()) < 60_000)).toBe(true);
    expect(signInFailed!.updatedAt.toISOString()).toBe("2026-01-05T08:00:00.000Z");
  });
});
