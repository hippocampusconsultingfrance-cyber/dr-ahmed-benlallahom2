import type { NeonQueryFunction } from "@neondatabase/serverless";
import { sql, type SQL } from "drizzle-orm";

type Executor = { execute: (query: SQL) => Promise<unknown> };
type NeonClient = NeonQueryFunction<false, false>;

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
 * Attente maximale du verrou exclusif de l’ALTER TABLE. Tant qu’il attend
 * (requête longue en cours sur la table), l’ALTER bloque aussi les lectures de
 * cette table par les autres sessions ; au-delà, PostgreSQL l’annule (55P03).
 */
const LANGUAGE_COLUMN_LOCK_TIMEOUT = "2s";

/**
 * neon-http n’a pas de transaction interactive : SET LOCAL et l’ALTER partent
 * dans le même bloc DO, donc dans la même transaction implicite, et le délai ne
 * survit pas à la requête (connexion partagée par le proxy Neon). La DDL ne
 * contient aucun paramètre, elle peut donc figurer dans le corps du bloc.
 */
function withLockTimeout(statement: SQL): SQL {
  return sql`DO $$ BEGIN SET LOCAL lock_timeout = '${sql.raw(LANGUAGE_COLUMN_LOCK_TIMEOUT)}'; ${statement}; END $$`;
}

/**
 * Codes PostgreSQL d’un ajout concurrent de la même colonne par une autre
 * instance : colonne dupliquée, ou doublon dans le catalogue (pg_attribute).
 */
const CONCURRENT_CREATION_CODES = new Set(["42701", "23505"]);

export function postgresErrorCode(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Tables présentes sans colonne « language » ; une table absente relève des
 * migrations. Lecture du catalogue seule : to_regclass ne verrouille pas la
 * table, donc la vérification répond même quand un ALTER attend son verrou.
 */
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
        await db.execute(withLockTimeout(LANGUAGE_COLUMN_DDL[index]!));
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

/** Toute requête qui nomme l’une de ces tables peut lire ou écrire « language » (Drizzle sélectionne toutes les colonnes). */
const LANGUAGE_TABLE_PATTERN = new RegExp(`\\b(?:${LANGUAGE_COLUMN_TABLES.join("|")})\\b`);

/**
 * Client Neon pour Drizzle : une requête qui nomme appointments,
 * cv_applications ou candidate_accounts attend d’abord `beforeLanguageQuery`
 * (vérification des colonnes) ; toute autre requête part aussitôt. Drizzle
 * envoie une requête par `client.query` et un `db.batch` par
 * `client.transaction`, avec les requêtes déjà construites, pas encore
 * envoyées : un NeonQueryPromise ne part qu’à son premier `then`.
 */
export function waitForLanguageColumns(client: NeonClient, beforeLanguageQuery: () => Promise<void>): NeonClient {
  // Requête mise en attente -> requête Neon d’origine, que `transaction` envoie.
  const deferred = new WeakMap<object, object>();
  const query = ((text: string, params?: unknown[], options?: Parameters<NeonClient["query"]>[2]) => {
    const pending = client.query(text, params, options);
    if (!LANGUAGE_TABLE_PATTERN.test(text)) return pending;
    const run = () => beforeLanguageQuery().then(() => pending);
    const waiting = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => run().then(onFulfilled, onRejected),
      catch: (onRejected?: (reason: unknown) => unknown) => run().catch(onRejected),
      finally: (onFinally?: () => void) => run().finally(onFinally),
    };
    deferred.set(waiting, pending);
    return waiting;
  }) as NeonClient["query"];
  const transaction = (async (queries: Parameters<NeonClient["transaction"]>[0], options?: Parameters<NeonClient["transaction"]>[1]) => {
    if (Array.isArray(queries) && queries.some(item => deferred.has(item))) {
      await beforeLanguageQuery();
      queries = queries.map(item => deferred.get(item) ?? item) as typeof queries;
    }
    return client.transaction(queries, options);
  }) as NeonClient["transaction"];
  return Object.assign(Object.create(client) as NeonClient, { query, transaction });
}
