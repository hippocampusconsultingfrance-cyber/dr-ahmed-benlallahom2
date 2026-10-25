import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { InsertUser, users } from "../drizzle/schema";
import { isConfiguredAdminOpenId } from './_core/env';
import { ensureLanguageColumns } from "./languageColumns";

let _db: ReturnType<typeof drizzle> | null = null;

/** After a failed check of the language columns, the next getDb() calls skip it for this long. */
export const LANGUAGE_COLUMNS_RETRY_DELAY_MS = 60_000;
let languageColumnsRetryAt = 0;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(neon(process.env.DATABASE_URL));
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  // Every query on appointments, cv_applications or candidate_accounts reads
  // "language" (EN-01, EN-02): the column is added once per instance before the
  // first one, until migration 0002 is applied. A failure is logged and checked
  // again later; tables without that column keep working meanwhile.
  if (_db && Date.now() >= languageColumnsRetryAt) {
    try {
      await ensureLanguageColumns(_db);
    } catch (error) {
      languageColumnsRetryAt = Date.now() + LANGUAGE_COLUMNS_RETRY_DELAY_MS;
      console.error("[Database] Language columns check failed:", error instanceof Error ? error.name : "UnknownError");
    }
  }
  return _db;
}

/** Test seam: drop the cached connection and the retry delay of the language columns check. */
export function resetDbForTests() {
  _db = null;
  languageColumnsRetryAt = 0;
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
