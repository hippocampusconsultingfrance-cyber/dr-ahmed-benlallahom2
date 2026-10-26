import { postgresErrorCode } from "./languageColumns";

/** PostgreSQL codes of a write refused by a constraint (DATA-01). */
export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";

/** Constraints of drizzle/pg/0004 whose refusals the code answers itself (names as in drizzle/schema.ts). */
export const CV_APPLICATION_SUBMISSION_UNIQUE_INDEX = "cv_applications_submission_unique";
export const CANDIDATE_DOCUMENT_ACCOUNT_FOREIGN_KEY = "candidate_documents_candidate_id_fk";

/**
 * Name of the constraint or unique index a PostgreSQL error names. drizzle-orm
 * wraps the error in a DrizzleQueryError (« Failed query: … »): the name is in
 * its cause, in the `constraint` field of Neon's error, else quoted in its
 * message.
 */
export function postgresConstraintName(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; depth += 1) {
    const { code, constraint, message } = current as { code?: unknown; constraint?: unknown; message?: unknown };
    if (typeof code === "string") {
      if (typeof constraint === "string") return constraint;
      return (typeof message === "string" ? /constraint "([^"]+)"/.exec(message)?.[1] : undefined) ?? null;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** A write refused because a row with the same key exists in this unique index. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return postgresErrorCode(error) === UNIQUE_VIOLATION && postgresConstraintName(error) === constraint;
}

/** A write refused by this foreign key (row referenced missing, or still referenced). */
export function isForeignKeyViolation(error: unknown, constraint: string): boolean {
  return postgresErrorCode(error) === FOREIGN_KEY_VIOLATION && postgresConstraintName(error) === constraint;
}
