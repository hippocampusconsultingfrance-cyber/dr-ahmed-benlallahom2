import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentInvoices } from "../drizzle/schema";

const database = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: database.getDb }));

import {
  allocateAppointmentInvoice,
  APPOINTMENT_INVOICE_DDL,
  APPOINTMENT_INVOICE_SCHEMA_OBJECTS,
  ensureInvoiceSchema,
  formatInvoiceNumber,
  invoiceSeriesFor,
  resetInvoiceSchemaMemo,
} from "./invoiceNumbering";

const dialect = new PgDialect();

function fakeDatabase(options: { selects: unknown[][]; executeFailures?: unknown[] }) {
  const selects = [...options.selects];
  const failures = [...(options.executeFailures ?? [])];
  const executed: string[] = [];
  const db = {
    execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const text = dialect.sqlToQuery(query).sql;
      executed.push(text);
      if (text.includes("INSERT INTO") && failures.length) throw failures.shift();
      return { rows: [] };
    }),
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: async () => selects.shift() ?? [] }) }),
    })),
  };
  database.getDb.mockResolvedValue(db);
  return { db, executed };
}

const record = { invoiceNumber: "FAC-2026-000001", issuedAt: new Date("2026-10-11T22:46:00Z"), paidAt: new Date("2026-10-11T22:45:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  resetInvoiceSchemaMemo();
});

describe("numérotation séquentielle des factures", () => {
  it("rattache la série à l’année civile de Paris", () => {
    expect(invoiceSeriesFor(new Date("2026-12-31T22:30:00Z"))).toBe("FAC-2026");
    expect(invoiceSeriesFor(new Date("2026-12-31T23:30:00Z"))).toBe("FAC-2027"); // 00:30 le 1er janvier à Paris
    expect(formatInvoiceNumber("FAC-2026", 1)).toBe("FAC-2026-000001");
    expect(formatInvoiceNumber("FAC-2026", 1234567)).toBe("FAC-2026-1234567");
  });

  it("crée la table de façon idempotente, sans migration manuelle, à l’identique du schéma Drizzle", () => {
    const statements = APPOINTMENT_INVOICE_DDL.map(statement => dialect.sqlToQuery(statement).sql);
    expect(statements.every(statement => /IF NOT EXISTS/.test(statement))).toBe(true);
    const config = getTableConfig(appointmentInvoices);
    for (const column of config.columns) expect(statements[0]).toContain(`"${column.name}"`);
    for (const index of config.indexes) expect(statements.join("\n")).toContain(`"${index.config.name}"`);
  });

  it("n’envoie aucune DDL quand la table et ses index existent (rôle sans droit CREATE ni propriété)", async () => {
    const executed: string[] = [];
    const db = {
      execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const text = dialect.sqlToQuery(query).sql;
        executed.push(text);
        if (text.startsWith("CREATE")) throw Object.assign(new Error("must be owner of table appointment_invoices"), { code: "42501" });
        return { rows: APPOINTMENT_INVOICE_SCHEMA_OBJECTS.map(name => ({ name })) };
      }),
    };
    await expect(ensureInvoiceSchema(db as never)).resolves.toBeUndefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain("to_regclass");
  });

  it("considère une création concurrente par une autre instance comme réussie, et propage les autres erreurs", async () => {
    const run = async (failure: { code: string }, existsAfter: boolean) => {
      resetInvoiceSchemaMemo();
      let created = false;
      const db = {
        execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          const text = dialect.sqlToQuery(query).sql;
          if (text.startsWith("CREATE TABLE")) {
            created = existsAfter;
            throw Object.assign(new Error("Failed query"), { cause: failure });
          }
          if (text.startsWith("CREATE")) return { rows: [] };
          return { rows: created ? [{ name: "appointment_invoices" }] : [] };
        }),
      };
      return ensureInvoiceSchema(db as never);
    };
    for (const code of ["42P07", "42710", "23505"]) await expect(run({ code }, true)).resolves.toBeUndefined();
    await expect(run({ code: "42P07" }, false)).rejects.toThrow("Failed query");
    await expect(run({ code: "42501" }, true)).rejects.toThrow("Failed query");
  });

  it("attribue le numéro une seule fois et le relit ensuite", async () => {
    const { executed } = fakeDatabase({ selects: [[], [record]] });
    const first = await allocateAppointmentInvoice({ appointmentId: 7, paidAt: record.paidAt, now: record.issuedAt });
    expect(first).toEqual(record);
    const inserts = executed.filter(statement => statement.includes("INSERT INTO"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toContain('COALESCE(MAX("invoice_sequence"), 0) + 1');
    expect(inserts[0]).toContain('ON CONFLICT ("appointment_id") DO NOTHING');

    const second = fakeDatabase({ selects: [[record]] });
    await expect(allocateAppointmentInvoice({ appointmentId: 7, paidAt: new Date(), now: new Date() })).resolves.toEqual(record);
    expect(second.executed.filter(statement => statement.includes("INSERT INTO"))).toHaveLength(0);
  });

  it("réessaie quand une attribution concurrente a pris le même rang", async () => {
    const conflict = Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
    const { executed } = fakeDatabase({ selects: [[], [record]], executeFailures: [conflict] });
    await expect(allocateAppointmentInvoice({ appointmentId: 7, paidAt: record.paidAt })).resolves.toEqual(record);
    expect(executed.filter(statement => statement.includes("INSERT INTO"))).toHaveLength(2);
  });

  it("propage les autres erreurs pour que le job soit réessayé", async () => {
    fakeDatabase({ selects: [[]], executeFailures: [new Error("connection reset")] });
    await expect(allocateAppointmentInvoice({ appointmentId: 7, paidAt: record.paidAt })).rejects.toThrow("connection reset");
  });
});
