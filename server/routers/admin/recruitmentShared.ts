// Shared by the recruitment admin routers and the employer missions: verified AI score, certification and language facts, shortlist, mission refusals.

import { PublicErrorReason } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../../db";
import { cvApplications, cvCandidateCertifications, cvCandidateLanguages, clientBriefCandidates } from "../../../drizzle/schema";
import { eq, and, or, sql, inArray, isNotNull, type SQL } from "drizzle-orm";
import { certificationFacts, languageFacts, sameRecruitmentFact, type CertificationRow, type LanguageRow } from "../../clientBriefMatching";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "../../recruitmentAnalysis";
import { adminFilterContains } from "../../adminSearch";
import type { CertificationRenewalRefusalReason, MissionAssociationRefusalReason, MissionConsentRefusalReason } from "../../../shared/recruitmentMissionRefusalReasons";
import { givesRequiredLanguage, meetsRequiredLanguage, recruitmentLanguagePrefixCodes, recruitmentLanguageRequirements } from "../../../shared/recruitmentLanguages";
import { parseRecruitmentJsonArray } from "../../recruitmentAudit";

/**
 * Refus d’un accord de candidat pour une mission (RGPD-03), d’une association
 * à une mission ou une candidature disparue (DATA-01) ou d’une confirmation de
 * certification (IA-02) : message français, motif stable et, quand le refus
 * nomme un jour, ce jour (YYYY-MM-DD). L’écran de la mission et les
 * certifications de la fiche 360° les traduisent dans la langue de
 * l’administration, avec ce jour.
 */
export function missionRefusal(code: "BAD_REQUEST" | "NOT_FOUND", reason: MissionConsentRefusalReason | MissionAssociationRefusalReason | CertificationRenewalRefusalReason, message: string, date?: string) {
  return new TRPCError({ code, message, cause: new PublicErrorReason(reason, date) });
}

export const verifiedRecruitmentScore = sql<number | null>`CASE WHEN ${cvApplications.analysisPromptVersion} = ${RECRUITMENT_ANALYSIS_PROMPT_VERSION} THEN ${cvApplications.aiScore} ELSE NULL END`;

/**
 * Score threshold of the admin lists (INTL-02): a dossier without a verified score (CV in
 * another language, analysis pending, refused or from an older version) is kept, and the
 * list shows it apart, « Score indisponible – à lire », instead of dropping it. A threshold
 * of 0 filters nothing.
 */
export const scoreAtLeastOrUnavailable = (minimumScore: number) => sql`(${verifiedRecruitmentScore} >= ${minimumScore} OR ${verifiedRecruitmentScore} IS NULL)`;

/** Best verified score first: a plain DESC would put the dossiers without one first in PostgreSQL, and a limit would then keep only them. */
export const verifiedScoreFirst = sql`${verifiedRecruitmentScore} DESC NULLS LAST`;

type AdminDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * A mission's shortlist: the candidates shortlisted for it whose application
 * is still open, with the date each one agreed to be presented for it, entered
 * by the admin (RGPD-03). Its export carries the candidates who agreed, and
 * nobody else (REC-01).
 */
export async function openShortlist(db: AdminDb, briefId: number): Promise<Array<{ applicationId: number; candidateConsentAt: Date | null }>> {
  const associations = await db.select({ applicationId: clientBriefCandidates.applicationId, candidateConsentAt: clientBriefCandidates.candidateConsentAt }).from(clientBriefCandidates).where(and(eq(clientBriefCandidates.briefId, briefId), eq(clientBriefCandidates.status, "shortlisted")));
  if (!associations.length) return [];
  const open = await db.select({ id: cvApplications.id }).from(cvApplications).where(and(sql`${cvApplications.status} NOT IN ('rejected', 'archived')`, inArray(cvApplications.id, associations.map(association => association.applicationId))));
  return open.map(application => ({
    applicationId: application.id,
    candidateConsentAt: associations.find(association => association.applicationId === application.id && association.candidateConsentAt)?.candidateConsentAt ?? null,
  }));
}

