import { sql, type SQL } from "drizzle-orm";

type Executor = { execute: (query: SQL) => Promise<unknown> };

/**
 * Tables qui portent la colonne « language » (fr, en, de, zh ; 'fr' par défaut) :
 * la réservation (EN-01), la candidature et le compte candidat (EN-02).
 */
export const LANGUAGE_COLUMN_TABLES = ["appointments", "candidate_accounts", "cv_applications"] as const;

/**
 * DDL idempotente, identique à drizzle/pg/0002_language_columns.sql : le
 * déploiement fonctionne avant que le propriétaire applique la migration.
 * Ajouter une colonne avec une valeur par défaut constante ne réécrit pas la
 * table (PostgreSQL 11+) : les lignes existantes lisent 'fr'.
 */
export const LANGUAGE_COLUMN_DDL = LANGUAGE_COLUMN_TABLES.map(table =>
  sql`ALTER TABLE ${sql.identifier(table)} ADD COLUMN IF NOT EXISTS "language" varchar(10) DEFAULT 'fr' NOT NULL`);

/**
 * Codes PostgreSQL d’un ajout concurrent de la même colonne par une autre
 * instance : colonne dupliquée, ou doublon dans le catalogue (pg_attribute).
 */
const CONCURRENT_CREATION_CODES = new Set(["42701", "23505"]);

function postgresErrorCode(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** Tables présentes sans colonne « language » ; une table absente relève des migrations. */
async function tablesMissingLanguageColumn(db: Executor): Promise<Set<string>> {
  const names = sql.join(LANGUAGE_COLUMN_TABLES.map(name => sql`${name}`), sql`, `);
  const result = await db.execute(sql`SELECT name FROM unnest(ARRAY[${names}]::text[]) AS name WHERE to_regclass(name) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass(name) AND attname = 'language' AND NOT attisdropped)`);
  const rows = (result as { rows?: Array<{ name?: unknown }> }).rows ?? [];
  return new Set(rows.map(row => String(row.name)));
}

let languageColumnsReady: Promise<void> | null = null;

/**
 * Mémoïsé par instance ; un échec est réessayé au prochain appel. Même modèle
 * que la table des factures (server/invoiceNumbering.ts) : lit d’abord ce qui
 * existe et n’exécute que la DDL manquante, donc aucune DDL n’est envoyée quand
 * les colonnes sont là (cas normal, ou 0002 appliquée par le propriétaire). Un
 * ajout concurrent par une autre instance compte comme une réussite dès que la
 * colonne existe.
 */
export function ensureLanguageColumns(db: Executor): Promise<void> {
  languageColumnsReady ??= (async () => {
    const missing = await tablesMissingLanguageColumn(db);
    for (let index = 0; index < LANGUAGE_COLUMN_TABLES.length; index += 1) {
      const table = LANGUAGE_COLUMN_TABLES[index]!;
      if (!missing.has(table)) continue;
      try {
        await db.execute(LANGUAGE_COLUMN_DDL[index]!);
      } catch (error) {
        if (!CONCURRENT_CREATION_CODES.has(postgresErrorCode(error) ?? "")) throw error;
        if ((await tablesMissingLanguageColumn(db)).has(table)) throw error;
      }
    }
  })().catch(error => {
    languageColumnsReady = null;
    throw error;
  });
  return languageColumnsReady;
}

/** Test seam: forget the memoised DDL run. */
export function resetLanguageColumnsMemo() {
  languageColumnsReady = null;
}
