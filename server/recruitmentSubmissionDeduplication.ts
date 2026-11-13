import { parseRecruitmentJsonArray } from "./recruitmentAudit";

export type RecruitmentSubmissionIdentity = {
  email: string;
  specialty: string;
  /** Stored as a JSON array in cv_applications.target_countries, or as parsed from the form. */
  targetCountries: string | string[];
};

function normalizeSubmissionValue(value: string): string {
  return value.trim().toLocaleLowerCase("fr");
}

function normalizedTargetCountries(value: string | string[]): string {
  const countries = typeof value === "string" ? parseRecruitmentJsonArray(value) : value;
  return Array.from(new Set(countries.map(normalizeSubmissionValue))).sort().join("\n");
}

/**
 * A repeated file is idempotent only for the same candidate, the same
 * recruitment pathway and the same target countries. The same CV may
 * legitimately be submitted for a standard application and later for a VVIP /
 * offshore application (the prefix of its specialty, shared/recruitmentPathway.ts),
 * or again for other countries (INTL-03). The rest describes the application
 * without making another one: other languages, experience or message, and the
 * environments of a VVIP application, which are neither in its specialty
 * (INTL-03) nor in its target countries (REC-11) and have no column, so a
 * sending that only changes them is the application already received.
 */
export function isSameRecruitmentSubmission(
  existing: RecruitmentSubmissionIdentity,
  incoming: RecruitmentSubmissionIdentity,
): boolean {
  return normalizeSubmissionValue(existing.email) === normalizeSubmissionValue(incoming.email)
    && normalizeSubmissionValue(existing.specialty) === normalizeSubmissionValue(incoming.specialty)
    && normalizedTargetCountries(existing.targetCountries) === normalizedTargetCountries(incoming.targetCountries);
}
