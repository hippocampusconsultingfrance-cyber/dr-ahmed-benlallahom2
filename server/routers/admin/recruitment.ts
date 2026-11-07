import { RECRUITMENT_EXPORT_MAX_CANDIDATES } from "../../../shared/recruitmentExportLimits";
import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import {
  candidateAccounts,
  cvApplications,
  cvGoogleDriveExportJobs,
  recruitmentMatchProfiles,
  clientBriefs,
  recruitmentCampaigns,
  recruitmentCampaignRecipients,
  recruitmentEmailEvents,
  recruitmentFollowUpTasks,
} from "../../../drizzle/schema";
import { storageGetSignedUrl } from "../../storage";
import { canAdminDownloadCv, CV_DOWNLOAD_UNAVAILABLE_MESSAGE } from "../../recruitmentDownloadPolicy";
import { eq, and, or, sql, desc, inArray, isNull, ne } from "drizzle-orm";
import { sendRecruitmentTemplateEmail, type RecruitmentEmailLanguage, type RecruitmentEmailTemplate } from "../../_core/notifications";
import { logRecruitmentAction, matchesRecruitmentProfile, parseRecruitmentJsonArray, RECRUITMENT_PROFILE_SCAN_LIMIT, recordWithRecruitmentAudit, recruitmentAuditInsert, traceRecruitmentActionDone } from "../../recruitmentAudit";
import { analysedLanguageNames } from "../../clientBriefMatching";
import { certificationFactLabel, recruitmentFactLabel, type RecruitmentFact } from "../../../shared/recruitmentFactOrigins";
import { recruitmentApplicationStatusLabel } from "../../../shared/recruitmentApplicationStatuses";
import { googleDriveExportStatus } from "../../googleDriveExport";
import {
  candidatePortalAccountMatchesApplication,
  resolveCandidatePortalActivationDelivery,
  resolveCandidatePortalInvitationDelivery,
  resolveCvConfirmationDelivery,
  retryCvConfirmationEmail,
} from "../../recruitmentEmailTrace";
import { AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR, MANUAL_REVIEW_FALLBACK_MODEL, RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "../../recruitmentAnalysis";
import { adminFilterContains, adminSearchCondition, adminSearchInput } from "../../adminSearch";
import {
  verifiedRecruitmentScore,
  scoreAtLeastOrUnavailable,
  verifiedScoreFirst,
  openShortlist,
  certificationFactsByApplication,
  languageFactsByApplication,
  certificationFilterCondition,
  languageFilterCondition,
  verifiedNormalizedLanguages,
} from "./recruitmentShared";
import { adminRecruitmentPoolRouter } from "./recruitmentPool";
import { adminRecruitmentCampaignsRouter, adminRecruitmentOfferTemplatesRouter } from "./recruitmentCampaigns";
import { adminRecruitmentCandidateRouter, adminRecruitmentFollowUpsRouter } from "./recruitmentCandidate";

const CV_APPLICATION_STATUSES = ["new", "reviewing", "shortlisted", "placed", "rejected", "archived"] as const;

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
}

/** A list stored as JSON (target countries) as a CSV cell reads it: « Émirats arabes unis ; Qatar ». Free text stays as typed. */
function csvListCell(value: string | null) {
  return value?.trim().startsWith("[") ? parseRecruitmentJsonArray(value).join(" ; ") : value;
}

/**
 * What a spreadsheet opening the file (Calc or Excel, in French as in English
 * or German) reads as a number or a date rather than text: digits alone, digits
 * grouped by three like thousands (« 51 000 010 »), a decimal number, a date
 * (« 06-12-34 »).
 */
const SPREADSHEET_NUMBER_OR_DATE = /^(?:\d+|\d{1,3}(?:[ ,.\u00a0\u202f]\d{3})+|\d+[.,]\d+|\d{1,4}[-/.]\d{1,2}(?:[-/.]\d{1,4})?)$/;

/**
 * ADM-26: a phone number as the exports write it, so that a spreadsheet keeps
 * it as text, leading zeros included, with nothing to clean by hand before it
 * is passed on. An international number leaves with « 00 » instead of its
 * « + », the same number dialled from abroad (« +216 51 000 010 » gives
 * « 00216 51 000 010 »): a « + » is read as a formula, so csvCell would show
 * it behind an apostrophe. A number a spreadsheet would read as a number or a
 * date (SPREADSHEET_NUMBER_OR_DATE) leaves with its digits set apart: its
 * « 00 » by one space (« +21651000010 » and « 0021651000010 » give
 * « 00 21651000010 »), the others by two from the end (« 0612345678 » gives
 * « 06 12 34 56 78 »). Any other number leaves as typed. The other columns
 * keep the protection.
 */
function csvPhoneValue(phone: string | null) {
  if (!phone) return phone;
  const typed = phone.trim();
  const written = typed.startsWith("+") ? `00${typed.slice(1)}` : typed;
  if (!SPREADSHEET_NUMBER_OR_DATE.test(written)) return written;
  const digits = written.replace(/\D/g, "");
  return digits.startsWith("00") ? `00 ${digits.slice(2)}` : digits.replace(/\B(?=(?:\d{2})+$)/g, " ");
}

