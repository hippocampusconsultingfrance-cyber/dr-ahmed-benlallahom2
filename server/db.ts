import { eq } from "drizzle-orm";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { InsertUser, users } from "../drizzle/schema";
import {
  isConfiguredAdminOpenId,
  localDevelopmentShortcuts,
} from "./_core/env";
import { logError } from "./_core/logError";
import {
  ensureLanguageColumns,
  LOCK_NOT_AVAILABLE,
  postgresErrorCode,
  waitForLanguageColumns,
} from "./languageColumns";

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * After the first failed check of the language columns, queries skip it for
 * this long. Short: until the column exists, queries naming it fail (42703),
 * and the lock of a long query on the table is usually released within seconds.
 */
export const LANGUAGE_COLUMNS_RETRY_DELAY_MS = 5_000;
/**
 * Delay after a retry that waited for the lock again (55P03, on any of the
 * tables, whatever the others failed with): the lock has
 * then been held for several seconds and may be for minutes, and each attempt
 * makes the readers of the table wait up to 2 s behind its queued ALTER, so
 * the attempts come once a minute at most per instance. Other failures do not
 * hold the readers back: their delay doubles from 5 s up to this.
 */
export const LANGUAGE_COLUMNS_MAX_RETRY_DELAY_MS = 60_000;
let languageColumnsRetryAt = 0;
// Delay set by the last failed check, 0 since the last success.
let languageColumnsRetryDelay = 0;
// Kinds of failure (error name and SQLSTATE) logged since the last success.
const languageColumnsLoggedFailures = new Set<string>();

// Queries that read or write "language" on appointments, cv_applications or
// candidate_accounts (EN-01, EN-02), confirmed_at on cv_candidate_certifications
// (IA-02) or candidate_consent_at on client_brief_candidates (RGPD-03): until
// migrations 0002 and 0003 are applied, the first
// one of the instance adds the missing columns, and those queries wait for it,
// sharing one check (memoised by ensureLanguageColumns). Other queries never
// wait. After a failure (lock not obtained within 2 s, role not allowed to
// alter the table) the queries go on without waiting, and the first one after
// the delay checks again, with the same 2 s bound: 5 s after the first failure;
// after a retry that waited for the lock again, 60 s, and so on while the
// checks fail; after a retry failing otherwise (without holding the readers
// back), the delay doubles (10, 20, 40 s), up to 60 s. Each kind of failure is
// logged once until a check succeeds, so retries failing again stay silent,
// and the success is logged once.
function languageColumnsReady(
  ddl: Parameters<typeof ensureLanguageColumns>[0]
): Promise<void> {
  if (Date.now() < languageColumnsRetryAt) return Promise.resolve();
  return ensureLanguageColumns(ddl).then(
    () => {
      languageColumnsRetryDelay = 0;
      if (languageColumnsLoggedFailures.size === 0) return;
      languageColumnsLoggedFailures.clear();
      console.log(
        "[Database] Language columns check succeeded after a failure"
      );
    },
    error => {
      const name = error instanceof Error ? error.name : "UnknownError";
      const code = postgresErrorCode(error) ?? "";
      // Queries waiting together share one check: only the first of them counts its failure.
      if (Date.now() >= languageColumnsRetryAt) {
        languageColumnsRetryDelay =
          languageColumnsRetryDelay === 0
            ? LANGUAGE_COLUMNS_RETRY_DELAY_MS
            : code === LOCK_NOT_AVAILABLE
              ? LANGUAGE_COLUMNS_MAX_RETRY_DELAY_MS
              : Math.min(
                  languageColumnsRetryDelay * 2,
                  LANGUAGE_COLUMNS_MAX_RETRY_DELAY_MS
                );
        languageColumnsRetryAt = Date.now() + languageColumnsRetryDelay;
      }
      if (languageColumnsLoggedFailures.has(`${name} ${code}`)) return;
      languageColumnsLoggedFailures.add(`${name} ${code}`);
      logError("[Database] Language columns check failed", error);
    }
  );
}

/** The SQLSTATE fields of a PostgreSQL error, which the Neon driver copies from its proxy's reply. */
const POSTGRES_ERROR_FIELDS = [
  "severity",
  "code",
  "detail",
  "hint",
  "position",
  "internalPosition",
  "internalQuery",
  "where",
  "schema",
  "table",
  "column",
  "dataType",
  "constraint",
  "file",
  "line",
  "routine",
] as const;

