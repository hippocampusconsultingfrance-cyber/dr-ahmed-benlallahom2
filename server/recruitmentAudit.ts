import { getDb } from "./db";
import { recruitmentAuditLogs } from "../drizzle/schema";

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
  if ((input.score ?? -1) < profile.minimumScore) return false;
  if (profile.specialty && !input.specialty.toLowerCase().includes(profile.specialty.toLowerCase())) return false;
  if (profile.targetCountry && !input.targetCountries.some(country => country.toLowerCase().includes(profile.targetCountry!.toLowerCase()))) return false;

  const languages = new Set(input.languages.map(value => value.toLowerCase()));
  const skills = new Set(input.extractedSkills.map(value => value.toLowerCase()));
  const requiredLanguages = parseRecruitmentJsonArray(profile.requiredLanguages);
  const requiredSkills = parseRecruitmentJsonArray(profile.requiredSkills);
  if (requiredLanguages.some(value => !languages.has(value.toLowerCase()))) return false;
  if (requiredSkills.some(value => !Array.from(skills).some(skill => skill.includes(value.toLowerCase())))) return false;
  return true;
}
