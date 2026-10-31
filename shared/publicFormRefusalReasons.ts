/**
 * Stable reasons of a refused contact message or GDPR request (ABUS-01), sent
 * by the server as `data.reason` next to its French message: the form shows
 * its own translation instead of the generic failure that invites an
 * immediate retry. The per-connection limit is reached (the form says when to
 * try again), the anti-robot check was refused (the page must be reloaded), or
 * Cloudflare could not judge it (reloading does not help: try again later).
 */
export const PUBLIC_FORM_REFUSAL_REASONS = ["rate_limited", "security_check_failed", "security_check_unavailable"] as const;

export type PublicFormRefusalReason = (typeof PUBLIC_FORM_REFUSAL_REASONS)[number];

export function isPublicFormRefusalReason(value: unknown): value is PublicFormRefusalReason {
  return typeof value === "string" && (PUBLIC_FORM_REFUSAL_REASONS as readonly string[]).includes(value);
}
