/**
 * Rights the GDPR form lets a person exercise: those of the privacy policy,
 * and the withdrawal of a consent (RGPD-13). The form lists them and the
 * server accepts them; gdpr_requests.request_type is a varchar without CHECK.
 */
export const GDPR_REQUEST_TYPES = [
  "access",
  "rectification",
  "deletion",
  "restriction",
  "portability",
  "objection",
  "consent_withdrawal",
] as const;

export type GdprRequestType = (typeof GDPR_REQUEST_TYPES)[number];
