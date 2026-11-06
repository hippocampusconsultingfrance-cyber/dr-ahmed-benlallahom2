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
 * offshore application, or again for other countries or VVIP environments,
 * which the specialty no longer carries (INTL-03).
 */
export function isSameRecruitmentSubmission(
  existing: RecruitmentSubmissionIdentity,
  incoming: RecruitmentSubmissionIdentity,
): boolean {
  return normalizeSubmissionValue(existing.email) === normalizeSubmissionValue(incoming.email)
    && normalizeSubmissionValue(existing.specialty) === normalizeSubmissionValue(incoming.specialty)
    && normalizedTargetCountries(existing.targetCountries) === normalizedTargetCountries(incoming.targetCountries);
}
