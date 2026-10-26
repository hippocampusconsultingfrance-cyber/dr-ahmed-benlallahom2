/**
 * Stable reasons of a refused candidate agreement for a mission (RGPD-03) or a
 * refused certification renewal (IA-02), sent by the server as `data.reason`
 * next to its French message: the mission screen, written in the admin's
 * language, shows its own translation instead of the French text.
 */
export const MISSION_CONSENT_REFUSAL_REASONS = [
  "consent_date_invalid",
  "consent_date_future",
  "consent_before_application",
  "consent_before_mission",
  "consent_not_associated",
] as const;

export type MissionConsentRefusalReason = (typeof MISSION_CONSENT_REFUSAL_REASONS)[number];

export const CERTIFICATION_RENEWAL_REFUSAL_REASONS = ["renewal_date_invalid", "renewal_date_past", "renewal_date_too_far"] as const;

export type CertificationRenewalRefusalReason = (typeof CERTIFICATION_RENEWAL_REFUSAL_REASONS)[number];

export function isMissionConsentRefusalReason(value: unknown): value is MissionConsentRefusalReason {
  return typeof value === "string" && (MISSION_CONSENT_REFUSAL_REASONS as readonly string[]).includes(value);
}
