import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import { cvApplications, clientBriefs, clientBriefCandidates } from "../../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { logRecruitmentAction } from "../../recruitmentAudit";
import { computeBriefCandidateMatch } from "../../clientBriefMatching";
import { postgresErrorCode } from "../../languageColumns";
import { parseAdminDate, getParisParts, pad, parisDateKey } from "../parisTime";
import { missionRefusal, verifiedRecruitmentScore, openShortlist, certificationFactsByApplication, languageFactsByApplication } from "./recruitmentShared";

/**
 * Bound of a mission's ranking (ADM-04): the compatibility of every open
 * application is computed before sorting and paging, in three queries (the
 * applications, their certifications, their languages). Beyond this many open
 * applications, only the most recent ones are ranked, with the candidates
 * already associated with the mission, and the screen says so.
 * About 2 KB a row, a few MB per request at most.
 */
export const MISSION_MATCHING_MAX_CANDIDATES = 2_000;

// Employer mission briefs and their human-reviewed candidate associations.
export const adminClientBriefsRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(clientBriefs).orderBy(desc(clientBriefs.createdAt));
  }),
  updateStatus: adminProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["new", "reviewing", "shortlist_sent", "contract_signed", "closed"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const [brief] = await db.select({ id: clientBriefs.id, acknowledgedAt: clientBriefs.acknowledgedAt, shortlistSentAt: clientBriefs.shortlistSentAt }).from(clientBriefs).where(eq(clientBriefs.id, input.id)).limit(1);
      if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "Brief introuvable" });
      const now = new Date();
      await db.update(clientBriefs).set({
        status: input.status,
        // First qualification = acknowledgement; first shortlist sent is dated.
        ...(input.status !== "new" && !brief.acknowledgedAt ? { acknowledgedAt: now } : {}),
        ...(input.status === "shortlist_sent" && !brief.shortlistSentAt ? { shortlistSentAt: now } : {}),
      }).where(eq(clientBriefs.id, input.id));
      return { success: true };
    }),
  candidates: adminProcedure
    .input(z.object({
      briefId: z.number().int().positive(),
      page: z.number().int().min(0).max(10_000).default(0),
      limit: z.number().int().min(10).max(50).default(25),
      // ADM-04 filters, applied after ranking and before paging.
      minimumMatch: z.number().int().min(0).max(100).optional(),
      shortlist: z.enum(["all", "shortlisted", "not_shortlisted"]).default("all"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { brief: null, candidates: [], shortlistedCount: 0, consentedCount: 0, ranking: { eligible: 0, ranked: 0 }, pagination: { page: input.page, limit: input.limit, total: 0, totalPages: 0 } };
      const [brief] = await db.select().from(clientBriefs).where(eq(clientBriefs.id, input.briefId)).limit(1);
      if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "Brief employeur introuvable" });
      const candidateConditions = [sql`${cvApplications.status} NOT IN ('rejected', 'archived')`];
      const [countResult] = await db.select({ total: sql<number>`COUNT(*)` }).from(cvApplications).where(and(...candidateConditions));
      // Every open application is ranked, not one page of the AI score order (ADM-04).
      const candidateColumns = {
        id: cvApplications.id,
        trackingId: cvApplications.trackingId,
        firstName: cvApplications.firstName,
        lastName: cvApplications.lastName,
        specialty: cvApplications.specialty,
        targetCountries: cvApplications.targetCountries,
        certifications: cvApplications.certifications,
        languages: cvApplications.languages,
        yearsExperience: cvApplications.yearsExperience,
        availability: cvApplications.availability,
        mobility: cvApplications.mobility,
        aiScore: verifiedRecruitmentScore,
        status: cvApplications.status,
        // The earliest date the candidate's agreement can bear (RGPD-03).
        createdAt: cvApplications.createdAt,
      };
      const [recentApplications, associations] = await Promise.all([
        db.select(candidateColumns).from(cvApplications)
          .where(and(...candidateConditions))
          .orderBy(desc(cvApplications.createdAt), desc(cvApplications.id))
          .limit(MISSION_MATCHING_MAX_CANDIDATES),
        db.select().from(clientBriefCandidates).where(eq(clientBriefCandidates.briefId, brief.id)),
      ]);
      // Beyond the bound, the mission's own candidates are ranked too, however
      // old: a shortlisted one stays on screen, to note their agreement or
      // remove them from the shortlist.
      const recentIds = new Set(recentApplications.map(application => application.id));
      const associatedOutsideBound = recentApplications.length < MISSION_MATCHING_MAX_CANDIDATES
        ? []
        : associations.map(association => association.applicationId).filter(id => !recentIds.has(id));
      const applications = associatedOutsideBound.length
        ? [...recentApplications, ...await db.select(candidateColumns).from(cvApplications).where(and(...candidateConditions, inArray(cvApplications.id, associatedOutsideBound)))]
        : recentApplications;
      const [certificationsByApplication, languagesByApplication] = await Promise.all([
        certificationFactsByApplication(db, applications),
        languageFactsByApplication(db, applications),
      ]);
      const associationByApplication = new Map(associations.map(association => [association.applicationId, association]));
      const ranked = applications.map(application => ({
        ...application,
        match: computeBriefCandidateMatch(brief, {
          ...application,
          certificationFacts: certificationsByApplication.get(application.id) ?? [],
          languageFacts: languagesByApplication.get(application.id) ?? [],
        }),
        association: associationByApplication.get(application.id) ?? null,
      }))
        // Best compatibility first, then the verified AI score with the
        // dossiers without one after every scored one, then the newest.
        .sort((left, right) => right.match.score - left.match.score
          || Number(left.aiScore === null) - Number(right.aiScore === null)
          || (right.aiScore ?? 0) - (left.aiScore ?? 0)
          || right.id - left.id)
        .filter(candidate => candidate.match.score >= (input.minimumMatch ?? 0))
        .filter(candidate => input.shortlist === "all" || (candidate.association?.status === "shortlisted") === (input.shortlist === "shortlisted"));
      const total = ranked.length;
      const totalPages = Math.ceil(total / input.limit);
      // A candidate leaving the filtered list (removed from the shortlist, a
      // confirmation withdrawn) can empty the page asked for: the last page
      // is returned instead, and pagination.page says which.
      const page = Math.min(input.page, Math.max(0, totalPages - 1));
      const candidates = ranked.slice(page * input.limit, (page + 1) * input.limit);
      // What the shortlist export would carry, across every page (REC-01):
      // only the candidates who agreed to be presented (RGPD-03).
      const shortlist = await openShortlist(db, brief.id);
      return {
        brief,
        candidates,
        shortlistedCount: shortlist.length,
        consentedCount: shortlist.filter(candidate => candidate.candidateConsentAt).length,
        ranking: { eligible: Number(countResult?.total || 0), ranked: applications.length },
        pagination: { page, limit: input.limit, total, totalPages },
      };
    }),
  associateCandidate: adminProcedure
    .input(z.object({
      briefId: z.number().int().positive(),
      applicationId: z.number().int().positive(),
      matchScore: z.number().int().min(0).max(100).optional(),
      status: z.enum(["suggested", "reviewing", "shortlisted", "declined"]).default("suggested"),
      notes: z.string().trim().max(5_000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      // Never an association to a mission or an application that does not
      // exist (DATA-01): the table has no foreign key to refuse it.
      const [[brief], [application]] = await Promise.all([
        db.select({ id: clientBriefs.id }).from(clientBriefs).where(eq(clientBriefs.id, input.briefId)).limit(1),
        db.select({ id: cvApplications.id }).from(cvApplications).where(eq(cvApplications.id, input.applicationId)).limit(1),
      ]);
      if (!brief) throw missionRefusal("NOT_FOUND", "association_brief_not_found", "Cette mission n’existe plus.");
      if (!application) throw missionRefusal("NOT_FOUND", "association_application_not_found", "Cette candidature n’existe plus : elle a peut-être été effacée.");
      // One row per mission and candidate, even for simultaneous calls: an
      // upsert on the unique index of drizzle/pg/0004. A score or note left
      // out keeps the stored one.
      const association = {
        briefId: input.briefId,
        applicationId: input.applicationId,
        matchScore: input.matchScore ?? null,
        status: input.status,
        notes: input.notes ?? null,
      };
      const changes = {
        status: input.status,
        updatedAt: new Date(),
        ...(input.matchScore !== undefined ? { matchScore: input.matchScore } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      };
      try {
        await db.insert(clientBriefCandidates).values(association).onConflictDoUpdate({
          target: [clientBriefCandidates.briefId, clientBriefCandidates.applicationId],
          set: changes,
        });
      } catch (error) {
        // Until 0004 is applied there is no index for the upsert (42P10):
        // the former read-then-write keeps the shortlist working meanwhile,
        // on the copy updated last, the one 0004 keeps.
        if (postgresErrorCode(error) !== "42P10") throw error;
        console.warn("[Database] client_brief_candidates_pair_unique missing: apply drizzle/pg/0004_integrity_constraints.sql");
        const [existing] = await db.select({ id: clientBriefCandidates.id }).from(clientBriefCandidates)
          .where(and(eq(clientBriefCandidates.briefId, input.briefId), eq(clientBriefCandidates.applicationId, input.applicationId)))
          .orderBy(desc(clientBriefCandidates.updatedAt), clientBriefCandidates.id)
          .limit(1);
        if (existing) await db.update(clientBriefCandidates).set(changes).where(eq(clientBriefCandidates.id, existing.id));
        else await db.insert(clientBriefCandidates).values(association);
      }
      return { success: true };
    }),
  // Date the candidate agreed to be presented for this mission (RGPD-03),
  // by email or phone; null withdraws it. The shortlist export carries
  // only the candidates who have one.
  setCandidateConsent: adminProcedure
    .input(z.object({
      briefId: z.number().int().positive(),
      applicationId: z.number().int().positive(),
      consentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const consentAt = input.consentDate === null ? null : parseAdminDate(input.consentDate);
      if (input.consentDate !== null && !consentAt) throw missionRefusal("BAD_REQUEST", "consent_date_invalid", "Date de l’accord invalide.");
      const today = getParisParts(new Date());
      if (input.consentDate !== null && input.consentDate > `${today.year}-${pad(today.month)}-${pad(today.day)}`) {
        throw missionRefusal("BAD_REQUEST", "consent_date_future", "La date de l’accord du candidat ne peut pas être dans le futur.");
      }
      const [association] = await db.select({ id: clientBriefCandidates.id }).from(clientBriefCandidates)
        .where(and(eq(clientBriefCandidates.briefId, input.briefId), eq(clientBriefCandidates.applicationId, input.applicationId)))
        .limit(1);
      if (!association) throw missionRefusal("NOT_FOUND", "consent_not_associated", "Ce candidat n’est pas associé à cette mission : présélectionnez-le d’abord.");
      if (input.consentDate !== null) {
        // Nor before the application or the mission: the candidate agreed
        // to be presented for a mission they had applied for, once it
        // existed. The same day is accepted (days in Paris).
        const [[application], [brief]] = await Promise.all([
          db.select({ createdAt: cvApplications.createdAt }).from(cvApplications).where(eq(cvApplications.id, input.applicationId)).limit(1),
          db.select({ createdAt: clientBriefs.createdAt }).from(clientBriefs).where(eq(clientBriefs.id, input.briefId)).limit(1),
        ]);
        const applicationDay = application ? parisDateKey(application.createdAt) : "";
        const briefDay = brief ? parisDateKey(brief.createdAt) : "";
        // The screen words the reason in the admin's language, with this day.
        const earliest = briefDay > applicationDay
          ? { day: briefDay, event: "la création de la mission, le", reason: "consent_before_mission" as const }
          : { day: applicationDay, event: "sa candidature, reçue le", reason: "consent_before_application" as const };
        if (input.consentDate < earliest.day) {
          throw missionRefusal("BAD_REQUEST", earliest.reason, `La date de l’accord du candidat ne peut pas précéder ${earliest.event} ${earliest.day.split("-").reverse().join("/")}.`, earliest.day);
        }
      }
      await db.update(clientBriefCandidates).set({ candidateConsentAt: consentAt, updatedAt: new Date() }).where(eq(clientBriefCandidates.id, association.id));
      await logRecruitmentAction({ applicationId: input.applicationId, adminOpenId: ctx.user.openId, action: "status_update", metadata: { event: "mission_consent", briefId: input.briefId, consentDate: input.consentDate } });
      return { success: true, candidateConsentAt: consentAt };
    }),
});
