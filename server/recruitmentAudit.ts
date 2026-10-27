import { getDb } from "./db";
import { recruitmentAuditLogs } from "../drizzle/schema";
import { foldAdminSearchText } from "../shared/adminSearchFolding";

export type RecruitmentAuditAction =
  | "download"
  | "reanalyze"
  | "erase"
  | "email"
  | "status_update"
  | "retention_cleanup"
  | "export"
  | "unsubscribe";

/** Persist a minimal, non-sensitive audit record for a recruitment action. */
export async function logRecruitmentAction(input: {
  applicationId?: number | null;
  adminOpenId: string;
  action: RecruitmentAuditAction;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.insert(recruitmentAuditLogs).values({
    applicationId: input.applicationId ?? null,
    adminOpenId: input.adminOpenId,
    action: input.action,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

export function parseRecruitmentJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Most dossiers the Candidatures list checks against a matching profile (its
 * languages and skills are checked here, not in SQL): far above the volume of
 * the site, so in practice every dossier is checked; past it the list says
 * that the profile was applied to the first ones only.
 */
export const RECRUITMENT_PROFILE_SCAN_LIMIT = 10_000;

/**
 * A country or a language as the profile compares them: folded like the
 * filters of the list and the admin search (adminFilterContains), accents,
 * case and ways of writing aside, so that the dossiers its SQL filter kept
 * (« emirats » finds « Émirats arabes unis ») are not dropped here.
 */
const foldProfileText = (text: string) => foldAdminSearchText(text).toLowerCase();

export function matchesRecruitmentProfile(input: {
  score: number | null;
  specialty: string;
  targetCountries: string[];
  languages: string[];
  extractedSkills: string[];
  profile: {
    targetCountry: string | null;
    specialty: string | null;
    minimumScore: number;
    requiredLanguages: string | null;
    requiredSkills: string | null;
  };
}): boolean {
  const profile = input.profile;
  // INTL-02: without a verified score the dossier stays in the profile, listed apart to be read.
  if (input.score !== null && input.score < profile.minimumScore) return false;
  if (profile.specialty && !input.specialty.toLowerCase().includes(profile.specialty.toLowerCase())) return false;
  if (profile.targetCountry && !input.targetCountries.some(country => foldProfileText(country).includes(foldProfileText(profile.targetCountry!)))) return false;

  const languages = new Set(input.languages.map(foldProfileText));
  const skills = new Set(input.extractedSkills.map(value => value.toLowerCase()));
  const requiredLanguages = parseRecruitmentJsonArray(profile.requiredLanguages);
  const requiredSkills = parseRecruitmentJsonArray(profile.requiredSkills);
  if (requiredLanguages.some(value => !languages.has(foldProfileText(value)))) return false;
  if (requiredSkills.some(value => !Array.from(skills).some(skill => skill.includes(value.toLowerCase())))) return false;
  return true;
}
