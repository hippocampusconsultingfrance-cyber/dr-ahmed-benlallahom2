import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appointments, availabilitySlots, blockedDates } from "../drizzle/schema";

// SEC-07 / BOOK-BLOCKREASON (dates bloquées publiques sans motif, futures seulement)
// et ADM-AVAIL-01 (validation serveur des créneaux et dates, avertissement RDV payés).

const database = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: database.getDb }));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
  isAdminMfaVerified: vi.fn(async () => true),
}));

import { appRouter, parisDateKey } from "./routers";

const dialect = new PgDialect();

function context(admin: boolean): TrpcContext {
  return {
    user: admin ? ({ openId: "test-admin", role: "admin" } as TrpcContext["user"]) : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

/** Select results served per table, in order; records selected columns, WHERE clauses and inserts. */
function fakeDb(results: Map<unknown, unknown[][]>) {
  const selects: Array<{ table: unknown; columns: unknown; where?: SQL }> = [];
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const db = {
    select: vi.fn((columns?: unknown) => ({
      from: (table: unknown) => {
        const entry: { table: unknown; columns: unknown; where?: SQL } = { table, columns };
        selects.push(entry);
        const next = () => results.get(table)?.shift() ?? [];
        const chain = {
          where: (where: SQL) => { entry.where = where; return chain; },
          limit: async () => next(),
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(next()).then(resolve, reject),
        };
        return chain;
      },
    })),
    insert: vi.fn((table: unknown) => ({ values: async (values: unknown) => { inserts.push({ table, values }); return { rowCount: 1 }; } })),
  };
  database.getDb.mockResolvedValue(db);
  return { selects, inserts };
}

const futureDate = () => parisDateKey(new Date(Date.now() + 10 * 86_400_000));

beforeEach(() => vi.clearAllMocks());

describe("dates bloquées publiques", () => {
  it("ne renvoie que la date (jamais le motif), et seulement à partir d’aujourd’hui", async () => {
    const { selects } = fakeDb(new Map([[blockedDates, [[{ date: futureDate() }]]]]));
    const result = await appRouter.createCaller(context(false)).availability.getBlockedDates();
    expect(result).toEqual([{ date: futureDate() }]);
    expect(Object.keys(selects[0].columns as object)).toEqual(["date"]);
    const { sql, params } = dialect.sqlToQuery(selects[0].where!);
    expect(sql).toContain('"blocked_dates"."date" >=');
    expect(params).toEqual([parisDateKey(new Date())]);
  });
});

describe("administration des disponibilités — validation serveur", () => {
  const admin = () => appRouter.createCaller(context(true)).admin.availability;

  it("refuse des heures impossibles, une plage de durée nulle et un doublon", async () => {
    fakeDb(new Map());
    await expect(admin().addSlot({ dayOfWeek: 1, startTime: "25:99", endTime: "26:00" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin().addSlot({ dayOfWeek: 1, startTime: "09:00", endTime: "09:00" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin().addSlot({ dayOfWeek: 7, startTime: "09:00", endTime: "10:00" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    fakeDb(new Map([[availabilitySlots, [[{ id: 3 }]]]]));
    await expect(admin().addSlot({ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" })).rejects.toMatchObject({ code: "CONFLICT" });

    const { inserts } = fakeDb(new Map([[availabilitySlots, [[]]]]));
    // Plage de nuit (fin le lendemain) : prise en charge par l’agenda.
    await expect(admin().addSlot({ dayOfWeek: 5, startTime: "22:00", endTime: "02:00" })).resolves.toEqual({ success: true });
    expect(inserts[0]).toMatchObject({ table: availabilitySlots, values: { dayOfWeek: 5, startTime: "22:00", endTime: "02:00" } });
  });

  it("refuse une date impossible, passée ou déjà bloquée", async () => {
    fakeDb(new Map());
    await expect(admin().addBlockedDate({ date: "2026-13-45" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin().addBlockedDate({ date: "2020-01-01" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Cette date est déjà passée." });
    fakeDb(new Map([[blockedDates, [[{ id: 1 }]]]]));
    await expect(admin().addBlockedDate({ date: futureDate() })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("avertit avant de bloquer un jour qui porte des rendez-vous payés, puis bloque après confirmation", async () => {
    const paid = [{ trackingId: "APTPAID00001", appointmentDate: new Date(`${futureDate()}T08:00:00Z`) }];
    let db = fakeDb(new Map<unknown, unknown[][]>([[blockedDates, [[]]], [appointments, [paid]]]));
    await expect(admin().addBlockedDate({ date: futureDate(), reason: "Congrès" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("APTPAID00001") });
    expect(db.inserts).toHaveLength(0);

    db = fakeDb(new Map<unknown, unknown[][]>([[blockedDates, [[]]], [appointments, [paid]]]));
    await expect(admin().addBlockedDate({ date: futureDate(), reason: "Congrès", acknowledgePaidAppointments: true }))
      .resolves.toEqual({ success: true, paidAppointments: ["APTPAID00001"] });
    expect(db.inserts[0]).toMatchObject({ table: blockedDates, values: { date: futureDate(), reason: "Congrès" } });

    db = fakeDb(new Map<unknown, unknown[][]>([[blockedDates, [[]]], [appointments, [[]]]]));
    await expect(admin().addBlockedDate({ date: futureDate() })).resolves.toEqual({ success: true, paidAppointments: [] });
  });

  it("présente le motif comme une note interne et confirme la suppression d’un créneau", () => {
    const source = readFileSync(new URL("../client/src/pages/AdminDashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("Motif interne (optionnel, jamais affiché sur le site)");
    expect(source).toContain("if (!window.confirm(`Supprimer le créneau");
    expect(source).toContain('e.data?.code === "PRECONDITION_FAILED" && !variables.acknowledgePaidAppointments');
  });
});
