import { eq, sql } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const neonDriver = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@neondatabase/serverless", async importOriginal => ({
  ...(await importOriginal<typeof import("@neondatabase/serverless")>()),
  neon: vi.fn(() => neonDriver.client),
}));

import { appointments, availabilitySlots, candidateAccounts, cvApplications, users } from "../drizzle/schema";
import { getDb, LANGUAGE_COLUMNS_RETRY_DELAY_MS, resetDbForTests } from "./db";
import { ensureLanguageColumns, LANGUAGE_COLUMN_DDL, LANGUAGE_COLUMN_TABLES, resetLanguageColumnsMemo } from "./languageColumns";

// EN-01 / EN-02 — colonne « language » ajoutée à l’exécution tant que la
// migration 0002 n’est pas appliquée, une seule fois par instance, sans faire
// attendre les requêtes qui ne touchent pas ces tables.

const dialect = new PgDialect();
const textOf = (query: Parameters<PgDialect["sqlToQuery"]>[0]) => dialect.sqlToQuery(query).sql;
const alteredTable = (text: string) => /ALTER TABLE "([a-z_]+)"/.exec(text)?.[1];
const isCheck = (text: string) => text.includes("to_regclass");

/** Database double: `missing` lists the tables still without the column; ALTER adds it. */
function fakeDatabase(options: { missing: string[]; alterFailures?: Record<string, unknown> }) {
  const missing = new Set(options.missing);
  const executed: string[] = [];
  const db = {
    execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const text = textOf(query);
      executed.push(text);
      const table = alteredTable(text);
      if (table) {
        const failure = options.alterFailures?.[table];
        if (failure) {
          if ((failure as { addsColumn?: boolean }).addsColumn) missing.delete(table);
          throw (failure as { error: unknown }).error;
        }
        missing.delete(table);
        return { rows: [] };
      }
      return { rows: [...missing].map(name => ({ name })) };
    }),
  };
  return { db, executed, missing };
}

type Reply = { rows: unknown[] };
type Deferred = { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void };

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

/**
 * Neon HTTP double behind the real Drizzle driver. Like a NeonQueryPromise, a
 * query is sent (recorded in `sent`) only when awaited; `transaction` receives
 * the queries built by `db.batch`. A query on a table without the column fails
 * as PostgreSQL would (42703); `alter` can hold or fail the ALTER of a table.
 */
function neonDatabase(options: { missing?: string[]; alter?: (table: string) => Promise<void> } = {}) {
  const missing = new Set(options.missing ?? []);
  const sent: string[] = [];
  const answer = async (text: string): Promise<Reply> => {
    if (isCheck(text)) return { rows: [...missing].map(name => ({ name })) };
    const altered = alteredTable(text);
    if (altered) {
      await options.alter?.(altered);
      missing.delete(altered);
      return { rows: [] };
    }
    const table = LANGUAGE_COLUMN_TABLES.find(name => new RegExp(`\\b${name}\\b`).test(text));
    if (table && missing.has(table)) throw Object.assign(new Error(`column "language" of relation "${table}" does not exist`), { code: "42703" });
    return { rows: [] };
  };
  const send = (text: string) => {
    sent.push(text);
    return answer(text);
  };
  neonDriver.client = {
    query: vi.fn((text: string) => ({
      text,
      then: (onFulfilled?: (value: Reply) => unknown, onRejected?: (reason: unknown) => unknown) => send(text).then(onFulfilled, onRejected),
    })),
    transaction: vi.fn((queries: Array<{ text: string }>) => Promise.all(queries.map(query => send(query.text)))),
  };
  return { sent, missing };
}

const lockTimeout = Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });

beforeEach(() => {
  vi.clearAllMocks();
  resetLanguageColumnsMemo();
  resetDbForTests();
  vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db.example.test/app");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("colonnes de langue créées à l’exécution", () => {
  it("reprend exactement la déclaration Drizzle : varchar(10), 'fr' par défaut, non nulle", () => {
    for (const table of [appointments, cvApplications, candidateAccounts]) {
      const config = getTableConfig(table);
      const column = config.columns.find(item => item.name === "language")!;
      expect(column.getSQLType(), config.name).toBe("varchar(10)");
      expect(column.default).toBe("fr");
      expect(column.notNull).toBe(true);
      expect(LANGUAGE_COLUMN_TABLES).toContain(config.name);
    }
    for (const statement of LANGUAGE_COLUMN_DDL) {
      expect(textOf(statement)).toMatch(/^ALTER TABLE "[a-z_]+" ADD COLUMN IF NOT EXISTS "language" varchar\(10\) DEFAULT 'fr' NOT NULL$/);
    }
  });

  it("n’envoie aucune DDL quand les colonnes existent (0002 appliquée, rôle sans droit de modification)", async () => {
    const { db, executed } = fakeDatabase({ missing: [] });
    await ensureLanguageColumns(db);
    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain("to_regclass");
    expect(executed[0]).toContain("pg_attribute");
  });

  it("ajoute seulement les colonnes manquantes, une seule fois par instance, avec une attente du verrou bornée à 2 s", async () => {
    const { db, executed } = fakeDatabase({ missing: ["appointments", "cv_applications"] });
    await ensureLanguageColumns(db);
    await ensureLanguageColumns(db);
    const alters = executed.filter(text => alteredTable(text));
    // neon-http has no interactive transaction: SET LOCAL and the ALTER share one DO block.
    expect(alters).toEqual([
      `DO $$ BEGIN SET LOCAL lock_timeout = '2s'; ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "language" varchar(10) DEFAULT 'fr' NOT NULL; END $$`,
      `DO $$ BEGIN SET LOCAL lock_timeout = '2s'; ALTER TABLE "cv_applications" ADD COLUMN IF NOT EXISTS "language" varchar(10) DEFAULT 'fr' NOT NULL; END $$`,
    ]);
    expect(executed.filter(isCheck)).toHaveLength(1);
  });

  it("considère un ajout concurrent par une autre instance comme réussi, et propage les autres erreurs", async () => {
    const concurrent = { error: Object.assign(new Error("Failed query"), { cause: { code: "42701" } }), addsColumn: true };
    await expect(ensureLanguageColumns(fakeDatabase({ missing: ["candidate_accounts"], alterFailures: { candidate_accounts: concurrent } }).db)).resolves.toBeUndefined();

    for (const error of [Object.assign(new Error("must be owner of table appointments"), { code: "42501" }), lockTimeout]) {
      resetLanguageColumnsMemo();
      const failing = fakeDatabase({ missing: ["appointments"], alterFailures: { appointments: { error } } });
      await expect(ensureLanguageColumns(failing.db)).rejects.toBe(error);
      // A failure is not memoised: the next call checks again.
      await expect(ensureLanguageColumns(failing.db)).rejects.toBe(error);
      expect(failing.executed.filter(isCheck)).toHaveLength(2);
    }
  });
});