/** What really happened to a manual CV re-analysis (ADM-REC-02). */
export function reanalysisOutcome(
  queue: { alreadyRunning: boolean },
  processing: { processed: number; results: Array<Record<string, unknown>> },
): { outcome: "completed" | "needs_review" | "ai_unavailable" | "retry_scheduled" | "failed" | "already_running" | "queued"; error: string | null } {
  const result = processing.results[0];
  if (!processing.processed || !result) return { outcome: queue.alreadyRunning ? "already_running" : "queued", error: null };
  if (result.completed === true && result.aiUnavailable === true) return { outcome: "ai_unavailable", error: AI_ANALYSIS_BILLING_UNAVAILABLE_ERROR };
  if (result.completed === true) return { outcome: result.needsReview ? "needs_review" : "completed", error: null };
  const error = typeof result.error === "string" ? result.error : typeof result.reason === "string" ? result.reason : null;
  return { outcome: result.retry ? "retry_scheduled" : "failed", error };
}

/** What really happened to a manual Google Drive copy (ADM-DRIVE-01). */
export function driveRetryOutcome(
  queue: { alreadyCompleted: boolean; alreadyRunning: boolean },
  processing: { processed: number; waitingForAuthorization?: boolean; reconnectRequired?: boolean; results: Array<Record<string, unknown>> },
): { outcome: "completed" | "already_completed" | "already_running" | "not_connected" | "reconnect_required" | "waiting_validation" | "retry_scheduled" | "failed" | "queued"; error: string | null } {
  if (queue.alreadyCompleted) return { outcome: "already_completed", error: null };
  if (queue.alreadyRunning) return { outcome: "already_running", error: null };
  // Revoked Google token: the copy waits for the reconnection (REC-09).
  if (processing.reconnectRequired || processing.results[0]?.reconnectRequired === true) return { outcome: "reconnect_required", error: "google_drive_token_invalid_grant" };
  if (processing.waitingForAuthorization) return { outcome: "not_connected", error: "google_drive_not_connected" };
  const result = processing.results[0];
  if (!processing.processed || !result) return { outcome: "queued", error: null };
  if (result.completed === true) return { outcome: "completed", error: null };
  if (result.reason === "cv_not_accepted") return { outcome: "waiting_validation", error: null };
  if (result.reason === "connection_missing") return { outcome: "not_connected", error: "google_drive_not_connected" };
  const error = typeof result.error === "string" ? result.error : typeof result.reason === "string" ? result.reason : null;
  return { outcome: result.retry ? "retry_scheduled" : "failed", error };
}

/**
 * What a resent « accusé de dépôt » became, said when its audit line is refused
 * (DATA-01): sent, refused by Resend or of uncertain delivery, as the screen says it.
 */
const CONFIRMATION_RETRY_DONE: Record<"sent" | "failed" | "delivery_unknown", string> = {
  sent: "L’accusé de dépôt est renvoyé.",
  failed: "Resend a refusé l’e-mail. Vérifiez la configuration et le suivi.",
  delivery_unknown: "La réponse de Resend est incertaine. Vérifiez le suivi avant tout nouvel envoi pour éviter un doublon.",
};

/** The same for a re-analysis started: queued or run, and what came of it; « already running » changed nothing. */
const REANALYSIS_DONE: Record<Exclude<ReturnType<typeof reanalysisOutcome>["outcome"], "already_running">, string> = {
  completed: "L’analyse est relancée et son résultat actualisé.",
  needs_review: "L’analyse est relancée et son résultat actualisé : des points demandent une revue humaine.",
  ai_unavailable: "L’analyse est relancée, mais le fournisseur d’IA la refuse : examinez le CV manuellement.",
  queued: "L’analyse est remise en file : elle sera traitée au prochain passage.",
  retry_scheduled: "L’analyse relancée a échoué ; une nouvelle tentative est programmée.",
  failed: "L’analyse relancée a échoué : examinez le CV manuellement.",
};

/** The same for a Drive copy requeued: copied, waiting or failed; one already done or running changed nothing. */
const DRIVE_RETRY_DONE: Record<Exclude<ReturnType<typeof driveRetryOutcome>["outcome"], "already_completed" | "already_running">, string> = {
  completed: "Le CV est copié dans Google Drive.",
  queued: "La copie Google Drive est remise en file.",
  waiting_validation: "La copie Google Drive est remise en file : elle suivra la validation du CV par le contrôle de sécurité.",
  not_connected: "La copie Google Drive est remise en file, mais Google Drive n’est pas connecté : connectez-le depuis l’en-tête de l’onglet.",
  reconnect_required: "La copie Google Drive est remise en file : elle repartira après la reconnexion de Google Drive.",
  retry_scheduled: "La copie Google Drive a échoué ; une nouvelle tentative est prévue.",
  failed: "La copie Google Drive a échoué : consultez le détail du dossier.",
};

