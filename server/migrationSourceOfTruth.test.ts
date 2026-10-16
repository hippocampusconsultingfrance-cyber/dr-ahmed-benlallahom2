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

  it("la baseline crée les 36 tables du schéma", () => {
    const baseline = read("drizzle/pg/0000_baseline.sql");
    const created = [...baseline.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map(match => match[1]);
    expect(created).toHaveLength(36);
    expect(created).toEqual(expect.arrayContaining(["appointments", "cv_applications", "candidate_documents", "users"]));
  });
});
