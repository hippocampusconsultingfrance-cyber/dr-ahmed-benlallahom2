import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMigrationsInSync, IN_SYNC_MESSAGE } from "../scripts/check-migrations-in-sync.mjs";

/**
 * scripts/check-migrations-in-sync.mjs, lancé par la CI (CODE-14), exécuté ici
 * avec le vrai drizzle-kit sur une copie de drizzle/pg : le dépôt n'est jamais
 * modifié, même quand une migration manque.
 */
const root = process.cwd();
// drizzle-kit préfixe « ./ » au dossier de sortie : la copie doit être sous le dépôt.
const scratch = path.join(root, "node_modules/.cache");
const directories: string[] = [];

function copyOfMigrations(schemaExtra?: string) {
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(path.join(scratch, "migrations-in-sync-"));
  directories.push(directory);
  cpSync(path.join(root, "drizzle/pg"), path.join(directory, "pg"), { recursive: true });
  const relative = (file: string) => `./${path.relative(root, path.join(directory, file))}`;
  let schema = "./drizzle/schema.ts";
  if (schemaExtra) {
    writeFileSync(path.join(directory, "schema.ts"), `export * from ${JSON.stringify(path.join(root, "drizzle/schema.ts"))};\n${schemaExtra}`);
    schema = relative("schema.ts");
  }
  // Même configuration que drizzle.config.ts, sortie dans la copie.
  writeFileSync(
    path.join(directory, "drizzle.config.ts"),
    `import config from ${JSON.stringify(path.join(root, "drizzle.config.ts"))};\nexport default { ...config, schema: ${JSON.stringify(schema)}, out: ${JSON.stringify(relative("pg"))} };\n`,
  );
  return { directory, args: ["--config", relative("drizzle.config.ts")] };
}

const listing = (directory: string) => readdirSync(path.join(directory, "pg"), { recursive: true }).map(String).sort();

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("concordance du schéma et des migrations (CODE-14)", () => {
  it("n'a rien à générer : drizzle/pg décrit exactement drizzle/schema.ts", async () => {
    const { directory, args } = copyOfMigrations();
    const before = listing(directory);
    const { inSync, output } = await checkMigrationsInSync(args);
    expect(output).toContain(IN_SYNC_MESSAGE);
    expect(inSync, output).toBe(true);
    expect(listing(directory)).toEqual(before);
  }, 60_000);

  it("signale un schéma en avance sur les migrations", async () => {
    const { directory, args } = copyOfMigrations('import { pgTable, serial } from "drizzle-orm/pg-core";\nexport const ciDriftCheck = pgTable("ci_drift_check", { id: serial("id").primaryKey() });\n');
    const { inSync } = await checkMigrationsInSync(args);
    expect(inSync).toBe(false);
    const written = readdirSync(path.join(directory, "pg")).filter(file => file.endsWith(".sql") && !readdirSync(path.join(root, "drizzle/pg")).includes(file));
    expect(written).toHaveLength(1);
    expect(readFileSync(path.join(directory, "pg", written[0]), "utf8")).toContain('CREATE TABLE "ci_drift_check"');
  }, 60_000);

  it("ne se fie pas au code de sortie de drizzle-kit, qui vaut 0 même quand il échoue", async () => {
    // Deux migrations de branches parallèles qui partent du même instantané.
    const { directory, args } = copyOfMigrations();
    const meta = path.join(directory, "pg/meta");
    const journal = JSON.parse(readFileSync(path.join(meta, "_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
    const last = journal.entries[journal.entries.length - 1];
    const snapshot = JSON.parse(readFileSync(path.join(meta, `${String(last.idx).padStart(4, "0")}_snapshot.json`), "utf8"));
    const next = String(last.idx + 1).padStart(4, "0");
    writeFileSync(path.join(meta, `${next}_snapshot.json`), JSON.stringify({ ...snapshot, id: "00000000-0000-4000-8000-00000000c0de" }));
    journal.entries.push({ ...last, idx: last.idx + 1, tag: `${next}_parallel_branch` });
    writeFileSync(path.join(meta, "_journal.json"), JSON.stringify(journal));
    writeFileSync(path.join(directory, `pg/${next}_parallel_branch.sql`), "SELECT 1;\n");

    const { inSync, output } = await checkMigrationsInSync(args);
    expect(output).toContain("collision");
    expect(inSync).toBe(false);
  }, 60_000);
});
