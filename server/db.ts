import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { InsertUser, users } from "../drizzle/schema";
import { isConfiguredAdminOpenId } from './_core/env';
import { ensureLanguageColumns, postgresErrorCode, waitForLanguageColumns } from "./languageColumns";

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * After a failed check of the language columns, queries skip it for this long.
 * Short: until the column exists, queries naming it fail (42703), and the lock
 * of a long query on the table is usually released within seconds.
 */
export const LANGUAGE_COLUMNS_RETRY_DELAY_MS = 5_000;
/**
 * The delay doubles after each consecutive failure, up to this. Under a lock
 * held for minutes, each attempt makes the readers of the table wait up to 2 s
 * behind its queued ALTER: once a minute at most per instance.
 */
export const LANGUAGE_COLUMNS_MAX_RETRY_DELAY_MS = 60_000;
let languageColumnsRetryAt = 0;
// Failed checks since the last success.
let languageColumnsFailedChecks = 0;
// Kinds of failure (error name and SQLSTATE) logged since the last success.
const languageColumnsLoggedFailures = new Set<string>();

// Queries that read or write "language" on appointments, cv_applications or
// candidate_accounts (EN-01, EN-02): until migration 0002 is applied, the first
// one of the instance adds the missing columns, and those queries wait for it,
// sharing one check (memoised by ensureLanguageColumns). Other queries never
// wait. After a failure (lock not obtained within 2 s, role not allowed to
// alter the table) the queries go on without waiting, and the first one after
// the delay (5 s, then 10, 20, 40 and at most 60 s) checks again, with the same
// 2 s bound. Each kind of failure is logged once until a check succeeds, so
// retries failing again stay silent, and the success is logged once.
function languageColumnsReady(ddl: Parameters<typeof ensureLanguageColumns>[0]): Promise<void> {
  if (Date.now() < languageColumnsRetryAt) return Promise.resolve();
  return ensureLanguageColumns(ddl).then(() => {
    languageColumnsFailedChecks = 0;
    if (languageColumnsLoggedFailures.size === 0) return;
    languageColumnsLoggedFailures.clear();
    console.log("[Database] Language columns check succeeded after a failure");
  }, error => {
    // Queries waiting together share one check: only the first of them counts its failure.
    if (Date.now() >= languageColumnsRetryAt) {
      languageColumnsRetryAt = Date.now() + Math.min(LANGUAGE_COLUMNS_RETRY_DELAY_MS * 2 ** languageColumnsFailedChecks, LANGUAGE_COLUMNS_MAX_RETRY_DELAY_MS);
      languageColumnsFailedChecks += 1;
    }
    const name = error instanceof Error ? error.name : "UnknownError";
    const code = postgresErrorCode(error) ?? "";
    if (languageColumnsLoggedFailures.has(`${name} ${code}`)) return;
    languageColumnsLoggedFailures.add(`${name} ${code}`);
    console.error("[Database] Language columns check failed:", name, code);
  });
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = neon(process.env.DATABASE_URL);
      // The check and its DDL name those tables: they go through a client that does not wait.
      const ddl = drizzle(client);
      _db = drizzle({ client: waitForLanguageColumns(client, () => languageColumnsReady(ddl)) });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** Test seam: drop the cached connection and the state of the language columns check. */
export function resetDbForTests() {
  _db = null;
  languageColumnsRetryAt = 0;
  languageColumnsFailedChecks = 0;
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
    const configuredRole = isConfiguredAdminOpenId(user.openId) ? 'admin' : 'user';
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
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
