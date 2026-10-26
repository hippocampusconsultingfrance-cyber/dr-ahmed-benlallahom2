import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../drizzle/schema";

const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

type SnapshotTable = { name: string; columns: Record<string, { name: string; type: string; notNull: boolean }>; indexes: Record<string, unknown> };
type Snapshot = { dialect: string; tables: Record<string, SnapshotTable> };

function latestPgSnapshot(): Snapshot {
  const journal = JSON.parse(read("drizzle/pg/meta/_journal.json")) as { dialect: string; entries: { idx: number; tag: string }[] };
  expect(journal.dialect).toBe("postgresql");
  const last = [...journal.entries].sort((a, b) => b.idx - a.idx)[0];
  return JSON.parse(read(`drizzle/pg/meta/${String(last.idx).padStart(4, "0")}_snapshot.json`)) as Snapshot;
}

const schemaTables = Object.values(schema)
  .filter((value): value is PgTable => value instanceof PgTable)
  .map(table => getTableConfig(table));

describe("source de vérité des migrations Drizzle (M32)", () => {
  it("aligne la documentation avec la sortie PostgreSQL déclarée dans la configuration", () => {
    const config = read("drizzle.config.ts");
    const guide = read("drizzle/MIGRATION_SOURCE_OF_TRUTH.md");
    expect(config).toContain('out: "./drizzle/pg"');
    expect(config).toContain('dialect: "postgresql"');
    expect(guide).toContain("drizzle.config.ts");
    expect(guide).toContain("source de vérité");
    expect(guide).toContain("drizzle/pg/");
    // L'ancien dossier manuel reste documenté comme historique.
    expect(guide).toContain("drizzle/migrations/");
    expect(guide).toContain("drizzle/legacy-mysql/");
  });

  it("isole l'historique MySQL, jamais lu par drizzle-kit", () => {
    const legacyJournal = JSON.parse(read("drizzle/legacy-mysql/meta/_journal.json")) as { dialect: string };
    expect(legacyJournal.dialect).toBe("mysql");
    expect(read("drizzle/legacy-mysql/README.md")).toMatch(/NE PAS EXÉCUTER/);
    expect(existsSync(new URL("../drizzle/meta", import.meta.url))).toBe(false);
    expect(readdirSync(new URL("../drizzle", import.meta.url)).filter(name => name.endsWith(".sql"))).toEqual([]);
    expect(read("package.json")).not.toContain("db:push");
  });

  it("ne contient que du SQL PostgreSQL dans drizzle/pg", () => {
    const folder = new URL("../drizzle/pg/", import.meta.url);
    const files = readdirSync(folder).filter(name => name.endsWith(".sql"));
    expect(files[0]).toBe("0000_baseline.sql");
    for (const file of files) {
      const sql = readFileSync(new URL(file, folder), "utf8");
      expect(sql, file).not.toMatch(/AUTO_INCREMENT|\bENUM\(|MODIFY COLUMN|`/i);
    }
  });

  it("couvre chaque table et chaque colonne de drizzle/schema.ts (sinon : pnpm db:generate)", () => {
    const snapshot = latestPgSnapshot();
    expect(snapshot.dialect).toBe("postgresql");
    expect(schemaTables.length).toBeGreaterThanOrEqual(36);

    const missing: string[] = [];
    for (const table of schemaTables) {
      const snapshotTable = snapshot.tables[`public.${table.name}`];
      if (!snapshotTable) {
        missing.push(table.name);
        continue;
      }
      const columns = new Set(Object.values(snapshotTable.columns).map(column => column.name));
      for (const column of table.columns) if (!columns.has(column.name)) missing.push(`${table.name}.${column.name}`);
      for (const index of table.indexes) {
        const name = index.config.name;
        if (name && !(name in snapshotTable.indexes)) missing.push(`${table.name} index ${name}`);
      }
    }
    expect(missing, "drizzle/pg est en retard sur drizzle/schema.ts : lancer pnpm db:generate").toEqual([]);

    const extra = Object.keys(snapshot.tables).filter(name => !schemaTables.some(table => `public.${table.name}` === name));
    expect(extra).toEqual([]);
  });

  it("0001 crée appointment_invoices de façon idempotente, avec le même DDL que l'application (B3)", async () => {
    const migration = read("drizzle/pg/0001_appointment_invoices.sql");
    const normalize = (text: string) => text.replace(/--[^\n]*\n/g, "").replace(/\s+/g, " ").replace(/ ?statement-breakpoint ?/g, "").replace(/;/g, "").trim();
    expect(migration).not.toMatch(/CREATE (UNIQUE )?(TABLE|INDEX) "/);
    const { APPOINTMENT_INVOICE_DDL } = await import("./invoiceNumbering");
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const dialect = new PgDialect();
    const body = normalize(migration);
    for (const statement of APPOINTMENT_INVOICE_DDL) expect(body).toContain(normalize(dialect.sqlToQuery(statement).sql));
  });

  it("0002 ajoute la colonne language de façon idempotente, avec le même DDL que l'application (EN-01, EN-02)", async () => {
    const migration = read("drizzle/pg/0002_language_columns.sql");
    const normalize = (text: string) => text.replace(/--[^\n]*\n/g, "").replace(/\s+/g, " ").replace(/ ?statement-breakpoint ?/g, "").replace(/;/g, "").trim();
    expect(migration).not.toMatch(/ADD COLUMN "/);
    const { LANGUAGE_COLUMN_DDL } = await import("./languageColumns");
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const dialect = new PgDialect();
    const body = normalize(migration);
    for (const statement of LANGUAGE_COLUMN_DDL) expect(body).toContain(normalize(dialect.sqlToQuery(statement).sql));
  });

  it("0003 ajoute confirmed_at et candidate_consent_at de façon idempotente, avec le même DDL que l'application (IA-02, RGPD-03)", async () => {
    const migration = read("drizzle/pg/0003_mission_shortlist_columns.sql");
    const normalize = (text: string) => text.replace(/--[^\n]*\n/g, "").replace(/\s+/g, " ").replace(/ ?statement-breakpoint ?/g, "").replace(/;/g, "").trim();
    expect(migration).not.toMatch(/ADD COLUMN "/);
    const { MISSION_COLUMN_DDL } = await import("./languageColumns");
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const dialect = new PgDialect();
    const body = normalize(migration);
    expect(MISSION_COLUMN_DDL).toHaveLength(2);
    for (const statement of MISSION_COLUMN_DDL) expect(body).toContain(normalize(dialect.sqlToQuery(statement).sql));
    const journal = JSON.parse(read("drizzle/pg/meta/_journal.json")) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.find(entry => entry.idx === 3)).toMatchObject({ idx: 3, tag: "0003_mission_shortlist_columns" });
  });

  it("0004 pose chaque clé étrangère et CHECK du schéma NOT VALID puis VALIDATE, et ses index uniques sans supprimer de candidature (DATA-01, DATA-11)", () => {
    const migration = read("drizzle/pg/0004_integrity_constraints.sql");
    const statements = migration.split("--> statement-breakpoint");
    const constraints = schemaTables.flatMap(table => [...table.foreignKeys.map(key => key.getName()), ...table.checks.map(check => check.name)]);
    expect(constraints.sort()).toEqual(["appointments_appointment_status_check", "appointments_payment_status_check", "candidate_documents_candidate_id_fk"]);
    for (const name of constraints) {
      const added = statements.findIndex(statement => new RegExp(`ADD CONSTRAINT ${name}\\b[^;]*NOT VALID;`).test(statement));
      const validated = statements.findIndex(statement => statement.trim().endsWith(`VALIDATE CONSTRAINT ${name};`));
      expect(added, name).toBeGreaterThanOrEqual(0);
      expect(validated, name).toBeGreaterThan(added);
    }
    for (const name of ["client_brief_candidates_pair_unique", "cv_applications_submission_unique"]) {
      expect(migration).toContain(`IF to_regclass('${name}') IS NULL THEN`);
      expect(migration).toContain(`CREATE UNIQUE INDEX ${name} ON`);
    }
    expect(migration).not.toMatch(/DELETE FROM cv_applications/i);
    const journal = JSON.parse(read("drizzle/pg/meta/_journal.json")) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.at(-1)).toMatchObject({ idx: 4, tag: "0004_integrity_constraints" });
  });

  it("la baseline crée les 36 tables du schéma", () => {
    const baseline = read("drizzle/pg/0000_baseline.sql");
    const created = [...baseline.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map(match => match[1]);
    expect(created).toHaveLength(36);
    expect(created).toEqual(expect.arrayContaining(["appointments", "cv_applications", "candidate_documents", "users"]));
  });
});
