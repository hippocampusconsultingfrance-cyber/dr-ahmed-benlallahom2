import { adminProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { cvApplications } from "../../../drizzle/schema";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "../../recruitmentAnalysis";
import { adminFilterContains } from "../../adminSearch";
import { verifiedRecruitmentScore, scoreAtLeastOrUnavailable, verifiedScoreFirst, certificationFactsByApplication, certificationFilterCondition } from "./recruitmentShared";

export const recruitmentPoolFiltersInput = z.object({
  specialty: z.string().trim().max(160).optional(),
  country: z.string().trim().max(80).optional(),
  availability: z.string().trim().max(100).optional(),
  mobility: z.string().trim().max(150).optional(),
  certification: z.string().trim().max(180).optional(),
  minimumScore: z.number().int().min(0).max(100).optional(),
  limit: z.number().int().min(1).max(200).optional().default(200),
}).optional();

export const adminRecruitmentPoolRouter = router({
  list: adminProcedure
    .input(recruitmentPoolFiltersInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [
        eq(cvApplications.marketingConsent, 1),
        isNull(cvApplications.marketingUnsubscribedAt),
        isNull(cvApplications.marketingSuppressedAt),
        sql`${cvApplications.status} NOT IN ('rejected', 'archived')`,
      ];
      if (input?.specialty) conditions.push(sql`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${input.specialty}%`})`);
      if (input?.country) conditions.push(adminFilterContains(cvApplications.targetCountries, input.country));
      if (input?.availability) conditions.push(sql`LOWER(COALESCE(${cvApplications.availability}, '')) LIKE LOWER(${`%${input.availability}%`})`);
      // Mobility reads the target countries too, accents aside as under « Pays ciblé ».
      if (input?.mobility) conditions.push(sql`(${adminFilterContains(cvApplications.mobility, input.mobility)} OR ${adminFilterContains(cvApplications.targetCountries, input.mobility)})`);
      if (input?.certification) conditions.push(await certificationFilterCondition(db, input.certification, sql`(${adminFilterContains(cvApplications.certifications, input.certification)} OR (${cvApplications.analysisPromptVersion} = ${RECRUITMENT_ANALYSIS_PROMPT_VERSION} AND ${adminFilterContains(cvApplications.normalizedCertifications, input.certification)}))`));
      if (input?.minimumScore) conditions.push(scoreAtLeastOrUnavailable(input.minimumScore));
      const candidates = await db.select({
        id: cvApplications.id,
        firstName: cvApplications.firstName,
        lastName: cvApplications.lastName,
        email: cvApplications.email,
        specialty: cvApplications.specialty,
        targetCountries: cvApplications.targetCountries,
        languages: cvApplications.languages,
        availability: cvApplications.availability,
        mobility: cvApplications.mobility,
        certifications: cvApplications.certifications,
        aiScore: verifiedRecruitmentScore,
        status: cvApplications.status,
        marketingConsent: cvApplications.marketingConsent,
        createdAt: cvApplications.createdAt,
      }).from(cvApplications).where(and(...conditions)).orderBy(verifiedScoreFirst, desc(cvApplications.createdAt)).limit(input?.limit || 200);
      // With their origins: the certification filter also matches what the AI read in the CV (IA-02).
      const certificationsByApplication = await certificationFactsByApplication(db, candidates);
      return candidates.map(candidate => ({ ...candidate, certificationFacts: certificationsByApplication.get(candidate.id) ?? [] }));
    }),
});
