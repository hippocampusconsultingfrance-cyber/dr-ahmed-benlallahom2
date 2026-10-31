/**
 * Stable reasons of a refused candidate agreement for a mission (RGPD-03) or a
 * refused certification confirmation (IA-02), sent by the server as
 * `data.reason` next to its French message, with `data.date` (YYYY-MM-DD,
 * Paris) when the refusal depends on a day. The mission screen and the
 * certifications of the 360° sheet, written in the admin's language, show
 * their own translation instead of the French text.
 */
export const MISSION_CONSENT_REFUSAL_REASONS = [
  "consent_date_invalid",
  "consent_date_future",
  "consent_before_application",
  "consent_before_mission",
  "consent_not_associated",
] as const;

export type MissionConsentRefusalReason = (typeof MISSION_CONSENT_REFUSAL_REASONS)[number];

/** A candidate associated with a mission, or a mission, that no longer exists (DATA-01). */
export const MISSION_ASSOCIATION_REFUSAL_REASONS = ["association_brief_not_found", "association_application_not_found"] as const;

export type MissionAssociationRefusalReason = (typeof MISSION_ASSOCIATION_REFUSAL_REASONS)[number];

/** renewal_required: an expired certification is confirmed only with its renewal. */
export const CERTIFICATION_RENEWAL_REFUSAL_REASONS = ["renewal_date_invalid", "renewal_date_past", "renewal_date_too_far", "renewal_required"] as const;

export type CertificationRenewalRefusalReason = (typeof CERTIFICATION_RENEWAL_REFUSAL_REASONS)[number];

export function isMissionConsentRefusalReason(value: unknown): value is MissionConsentRefusalReason {
  return typeof value === "string" && (MISSION_CONSENT_REFUSAL_REASONS as readonly string[]).includes(value);
}

export function isCertificationRenewalRefusalReason(value: unknown): value is CertificationRenewalRefusalReason {
  return typeof value === "string" && (CERTIFICATION_RENEWAL_REFUSAL_REASONS as readonly string[]).includes(value);
}

export function isMissionAssociationRefusalReason(value: unknown): value is MissionAssociationRefusalReason {
  return typeof value === "string" && (MISSION_ASSOCIATION_REFUSAL_REASONS as readonly string[]).includes(value);
}
