/**
 * Stable reasons of a write a database constraint refused and that the
 * procedure did not handle itself (DATA-01), sent by the server as
 * `data.reason` next to its French message (server/_core/trpc.ts): a duplicate
 * (23505), a row missing or still referenced (23503), a value a CHECK refuses
 * (23514). A screen written in the admin's language shows its own translation.
 */
export const DATABASE_REFUSAL_REASONS = ["duplicate_record", "related_record_invalid", "value_not_allowed"] as const;

export type DatabaseRefusalReason = (typeof DATABASE_REFUSAL_REASONS)[number];

export function isDatabaseRefusalReason(value: unknown): value is DatabaseRefusalReason {
  return typeof value === "string" && (DATABASE_REFUSAL_REASONS as readonly string[]).includes(value);
}