function groupByApplication<T extends { applicationId: number }>(rows: T[]) {
  const groups = new Map<number, T[]>();
  for (const row of rows) groups.set(row.applicationId, [...(groups.get(row.applicationId) ?? []), row]);
  return groups;
}

/** The names of the facts an analysis read in what the vision transcribed from a scan (IA-07), as its normalized_* column keeps them. */
function transcribedFactNames(value: string | null, key: "name" | "language") {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.flatMap(item => {
        const fact = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return fact.fromTranscription === true && typeof fact[key] === "string" ? [fact[key] as string] : [];
      })
      : [];
  } catch {
    return [];
  }
}

/**
 * Fact rows with what the latest analysis of their application says of them:
 * whether that analysis is of the current version, and whether it read the
 * fact, read in the CV, in what the vision transcribed from a scan (IA-07).
 * One query, for the applications that have rows.
 */
async function withLatestAnalysis<T extends { applicationId: number; source: string }>(db: AdminDb, rows: T[], analysedFacts: typeof cvApplications.normalizedCertifications | typeof cvApplications.normalizedLanguages, key: "name" | "language", name: (row: T) => string) {
  const ids = Array.from(new Set(rows.map(row => row.applicationId)));
  const analyses = ids.length
    ? await db.select({ id: cvApplications.id, version: cvApplications.analysisPromptVersion, facts: analysedFacts }).from(cvApplications).where(inArray(cvApplications.id, ids))
    : [];
  const byApplication = new Map(analyses.map(analysis => [analysis.id, { current: analysis.version === RECRUITMENT_ANALYSIS_PROMPT_VERSION, transcribed: transcribedFactNames(analysis.facts, key) }]));
  return rows.map(row => ({
    ...row,
    analysisIsCurrent: byApplication.get(row.applicationId)?.current ?? false,
    fromTranscription: row.source === "extracted" && (byApplication.get(row.applicationId)?.transcribed ?? []).some(item => sameRecruitmentFact(item, name(row))),
  }));
}

/**
 * Certifications of these applications with their origins (IA-02): the
 * declared text and the cv_candidate_certifications rows, one query whatever
 * the number of applications, and one for what their analysis read in a
 * scan's transcription (IA-07).
 */
export async function certificationFactsByApplication(db: AdminDb, applications: Array<{ id: number; certifications: string | null }>) {
  const rows = applications.length
    ? groupByApplication(await withLatestAnalysis(db, await db.select({ applicationId: cvCandidateCertifications.applicationId, name: cvCandidateCertifications.name, source: cvCandidateCertifications.source, confirmedAt: cvCandidateCertifications.confirmedAt, expiresAt: cvCandidateCertifications.expiresAt })
      .from(cvCandidateCertifications)
      .where(inArray(cvCandidateCertifications.applicationId, applications.map(application => application.id))), cvApplications.normalizedCertifications, "name", row => row.name))
    : new Map<number, CertificationRow[]>();
  return new Map(applications.map(application => [application.id, certificationFacts(application.certifications, rows.get(application.id) ?? [])]));
}

/**
 * Languages of these applications with their origins (declared, read in the
 * CV), one query, and one for their analysis. A language read in the CV
 * counts only for an analysis of the current version, as for the Langue
 * filter and a matching profile: a dossier analysed under an older prompt
 * keeps its declared languages until its CV is analysed again. Read in a
 * scan's transcription, it says so (IA-07).
 */
export async function languageFactsByApplication(db: AdminDb, applications: Array<{ id: number; languages: string | null }>) {
  const rows = applications.length
    ? groupByApplication((await withLatestAnalysis(db, await db.select({ applicationId: cvCandidateLanguages.applicationId, language: cvCandidateLanguages.language, source: cvCandidateLanguages.source })
      .from(cvCandidateLanguages)
      .where(inArray(cvCandidateLanguages.applicationId, applications.map(application => application.id))), cvApplications.normalizedLanguages, "language", row => row.language))
      .filter(row => row.source !== "extracted" || row.analysisIsCurrent))
    : new Map<number, LanguageRow[]>();
  return new Map(applications.map(application => [application.id, languageFacts(application.languages, rows.get(application.id) ?? [])]));
}

