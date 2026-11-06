/**
 * Stable reasons of the candidate portal refusals (EN-06), sent by the server
 * as `data.reason` next to its French message. The access, activation and
 * password reset pages translate them instead of showing the French text.
 */
export const CANDIDATE_ACCESS_REASONS = [
  "candidate_rate_limited",
  "candidate_security_check_required",
  "candidate_invitation_invalid",
  "candidate_invitation_email_mismatch",
  "candidate_activation_link_invalid",
  "candidate_reset_link_invalid",
  "candidate_password_too_short",
  "candidate_password_compromised",
  "candidate_password_check_unavailable",
  "candidate_credentials_invalid",
  "candidate_login_rate_limited",
  "candidate_login_challenge_required",
  "candidate_service_unavailable",
] as const;

export type CandidateAccessReason = (typeof CANDIDATE_ACCESS_REASONS)[number];

export function isCandidateAccessReason(value: unknown): value is CandidateAccessReason {
  return typeof value === "string" && (CANDIDATE_ACCESS_REASONS as readonly string[]).includes(value);
}
