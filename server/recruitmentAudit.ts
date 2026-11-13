import { TRPCError } from "@trpc/server";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "./db";
import { recruitmentAuditLogs } from "../drizzle/schema";
import { PublicErrorReason } from "./_core/trpc";
import { postgresConstraintName } from "./databaseConstraints";
import { postgresErrorCode } from "./languageColumns";
import { foldAdminSearchText } from "../shared/adminSearchFolding";
import { AUDIT_NOT_RECORDED_REASON } from "../shared/databaseRefusalReasons";
import { meetsRequiredLanguage, recruitmentLanguageListRequirements } from "../shared/recruitmentLanguages";

export type RecruitmentAuditAction =
  | "download"
  | "reanalyze"
  | "erase"
  | "email"
  | "status_update"
  | "retention_cleanup"
  | "export"
  | "unsubscribe";

type RecruitmentAuditRecord = {
  applicationId?: number | null;
  adminOpenId: string;
  action: RecruitmentAuditAction;
  metadata?: Record<string, unknown>;
};

/**
 * The insert of these audit records, not yet sent: for a db.batch that writes
 * them with the change they record, both or neither (DATA-01).
 */
export function recruitmentAuditInsert(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, records: RecruitmentAuditRecord[]) {
  return db.insert(recruitmentAuditLogs).values(records.map(record => ({
    applicationId: record.applicationId ?? null,
    adminOpenId: record.adminOpenId,
    action: record.action,
    metadata: record.metadata ? JSON.stringify(record.metadata) : null,
  })));
}

/** Persist a minimal, non-sensitive audit record for a recruitment action. */
export async function logRecruitmentAction(input: RecruitmentAuditRecord): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await recruitmentAuditInsert(db, [input]);
}

/**
 * A change in the database and its audit lines in one batch, both or neither
 * (DATA-01): when the database refuses a line, the change is not recorded
 * either, and the screen rightly says that nothing was changed. The batch's
 * results, the change's first.
 */
export function recordWithRecruitmentAudit(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, change: BatchItem<"pg">, records: RecruitmentAuditRecord[]) {
  return db.batch([change, recruitmentAuditInsert(db, records)]);
}

/** Said once the action is done but its trace could not be written: never « rien n’a été modifié » (DATA-01). */
export const AUDIT_NOT_RECORDED_MESSAGE = "Sa trace n’a pas pu être écrite dans le journal d’audit.";

/**
 * Writes the audit lines of an action already done, which no batch can undo
 * (an email sent, a CV analysed, a copy on Drive, a job queued by its own
 * module): when the database refuses them, the failure is logged, the
 * constraint's name only (the error's detail holds the row's values), and
 * false returned, the action standing.
 */
export async function logRecruitmentActionsDone(records: RecruitmentAuditRecord[]): Promise<boolean> {
  if (!records.length) return true;
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    await recruitmentAuditInsert(db, records);
    return true;
  } catch (error) {
    console.error("[Recruitment] Action done, its audit lines not recorded", { actions: Array.from(new Set(records.map(record => record.action))), count: records.length, code: postgresErrorCode(error), constraint: postgresConstraintName(error) });
    return false;
  }
}

/**
 * The same for an admin's action: when its lines are refused, the admin is
 * told that it is done (`done`, « L’action est faite. » unless it ended
 * otherwise, an invitation refused by the sender) and that its trace could
 * not be written, so as not to do it again, rather than the « rien n’a été
 * modifié » of a refused write.
 */
export async function traceRecruitmentActionDone(records: RecruitmentAuditRecord[], done = "L’action est faite."): Promise<void> {
  if (await logRecruitmentActionsDone(records)) return;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${done} ${AUDIT_NOT_RECORDED_MESSAGE}`, cause: new PublicErrorReason(AUDIT_NOT_RECORDED_REASON) });
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
 * A specialty or a country as the profile compares it: folded like the
 * filters of the list and the admin search (adminFilterContains), accents,
 * case and ways of writing aside, so that the dossiers its SQL filter kept
 * (« emirats » finds « Émirats arabes unis », « anesthesie » « Anesthésie »,
 * INTL-12) are not dropped here.
 */
const foldProfileText = (text: string) => foldAdminSearchText(text).toLowerCase();

export function matchesRecruitmentProfile(input: {
  score: number | null;
  specialty: string;
  targetCountries: string[];
  /** Declared in the form and, when its analysis is of the current version, read in the CV (normalized_languages). */
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
  if (profile.specialty && !foldProfileText(input.specialty).includes(foldProfileText(profile.specialty))) return false;
  if (profile.targetCountry && !input.targetCountries.some(country => foldProfileText(country).includes(foldProfileText(profile.targetCountry!)))) return false;

  const skills = new Set(input.extractedSkills.map(value => value.toLowerCase()));
  // Typed with commas, as one text: « Anglais – parlé, écrit » is one requirement (IA02-R5).
  const requiredLanguages = recruitmentLanguageListRequirements(parseRecruitmentJsonArray(profile.requiredLanguages));
  const requiredSkills = parseRecruitmentJsonArray(profile.requiredSkills);
  // Each required language the dossier has under any of its names (IA-02),
  // the form recording « French » or « Arabic » where the admin types
  // « Français » or « arabe », compared as a mission and the Langue filter
  // compare them (shared/recruitmentLanguages.ts).
  if (requiredLanguages.some(required => !meetsRequiredLanguage(input.languages, required))) return false;
  if (requiredSkills.some(value => !Array.from(skills).some(skill => skill.includes(value.toLowerCase())))) return false;
  return true;
}
