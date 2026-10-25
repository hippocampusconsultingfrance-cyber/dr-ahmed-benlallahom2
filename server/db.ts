import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { InsertUser, users } from "../drizzle/schema";
import { isConfiguredAdminOpenId } from './_core/env';
import { ensureLanguageColumns, postgresErrorCode, waitForLanguageColumns } from "./languageColumns";

let _db: ReturnType<typeof drizzle> | null = null;

/** After a failed check of the language columns, queries skip it for this long. */
export const LANGUAGE_COLUMNS_RETRY_DELAY_MS = 60_000;
let languageColumnsRetryAt = 0;
let languageColumnsFailureLogged = false;

// Every query on appointments, cv_applications or candidate_accounts reads
// "language" (EN-01, EN-02): until migration 0002 is applied, the first one of
// the instance adds the missing columns, and the queries on those tables wait
// for it, sharing one check (memoised by ensureLanguageColumns). Other queries
// never wait. After a failure (lock not obtained within 2 s, role not allowed
// to alter the table) the queries go on without waiting, the failure is logged
// once per instance and the check runs again after the delay.
function languageColumnsReady(ddl: Parameters<typeof ensureLanguageColumns>[0]): Promise<void> {
  if (Date.now() < languageColumnsRetryAt) return Promise.resolve();
  return ensureLanguageColumns(ddl).catch(error => {
    languageColumnsRetryAt = Date.now() + LANGUAGE_COLUMNS_RETRY_DELAY_MS;
    if (languageColumnsFailureLogged) return;
    languageColumnsFailureLogged = true;
    console.error("[Database] Language columns check failed:", error instanceof Error ? error.name : "UnknownError", postgresErrorCode(error) ?? "");
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
  languageColumnsFailureLogged = false;
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