/**
 * Applications holding a certification an admin confirmed whose name contains
 * this term, case and accents aside (IA-02). The certification filters find a
 * confirmed certification even once a new analysis stored no facts (a
 * contradiction, hidden text) and left normalized_certifications empty. They
 * are wider than a mission's matching: a certification that has expired,
 * confirmed or read in the CV with its date, is found too, as the declared
 * text finds one. The lists then give its expiry beside its origins.
 */
async function applicationsWithConfirmedCertification(db: AdminDb, term: string) {
  const rows = await db.select({ applicationId: cvCandidateCertifications.applicationId })
    .from(cvCandidateCertifications)
    .where(and(isNotNull(cvCandidateCertifications.confirmedAt), adminFilterContains(cvCandidateCertifications.name, term)));
  return Array.from(new Set(rows.map(row => row.applicationId)));
}

/** The certification filter of the admin lists: the declared or analysed text, or a confirmed certification (IA-02). */
export async function certificationFilterCondition(db: AdminDb, term: string, textCondition: SQL) {
  const confirmedIds = await applicationsWithConfirmedCertification(db, term);
  return confirmedIds.length ? or(textCondition, inArray(cvApplications.id, confirmedIds))! : textCondition;
}

/**
 * The language filter of the Candidatures (IA-02): the dossiers that have
 * every language the term names, as a matching profile requires them
 * (shared/recruitmentLanguages.ts), declared (each name of the languages
 * column) or read in the CV by an analysis of the current version
 * (cv_candidate_languages, one row per language, without the CV's quotes).
 * Whole languages are compared, never letters inside a word or a quote:
 * « arabe » finds « Arabic », which the form records even from its French
 * page, but « polonais » not « English (polished) », nor « allemand »
 * « Germany »; a term the table does not know (« wolof ») by its words. As
 * the field looks while the admin types, the start of a name (« angl »,
 * « arab ») finds its language. A term with no letter finds nothing. The
 * few names the dossiers use are read once (distinct), compared here, and
 * those that match found by equality, the folded columns no longer scanned.
 */
export async function languageFilterCondition(db: AdminDb, term: string) {
  const [declaredValues, readLanguages] = await Promise.all([
    db.selectDistinct({ languages: cvApplications.languages }).from(cvApplications).where(isNotNull(cvApplications.languages)),
    db.selectDistinct({ language: cvCandidateLanguages.language }).from(cvCandidateLanguages),
  ]);
  const declared = declaredValues.map(row => ({ value: row.languages!, names: parseRecruitmentJsonArray(row.languages) }));
  // One condition per language required: « anglais, arabe » is met by English
  // declared and Arabic read in the CV. A name typed in part, by any language
  // it starts, or by its words as one the table does not know.
  const languages = recruitmentLanguageRequirements(term).flatMap(requirement => {
    const typed = requirement.codes.length ? [] : recruitmentLanguagePrefixCodes(requirement.text);
    if (typed.length) return [{ ...requirement, codes: typed, anyOf: [requirement.text] }];
    return requirement.codes.length && !requirement.anyOf.length ? requirement.codes.map(code => ({ ...requirement, codes: [code] })) : [requirement];
  });
  return and(...languages.map(language => {
    const declaredWith = declared.filter(item => meetsRequiredLanguage(item.names, language)).map(item => item.value);
    const readWith = readLanguages.map(row => row.language).filter(name => givesRequiredLanguage(name, language));
    return or(
      declaredWith.length ? inArray(cvApplications.languages, declaredWith) : undefined,
      readWith.length ? and(
        eq(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION),
        inArray(cvApplications.id, db.select({ applicationId: cvCandidateLanguages.applicationId }).from(cvCandidateLanguages).where(inArray(cvCandidateLanguages.language, readWith))),
      ) : undefined,
    ) ?? sql`FALSE`;
  })) ?? sql`FALSE`;
}

/** The languages an analysis of the current version retained (normalized_languages), none for an older one. */
export const verifiedNormalizedLanguages = sql<string | null>`CASE WHEN ${cvApplications.analysisPromptVersion} = ${RECRUITMENT_ANALYSIS_PROMPT_VERSION} THEN ${cvApplications.normalizedLanguages} ELSE NULL END`;
