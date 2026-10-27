// Shared by the recruitment admin routers and the employer missions: verified AI score, certification and language facts, shortlist, mission refusals.

import { PublicErrorReason } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../../db";
import { cvApplications, cvCandidateCertifications, cvCandidateLanguages, clientBriefCandidates } from "../../../drizzle/schema";
import { eq, and, or, sql, inArray, isNotNull, type SQL } from "drizzle-orm";
import { certificationFacts, languageFacts, type CertificationRow, type LanguageRow } from "../../clientBriefMatching";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "../../recruitmentAnalysis";
import { adminFilterContains } from "../../adminSearch";
import type { CertificationRenewalRefusalReason, MissionAssociationRefusalReason, MissionConsentRefusalReason } from "../../../shared/recruitmentMissionRefusalReasons";

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

/**
 * Certifications of these applications with their origins (IA-02): the
 * declared text and the cv_candidate_certifications rows, one query whatever
 * the number of applications.
 */
export async function certificationFactsByApplication(db: AdminDb, applications: Array<{ id: number; certifications: string | null }>) {
  const rows = applications.length
    ? groupByApplication(await db.select({ applicationId: cvCandidateCertifications.applicationId, name: cvCandidateCertifications.name, source: cvCandidateCertifications.source, confirmedAt: cvCandidateCertifications.confirmedAt, expiresAt: cvCandidateCertifications.expiresAt })
      .from(cvCandidateCertifications)
      .where(inArray(cvCandidateCertifications.applicationId, applications.map(application => application.id))))
    : new Map<number, CertificationRow[]>();
  return new Map(applications.map(application => [application.id, certificationFacts(application.certifications, rows.get(application.id) ?? [])]));
}

/** Languages of these applications with their origins (declared, read in the CV), one query. */
export async function languageFactsByApplication(db: AdminDb, applications: Array<{ id: number; languages: string | null }>) {
  const rows = applications.length
    ? groupByApplication(await db.select({ applicationId: cvCandidateLanguages.applicationId, language: cvCandidateLanguages.language, source: cvCandidateLanguages.source })
      .from(cvCandidateLanguages)
      .where(inArray(cvCandidateLanguages.applicationId, applications.map(application => application.id))))
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