type NeonHttpQuery = { query: string; params?: unknown[] };

/**
 * Local database (CODE-15): a DATABASE_URL on this machine, in local development only
 * (localDevelopmentShortcuts), is reached through node-postgres, the Neon HTTP driver
 * left in place: its requests are answered here as Neon's proxy answers them, one query,
 * or a batch in one transaction (db.batch), every value as text for the driver to read
 * as it reads Neon's. "pg" is a development dependency, loaded by a name the server
 * bundle does not follow, as the Vite toolchain is.
 */
export async function answerNeonQueriesLocally(connectionString: string) {
  const driverModule = "pg";
  const { default: pg } = (await import(driverModule)) as typeof import("pg");
  const pool = new pg.Pool({ connectionString, max: 5 });
  const asText = { getTypeParser: () => (value: string) => value };
  const run = (
    client: import("pg").PoolClient,
    { query, params }: NeonHttpQuery
  ) =>
    client
      .query({
        text: query,
        values: params ?? [],
        rowMode: "array",
        types: asText,
      })
      .then(result => ({
        fields: result.fields.map(field => ({
          name: field.name,
          dataTypeID: field.dataTypeID,
        })),
        rows: result.rows,
        command: result.command,
        rowCount: result.rowCount,
      }));
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  neonConfig.fetchEndpoint = () => "http://localhost/sql";
  neonConfig.fetchFunction = async (
    _url: string,
    init: { body: string; headers: Record<string, string> }
  ) => {
    const body = JSON.parse(init.body) as
      | NeonHttpQuery
      | { queries: NeonHttpQuery[] };
    const client = await pool.connect();
    try {
      if (!("queries" in body)) return reply(200, await run(client, body));
      // Neon names the level as ReadCommitted, RepeatableRead…; PostgreSQL as READ COMMITTED.
      const level = init.headers["Neon-Batch-Isolation-Level"]
        ?.replace(/([a-z])([A-Z])/g, "$1 $2")
        .toUpperCase();
      const readOnly =
        init.headers["Neon-Batch-Read-Only"] === "true" ? " READ ONLY" : "";
      const deferrable =
        init.headers["Neon-Batch-Deferrable"] === "true" ? " DEFERRABLE" : "";
      await client.query(
        `BEGIN${level ? ` ISOLATION LEVEL ${level}` : ""}${readOnly}${deferrable}`
      );
      try {
        const results = [];
        for (const query of body.queries)
          results.push(await run(client, query));
        await client.query("COMMIT");
        return reply(200, { results });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (!(error instanceof pg.DatabaseError)) throw error;
      return reply(
        400,
        Object.fromEntries([
          ["message", error.message],
          ...POSTGRES_ERROR_FIELDS.map(field => [field, error[field]]),
        ])
      );
    } finally {
      client.release();
    }
  };
}

let localQueries: Promise<void> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      if (localDevelopmentShortcuts().includes("local_database"))
        await (localQueries ??= answerNeonQueriesLocally(
          process.env.DATABASE_URL
        ));
      const client = neon(process.env.DATABASE_URL);
      // The check and its DDL name those tables: they go through a client that does not wait.
      const ddl = drizzle(client);
      _db = drizzle({
        client: waitForLanguageColumns(client, () => languageColumnsReady(ddl)),
      });
    } catch (error) {
      // neon() names the connection string, password included, in its message: logError leaves it out.
      logError("[Database] Failed to connect", error, { level: "warn" });
      _db = null;
    }
  }
  return _db;
}

/** Test seam: drop the cached connection and the state of the language columns check. */
export function resetDbForTests() {
  _db = null;
  localQueries = null;
  languageColumnsRetryAt = 0;
  languageColumnsRetryDelay = 0;
  languageColumnsLoggedFailures.clear();
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    // Clerk authentication alone must never preserve a historical admin role.
    // The single configured owner is promoted; every other account is demoted.
    const configuredRole = isConfiguredAdminOpenId(user.openId)
      ? "admin"
      : "user";
    values.role = configuredRole;
    updateSet.role = configuredRole;

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    logError("[Database] Failed to upsert user", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