describe("getDb() : seules les requêtes sur ces tables attendent les colonnes", () => {
  it("colonnes présentes : aucune DDL, une seule lecture du catalogue, et seulement à la première requête sur ces tables", async () => {
    const { sent } = neonDatabase();
    const db = (await getDb())!;
    await db.select().from(availabilitySlots);
    await db.execute(sql`select 1`);
    expect(sent.filter(isCheck)).toHaveLength(0);

    await db.select().from(appointments);
    await db.select().from(candidateAccounts).where(eq(candidateAccounts.id, 1));
    await db.update(cvApplications).set({ language: "en" }).where(eq(cvApplications.id, 1));
    expect(sent.filter(isCheck)).toHaveLength(1);
    expect(sent.filter(text => alteredTable(text))).toEqual([]);
    expect(sent.filter(text => text.includes('"appointments"'))).toHaveLength(1);
  });

  it("colonnes absentes : un seul ALTER par table pour des requêtes simultanées, envoyées après lui", async () => {
    const { sent, missing } = neonDatabase({ missing: [...LANGUAGE_COLUMN_TABLES] });
    const db = (await getDb())!;
    await expect(Promise.all([
      db.select().from(appointments),
      db.select().from(appointments).where(eq(appointments.trackingId, "APT1")),
      db.select().from(cvApplications),
      db.update(candidateAccounts).set({ language: "en" }).where(eq(candidateAccounts.id, 1)),
      db.execute(sql`INSERT INTO cv_applications (tracking_id, language) VALUES (${"CV1"}, ${"en"})`),
      db.batch([db.update(cvApplications).set({ language: "zh" }).where(eq(cvApplications.id, 2)), db.select().from(users)]),
    ])).resolves.toHaveLength(6);

    expect(missing.size).toBe(0);
    expect(sent.filter(isCheck)).toHaveLength(1);
    const alters = sent.map((text, index) => [alteredTable(text), index] as const).filter(([table]) => table);
    expect(alters.map(([table]) => table)).toEqual(["appointments", "candidate_accounts", "cv_applications"]);
    const lastAlter = alters.at(-1)![1];
    sent.forEach((text, index) => {
      if (!isCheck(text) && !alteredTable(text) && !text.includes('"users"')) expect(index, text).toBeGreaterThan(lastAlter);
    });
  });

  it("verrou indisponible : pas de blocage global, les requêtes sur ces tables repartent après l’échec, journalisé une fois", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-25T10:00:00Z"), toFake: ["Date"] });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lockWait = deferred();
    let lock: "held" | "timeout" | "free" = "held";
    const alter = () => (lock === "held" ? lockWait.promise : lock === "timeout" ? Promise.reject(lockTimeout) : Promise.resolve());
    const { sent } = neonDatabase({ missing: ["appointments"], alter });
    const db = (await getDb())!;

    // Two bookings wait for the ALTER, which waits for the lock held by a long query.
    const first = db.select().from(appointments);
    const second = db.select().from(appointments).where(eq(appointments.id, 2));
    const settled = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(sent.some(text => alteredTable(text))).toBe(true));

    // Meanwhile the rest of the site answers: availability, health check, users.
    await expect(db.select().from(availabilitySlots)).resolves.toEqual([]);
    await expect(db.execute(sql`select 1`)).resolves.toEqual({ rows: [] });
    await expect(db.select().from(users)).resolves.toEqual([]);
    expect(sent.filter(text => text.includes('"appointments"') && !alteredTable(text))).toHaveLength(0);

    // PostgreSQL gives up after lock_timeout (55P03): the bookings are sent at once,
    // without the column (the owner applies 0002), and nothing stays stuck.
    lockWait.reject(lockTimeout);
    const columnMissing = { status: "rejected", reason: { cause: { code: "42703" } } };
    expect(await settled).toMatchObject([columnMissing, columnMissing]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[Database] Language columns check failed:", "Error", "55P03");

    // Within the delay, no new check or ALTER: the queries go straight through.
    await expect(db.select().from(appointments)).rejects.toThrow();
    expect(sent.filter(isCheck)).toHaveLength(1);
    expect(sent.filter(text => alteredTable(text))).toHaveLength(1);

    // After the delay, the next query on the table checks again. A second
    // timeout is not logged again; once the lock is free the column is added.
    lock = "timeout";
    vi.setSystemTime(Date.now() + LANGUAGE_COLUMNS_RETRY_DELAY_MS);
    await expect(db.select().from(appointments)).rejects.toThrow();
    lock = "free";
    vi.setSystemTime(Date.now() + LANGUAGE_COLUMNS_RETRY_DELAY_MS);
    await expect(db.select().from(appointments)).resolves.toEqual([]);
    expect(sent.filter(isCheck)).toHaveLength(3);
    expect(sent.filter(text => alteredTable(text))).toHaveLength(3);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("ne fait rien sans base configurée", async () => {
    vi.stubEnv("DATABASE_URL", "");
    neonDatabase();
    await expect(getDb()).resolves.toBeNull();
  });
});
