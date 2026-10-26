/**
 * An application's statuses as the admin Candidatures tab names them, shared
 * with the shortlist file sent to an employer, which writes them in words
 * rather than as internal codes (RGPD-03).
 */
export const RECRUITMENT_APPLICATION_STATUS_OPTIONS = [
  { value: "new", label: "Nouvelle" },
  { value: "reviewing", label: "En revue" },
  { value: "shortlisted", label: "Présélectionnée" },
  { value: "placed", label: "Positionnée" },
  { value: "rejected", label: "Refusée" },
  { value: "archived", label: "Archivée" },
] as const;

export type RecruitmentApplicationStatus = (typeof RECRUITMENT_APPLICATION_STATUS_OPTIONS)[number]["value"];

/** « En revue » for "reviewing"; the code itself for a status this list does not know. */
export const recruitmentApplicationStatusLabel = (status: string) =>
  RECRUITMENT_APPLICATION_STATUS_OPTIONS.find(option => option.value === status)?.label ?? status;