// International recruitment applications
export const adminRecruitmentRouter = router({
  confirmationEmail: router({
    retry: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const result = await retryCvConfirmationEmail(input.id, { allowUntracked: true });
      if (result.outcome === "not_found") throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable." });
      if (result.outcome === "blocked") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cette adresse a rejeté ou bloqué l’e-mail. Vérifiez-la avant tout nouvel envoi." });
      if (result.outcome === "exhausted") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Les tentatives automatiques sont épuisées. Vérifiez la configuration Resend avant un nouvel essai." });
      const record = { applicationId: input.id, adminOpenId: ctx.user.openId, action: "email" as const, metadata: { template: "application_confirmation_retry", outcome: result.outcome } };
      // Sent, refused by Resend or of uncertain delivery, the email was tried. Otherwise (already sent,
      // untracked) nothing was sent: a refused line leaves nothing changed, as the screen then says.
      if (result.outcome === "sent" || result.outcome === "failed" || result.outcome === "delivery_unknown") await traceRecruitmentActionDone([record], CONFIRMATION_RETRY_DONE[result.outcome]);
      else await logRecruitmentAction(record);
      return result;
    }),
  }),
  driveExport: router({
    status: adminProcedure.query(async () => googleDriveExportStatus()),
    retry: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de données indisponible." });
      const [application] = await db.select({ id: cvApplications.id }).from(cvApplications).where(eq(cvApplications.id, input.id)).limit(1);
      if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable." });
      const { processDueCvGoogleDriveExports, retryCvGoogleDriveExport } = await import("../../googleDriveExport");
      const queue = await retryCvGoogleDriveExport(application.id);
      const processing = queue.alreadyCompleted || queue.alreadyRunning
        ? { processed: 0, waitingForAuthorization: false, reconnectRequired: false, results: [] as Array<Record<string, unknown>> }
        : await processDueCvGoogleDriveExports(1, [application.id]);
      const outcome = driveRetryOutcome(queue, processing);
      const record = {
        applicationId: application.id,
        adminOpenId: ctx.user.openId,
        action: "export" as const,
        metadata: { event: "google_drive_retry", ...queue, processed: processing.processed, outcome: outcome.outcome },
      };
      // Already copied or being copied, nothing was requeued: a refused line leaves nothing changed.
      if (outcome.outcome === "already_completed" || outcome.outcome === "already_running") await logRecruitmentAction(record);
      else await traceRecruitmentActionDone([record], DRIVE_RETRY_DONE[outcome.outcome]);
      return { success: true, ...queue, processed: processing.processed, ...outcome };
    }),
    // « Relancer toutes les copies échouées » (REC-09).
    retryAllFailed: adminProcedure.mutation(async ({ ctx }) => {
      const { googleDriveConnectionWait, processDueCvGoogleDriveExports, retryAllFailedCvGoogleDriveExports } = await import("../../googleDriveExport");
      const queue = await retryAllFailedCvGoogleDriveExports();
      // Requeued already: their lines in one statement, all or none.
      await traceRecruitmentActionDone(
        queue.applicationIds.map(applicationId => ({ applicationId, adminOpenId: ctx.user.openId, action: "export" as const, metadata: { event: "google_drive_retry", batch: true } })),
        `${queue.requeued} copie(s) Google Drive remise(s) en file.`,
      );
      // A few copies inline (each one downloads and uploads a CV); the cron copies the rest.
      // Nothing to copy: the connection's real state all the same (REC-09).
      const processing = queue.requeued > 0
        ? await processDueCvGoogleDriveExports(3, queue.applicationIds)
        : { processed: 0, ...await googleDriveConnectionWait(), results: [] as Array<Record<string, unknown>> };
      return {
        success: true,
        requeued: queue.requeued,
        processed: processing.processed,
        copied: processing.results.filter(result => result.completed === true).length,
        // A skipped copy (CV awaiting its security check, claim lost) is not a
        // failure, nor one waiting for the Drive reconnection (reconnectRequired).
        failedAgain: processing.results.filter(result => result.completed === false && result.reconnectRequired !== true).length,
        reconnectRequired: processing.reconnectRequired,
        notConnected: processing.waitingForAuthorization && !processing.reconnectRequired,
      };
    }),
  }),
  list: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
        status: z.enum(CV_APPLICATION_STATUSES).optional(),
        specialty: z.string().trim().max(160).optional(),
        country: z.string().trim().max(80).optional(),
        language: z.string().trim().max(80).optional(),
        certification: z.string().trim().max(160).optional(),
        minimumScore: z.number().int().min(0).max(100).optional(),
        profileId: z.number().int().positive().optional(),
        /** First name, last name, email or application reference (ADM-02). */
        search: adminSearchInput,
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions = [];
      if (input.status) conditions.push(eq(cvApplications.status, input.status));
      const search = adminSearchCondition(input.search, [cvApplications.firstName, cvApplications.lastName, cvApplications.email, cvApplications.trackingId], { firstName: cvApplications.firstName, lastName: cvApplications.lastName });
      if (search) conditions.push(search);
      // Specialty, country, language and certification, case and accents aside, like the pool and a
      // campaign's filtered audience: « anesthesie » finds « Anesthésie » (INTL-12), « dha » « Licence DHA »,
      // « emirats » « Émirats arabes unis »; a % or _ typed matches itself.
      if (input.specialty) conditions.push(adminFilterContains(cvApplications.specialty, input.specialty));
      if (input.country) conditions.push(adminFilterContains(cvApplications.targetCountries, input.country));
      // A language by any of its names (IA-02): « arabe » finds « Arabic » too.
      if (input.language) conditions.push(await languageFilterCondition(db, input.language));
      if (input.certification) conditions.push(await certificationFilterCondition(db, input.certification, sql`((${cvApplications.analysisPromptVersion} = ${RECRUITMENT_ANALYSIS_PROMPT_VERSION} AND ${adminFilterContains(cvApplications.normalizedCertifications, input.certification)}) OR ${adminFilterContains(cvApplications.certifications, input.certification)})`));

      let profile: typeof recruitmentMatchProfiles.$inferSelect | null = null;
      if (input.profileId) {
        const [selectedProfile] = await db.select().from(recruitmentMatchProfiles)
          .where(and(eq(recruitmentMatchProfiles.id, input.profileId), eq(recruitmentMatchProfiles.active, 1)))
          .limit(1);
        if (!selectedProfile) throw new TRPCError({ code: "NOT_FOUND", message: "Profil de matching introuvable" });
        profile = selectedProfile;
        if (selectedProfile.specialty) conditions.push(adminFilterContains(cvApplications.specialty, selectedProfile.specialty));
        if (selectedProfile.targetCountry) conditions.push(adminFilterContains(cvApplications.targetCountries, selectedProfile.targetCountry));
      }
      const minimumScore = Math.max(input.minimumScore ?? 0, profile?.minimumScore ?? 0);
      if (minimumScore > 0) conditions.push(scoreAtLeastOrUnavailable(minimumScore));
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      // With a threshold, the dossiers without a score come after every scored one, not page by page.
      const listOrder = [...(minimumScore > 0 ? [sql`(${verifiedRecruitmentScore} IS NULL)`] : []), desc(cvApplications.createdAt)];

      // A matching profile's languages and skills are checked here, not in SQL: every dossier the
      // other filters keep is checked on the few columns it needs (up to RECRUITMENT_PROFILE_SCAN_LIMIT,
      // said in the answer when reached), then only the page asked for is read in full. The total
      // counts every match, not only those among the first rows.
      let profilePage: { ids: number[]; total: number; scanLimited: boolean } | null = null;
      if (profile) {
        const matchProfile = profile;
        const scanned = await db
          .select({
            id: cvApplications.id,
            aiScore: verifiedRecruitmentScore,
            specialty: cvApplications.specialty,
            targetCountries: cvApplications.targetCountries,
            languages: cvApplications.languages,
            // The languages an analysis of the current version read in the CV too (IA-02), their names
            // only, those the Langue filter reads in cv_candidate_languages, written in the same batch;
            // only for a profile that requires some: this JSON carries the CV's quotes.
            normalizedLanguages: parseRecruitmentJsonArray(matchProfile.requiredLanguages).length ? verifiedNormalizedLanguages : sql<string | null>`NULL`,
            // The AI's skills, the largest of these columns, only for a profile that requires some.
            aiExtractedSkills: parseRecruitmentJsonArray(matchProfile.requiredSkills).length ? cvApplications.aiExtractedSkills : sql<string | null>`NULL`,
          })
          .from(cvApplications)
          .where(whereClause)
          // The id breaks ties, so that each page reads the matches in the same order.
          .orderBy(...listOrder, desc(cvApplications.id))
          .limit(RECRUITMENT_PROFILE_SCAN_LIMIT + 1);
        const matchedIds = scanned.slice(0, RECRUITMENT_PROFILE_SCAN_LIMIT)
          .filter(item => matchesRecruitmentProfile({
            score: item.aiScore,
            specialty: item.specialty,
            targetCountries: parseRecruitmentJsonArray(item.targetCountries),
            languages: [...parseRecruitmentJsonArray(item.languages), ...analysedLanguageNames(item.normalizedLanguages)],
            extractedSkills: (() => {
              try {
                const parsed = item.aiExtractedSkills ? JSON.parse(item.aiExtractedSkills) : {};
                return Array.isArray(parsed.verifiedSkills) ? parsed.verifiedSkills.filter((value: unknown): value is string => typeof value === "string") : [];
              } catch { return []; }
            })(),
            profile: matchProfile,
          }))
          .map(item => item.id);
        profilePage = { ids: matchedIds.slice(input.offset, input.offset + input.limit), total: matchedIds.length, scanLimited: scanned.length > RECRUITMENT_PROFILE_SCAN_LIMIT };
      }

      // ADM-20: what the card shows, folded or open, but not the CV analysis (its summary,
      // strengths, extracted skills and quotes, about 8 KB a dossier), which the open card
      // loads through detail. The CV's own readings (normalized_*) are never sent.
      const rawItems = await db
        .select({
          id: cvApplications.id,
          trackingId: cvApplications.trackingId,
          firstName: cvApplications.firstName,
          lastName: cvApplications.lastName,
          email: cvApplications.email,
          phone: cvApplications.phone,
          specialty: cvApplications.specialty,
          diplomaCountry: cvApplications.diplomaCountry,
          targetCountries: cvApplications.targetCountries,
          languages: cvApplications.languages,
          yearsExperience: cvApplications.yearsExperience,
          availability: cvApplications.availability,
          mobility: cvApplications.mobility,
          certifications: cvApplications.certifications,
          message: cvApplications.message,
          cvOriginalName: cvApplications.cvOriginalName,
          cvSizeBytes: cvApplications.cvSizeBytes,
          fileValidationStatus: cvApplications.fileValidationStatus,
          fileSecurityScanVersion: cvApplications.fileSecurityScanVersion,
          status: cvApplications.status,
          adminNotes: cvApplications.adminNotes,
          retentionUntil: cvApplications.retentionUntil,
          // Read only to say whether the dossier has an analysis (hasAiSummary).
          aiSummary: cvApplications.aiSummary,
          aiScore: verifiedRecruitmentScore,
          aiAnalyzedAt: cvApplications.aiAnalyzedAt,
          analysisStatus: cvApplications.analysisStatus,
          analysisAttempts: cvApplications.analysisAttempts,
          analysisLastError: cvApplications.analysisLastError,
          analysisModel: cvApplications.analysisModel,
          analysisPromptVersion: cvApplications.analysisPromptVersion,
          extractionMethod: cvApplications.extractionMethod,
          extractionTotalPages: cvApplications.extractionTotalPages,
          ocrConfidence: cvApplications.ocrConfidence,
          ocrModelVersion: cvApplications.ocrModelVersion,
          // Language of the application form, preselected for manual emails (EN-02).
          language: cvApplications.language,
          createdAt: cvApplications.createdAt,
        })
        .from(cvApplications)
        .where(profilePage ? inArray(cvApplications.id, profilePage.ids) : whereClause)
        .orderBy(...listOrder)
        .limit(profilePage ? profilePage.ids.length : input.limit)
        .offset(profilePage ? 0 : input.offset);
      // A profile's page in the order of its matches.
      if (profilePage) {
        const position = new Map(profilePage.ids.map((id, index) => [id, index]));
        rawItems.sort((left, right) => position.get(left.id)! - position.get(right.id)!);
      }

      const applicationIds = rawItems.map(item => item.id);
      const applicationEmails = Array.from(new Set(rawItems.map(item => item.email.trim().toLowerCase())));
      const portalAccounts = applicationIds.length
        ? await db.select({ linkedApplicationId: candidateAccounts.linkedApplicationId, email: candidateAccounts.email, emailVerifiedAt: candidateAccounts.emailVerifiedAt })
          .from(candidateAccounts)
          .where(or(
            inArray(candidateAccounts.linkedApplicationId, applicationIds),
            inArray(candidateAccounts.email, applicationEmails),
          ))
        : [];
      const driveExportJobs = applicationIds.length
        ? await db.select({
            applicationId: cvGoogleDriveExportJobs.applicationId,
            status: cvGoogleDriveExportJobs.status,
            attempts: cvGoogleDriveExportJobs.attempts,
            maxAttempts: cvGoogleDriveExportJobs.maxAttempts,
            lastError: cvGoogleDriveExportJobs.lastError,
            driveFileUrl: cvGoogleDriveExportJobs.driveFileUrl,
            finishedAt: cvGoogleDriveExportJobs.finishedAt,
            updatedAt: cvGoogleDriveExportJobs.updatedAt,
          }).from(cvGoogleDriveExportJobs).where(inArray(cvGoogleDriveExportJobs.applicationId, applicationIds))
        : [];
      const emailEvents = applicationIds.length
        ? await db.select({
            applicationId: recruitmentEmailEvents.applicationId,
            eventType: recruitmentEmailEvents.eventType,
            providerEmailId: recruitmentEmailEvents.providerEmailId,
            payload: recruitmentEmailEvents.payload,
            occurredAt: recruitmentEmailEvents.occurredAt,
          }).from(recruitmentEmailEvents)
            .where(inArray(recruitmentEmailEvents.applicationId, applicationIds))
            .orderBy(desc(recruitmentEmailEvents.occurredAt))
        : [];
      // With their origins, shown by the certification filter and the confirmation buttons (IA-02).
      const certificationsByApplication = await certificationFactsByApplication(db, rawItems);
      const driveExportByApplicationId = new Map(driveExportJobs.map(job => [job.applicationId, job]));
      const emailEventsByApplicationId = new Map<number, typeof emailEvents>();
      for (const event of emailEvents) {
        if (!event.applicationId) continue;
        const current = emailEventsByApplicationId.get(event.applicationId) || [];
        current.push(event);
        emailEventsByApplicationId.set(event.applicationId, current);
      }
      const items = rawItems
        .map(({ aiSummary, ...item }) => ({
          ...item,
          hasAiSummary: Boolean(aiSummary),
          candidatePortalActive: portalAccounts.some(account => candidatePortalAccountMatchesApplication(account, item)),
          candidatePortalActivation: resolveCandidatePortalActivationDelivery(emailEventsByApplicationId.get(item.id) || []),
          candidatePortalInvitation: resolveCandidatePortalInvitationDelivery(emailEventsByApplicationId.get(item.id) || []),
          driveExport: driveExportByApplicationId.get(item.id) || null,
          emailDelivery: resolveCvConfirmationDelivery(emailEventsByApplicationId.get(item.id) || []),
          certificationFacts: certificationsByApplication.get(item.id) ?? [],
        }));
      const countResult = profilePage ? [{ count: profilePage.total }] : await db.select({ count: sql<number>`COUNT(*)` }).from(cvApplications).where(whereClause);
      return { items, total: Number(countResult[0]?.count ?? 0), ...(profilePage?.scanLimited ? { profileScanLimit: RECRUITMENT_PROFILE_SCAN_LIMIT } : {}) };
    }),

  /**
   * ADM-20: the CV analysis of a dossier, which the list leaves out, loaded
   * when its card is opened: the summary, the profile and skills read, the
   * evidence and contradictions, the strengths, the points to check, the
   * score's reasoning and the extraction warnings.
   */
  detail: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const [analysis] = await db.select({
      id: cvApplications.id,
      aiSummary: cvApplications.aiSummary,
      aiStrengths: cvApplications.aiStrengths,
      aiWeaknesses: cvApplications.aiWeaknesses,
      aiExtractedSkills: cvApplications.aiExtractedSkills,
      aiMatchReasoning: cvApplications.aiMatchReasoning,
      extractionWarnings: cvApplications.extractionWarnings,
    }).from(cvApplications).where(eq(cvApplications.id, input.id)).limit(1);
    if (!analysis) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable" });
    return analysis;
  }),

  pool: adminRecruitmentPoolRouter,

  campaigns: adminRecruitmentCampaignsRouter,

  dashboard: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [candidateStats] = await db.select({
      total: sql<number>`COUNT(*)`,
      marketingEligible: sql<number>`SUM(CASE WHEN ${cvApplications.marketingConsent} = 1 AND ${cvApplications.marketingUnsubscribedAt} IS NULL AND ${cvApplications.marketingSuppressedAt} IS NULL THEN 1 ELSE 0 END)`,
      analysesQueued: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'queued' THEN 1 ELSE 0 END)`,
      analysesInProgress: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} IN ('extracting', 'analyzing') THEN 1 ELSE 0 END)`,
      analysesCompleted: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'completed' THEN 1 ELSE 0 END)`,
      // A dossier left without AI analysis (degraded) is read by a human too.
      analysesNeedsReview: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} IN ('needs_review', 'degraded') THEN 1 ELSE 0 END)`,
      analysesFailed: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'failed' THEN 1 ELSE 0 END)`,
      contacted: sql<number>`SUM(CASE WHEN ${cvApplications.lastContactedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      // ADM-13: the answers of the contacted profiles only, so that the rate never goes past 100 %
      // when « Le candidat a répondu » is recorded for a candidate no campaign has contacted.
      responded: sql<number>`SUM(CASE WHEN ${cvApplications.lastContactedAt} IS NOT NULL AND ${cvApplications.lastCandidateResponseAt} IS NOT NULL THEN 1 ELSE 0 END)`,
    }).from(cvApplications);
    const [campaignStats] = await db.select({
      total: sql<number>`COUNT(*)`,
      sent: sql<number>`SUM(CASE WHEN ${recruitmentCampaigns.status} IN ('sent', 'partially_sent') THEN 1 ELSE 0 END)`,
    }).from(recruitmentCampaigns);
    const [deliveryStats] = await db.select({
      delivered: sql<number>`SUM(CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delivered' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} IN ('failed', 'bounced', 'complained', 'suppressed') THEN 1 ELSE 0 END)`,
      delayed: sql<number>`SUM(CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delayed' THEN 1 ELSE 0 END)`,
    }).from(recruitmentCampaignRecipients);
    const [followUpStats] = await db.select({
      pending: sql<number>`SUM(CASE WHEN ${recruitmentFollowUpTasks.status} = 'suggested' THEN 1 ELSE 0 END)`,
      due: sql<number>`SUM(CASE WHEN ${recruitmentFollowUpTasks.status} = 'suggested' AND ${recruitmentFollowUpTasks.dueAt} <= NOW() THEN 1 ELSE 0 END)`,
    }).from(recruitmentFollowUpTasks);
    const [briefStats] = await db.select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`SUM(CASE WHEN ${clientBriefs.status} IN ('new', 'reviewing', 'shortlist_sent') THEN 1 ELSE 0 END)`,
    }).from(clientBriefs);
    return { candidateStats, campaignStats, deliveryStats, followUpStats, briefStats };
  }),

  candidate: adminRecruitmentCandidateRouter,

  followUps: adminRecruitmentFollowUpsRouter,

  offerTemplates: adminRecruitmentOfferTemplatesRouter,

  exportCsv: adminProcedure.input(z.object({ type: z.enum(["pool", "shortlist"]), briefId: z.number().int().positive().optional(), candidateIds: z.array(z.number().int().positive()).max(RECRUITMENT_EXPORT_MAX_CANDIDATES).optional().default([]) })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    let candidateIds = input.candidateIds;
    let consentByApplication = new Map<number, Date>();
    let excludedWithoutConsent = 0;
    if (input.type === "shortlist") {
      if (!input.briefId) throw new TRPCError({ code: "BAD_REQUEST", message: "Une mission est requise pour exporter une shortlist." });
      // Ids sent by the client never widen or replace a mission's shortlist.
      const shortlist = await openShortlist(db, input.briefId);
      if (!shortlist.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun candidat présélectionné pour cette mission." });
      // A profile leaves for an employer only with the candidate's agreement for this mission (RGPD-03).
      const consented = shortlist.filter((candidate): candidate is { applicationId: number; candidateConsentAt: Date } => candidate.candidateConsentAt !== null);
      excludedWithoutConsent = shortlist.length - consented.length;
      if (!consented.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Aucun des ${shortlist.length} candidat(s) de la shortlist n’a d’accord noté pour cette mission. Obtenez l’accord de chaque candidat et notez-en la date (« Accord du candidat reçu ») avant d’exporter.` });
      consentByApplication = new Map(consented.map(candidate => [candidate.applicationId, candidate.candidateConsentAt]));
      candidateIds = consented.map(candidate => candidate.applicationId);
      // Refused rather than cut short: the file must match the count on the button.
      if (candidateIds.length > RECRUITMENT_EXPORT_MAX_CANDIDATES) throw new TRPCError({ code: "BAD_REQUEST", message: `La shortlist compte ${candidateIds.length} candidats avec accord ; ${RECRUITMENT_EXPORT_MAX_CANDIDATES} au maximum par export. Retirez des candidats de la shortlist avant de l’exporter.` });
    }
    // An empty selection is refused, never read as "every candidate" (REC-01).
    if (!candidateIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Sélectionnez au moins un candidat à exporter." });
    const conditions = [sql`${cvApplications.status} NOT IN ('rejected', 'archived')`, inArray(cvApplications.id, candidateIds)];
    if (input.type === "pool") {
      conditions.push(eq(cvApplications.marketingConsent, 1), isNull(cvApplications.marketingUnsubscribedAt), isNull(cvApplications.marketingSuppressedAt));
    }
    const rows = await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, phone: cvApplications.phone, specialty: cvApplications.specialty, targetCountries: cvApplications.targetCountries, languages: cvApplications.languages, yearsExperience: cvApplications.yearsExperience, availability: cvApplications.availability, mobility: cvApplications.mobility, certifications: cvApplications.certifications, aiScore: verifiedRecruitmentScore, status: cvApplications.status }).from(cvApplications).where(and(...conditions)).orderBy(verifiedScoreFirst, desc(cvApplications.createdAt)).limit(RECRUITMENT_EXPORT_MAX_CANDIDATES);
    // Selected candidates may have been refused or unsubscribed meanwhile: no header-only file, no "logged" export of nobody.
    if (!rows.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun des candidats sélectionnés ne peut plus être exporté (refusé, archivé ou désinscrit)." });
    // A shortlist is meant for a client employer: it never carries the AI
    // score, an internal reading aid that must not become a third party's
    // selection criterion (LEGAL-22). The internal pool export keeps it.
    let csv: string;
    if (input.type === "shortlist") {
      // Each certification and language says where it comes from (IA-02),
      // and each candidate the date of their agreement (RGPD-03).
      const [certificationsByApplication, languagesByApplication] = await Promise.all([certificationFactsByApplication(db, rows), languageFactsByApplication(db, rows)]);
      // The employer reads every cell as written: the countries listed, a
      // certification's expiry, the application's status in words.
      const facts = <T extends RecruitmentFact>(list: T[] | undefined, label: (fact: T) => string = recruitmentFactLabel) => (list ?? []).map(label).join(" ; ");
      const header = ["Prénom", "Nom", "Email", "Téléphone", "Spécialité", "Pays ciblés", "Langues (origine)", "Expérience (ans)", "Disponibilité", "Mobilité", "Certifications (origine)", "Accord du candidat", "Statut"];
      csv = [header.map(csvCell).join(";"), ...rows.map(row => [row.firstName, row.lastName, row.email, csvPhoneValue(row.phone), row.specialty, csvListCell(row.targetCountries), facts(languagesByApplication.get(row.id)), row.yearsExperience, row.availability, row.mobility, facts(certificationsByApplication.get(row.id), certificationFactLabel), consentByApplication.get(row.id)?.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }), recruitmentApplicationStatusLabel(row.status)].map(csvCell).join(";"))].join("\n");
    } else {
      // The countries and languages listed, the status in words, as in the shortlist (INTL-10).
      const header = ["Prénom", "Nom", "Email", "Téléphone", "Spécialité", "Pays ciblés", "Langues", "Expérience (ans)", "Disponibilité", "Mobilité", "Certifications", "Score IA", "Statut"];
      csv = [header.map(csvCell).join(";"), ...rows.map(row => [row.firstName, row.lastName, row.email, csvPhoneValue(row.phone), row.specialty, csvListCell(row.targetCountries), csvListCell(row.languages), row.yearsExperience, row.availability, row.mobility, row.certifications, row.aiScore, recruitmentApplicationStatusLabel(row.status)].map(csvCell).join(";"))].join("\n");
    }
    // One audit line per candidate, in one statement: all of them or, when
    // the database refuses one, none and no file (DATA-01).
    await recruitmentAuditInsert(db, rows.map(row => ({ applicationId: row.id, adminOpenId: ctx.user.openId, action: "export" as const, metadata: { type: input.type, briefId: input.briefId || null } })));
    // excludedWithoutConsent: shortlisted candidates left out for lack of agreement (RGPD-03).
    return { filename: `${input.type}-${new Date().toISOString().slice(0, 10)}.csv`, csv, count: rows.length, excludedWithoutConsent };
  }),

  profiles: router({
    list: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(recruitmentMatchProfiles).where(eq(recruitmentMatchProfiles.active, 1)).orderBy(desc(recruitmentMatchProfiles.updatedAt));
    }),
    create: adminProcedure
      .input(z.object({
        name: z.string().trim().min(1).max(160),
        targetCountry: z.string().trim().max(120).optional(),
        specialty: z.string().trim().max(160).optional(),
        minimumScore: z.number().int().min(0).max(100).default(0),
        requiredLanguages: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
        requiredSkills: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const result = await db.insert(recruitmentMatchProfiles).values({
          name: input.name,
          targetCountry: input.targetCountry || null,
          specialty: input.specialty || null,
          minimumScore: input.minimumScore,
          requiredLanguages: JSON.stringify(input.requiredLanguages),
          requiredSkills: JSON.stringify(input.requiredSkills),
        }).returning({ id: recruitmentMatchProfiles.id });
        return { success: true, id: Number(result[0]?.id || 0) };
      }),
    delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      await db.update(recruitmentMatchProfiles).set({ active: 0, updatedAt: new Date() }).where(eq(recruitmentMatchProfiles.id, input.id));
      return { success: true };
    }),
  }),

  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(CV_APPLICATION_STATUSES),
        adminNotes: z.string().trim().max(5000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      // A status change alone must never erase the recruiter's note: the
      // note is only written when the client sends it (empty clears it).
      // With its audit line, both or neither (DATA-01).
      await recordWithRecruitmentAudit(db, db
        .update(cvApplications)
        .set({
          status: input.status,
          ...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes || null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(cvApplications.id, input.id)), [{ applicationId: input.id, adminOpenId: ctx.user.openId, action: "status_update", metadata: { status: input.status } }]);

      return { success: true };
    }),

  getDownloadUrl: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const [application] = await db
        .select({ cvFileKey: cvApplications.cvFileKey, cvOriginalName: cvApplications.cvOriginalName, status: cvApplications.status, fileValidationStatus: cvApplications.fileValidationStatus })
        .from(cvApplications)
        .where(eq(cvApplications.id, input.id))
        .limit(1);
      if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable" });
      if (!canAdminDownloadCv(application)) {
        throw new TRPCError({ code: "NOT_FOUND", message: CV_DOWNLOAD_UNAVAILABLE_MESSAGE });
      }
      // Traced before the link is made: refused, nothing was downloaded (DATA-01).
      await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "download", metadata: { fileName: application.cvOriginalName } });
      const signedUrl = await storageGetSignedUrl(application.cvFileKey);
      return { url: signedUrl, fileName: application.cvOriginalName };
    }),

  reanalyze: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const [application] = await db
        .select({
          id: cvApplications.id,
          firstName: cvApplications.firstName,
          lastName: cvApplications.lastName,
          specialty: cvApplications.specialty,
          targetCountries: cvApplications.targetCountries,
          languages: cvApplications.languages,
          yearsExperience: cvApplications.yearsExperience,
          message: cvApplications.message,
          cvFileKey: cvApplications.cvFileKey,
          cvMimeType: cvApplications.cvMimeType,
        })
        .from(cvApplications)
        .where(eq(cvApplications.id, input.id))
        .limit(1);
      if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable" });

      const { enqueueCvAnalysis, processDueCvAnalysisJobs } = await import("../../recruitmentProcessing");
      const queue = await enqueueCvAnalysis(application.id);
      const processing = await processDueCvAnalysisJobs(1, [application.id]);
      const outcome = reanalysisOutcome(queue, processing);
      const record = {
        applicationId: application.id,
        adminOpenId: ctx.user.openId,
        action: "reanalyze" as const,
        metadata: { queued: queue.queued, accelerated: queue.accelerated, alreadyRunning: queue.alreadyRunning, processed: processing.processed, outcome: outcome.outcome },
      };
      // Already running, nothing was queued: a refused line leaves nothing changed.
      if (outcome.outcome === "already_running") await logRecruitmentAction(record);
      else await traceRecruitmentActionDone([record], REANALYSIS_DONE[outcome.outcome]);
      return { success: true, queued: queue.queued || queue.accelerated, processed: processing.processed, ...outcome };
    }),

  reanalyzeFailed: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(25).default(10) }).optional())
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const { CV_ANALYSIS_DEFERRED_DAILY_VOLUME, enqueueCvAnalysis, processDueCvAnalysisJobs } = await import("../../recruitmentProcessing");
      // Les candidatures reçues au-delà du volume du jour (ABUS-01), jamais
      // analysées, restent à l’écart comme pour le rattrapage automatique :
      // seule l’action « Analyser le CV » d’un dossier les met en file.
      const resumableApplications = await db
        .select({ id: cvApplications.id, trackingId: cvApplications.trackingId })
        .from(cvApplications)
        // degraded, or saved as needs_review by the billing fallback before
        // that status existed: the AI provider refused, the CV was never analysed (REC-08).
        .where(and(
          or(inArray(cvApplications.analysisStatus, ["failed", "queued", "degraded"]), eq(cvApplications.analysisModel, MANUAL_REVIEW_FALLBACK_MODEL), ne(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION), isNull(cvApplications.analysisPromptVersion)),
          ne(cvApplications.status, "rejected"),
          ne(cvApplications.status, "archived"),
          or(isNull(cvApplications.analysisLastError), ne(cvApplications.analysisLastError, CV_ANALYSIS_DEFERRED_DAILY_VOLUME)),
        ))
        .orderBy(cvApplications.updatedAt)
        .limit(input?.limit ?? 10);

      let processing: { processed: number; results: Array<Record<string, unknown>> } = { processed: 0, results: [] };
      let queued = 0;
      let aiUnavailable = false;
      for (const application of resumableApplications) {
        await enqueueCvAnalysis(application.id);
        await traceRecruitmentActionDone([{ applicationId: application.id, adminOpenId: ctx.user.openId, action: "reanalyze", metadata: { queued: true, batch: true } }], `L’analyse de ${queued + 1} dossier(s) est relancée.`);
        queued += 1;
        // One analysis inline at most (an AI call can take ~35 s): the rest is
        // queued for the cron, so the admin request stays under the 60 s limit.
        if (processing.processed === 0) processing = await processDueCvAnalysisJobs(1, [application.id]);
        // The AI provider still refuses for billing: the other dossiers keep
        // their state (each would be refused too) until the credit is restored (REC-08).
        aiUnavailable = processing.results.some(result => result.aiUnavailable === true);
        if (aiUnavailable) break;
      }
      return { success: true, queued, processed: processing.processed, aiUnavailable };
    }),

  sendTemplateEmail: adminProcedure
    .input(z.object({
      id: z.number(),
      template: z.enum(["profile_interest", "additional_information"]),
      language: z.enum(["fr", "en"]).optional().default("fr"),
      customRequest: z.string().trim().max(3000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const [application] = await db
        .select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, trackingId: cvApplications.trackingId })
        .from(cvApplications)
        .where(eq(cvApplications.id, input.id))
        .limit(1);
      if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable" });
      const result = await sendRecruitmentTemplateEmail(
        application.email,
        application.firstName,
        application.trackingId,
        input.template as RecruitmentEmailTemplate,
        { language: input.language as RecruitmentEmailLanguage, customRequest: input.customRequest },
      );
      await traceRecruitmentActionDone([{ applicationId: input.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: input.template, language: input.language, customRequest: input.customRequest || null, resendId: result.id } }], "L’email est envoyé.");
      return { success: true };
    }),

  erase: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { eraseCandidateApplication, CandidateErasureBusyError, CandidateErasureNotFoundError, CandidateErasureStorageError } = await import("../../recruitmentErasure");
      try {
        const report = await eraseCandidateApplication({ applicationId: input.id, actorOpenId: ctx.user.openId, reason: "admin_gdpr_request" });
        return { success: true as const, ...report };
      } catch (error) {
        if (error instanceof CandidateErasureNotFoundError) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable" });
        if (error instanceof CandidateErasureBusyError) throw new TRPCError({ code: "CONFLICT", message: "Une analyse ou une copie Google Drive de ce dossier est en cours. Réessayez l’effacement dans quelques minutes." });
        if (error instanceof CandidateErasureStorageError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Les fichiers stockés n’ont pas pu être supprimés : aucune donnée n’a été effacée en base. Réessayez dans quelques instants." });
        throw error;
      }
    }),
});
