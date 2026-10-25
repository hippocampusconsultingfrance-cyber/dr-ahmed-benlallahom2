import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const driver = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn(() => "neon-client") }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: vi.fn(() => ({ execute: driver.execute })) }));

import { getTableConfig } from "drizzle-orm/pg-core";
import { appointments, candidateAccounts, cvApplications } from "../drizzle/schema";
import { getDb, LANGUAGE_COLUMNS_RETRY_DELAY_MS, resetDbForTests } from "./db";
import { ensureLanguageColumns, LANGUAGE_COLUMN_DDL, LANGUAGE_COLUMN_TABLES, resetLanguageColumnsMemo } from "./languageColumns";

// EN-01 / EN-02 — colonne « language » ajoutée à l’exécution tant que la
// migration 0002 n’est pas appliquée, une seule fois par instance.

const dialect = new PgDialect();
const textOf = (query: Parameters<PgDialect["sqlToQuery"]>[0]) => dialect.sqlToQuery(query).sql;

/** Database double: `missing` lists the tables still without the column; ALTER adds it. */
function fakeDatabase(options: { missing: string[]; alterFailures?: Record<string, unknown> }) {
  const missing = new Set(options.missing);
  const executed: string[] = [];
  const db = {
    execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const text = textOf(query);
      executed.push(text);
      if (text.startsWith("ALTER TABLE")) {
        const table = /ALTER TABLE "([a-z_]+)"/.exec(text)![1];
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

beforeEach(() => {
  vi.clearAllMocks();
  resetLanguageColumnsMemo();
  resetDbForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
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

  it("ajoute seulement les colonnes manquantes, une seule fois par instance", async () => {
    const { db, executed } = fakeDatabase({ missing: ["appointments", "cv_applications"] });
    await ensureLanguageColumns(db);
    await ensureLanguageColumns(db);
    const alters = executed.filter(text => text.startsWith("ALTER TABLE"));
    expect(alters).toEqual([
      `ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "language" varchar(10) DEFAULT 'fr' NOT NULL`,
      `ALTER TABLE "cv_applications" ADD COLUMN IF NOT EXISTS "language" varchar(10) DEFAULT 'fr' NOT NULL`,
    ]);
    expect(executed.filter(text => text.includes("to_regclass"))).toHaveLength(1);
  });

  it("considère un ajout concurrent par une autre instance comme réussi, et propage les autres erreurs", async () => {
    const concurrent = { error: Object.assign(new Error("Failed query"), { cause: { code: "42701" } }), addsColumn: true };
    await expect(ensureLanguageColumns(fakeDatabase({ missing: ["candidate_accounts"], alterFailures: { candidate_accounts: concurrent } }).db)).resolves.toBeUndefined();

    resetLanguageColumnsMemo();
    const denied = { error: Object.assign(new Error("must be owner of table appointments"), { code: "42501" }) };
    const failing = fakeDatabase({ missing: ["appointments"], alterFailures: { appointments: denied } });
    await expect(ensureLanguageColumns(failing.db)).rejects.toThrow("must be owner");
    // A failure is not memoised: the next call checks again.
    await expect(ensureLanguageColumns(failing.db)).rejects.toThrow("must be owner");
    expect(failing.executed.filter(text => text.includes("to_regclass"))).toHaveLength(2);
  });
});

describe("getDb() ajoute les colonnes avant la première requête", () => {
  it("vérifie une fois par instance puis rend la connexion", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db.example.test/app");
    driver.execute.mockImplementation(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const text = textOf(query);
      return { rows: text.includes("to_regclass") ? [{ name: "appointments" }] : [] };
    });
    const db = await getDb();
    expect(db).not.toBeNull();
    await getDb();
    const statements = driver.execute.mock.calls.map(([query]) => textOf(query));
    expect(statements.filter(text => text.includes("to_regclass"))).toHaveLength(1);
    expect(statements.filter(text => text.startsWith("ALTER TABLE"))).toEqual([expect.stringContaining('"appointments"')]);
  });

  it("rend la connexion même si la vérification échoue, et ne la retente qu’après le délai", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-25T10:00:00Z") });
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db.example.test/app");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    driver.execute.mockRejectedValue(new Error("fetch failed"));
    await expect(getDb()).resolves.not.toBeNull();
    await expect(getDb()).resolves.not.toBeNull();
    expect(driver.execute).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[Database] Language columns check failed:", "Error");

    vi.setSystemTime(Date.now() + LANGUAGE_COLUMNS_RETRY_DELAY_MS);
    driver.execute.mockResolvedValue({ rows: [] });
    await getDb();
    expect(driver.execute).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("ne fait rien sans base configurée", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(getDb()).resolves.toBeNull();
    expect(driver.execute).not.toHaveBeenCalled();
  });
});
