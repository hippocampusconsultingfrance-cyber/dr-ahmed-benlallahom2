export type RecruitmentSubmissionIdentity = {
  email: string;
  specialty: string;
};

function normalizeSubmissionValue(value: string): string {
  return value.trim().toLocaleLowerCase("fr");
}

/**
 * A repeated file is idempotent only for the same candidate and the same
 * recruitment pathway. The same CV may legitimately be submitted for a
 * standard application and later for a VVIP / offshore application.
 */
export function isSameRecruitmentSubmission(
  existing: RecruitmentSubmissionIdentity,
  incoming: RecruitmentSubmissionIdentity,
): boolean {
  return normalizeSubmissionValue(existing.email) === normalizeSubmissionValue(incoming.email)
    && normalizeSubmissionValue(existing.specialty) === normalizeSubmissionValue(incoming.specialty);
}
