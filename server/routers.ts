import { createHash, randomInt, randomUUID } from "node:crypto";
import { isPublicTestimonialsEnabled } from "../shared/publicFeatures";
import { RECRUITMENT_EXPORT_MAX_CANDIDATES } from "../shared/recruitmentExportLimits";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, PublicErrorReason, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { canRequestCandidateDocumentReanalysis } from "../shared/candidateDocumentReanalysis";
import { candidateDocumentAllowsAiAnalysis } from "../shared/candidateDocumentCategories";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { candidateAccounts, candidateDocumentAuditLogs, candidateDocuments, contactMessages, gdprRequests, testimonials, appointments, blogPosts, availabilitySlots, blockedDates, cvApplications, cvCandidateCertifications, cvCandidateLanguages, cvGoogleDriveExportJobs, recruitmentAuditLogs, recruitmentMatchProfiles, clientBriefs, clientBriefCandidates, recruitmentCampaigns, recruitmentCampaignRecipients, recruitmentEmailEvents, recruitmentFollowUpTasks, recruitmentOfferTemplates, securityEvents } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";
import { storageGetSignedUrl } from "./storage";
import { canAdminDownloadCv, CV_DOWNLOAD_UNAVAILABLE_MESSAGE } from "./recruitmentDownloadPolicy";
import { eq, and, or, sql, desc, getTableColumns, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import Stripe from "stripe";
import {
  sendCandidatePortalAccessEmail,
  candidatePortalAccessEmailFailureCode,
  sendRecruitmentCampaignEmail,
  sendRecruitmentTemplateEmail,
  type RecruitmentEmailLanguage,
  type RecruitmentEmailTemplate,
} from "./_core/notifications";
import { logRecruitmentAction, matchesRecruitmentProfile, parseRecruitmentJsonArray } from "./recruitmentAudit";
import { computeBriefCandidateMatch } from "./clientBriefMatching";
import { candidatePortalRouter } from "./candidatePortalRouter";
import { enforcePersistentRateLimit, hashSecurityValue, logSecurityEvent, requestIpHash } from "./candidateSecurity";
import { publicFormRateLimitSubject, type PublicFormRateLimitScope } from "./publicFormRateLimit";
import { createCandidateInvitationToken } from "./candidateAuth";
import { emailLanguageFor, SITE_LANGUAGES } from "./emailLanguage";
import { verifyCandidateTurnstile } from "./candidateTurnstile";
import { googleDriveExportStatus } from "./googleDriveExport";
import { buildCandidatePortalInvitationEmailEvent, candidatePortalAccountMatchesApplication, resolveCandidatePortalActivationDelivery, resolveCandidatePortalInvitationDelivery, resolveCvConfirmationDelivery, retryCvConfirmationEmail } from "./recruitmentEmailTrace";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "./recruitmentAnalysis";
import { medicalQuestionsRouter } from "./medicalQuestionsRouter";
import { AdminMfaRateLimitError, issueAdminMfaChallenge, revokeCurrentAdminMfaSession, verifyAdminMfaChallenge } from "./adminMfa";
import {
  BOOKING_INVALID_NAME_MESSAGE,
  BOOKING_INVALID_PHONE_MESSAGE,
  BOOKING_REQUEST_SUBJECT_MAX_LENGTH,
  BOOKING_TOO_FAR_MESSAGE,
  BOOKING_TOO_SOON_MESSAGE,
  getBookingWindowIssue,
  hasVisibleNameCharacter,
  isPlausiblePhoneNumber,
  type BookingRefusalReason,
} from "../shared/bookingPolicy";

const ADMIN_MFA_RATE_LIMITED_MESSAGE = "Trop de tentatives de double authentification. Patientez 15 minutes avant de réessayer.";

let stripeClient: Stripe | undefined;

/** Shared Stripe client (also used by the hold cleanup job); throws when the key is not configured. */
export function getStripeClient(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le service de paiement n’est pas configuré." });
  stripeClient ??= new Stripe(apiKey);
  return stripeClient;
}

// Secret-bearing URLs must never be assembled from browser-controlled headers.
const DEFAULT_PUBLIC_ORIGIN = process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";

const PARIS_TIME_ZONE = "Europe/Paris";
const CV_APPLICATION_STATUSES = ["new", "reviewing", "shortlisted", "placed", "rejected", "archived"] as const;
type PublicFormRateLimitPolicy = {
  action: string;
  /** Clé de comptage : couple IP + email (formulaires), IP seule ou email seul (réservation). */
  scope: PublicFormRateLimitScope;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
  blockedMessage?: string;
  /** Motif stable joint au refus, que la page de réservation traduit (EN-06). */
  reason?: BookingRefusalReason;
};

const DEFAULT_PUBLIC_FORM_BLOCKED_MESSAGE = "Veuillez patienter avant de soumettre une nouvelle demande.";
export const BOOKING_RATE_LIMIT_MESSAGE = "Trop de tentatives de réservation ont été effectuées. Veuillez réessayer dans une heure ou nous contacter directement.";

export const PUBLIC_FORM_RATE_LIMITS = {
  contact: { action: "public_contact_submit", scope: "ip_email", maxAttempts: 5, windowMs: 15 * 60 * 1000, blockMs: 60 * 60 * 1000 },
  gdpr: { action: "public_gdpr_submit", scope: "ip_email", maxAttempts: 3, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000 },
  // Chaque réservation bloque un créneau de 30 minutes et ouvre une session
  // Stripe. Le compteur par IP borne un script qui change d’email à chaque
  // appel ; le compteur par email borne une même identité qui change d’IP.
  bookingIp: { action: "public_booking_create_ip", scope: "ip", maxAttempts: 6, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000, blockedMessage: BOOKING_RATE_LIMIT_MESSAGE, reason: "rate_limited" },
  bookingEmail: { action: "public_booking_create_email", scope: "email", maxAttempts: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000, blockedMessage: BOOKING_RATE_LIMIT_MESSAGE, reason: "rate_limited" },
} as const satisfies Record<string, PublicFormRateLimitPolicy>;

async function enforcePublicFormRateLimit(input: {
  kind: keyof typeof PUBLIC_FORM_RATE_LIMITS;
  email: string;
  headers: Record<string, unknown>;
  remoteIp?: string | null;
}) {
  // Les tests d’intégration réemploient volontairement les mêmes adresses dans
  // plusieurs scénarios indépendants. La protection persistante reste active
  // dans tous les environnements réels ; ses seuils sont couverts séparément.
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return;

  const ipHash = requestIpHash(input.headers) ?? (input.remoteIp ? hashSecurityValue(input.remoteIp) : null);
  const { scope, blockedMessage, reason, ...policy }: PublicFormRateLimitPolicy = PUBLIC_FORM_RATE_LIMITS[input.kind];
  const subject = publicFormRateLimitSubject(scope, ipHash, input.email);
  if (!subject) return;
  try {
    await enforcePersistentRateLimit({
      ...policy,
      subject,
    });
  } catch {
    await logSecurityEvent({
      actorKind: "anonymous",
      category: `${policy.action}_rate_limit`,
      outcome: "blocked",
      severity: "warning",
      ipHash,
    });
    const message = blockedMessage ?? DEFAULT_PUBLIC_FORM_BLOCKED_MESSAGE;
    throw reason ? bookingRefusal("TOO_MANY_REQUESTS", reason, message) : new TRPCError({ code: "TOO_MANY_REQUESTS", message });
  }
}

/** Nombre maximal de créneaux retenus (en attente de paiement) par adresse email. */
export const MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL = 2;
export const ACTIVE_APPOINTMENT_HOLDS_LIMIT_MESSAGE = "Vous avez déjà deux réservations en attente de paiement. Finalisez ou annulez l’un de ces paiements, ou patientez une trentaine de minutes avant de réserver un nouveau créneau.";

export const CONSULTATION_CHECKOUT_PRODUCT_NAME = "Consultation de conseil santé – 30 minutes";

export const BOOKING_PAYMENT_UNAVAILABLE_MESSAGE = "Le service de paiement est momentanément indisponible. Votre créneau n’a pas été réservé : veuillez réessayer dans quelques minutes ou nous contacter.";

/** Refus métier d’une réservation : message français et motif stable que la page traduit (EN-06). */
function bookingRefusal(code: "BAD_REQUEST" | "CONFLICT" | "UNPROCESSABLE_CONTENT" | "TOO_MANY_REQUESTS" | "SERVICE_UNAVAILABLE", reason: BookingRefusalReason, message: string) {
  return new TRPCError({ code, message, cause: new PublicErrorReason(reason) });
}

/** Refuse NUL and other control characters (PostgreSQL rejects NUL in text). */
const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001F\u007F]*$/;
const NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;

/** Libellé de la ligne Stripe Checkout, visible sur la page de paiement et le reçu. */
export function consultationCheckoutProductData(trackingId: string) {
  return { name: CONSULTATION_CHECKOUT_PRODUCT_NAME, description: `Rendez-vous : ${trackingId}` };
}

const PUBLIC_TRACKING_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Numéro de suivi imprévisible pour les formulaires publics (contact, RGPD) :
 * préfixe + 12 caractères alphanumériques majuscules tirés par le générateur
 * cryptographique (≈ 62 bits), soit 13 caractères pour une colonne varchar(20).
 */
export function createPublicTrackingId(prefix: "C" | "G"): string {
  let suffix = "";
  for (let index = 0; index < 12; index += 1) {
    suffix += PUBLIC_TRACKING_ID_ALPHABET[randomInt(PUBLIC_TRACKING_ID_ALPHABET.length)];
  }
  return `${prefix}${suffix}`;
}
export const recruitmentPoolFiltersInput = z.object({
  specialty: z.string().trim().max(160).optional(),
  country: z.string().trim().max(80).optional(),
  availability: z.string().trim().max(100).optional(),
  mobility: z.string().trim().max(150).optional(),
  certification: z.string().trim().max(180).optional(),
  minimumScore: z.number().int().min(0).max(100).optional(),
  limit: z.number().int().min(1).max(200).optional().default(200),
}).optional();

const verifiedRecruitmentScore = sql<number | null>`CASE WHEN ${cvApplications.analysisPromptVersion} = ${RECRUITMENT_ANALYSIS_PROMPT_VERSION} THEN ${cvApplications.aiScore} ELSE NULL END`;
/**
 * Score threshold of the admin lists (INTL-02): a dossier without a verified score (CV in
 * another language, analysis pending, refused or from an older version) is kept, and the
 * list shows it apart, « Score indisponible – à lire », instead of dropping it. A threshold
 * of 0 filters nothing.
 */
const scoreAtLeastOrUnavailable = (minimumScore: number) => sql`(${verifiedRecruitmentScore} >= ${minimumScore} OR ${verifiedRecruitmentScore} IS NULL)`;
/** Best verified score first: a plain DESC would put the dossiers without one first in PostgreSQL, and a limit would then keep only them. */
const verifiedScoreFirst = sql`${verifiedRecruitmentScore} DESC NULLS LAST`;

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
}

/**
 * A mission's shortlist: the candidates shortlisted for it whose application
 * is still open. Its export carries them and nobody else (REC-01).
 */
async function openShortlistedApplicationIds(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, briefId: number): Promise<number[]> {
  const associations = await db.select({ applicationId: clientBriefCandidates.applicationId }).from(clientBriefCandidates).where(and(eq(clientBriefCandidates.briefId, briefId), eq(clientBriefCandidates.status, "shortlisted")));
  if (!associations.length) return [];
  const open = await db.select({ id: cvApplications.id }).from(cvApplications).where(and(sql`${cvApplications.status} NOT IN ('rejected', 'archived')`, inArray(cvApplications.id, associations.map(association => association.applicationId))));
  return open.map(application => application.id);
}

const PARIS_DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getParisParts(date: Date) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PARIS_TIME_ZONE,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: String(values.weekday),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function parisDateKey(date: Date): string {
  const parts = getParisParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parisWallClockToUtc(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!match) throw new Error("Invalid Paris local date");

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const wallClockMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let utcMs = wallClockMs;

  // Resolve the Europe/Paris offset without relying on the server process timezone.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = getParisParts(new Date(utcMs));
    const representedWallClockMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const offsetErrorMs = representedWallClockMs - wallClockMs;
    if (offsetErrorMs === 0) break;
    utcMs -= offsetErrorMs;
  }

  return new Date(utcMs);
}

const APPOINTMENT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Parses an ISO instant (with Z or an offset) or a Europe/Paris wall-clock time.
 * Impossible calendar values (30 February, 25:00) and Paris wall-clock times
 * that do not exist (spring-forward gap) are rejected instead of being shifted.
 */
export function parseAppointmentDate(value: string): Date {
  const match = APPOINTMENT_DATE_PATTERN.exec(value.trim());
  if (!match) throw new Error("Invalid appointment date");
  const [, yearText, monthText, dayText, hourText = "00", minuteText = "00", secondText = "00", zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    throw new Error("Invalid appointment date");
  }
  if (zone && /^[+-]/.test(zone)) {
    const offset = zone.replace(":", "");
    if (Number(offset.slice(1, 3)) > 14 || Number(offset.slice(3, 5)) > 59) throw new Error("Invalid appointment date");
  }

  const parsed = zone
    ? new Date(value.trim())
    : parisWallClockToUtc(`${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}`);

  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Invalid appointment date");
  }
  if (!zone) {
    const reread = getParisParts(parsed);
    if (reread.year !== year || reread.month !== month || reread.day !== day || reread.hour !== hour || reread.minute !== minute) {
      throw new Error("Invalid appointment date");
    }
  }
  return parsed;
}

const appointmentDateInput = z
  .string()
  .min(1, "La date de consultation est requise")
  .refine(value => {
    try {
      parseAppointmentDate(value);
      return true;
    } catch {
      return false;
    }
  }, "La date de consultation est invalide");

const calendarDateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit respecter le format YYYY-MM-DD")
  .refine(value => {
    const [year, month, day] = value.split("-").map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
  }, "La date calendaire est invalide");

export function isNightRateForParis(date: Date): boolean {
  return getParisParts(date).hour >= 18 || getParisParts(date).hour < 8;
}

function getParisDateRange(dateKey: string): { start: Date; end: Date } {
  const start = parisWallClockToUtc(`${dateKey}T00:00:00`);
  const [year, month, day] = dateKey.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextKey = `${nextDay.getUTCFullYear()}-${pad(nextDay.getUTCMonth() + 1)}-${pad(nextDay.getUTCDate())}`;
  return { start, end: parisWallClockToUtc(`${nextKey}T00:00:00`) };
}

function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : Number.NaN;
}

export function isWithinAvailability(
  date: Date,
  slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  durationMinutes = 30
): boolean {
  const parts = getParisParts(date);
  const dayOfWeek = PARIS_DAY_INDEX[parts.weekday];
  const previousDayOfWeek = (dayOfWeek + 6) % 7;
  const candidateStart = parts.hour * 60 + parts.minute;

  return slots.some(slot => {
    const slotStart = timeToMinutes(slot.startTime);
    const rawSlotEnd = timeToMinutes(slot.endTime);
    if (!Number.isFinite(slotStart) || !Number.isFinite(rawSlotEnd)) return false;

    const crossesMidnight = rawSlotEnd <= slotStart;
    const slotEnd = crossesMidnight ? rawSlotEnd + 24 * 60 : rawSlotEnd;
    let normalizedCandidateStart = candidateStart;

    if (!crossesMidnight) {
      if (slot.dayOfWeek !== dayOfWeek) return false;
    } else if (slot.dayOfWeek === dayOfWeek && candidateStart >= slotStart) {
      normalizedCandidateStart = candidateStart;
    } else if (slot.dayOfWeek === previousDayOfWeek && candidateStart < rawSlotEnd) {
      normalizedCandidateStart = candidateStart + 24 * 60;
    } else {
      return false;
    }

    const offsetFromStart = normalizedCandidateStart - slotStart;
    return offsetFromStart >= 0
      && normalizedCandidateStart + durationMinutes <= slotEnd
      && offsetFromStart % durationMinutes === 0;
  });
}

export function isBookableAppointmentTime(
  date: Date,
  slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  durationMinutes = 30
): boolean {
  return slots.length > 0 && isWithinAvailability(date, slots, durationMinutes);
}

function getSafeCheckoutOrigin(): string {
  return DEFAULT_PUBLIC_ORIGIN;
}

type CampaignDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Sends one campaign email and records the outcome; returns true when the provider accepted it. */
async function deliverCampaignRecipient(
  db: CampaignDb,
  campaign: { id: number; title: string; subject: string; body: string; language: string },
  candidate: { id: number; firstName: string; lastName: string; email: string; marketingUnsubscribeToken: string | null },
  recipientId: number,
  adminOpenId: string,
) {
  const unsubscribeToken = candidate.marketingUnsubscribeToken || randomUUID().replace(/-/g, "");
  if (!candidate.marketingUnsubscribeToken) {
    await db.update(cvApplications).set({ marketingUnsubscribeToken: unsubscribeToken }).where(eq(cvApplications.id, candidate.id));
  }
  try {
    const email = await sendRecruitmentCampaignEmail({
      candidateEmail: candidate.email,
      candidateFirstName: candidate.firstName,
      campaignTitle: campaign.title,
      subject: campaign.subject,
      body: campaign.body,
      language: campaign.language as RecruitmentEmailLanguage,
      unsubscribeUrl: `${DEFAULT_PUBLIC_ORIGIN}/recruitment/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
    });
    const contactedAt = new Date();
    await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "sent", providerEmailId: email.id || null, error: null, sentAt: contactedAt, lastEventAt: contactedAt }).where(eq(recruitmentCampaignRecipients.id, recipientId));
    await db.update(cvApplications).set({ lastContactedAt: contactedAt }).where(eq(cvApplications.id, candidate.id));
    await db.insert(recruitmentFollowUpTasks).values([
      { applicationId: candidate.id, campaignId: campaign.id, kind: "follow_up_7", dueAt: new Date(contactedAt.getTime() + 7 * 24 * 60 * 60 * 1000), notes: "Relance suggérée à J+7 — aucun email n’est envoyé automatiquement." },
      { applicationId: candidate.id, campaignId: campaign.id, kind: "follow_up_14", dueAt: new Date(contactedAt.getTime() + 14 * 24 * 60 * 60 * 1000), notes: "Relance suggérée à J+14 — aucun email n’est envoyé automatiquement." },
    ]);
    await logRecruitmentAction({ applicationId: candidate.id, adminOpenId, action: "email", metadata: { campaignId: campaign.id, resendId: email.id, language: campaign.language } });
    return true;
  } catch (error) {
    await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "failed", error: error instanceof Error ? error.message.slice(0, 2000) : "Unknown campaign email failure" }).where(eq(recruitmentCampaignRecipients.id, recipientId));
    return false;
  }
}

/** What really happened to a manual CV re-analysis (ADM-REC-02). */
export function reanalysisOutcome(
  queue: { alreadyRunning: boolean },
  processing: { processed: number; results: Array<Record<string, unknown>> },
): { outcome: "completed" | "needs_review" | "retry_scheduled" | "failed" | "already_running" | "queued"; error: string | null } {
  const result = processing.results[0];
  if (!processing.processed || !result) return { outcome: queue.alreadyRunning ? "already_running" : "queued", error: null };
  if (result.completed === true) return { outcome: result.needsReview ? "needs_review" : "completed", error: null };
  const error = typeof result.error === "string" ? result.error : typeof result.reason === "string" ? result.reason : null;
  return { outcome: result.retry ? "retry_scheduled" : "failed", error };
}

/** What really happened to a manual Google Drive copy (ADM-DRIVE-01). */
export function driveRetryOutcome(
  queue: { alreadyCompleted: boolean; alreadyRunning: boolean },
  processing: { processed: number; waitingForAuthorization?: boolean; results: Array<Record<string, unknown>> },
): { outcome: "completed" | "already_completed" | "already_running" | "not_connected" | "waiting_validation" | "retry_scheduled" | "failed" | "queued"; error: string | null } {
  if (queue.alreadyCompleted) return { outcome: "already_completed", error: null };
  if (queue.alreadyRunning) return { outcome: "already_running", error: null };
  if (processing.waitingForAuthorization) return { outcome: "not_connected", error: "google_drive_not_connected" };
  const result = processing.results[0];
  if (!processing.processed || !result) return { outcome: "queued", error: null };
  if (result.completed === true) return { outcome: "completed", error: null };
  if (result.reason === "cv_not_accepted") return { outcome: "waiting_validation", error: null };
  if (result.reason === "connection_missing") return { outcome: "not_connected", error: "google_drive_not_connected" };
  const error = typeof result.error === "string" ? result.error : typeof result.reason === "string" ? result.reason : null;
  return { outcome: result.retry ? "retry_scheduled" : "failed", error };
}

export const appRouter = router({
  system: systemRouter,
  candidatePortal: candidatePortalRouter,
  medicalQuestions: medicalQuestionsRouter,
  adminSecurity: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Accès administrateur requis." });
      return { verified: ctx.mfaVerified, email: ctx.user.email ?? null };
    }),
    begin: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Accès administrateur requis." });
      if (!ctx.user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun email administrateur vérifié n’est disponible pour la double authentification." });
      try {
        await issueAdminMfaChallenge({ openId: ctx.user.openId, email: ctx.user.email, req: ctx.req });
      } catch (error) {
        if (error instanceof AdminMfaRateLimitError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ADMIN_MFA_RATE_LIMITED_MESSAGE });
        console.error("[AdminMfa] Unable to issue a security code", error instanceof Error ? error.message : "unknown");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le code de sécurité n’a pas pu être envoyé. Réessayez dans quelques instants." });
      }
      return { success: true };
    }),
    verify: protectedProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Accès administrateur requis." });
      try {
        await verifyAdminMfaChallenge({ openId: ctx.user.openId, code: input.code, req: ctx.req, res: ctx.res });
        return { success: true };
      } catch (error) {
        if (error instanceof AdminMfaRateLimitError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ADMIN_MFA_RATE_LIMITED_MESSAGE });
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le code de sécurité est invalide ou expiré." });
      }
    }),
    events: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional()).query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Accès administrateur requis." });
      if (!ctx.mfaVerified) throw new TRPCError({ code: "FORBIDDEN", message: "Double authentification administrateur requise." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de données indisponible." });
      const events = await db.select({
        id: securityEvents.id,
        actorKind: securityEvents.actorKind,
        category: securityEvents.category,
        outcome: securityEvents.outcome,
        severity: securityEvents.severity,
        createdAt: securityEvents.createdAt,
      }).from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(input?.limit ?? 50);
      return events;
    }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ? { ...opts.ctx.user, mfaVerified: opts.ctx.mfaVerified } : null),
    // Clerk ends the first factor in the browser; the server-side MFA proof
    // (8 h) must not survive it on a shared computer.
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await revokeCurrentAdminMfaSession({ req: ctx.req, res: ctx.res, openId: ctx.user?.openId ?? null });
      return { success: true } as const;
    }),
  }),

  contact: router({
    submit: publicProcedure
      .input(
        z.object({
          name: z.string().min(1, "Le nom est requis").max(255),
          email: z.string().email("Email invalide").max(320),
          phone: z.string().max(50).optional(),
          message: z.string().min(1, "Le message est requis").max(5000),
          gdprConsent: z.number().int().min(0).max(1),
          turnstileToken: z.string().min(20).max(4096).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Server-side GDPR consent validation
        if (input.gdprConsent !== 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le consentement RGPD est requis' });
        }

        await enforcePublicFormRateLimit({
          kind: "contact",
          email: input.email,
          headers: ctx.req.headers as Record<string, unknown>,
        });
        await verifyCandidateTurnstile({ token: input.turnstileToken ?? "", remoteIp: ctx.req.ip });

        // Unpredictable tracking ID (13 chars, column is varchar(20))
        const trackingId = createPublicTrackingId("C");

        // Save the message to the database using raw SQL (TiDB DEFAULT bug workaround)
        const db = await getDb();
        if (db) {
          await db.execute(
            sql`INSERT INTO contact_messages (tracking_id, name, email, phone, message, gdpr_consent) VALUES (${trackingId}, ${input.name}, ${input.email}, ${input.phone || null}, ${input.message}, ${input.gdprConsent})`
          );
        }

        // Notify the owner via Manus notification system
        await notifyOwner({
          title: `Nouveau message de contact de ${input.name} (${trackingId})`,
          content: `**Numéro de suivi:** ${trackingId}\n**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n**Consentement RGPD:** ${input.gdprConsent === 1 ? "✅ Accepté" : "❌ Refusé"}\n\n**Message:**\n${input.message}`,
        });

        return { success: true, trackingId } as const;
      }),
  }),

  gdpr: router({
    submit: publicProcedure
      .input(
        z.object({
          name: z.string().min(1, "Le nom est requis").max(255),
          email: z.string().email("Email invalide").max(320),
          phone: z.string().max(50).optional(),
          requestType: z.enum(["access", "rectification", "deletion", "portability", "objection"]),
          description: z.string().min(1, "La description est requise").max(5000).optional(),
          turnstileToken: z.string().min(20).max(4096).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await enforcePublicFormRateLimit({
          kind: "gdpr",
          email: input.email,
          headers: ctx.req.headers as Record<string, unknown>,
        });
        await verifyCandidateTurnstile({ token: input.turnstileToken ?? "", remoteIp: ctx.req.ip });
        // Unpredictable tracking ID (13 chars, column is varchar(20))
        const trackingId = createPublicTrackingId("G");

        // Save the GDPR request to the database using raw SQL (TiDB DEFAULT bug workaround)
        const db = await getDb();
        if (db) {
          await db.execute(
            sql`INSERT INTO gdpr_requests (tracking_id, name, email, phone, request_type, description, status) VALUES (${trackingId}, ${input.name}, ${input.email}, ${input.phone || null}, ${input.requestType}, ${input.description || null}, ${'pending'})`
          );
        }

        // Notify the owner via Manus notification system
        const requestTypeLabels: Record<string, string> = {
          access: "Accès aux données",
          rectification: "Rectification de données",
          deletion: "Suppression de données (droit à l'oubli)",
          portability: "Portabilité des données",
          objection: "Opposition au traitement",
        };

        await notifyOwner({
          title: `Nouvelle demande RGPD de ${input.name} (${trackingId})`,
          content: `**Numéro de suivi:** ${trackingId}\n**Type de demande:** ${requestTypeLabels[input.requestType]}\n**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n\n**Description:**\n${input.description || "Aucune description fournie"}`,
        });

        return { success: true, trackingId } as const;
      }),
  }),

  testimonials: router({
    list: publicProcedure
      .input(
        z.object({
          language: z.string().optional().default("fr"),
          featured: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        // Témoignages masqués du site public (LEGAL-08, shared/publicFeatures.ts).
        if (!isPublicTestimonialsEnabled()) return [];
        const db = await getDb();
        if (!db) return [];

        const conditions = [
          eq(testimonials.language, input.language),
          eq(testimonials.status, "approved"),
        ];

        if (input.featured !== undefined) {
          conditions.push(eq(testimonials.featured, input.featured));
        }

        return await db
          .select()
          .from(testimonials)
          .where(and(...conditions));
      }),
    
    create: adminProcedure
      .input(
        z.object({
          authorName: z.string().min(1).max(100),
          rating: z.number().min(1).max(5),
          title: z.string().min(1).max(255),
          content: z.string().min(1).max(5000),
          specialty: z.string().min(1).max(255),
          language: z.string().default("fr"),
          featured: z.number().optional().default(0),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        await db.insert(testimonials).values({
          authorName: input.authorName,
          rating: input.rating,
          title: input.title,
          content: input.content,
          specialty: input.specialty,
          language: input.language,
          featured: input.featured,
          verified: 1,
          status: "approved",
        });

        return { success: true };
      }),
  }),

  appointments: router({
    calculatePrice: publicProcedure
      .input(
        z.object({
          appointmentDate: appointmentDateInput,
        })
      )
      .query(({ input }) => {
        const date = parseAppointmentDate(input.appointmentDate);
        const basePrice = 100;
        const isNightRate = isNightRateForParis(date);
        const finalPrice = isNightRate ? basePrice * 1.5 : basePrice;

        return {
          basePrice,
          finalPrice,
          isNightRate,
        };
      }),

    create: publicProcedure
      .input(
        z.object({
          customerName: z.string().min(1).max(255).regex(NO_CONTROL_CHARACTERS, "Caractères non autorisés"),
          customerEmail: z.string().email().max(320),
          customerPhone: z.string().trim().min(1).max(50).refine(isPlausiblePhoneNumber, BOOKING_INVALID_PHONE_MESSAGE),
          appointmentDate: appointmentDateInput,
          // Objet de la demande, sans information médicale (minimisation) :
          // conservé pour le tableau de bord, jamais recopié dans un email.
          requestDetails: z.string().trim().min(1).max(BOOKING_REQUEST_SUBJECT_MAX_LENGTH).regex(NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES, "Caractères non autorisés"),
          // Langue affichée par la page de réservation : emails patients en
          // français pour « fr », en anglais sinon (EN-01).
          language: z.enum(SITE_LANGUAGES).optional().default("fr"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Nom sans lettre ni chiffre visible (espaces, caractères invisibles,
        // emoji seuls) : la facture n’aurait pas de nom lisible. Refusé comme
        // une saisie invalide, avant le compteur anti-abus, avec un motif que
        // la page traduit.
        if (!hasVisibleNameCharacter(input.customerName)) {
          throw bookingRefusal("BAD_REQUEST", "invalid_name", BOOKING_INVALID_NAME_MESSAGE);
        }
        const date = parseAppointmentDate(input.appointmentDate);
        // Délai minimal (le passé compris) et horizon maximal : refus métier,
        // traduits par la page à partir de leur motif (UNPROCESSABLE_CONTENT).
        const bookingWindowIssue = getBookingWindowIssue(date);
        if (bookingWindowIssue) {
          throw bookingRefusal("UNPROCESSABLE_CONTENT", bookingWindowIssue, bookingWindowIssue === "too_soon" ? BOOKING_TOO_SOON_MESSAGE : BOOKING_TOO_FAR_MESSAGE);
        }

        // Endpoint public sans Turnstile (parcours de paiement) : chaque appel
        // retient un créneau et ouvre une session Stripe, d’où un compteur
        // persistant par IP puis par email avant tout accès à l’agenda.
        const customerEmailKey = input.customerEmail.trim().toLowerCase();
        const rateLimitRequest = { email: customerEmailKey, headers: ctx.req.headers as Record<string, unknown>, remoteIp: ctx.req.ip };
        await enforcePublicFormRateLimit({ kind: "bookingIp", ...rateLimitRequest });
        await enforcePublicFormRateLimit({ kind: "bookingEmail", ...rateLimitRequest });

        const basePrice = "100.00";
        const isNightRate = isNightRateForParis(date);
        const finalPrice = isNightRate ? "150.00" : "100.00";

        const trackingId = `APT${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

        const db = await getDb();
        if (!db) {
          throw new Error("Database connection failed");
        }

        try {
          const { getAppointmentHoldExpiry, getExpiredAppointmentHoldUpdate, releaseExpiredAppointmentHolds, stripeExpiresAt } = await import("./appointmentHolds");
          // Un maintien expiré dont la session a pourtant été payée (webhook
          // absent) est confirmé au lieu d’être libéré pour cette réservation.
          await releaseExpiredAppointmentHolds(getStripeClient);

          // Plafond de créneaux retenus simultanément par une même adresse
          // (comparaison insensible à la casse) : un patient peut relancer un
          // paiement abandonné sans pouvoir verrouiller l’agenda en boucle.
          const [activeHolds] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(appointments)
            .where(
              and(
                sql`LOWER(${appointments.customerEmail}) = ${customerEmailKey}`,
                eq(appointments.paymentStatus, "pending"),
                eq(appointments.appointmentStatus, "held"),
                sql`${appointments.holdExpiresAt} > NOW()`
              )
            );
          if (Number(activeHolds?.count ?? 0) >= MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL) {
            throw bookingRefusal("TOO_MANY_REQUESTS", "too_many_holds", ACTIVE_APPOINTMENT_HOLDS_LIMIT_MESSAGE);
          }

          const dateKey = parisDateKey(date);
          const blockedDate = await db
            .select({ id: blockedDates.id })
            .from(blockedDates)
            .where(eq(blockedDates.date, dateKey))
            .limit(1);

          if (blockedDate.length > 0) {
            throw bookingRefusal("CONFLICT", "date_blocked", "Cette date est indisponible");
          }

          const activeSlots = await db
            .select({ dayOfWeek: availabilitySlots.dayOfWeek, startTime: availabilitySlots.startTime, endTime: availabilitySlots.endTime })
            .from(availabilitySlots)
            .where(eq(availabilitySlots.isActive, 1));

          if (!isBookableAppointmentTime(date, activeSlots, 30)) {
            throw activeSlots.length === 0
              ? bookingRefusal("CONFLICT", "no_availability", "Aucun créneau de consultation n’est actuellement ouvert")
              : bookingRefusal("CONFLICT", "outside_schedule", "Ce créneau ne correspond pas aux disponibilités configurées");
          }

          const appointmentEnd = new Date(date.getTime() + 30 * 60 * 1000);
          const existingAppointments = await db
            .select({ id: appointments.id })
            .from(appointments)
            .where(
              and(
                sql`appointment_date < ${appointmentEnd}`,
                sql`appointment_date + (duration * INTERVAL '1 minute') > ${date}`,
                sql`(
                  (payment_status = 'pending' AND appointment_status = 'held' AND hold_expires_at > NOW())
                  OR (payment_status = 'pending' AND appointment_status = 'confirmed')
                  OR (payment_status = 'completed' AND appointment_status IN ('confirmed', 'completed'))
                )`
              )
            )
            .limit(1);

          if (existingAppointments.length > 0) {
            throw bookingRefusal("CONFLICT", "slot_taken", "Ce créneau chevauche une réservation existante");
          }

          const appointmentDateFormatted = date.toISOString().slice(0, 19).replace('T', ' ');
          const slotKey = date.toISOString();
          // Le maintien (et donc l’expiration Stripe) ne dépasse jamais le début
          // du créneau ; s’il ne reste pas assez de temps pour une session Stripe
          // valide, la réservation est refusée avant toute écriture.
          const holdExpiresAt = getAppointmentHoldExpiry(new Date(), date);
          if (!holdExpiresAt) {
            throw bookingRefusal("UNPROCESSABLE_CONTENT", "too_soon", BOOKING_TOO_SOON_MESSAGE);
          }
          await db.execute(
            sql`INSERT INTO appointments (tracking_id, customer_name, customer_email, customer_phone, consultation_type, request_details, appointment_date, slot_key, duration, base_price, final_price, is_night_rate, payment_status, appointment_status, hold_expires_at, language) VALUES (${trackingId}, ${input.customerName}, ${input.customerEmail}, ${input.customerPhone}, ${'health_advice'}, ${input.requestDetails}, ${appointmentDateFormatted}, ${slotKey}, ${30}, ${basePrice}, ${finalPrice}, ${isNightRate ? 1 : 0}, ${'pending'}, ${'held'}, ${holdExpiresAt}, ${input.language})`
          );

          let session: Stripe.Checkout.Session;
          try {
            session = await getStripeClient().checkout.sessions.create({
              payment_method_types: ["card"],
              line_items: [{ price_data: { currency: "eur", product_data: consultationCheckoutProductData(trackingId), unit_amount: Math.round(Number(finalPrice) * 100) }, quantity: 1 }],
              mode: "payment",
              customer_email: input.customerEmail,
              metadata: { trackingId, customerName: input.customerName },
              expires_at: stripeExpiresAt(holdExpiresAt),
              success_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=success&trackingId=${encodeURIComponent(trackingId)}&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=canceled&session_id={CHECKOUT_SESSION_ID}`,
            });
            if (!session.id || !session.url) throw new Error("stripe_checkout_session_unavailable");
          } catch (stripeError) {
            // Paiement indisponible : le créneau est libéré et le patient reçoit
            // une consigne claire, jamais le texte technique de Stripe.
            await db.update(appointments).set(getExpiredAppointmentHoldUpdate()).where(and(eq(appointments.trackingId, trackingId), eq(appointments.paymentStatus, "pending"), eq(appointments.appointmentStatus, "held")));
            console.error("Stripe checkout session creation failed:", stripeError instanceof Error ? stripeError.name : "UnknownError");
            throw bookingRefusal("SERVICE_UNAVAILABLE", "payment_unavailable", BOOKING_PAYMENT_UNAVAILABLE_MESSAGE);
          }
          await db.update(appointments).set({ stripeSessionId: session.id }).where(and(eq(appointments.trackingId, trackingId), eq(appointments.appointmentStatus, "held")));
          // La page de réservation garde la session et l’expiration du maintien
          // (sessionStorage) pour proposer « Reprendre le paiement » ou
          // « Annuler et choisir un autre créneau » après un retour arrière.
          return { success: true, trackingId, finalPrice: parseFloat(finalPrice), checkoutUrl: session.url!, checkoutSessionId: session.id, holdExpiresAt: holdExpiresAt.toISOString() };
        } catch (dbError) {
          if (dbError instanceof TRPCError) throw dbError;
          console.error("Appointment creation failed:", dbError instanceof Error ? dbError.name : "UnknownError");
          if (String(dbError).toLowerCase().includes("appointments_active_slot_unique") || String(dbError).toLowerCase().includes("duplicate")) {
            throw bookingRefusal("CONFLICT", "slot_taken", "Ce créneau vient d’être réservé par un autre patient. Veuillez en choisir un autre.");
          }
          // Jamais de requête SQL ni de message de fournisseur dans la réponse.
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "La réservation n’a pas pu être enregistrée. Veuillez réessayer dans quelques instants." });
        }

        // Unreachable: the successful branch returns a Stripe Checkout URL.
      }),

    createCheckoutSession: publicProcedure
      .input(
        z.object({
          trackingId: z.string(),
          finalPrice: z.number(),
          customerEmail: z.string().email(),
          customerName: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          const appointmentResult = await db
            .select({
              trackingId: appointments.trackingId,
              customerEmail: appointments.customerEmail,
              customerName: appointments.customerName,
              finalPrice: appointments.finalPrice,
              paymentStatus: appointments.paymentStatus,
              appointmentStatus: appointments.appointmentStatus,
              stripeSessionId: appointments.stripeSessionId,
              holdExpiresAt: appointments.holdExpiresAt,
            })
            .from(appointments)
            .where(eq(appointments.trackingId, input.trackingId))
            .limit(1);
          const appointment = appointmentResult[0];

          if (!appointment) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Rendez-vous introuvable" });
          }
          if (appointment.paymentStatus !== "pending" || appointment.appointmentStatus !== "held" || !appointment.holdExpiresAt || appointment.holdExpiresAt <= new Date()) {
            throw new TRPCError({ code: "CONFLICT", message: "Ce rendez-vous ne peut plus être payé" });
          }

          const expectedPrice = Number(appointment.finalPrice);
          if (!Number.isFinite(expectedPrice) || Math.round(expectedPrice * 100) !== Math.round(input.finalPrice * 100)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Le montant du paiement ne correspond pas au rendez-vous" });
          }
          if (appointment.customerEmail !== input.customerEmail || appointment.customerName !== input.customerName) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Les informations du paiement ne correspondent pas au rendez-vous" });
          }

          if (appointment.stripeSessionId) {
            const existingSession = await getStripeClient().checkout.sessions.retrieve(appointment.stripeSessionId);
            if (existingSession.status === "open" && existingSession.url) return { success: true, checkoutUrl: existingSession.url };
            throw new TRPCError({ code: "CONFLICT", message: "La session de paiement a expiré" });
          }

          const amountInCents = Math.round(expectedPrice * 100);
          const { STRIPE_CHECKOUT_MIN_EXPIRY_MS, stripeExpiresAt } = await import("./appointmentHolds");
          // Stripe refuse une expiration à moins de 30 min : un maintien presque
          // écoulé ne peut plus ouvrir de session valide.
          if (appointment.holdExpiresAt.getTime() - Date.now() < STRIPE_CHECKOUT_MIN_EXPIRY_MS) {
            throw new TRPCError({ code: "CONFLICT", message: "La session de paiement a expiré. Veuillez choisir à nouveau votre créneau." });
          }

          const session = await getStripeClient().checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
              {
                price_data: {
                  currency: "eur",
                  product_data: consultationCheckoutProductData(input.trackingId),
                  unit_amount: amountInCents,
                },
                quantity: 1,
              },
            ],
            mode: "payment",
            customer_email: input.customerEmail,
            metadata: {
              trackingId: input.trackingId,
              customerName: input.customerName,
            },
            expires_at: stripeExpiresAt(appointment.holdExpiresAt),
            success_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=success&trackingId=${encodeURIComponent(input.trackingId)}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=canceled&session_id={CHECKOUT_SESSION_ID}`,
          });

          if (session.id) {
            await db
              .update(appointments)
              .set({ stripeSessionId: session.id })
              .where(and(eq(appointments.trackingId, input.trackingId), eq(appointments.appointmentStatus, "held")));
          }

          return {
            success: true,
            checkoutUrl: session.url,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.error("Stripe checkout session error:", error instanceof Error ? error.name : "UnknownError");
          throw bookingRefusal("SERVICE_UNAVAILABLE", "payment_unavailable", BOOKING_PAYMENT_UNAVAILABLE_MESSAGE);
        }
      }),

    /**
     * État réel d’un paiement pour la page de retour Stripe (confirmé, en cours
     * de validation, à régulariser…), sans jamais se fier au seul ?status=success.
     */
    publicStatus: publicProcedure
      .input(z.object({
        trackingId: z.string().regex(/^APT[A-Z0-9]{6,17}$/),
        sessionId: z.string().regex(/^cs_[A-Za-z0-9_]{6,250}$/),
      }))
      .query(async ({ input }) => {
        const { getPublicPaymentState } = await import("./appointmentPublicStatus");
        return getPublicPaymentState(getStripeClient, input);
      }),

    cancelPending: publicProcedure
      .input(z.object({ sessionId: z.string().min(1).max(255) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        let session: Stripe.Checkout.Session;
        try {
          session = await getStripeClient().checkout.sessions.retrieve(input.sessionId);
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Session Stripe invalide" });
        }

        const trackingId = session.metadata?.trackingId;
        if (!trackingId || session.payment_status === "paid" || session.status === "complete") {
          return { success: true, cancelled: false };
        }

        // Stripe keeps the Checkout page payable until it expires: close it before
        // releasing the hold, so going back to it can no longer charge the patient
        // for a slot that is not reserved anymore. If Stripe refuses (the payment
        // just completed) or is unreachable, the hold stays and the webhook or the
        // scheduled hold expiry settles it.
        if (session.status !== "expired") {
          try {
            await getStripeClient().checkout.sessions.expire(input.sessionId);
          } catch {
            return { success: true, cancelled: false };
          }
        }

        const result = await db
          .update(appointments)
          .set({ appointmentStatus: "cancelled", slotKey: null, holdExpiresAt: null, cancelledAt: new Date() })
          .where(
            and(
              eq(appointments.trackingId, trackingId),
              eq(appointments.stripeSessionId, input.sessionId),
              eq(appointments.paymentStatus, "pending"),
              eq(appointments.appointmentStatus, "held")
            )
          );

        return { success: true, cancelled: Number(result.rowCount ?? 0) > 0 };
      }),
  }),

  // Blog / Actualités
  blog: router({
    list: publicProcedure
      .input(
        z.object({
          language: z.string().optional().default("fr"),
          category: z.string().optional(),
          limit: z.number().min(1).max(50).optional().default(10),
          offset: z.number().min(0).optional().default(0),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { items: [], total: 0 };

        const conditions = [
          eq(blogPosts.published, 1),
          eq(blogPosts.language, input.language),
        ];
        if (input.category) {
          conditions.push(eq(blogPosts.category, input.category));
        }

        const whereClause = and(...conditions);
        const items = await db
          .select()
          .from(blogPosts)
          .where(whereClause)
          .orderBy(desc(blogPosts.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const [countResult] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(blogPosts)
          .where(whereClause);

        return { items, total: countResult?.count || 0 };
      }),

    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;

        const results = await db
          .select()
          .from(blogPosts)
          .where(and(eq(blogPosts.slug, input.slug), eq(blogPosts.published, 1)))
          .limit(1);

        return results[0] || null;
      }),
  }),

  // Availability / Calendar
  availability: router({
    getSlots: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(availabilitySlots).where(eq(availabilitySlots.isActive, 1));
    }),

    // Public : seulement les dates à venir, jamais le motif (note interne).
    getBlockedDates: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db
        .select({ date: blockedDates.date })
        .from(blockedDates)
        .where(gte(blockedDates.date, parisDateKey(new Date())));
    }),

    getBookedSlots: publicProcedure
      .input(z.object({ date: calendarDateInput }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        // Interpret the requested calendar day in Europe/Paris, not in the DB server timezone.
        const { start, end } = getParisDateRange(input.date);
        const results = await db
          .select({ appointmentDate: appointments.appointmentDate })
          .from(appointments)
          .where(
            and(
              gte(appointments.appointmentDate, start),
              lt(appointments.appointmentDate, end),
              sql`(
                (payment_status = 'pending' AND appointment_status = 'held' AND hold_expires_at > NOW())
                OR (payment_status = 'pending' AND appointment_status = 'confirmed')
                OR (payment_status = 'completed' AND appointment_status IN ('confirmed', 'completed'))
              )`
            )
          );

        return results.map(r => r.appointmentDate);
    }),
  }),

  recruitmentPreferences: router({
    unsubscribe: publicProcedure
      .input(z.object({ token: z.string().trim().min(24).max(80) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const [candidate] = await db.select({ id: cvApplications.id, marketingUnsubscribedAt: cvApplications.marketingUnsubscribedAt })
          .from(cvApplications)
          .where(eq(cvApplications.marketingUnsubscribeToken, input.token))
          .limit(1);
        if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "Lien de désinscription invalide ou expiré." });
        const alreadyUnsubscribed = Boolean(candidate.marketingUnsubscribedAt);
        if (!alreadyUnsubscribed) {
          await db.update(cvApplications).set({ marketingConsent: 0, marketingUnsubscribedAt: new Date(), updatedAt: new Date() }).where(eq(cvApplications.id, candidate.id));
        }
        await db.insert(recruitmentAuditLogs).values({
          applicationId: candidate.id,
          adminOpenId: "public:unsubscribe",
          action: "unsubscribe",
          metadata: JSON.stringify({ source: "recruitment_preferences", alreadyUnsubscribed }),
        });
        return { success: true, alreadyUnsubscribed };
      }),
  }),

  // Admin Dashboard Procedures
  admin: router({
    // List all appointments with pagination
    appointments: router({
      list: adminProcedure
        .input(
          z.object({
            limit: z.number().min(1).max(100).optional().default(50),
            offset: z.number().min(0).optional().default(0),
            status: z.enum(["pending", "completed", "failed", "refunded"]).optional(),
          })
        )
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return { items: [], total: 0 };

          const conditions = [];
          if (input.status) {
            conditions.push(eq(appointments.paymentStatus, input.status));
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

          const items = await db
            .select()
            .from(appointments)
            .where(whereClause)
            .orderBy(desc(appointments.createdAt))
            .limit(input.limit)
            .offset(input.offset);

          const countResult = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(appointments)
            .where(whereClause);

          return { items, total: countResult[0]?.count || 0 };
        }),

      updateStatus: adminProcedure
        .input(
          z.object({
            trackingId: z.string().min(1).max(20),
            appointmentStatus: z.enum(["confirmed", "cancelled", "completed", "no_show"]),
          })
        )
        .mutation(async ({ input }) => {
          const { updateAppointmentStatusByAdmin } = await import("./appointmentAdminActions");
          return updateAppointmentStatusByAdmin(input);
        }),

      /**
       * Remboursement intégral. « patient » : annulation demandée par le patient,
       * possible jusqu’à 24 h avant. « practitioner » : annulation (ou geste) du
       * praticien, toujours possible, motif obligatoire communiqué au patient.
       */
      refund: adminProcedure
        .input(
          z.object({
            trackingId: z.string().min(1).max(20),
            reason: z.string().trim().min(3, "Indiquez le motif du remboursement.").max(500),
            initiator: z.enum(["patient", "practitioner"]).default("patient"),
          })
        )
        .mutation(async ({ input }) => {
          const { refundAppointmentPayment } = await import("./appointmentAdminActions");
          return refundAppointmentPayment(getStripeClient(), input);
        }),

      /** Paiement Stripe reçu mais non rattachable au rendez-vous (session indiquée dans l’alerte). */
      refundUnconfirmedSession: adminProcedure
        .input(z.object({ sessionId: z.string().trim().regex(/^cs_[A-Za-z0-9_]{6,250}$/, "Identifiant de session Stripe invalide (cs_…)") }))
        .mutation(async ({ input }) => {
          const { refundUnconfirmedCheckoutSession } = await import("./appointmentAdminActions");
          return refundUnconfirmedCheckoutSession(getStripeClient(), input);
        }),
    }),

    // International recruitment applications
    recruitment: router({
      confirmationEmail: router({
        retry: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
          const result = await retryCvConfirmationEmail(input.id, { allowUntracked: true });
          if (result.outcome === "not_found") throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable." });
          if (result.outcome === "blocked") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cette adresse a rejeté ou bloqué l’e-mail. Vérifiez-la avant tout nouvel envoi." });
          if (result.outcome === "exhausted") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Les tentatives automatiques sont épuisées. Vérifiez la configuration Resend avant un nouvel essai." });
          await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: "application_confirmation_retry", outcome: result.outcome } });
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
          const { processDueCvGoogleDriveExports, retryCvGoogleDriveExport } = await import("./googleDriveExport");
          const queue = await retryCvGoogleDriveExport(application.id);
          const processing = queue.alreadyCompleted || queue.alreadyRunning
            ? { processed: 0, waitingForAuthorization: false, results: [] as Array<Record<string, unknown>> }
            : await processDueCvGoogleDriveExports(1, [application.id]);
          const outcome = driveRetryOutcome(queue, processing);
          await logRecruitmentAction({
            applicationId: application.id,
            adminOpenId: ctx.user.openId,
            action: "export",
            metadata: { event: "google_drive_retry", ...queue, processed: processing.processed, outcome: outcome.outcome },
          });
          return { success: true, ...queue, processed: processing.processed, ...outcome };
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
          })
        )
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return { items: [], total: 0 };

          const conditions = [];
          if (input.status) conditions.push(eq(cvApplications.status, input.status));
          if (input.specialty) conditions.push(sql`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${input.specialty}%`})`);
          if (input.country) conditions.push(sql`${cvApplications.targetCountries} LIKE ${`%${input.country}%`}`);
          if (input.language) conditions.push(sql`((${cvApplications.analysisPromptVersion} = ${RECRUITMENT_ANALYSIS_PROMPT_VERSION} AND ${cvApplications.normalizedLanguages} LIKE ${`%${input.language}%`}) OR ${cvApplications.languages} LIKE ${`%${input.language}%`})`);
          if (input.certification) conditions.push(sql`((${cvApplications.analysisPromptVersion} = ${RECRUITMENT_ANALYSIS_PROMPT_VERSION} AND ${cvApplications.normalizedCertifications} LIKE ${`%${input.certification}%`}) OR ${cvApplications.certifications} LIKE ${`%${input.certification}%`})`);

          let profile: typeof recruitmentMatchProfiles.$inferSelect | null = null;
          if (input.profileId) {
            const [selectedProfile] = await db.select().from(recruitmentMatchProfiles)
              .where(and(eq(recruitmentMatchProfiles.id, input.profileId), eq(recruitmentMatchProfiles.active, 1)))
              .limit(1);
            if (!selectedProfile) throw new TRPCError({ code: "NOT_FOUND", message: "Profil de matching introuvable" });
            profile = selectedProfile;
            if (selectedProfile.specialty) conditions.push(sql`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${selectedProfile.specialty}%`})`);
            if (selectedProfile.targetCountry) conditions.push(sql`${cvApplications.targetCountries} LIKE ${`%${selectedProfile.targetCountry}%`}`);
          }
          const minimumScore = Math.max(input.minimumScore ?? 0, profile?.minimumScore ?? 0);
          if (minimumScore > 0) conditions.push(scoreAtLeastOrUnavailable(minimumScore));
          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
              normalizedCertifications: cvApplications.normalizedCertifications,
              normalizedLanguages: cvApplications.normalizedLanguages,
              normalizedExperiences: cvApplications.normalizedExperiences,
              message: cvApplications.message,
              cvOriginalName: cvApplications.cvOriginalName,
              cvMimeType: cvApplications.cvMimeType,
              cvSizeBytes: cvApplications.cvSizeBytes,
              fileValidationStatus: cvApplications.fileValidationStatus,
              fileSecurityScanVersion: cvApplications.fileSecurityScanVersion,
              fileValidationNotes: cvApplications.fileValidationNotes,
              gdprConsent: cvApplications.gdprConsent,
              marketingConsent: cvApplications.marketingConsent,
              status: cvApplications.status,
              adminNotes: cvApplications.adminNotes,
              consentAt: cvApplications.consentAt,
              retentionUntil: cvApplications.retentionUntil,
              aiSummary: cvApplications.aiSummary,
              aiScore: verifiedRecruitmentScore,
              aiStrengths: cvApplications.aiStrengths,
              aiWeaknesses: cvApplications.aiWeaknesses,
              aiExtractedSkills: cvApplications.aiExtractedSkills,
              aiMatchReasoning: cvApplications.aiMatchReasoning,
              aiAnalyzedAt: cvApplications.aiAnalyzedAt,
              analysisStatus: cvApplications.analysisStatus,
              analysisAttempts: cvApplications.analysisAttempts,
              analysisLastError: cvApplications.analysisLastError,
              analysisModel: cvApplications.analysisModel,
              analysisPromptVersion: cvApplications.analysisPromptVersion,
              extractionMethod: cvApplications.extractionMethod,
              extractionPageCount: cvApplications.extractionPageCount,
              extractionTotalPages: cvApplications.extractionTotalPages,
              ocrConfidence: cvApplications.ocrConfidence,
              ocrModelVersion: cvApplications.ocrModelVersion,
              extractionWarnings: cvApplications.extractionWarnings,
              analysisRequestedAt: cvApplications.analysisRequestedAt,
              // Language of the application form, preselected for manual emails (EN-02).
              language: cvApplications.language,
              createdAt: cvApplications.createdAt,
              updatedAt: cvApplications.updatedAt,
            })
            .from(cvApplications)
            .where(whereClause)
            // With a threshold, the dossiers without a score come after every scored one, not page by page.
            .orderBy(...(minimumScore > 0 ? [sql`(${verifiedRecruitmentScore} IS NULL)`] : []), desc(cvApplications.createdAt))
            .limit(profile ? 1000 : input.limit)
            .offset(profile ? 0 : input.offset);

          const matchedItems = profile
            ? rawItems.filter(item => matchesRecruitmentProfile({
                score: item.aiScore,
                specialty: item.specialty,
                targetCountries: parseRecruitmentJsonArray(item.targetCountries),
                languages: parseRecruitmentJsonArray(item.languages),
                extractedSkills: (() => {
                  try {
                    const parsed = item.aiExtractedSkills ? JSON.parse(item.aiExtractedSkills) : {};
                    return Array.isArray(parsed.verifiedSkills) ? parsed.verifiedSkills.filter((value: unknown): value is string => typeof value === "string") : [];
                  } catch { return []; }
                })(),
                profile,
              }))
            : rawItems;
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
          const driveExportByApplicationId = new Map(driveExportJobs.map(job => [job.applicationId, job]));
          const emailEventsByApplicationId = new Map<number, typeof emailEvents>();
          for (const event of emailEvents) {
            if (!event.applicationId) continue;
            const current = emailEventsByApplicationId.get(event.applicationId) || [];
            current.push(event);
            emailEventsByApplicationId.set(event.applicationId, current);
          }
          const items = (profile ? matchedItems.slice(input.offset, input.offset + input.limit) : matchedItems)
            .map(item => ({
              ...item,
              candidatePortalActive: portalAccounts.some(account => candidatePortalAccountMatchesApplication(account, item)),
              candidatePortalActivation: resolveCandidatePortalActivationDelivery(emailEventsByApplicationId.get(item.id) || []),
              candidatePortalInvitation: resolveCandidatePortalInvitationDelivery(emailEventsByApplicationId.get(item.id) || []),
              driveExport: driveExportByApplicationId.get(item.id) || null,
              emailDelivery: resolveCvConfirmationDelivery(emailEventsByApplicationId.get(item.id) || []),
            }));
          const countResult = profile ? [{ count: matchedItems.length }] : await db.select({ count: sql<number>`COUNT(*)` }).from(cvApplications).where(whereClause);
          return { items, total: countResult[0]?.count || 0 };
        }),

      pool: router({
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
            if (input?.country) conditions.push(sql`${cvApplications.targetCountries} LIKE ${`%${input.country}%`}`);
            if (input?.availability) conditions.push(sql`LOWER(COALESCE(${cvApplications.availability}, '')) LIKE LOWER(${`%${input.availability}%`})`);
            if (input?.mobility) conditions.push(sql`(LOWER(COALESCE(${cvApplications.mobility}, '')) LIKE LOWER(${`%${input.mobility}%`}) OR LOWER(COALESCE(${cvApplications.targetCountries}, '')) LIKE LOWER(${`%${input.mobility}%`}))`);
            if (input?.certification) conditions.push(sql`(LOWER(COALESCE(${cvApplications.certifications}, '')) LIKE LOWER(${`%${input.certification}%`}) OR (${cvApplications.analysisPromptVersion} = ${RECRUITMENT_ANALYSIS_PROMPT_VERSION} AND LOWER(COALESCE(${cvApplications.normalizedCertifications}, '')) LIKE LOWER(${`%${input.certification}%`})))`);
            if (input?.minimumScore) conditions.push(scoreAtLeastOrUnavailable(input.minimumScore));
            return db.select({
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
          }),
      }),

      campaigns: router({
        previewAudience: adminProcedure
          .input(z.object({
            mode: z.enum(["selected", "all_eligible", "filtered"]),
            selectedIds: z.array(z.number().int().positive()).max(200).default([]),
            specialty: z.string().trim().max(160).optional(),
            country: z.string().trim().max(80).optional(),
            minimumScore: z.number().int().min(0).max(100).optional(),
          }))
          .query(async ({ input }) => {
            const db = await getDb();
            if (!db) return [];
            const conditions = [eq(cvApplications.marketingConsent, 1), isNull(cvApplications.marketingUnsubscribedAt), isNull(cvApplications.marketingSuppressedAt), sql`${cvApplications.status} NOT IN ('rejected', 'archived')`];
            if (input.mode === "selected") {
              if (!input.selectedIds.length) return [];
              conditions.push(inArray(cvApplications.id, input.selectedIds));
            }
            if (input.mode === "filtered") {
              if (input.specialty) conditions.push(sql`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${input.specialty}%`})`);
              if (input.country) conditions.push(sql`${cvApplications.targetCountries} LIKE ${`%${input.country}%`}`);
              if (input.minimumScore !== undefined) {
                conditions.push(sql`${cvApplications.aiScore} >= ${input.minimumScore}`);
                conditions.push(eq(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION));
              }
            }
            return db.select({
              id: cvApplications.id,
              firstName: cvApplications.firstName,
              lastName: cvApplications.lastName,
              email: cvApplications.email,
              specialty: cvApplications.specialty,
              aiScore: verifiedRecruitmentScore,
            }).from(cvApplications).where(and(...conditions)).orderBy(verifiedScoreFirst, desc(cvApplications.createdAt)).limit(200);
          }),

        list: adminProcedure.query(async () => {
          const db = await getDb();
          if (!db) return [];
          const campaigns = await db.select().from(recruitmentCampaigns).orderBy(desc(recruitmentCampaigns.createdAt)).limit(50);
          if (!campaigns.length) return [];
          const metrics = await db.select({
            campaignId: recruitmentCampaignRecipients.campaignId,
            total: sql<number>`COUNT(DISTINCT ${recruitmentCampaignRecipients.id})`,
            delivered: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delivered' THEN ${recruitmentCampaignRecipients.id} END)`,
            sent: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} IN ('sent', 'delivered') THEN ${recruitmentCampaignRecipients.id} END)`,
            failed: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} IN ('failed', 'bounced', 'complained', 'suppressed') THEN ${recruitmentCampaignRecipients.id} END)`,
            // Only a send that failed before the provider accepted it can be retried.
            retryable: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'failed' THEN ${recruitmentCampaignRecipients.id} END)`,
            delayed: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delayed' THEN ${recruitmentCampaignRecipients.id} END)`,
            opened: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentEmailEvents.eventType} = 'email.opened' THEN ${recruitmentCampaignRecipients.id} END)`,
          }).from(recruitmentCampaignRecipients)
            .leftJoin(recruitmentEmailEvents, eq(recruitmentEmailEvents.campaignRecipientId, recruitmentCampaignRecipients.id))
            .where(inArray(recruitmentCampaignRecipients.campaignId, campaigns.map(campaign => campaign.id)))
            .groupBy(recruitmentCampaignRecipients.campaignId);
          const metricByCampaign = new Map(metrics.map(metric => [metric.campaignId, metric]));
          return campaigns.map(campaign => ({ ...campaign, delivery: metricByCampaign.get(campaign.id) || { total: 0, sent: 0, delivered: 0, failed: 0, retryable: 0, delayed: 0, opened: 0 } }));
        }),

        send: adminProcedure
          .input(z.object({
            title: z.string().trim().min(3).max(180),
            subject: z.string().trim().min(3).max(255),
            body: z.string().trim().min(10).max(8000),
            language: z.enum(["fr", "en"]),
            mode: z.enum(["selected", "all_eligible", "filtered"]),
            selectedIds: z.array(z.number().int().positive()).max(200).default([]),
            specialty: z.string().trim().max(160).optional(),
            country: z.string().trim().max(80).optional(),
            minimumScore: z.number().int().min(0).max(100).optional(),
            confirmed: z.literal(true),
          }))
          .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new Error("Database connection failed");
            const conditions = [eq(cvApplications.marketingConsent, 1), isNull(cvApplications.marketingUnsubscribedAt), isNull(cvApplications.marketingSuppressedAt), sql`${cvApplications.status} NOT IN ('rejected', 'archived')`];
            if (input.mode === "selected") {
              if (!input.selectedIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Sélectionnez au moins un profil éligible" });
              conditions.push(inArray(cvApplications.id, input.selectedIds));
            }
            if (input.mode === "filtered") {
              if (input.specialty) conditions.push(sql`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${input.specialty}%`})`);
              if (input.country) conditions.push(sql`${cvApplications.targetCountries} LIKE ${`%${input.country}%`}`);
              if (input.minimumScore !== undefined) {
                conditions.push(sql`${cvApplications.aiScore} >= ${input.minimumScore}`);
                conditions.push(eq(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION));
              }
            }
            const audience = await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, marketingUnsubscribeToken: cvApplications.marketingUnsubscribeToken })
              .from(cvApplications).where(and(...conditions)).limit(200);
            if (!audience.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun profil éligible : seuls les candidats ayant accepté les communications de recrutement peuvent être contactés." });

            const [campaignResult] = await db.insert(recruitmentCampaigns).values({
              title: input.title,
              subject: input.subject,
              body: input.body,
              language: input.language,
              audienceMode: input.mode,
              audienceFilters: JSON.stringify({ specialty: input.specialty || null, country: input.country || null, minimumScore: input.minimumScore ?? null, selectedIds: input.mode === "selected" ? input.selectedIds : undefined }),
              recipientCount: audience.length,
              status: "sending",
              createdByOpenId: ctx.user.openId,
            }).returning({ id: recruitmentCampaigns.id });
            const campaignId = Number(campaignResult.id);
            const campaign = { id: campaignId, title: input.title, subject: input.subject, body: input.body, language: input.language };
            let sent = 0;
            let failed = 0;
            for (const candidate of audience) {
              const [recipientResult] = await db.insert(recruitmentCampaignRecipients).values({ campaignId, applicationId: candidate.id, recipientEmail: candidate.email, deliveryStatus: "queued" }).returning({ id: recruitmentCampaignRecipients.id });
              if (await deliverCampaignRecipient(db, campaign, candidate, Number(recipientResult.id), ctx.user.openId)) sent += 1;
              else failed += 1;
            }
            await db.update(recruitmentCampaigns).set({ status: failed === 0 ? "sent" : sent > 0 ? "partially_sent" : "failed", sentAt: new Date() }).where(eq(recruitmentCampaigns.id, campaignId));
            return { campaignId, total: audience.length, sent, failed };
          }),

        /**
         * Sends the campaign again to its failed recipients only (provider
         * error before acceptance). Bounces, complaints, suppressions and
         * candidates who withdrew their consent are never retried; recipients
         * already served are never emailed twice.
         */
        retryFailed: adminProcedure
          .input(z.object({ campaignId: z.number().int().positive(), confirmed: z.literal(true) }))
          .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new Error("Database connection failed");
            const [campaign] = await db.select({ id: recruitmentCampaigns.id, title: recruitmentCampaigns.title, subject: recruitmentCampaigns.subject, body: recruitmentCampaigns.body, language: recruitmentCampaigns.language })
              .from(recruitmentCampaigns).where(eq(recruitmentCampaigns.id, input.campaignId)).limit(1);
            if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campagne introuvable" });
            const failedRecipients = await db.select({ recipientId: recruitmentCampaignRecipients.id, applicationId: recruitmentCampaignRecipients.applicationId })
              .from(recruitmentCampaignRecipients)
              .where(and(eq(recruitmentCampaignRecipients.campaignId, campaign.id), eq(recruitmentCampaignRecipients.deliveryStatus, "failed")))
              .limit(200);
            const eligible = failedRecipients.length
              ? await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, marketingUnsubscribeToken: cvApplications.marketingUnsubscribeToken })
                .from(cvApplications)
                .where(and(inArray(cvApplications.id, failedRecipients.map(recipient => recipient.applicationId)), eq(cvApplications.marketingConsent, 1), isNull(cvApplications.marketingUnsubscribedAt), isNull(cvApplications.marketingSuppressedAt), sql`${cvApplications.status} NOT IN ('rejected', 'archived')`))
              : [];
            const candidateById = new Map(eligible.map(candidate => [candidate.id, candidate]));
            let sent = 0;
            let failed = 0;
            let skipped = 0;
            for (const recipient of failedRecipients) {
              const candidate = candidateById.get(recipient.applicationId);
              if (!candidate) {
                await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "skipped", error: "consent_withdrawn_or_profile_closed" }).where(and(eq(recruitmentCampaignRecipients.id, recipient.recipientId), eq(recruitmentCampaignRecipients.deliveryStatus, "failed")));
                skipped += 1;
                continue;
              }
              // Claim the row: a concurrent retry cannot send the same email twice.
              const claimed = await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "queued", error: null })
                .where(and(eq(recruitmentCampaignRecipients.id, recipient.recipientId), eq(recruitmentCampaignRecipients.deliveryStatus, "failed")));
              if (mutationRowCount(claimed) !== 1) continue;
              if (await deliverCampaignRecipient(db, campaign, candidate, recipient.recipientId, ctx.user.openId)) sent += 1;
              else failed += 1;
            }
            const statuses = await db.select({ deliveryStatus: recruitmentCampaignRecipients.deliveryStatus }).from(recruitmentCampaignRecipients).where(eq(recruitmentCampaignRecipients.campaignId, campaign.id));
            const served = statuses.filter(row => ["sent", "delivered", "delayed"].includes(row.deliveryStatus)).length;
            await db.update(recruitmentCampaigns).set({ status: served === statuses.length ? "sent" : served > 0 ? "partially_sent" : "failed" }).where(eq(recruitmentCampaigns.id, campaign.id));
            return { campaignId: campaign.id, attempted: failedRecipients.length, sent, failed, skipped };
          }),
      }),

      dashboard: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return null;
        const [candidateStats] = await db.select({
          total: sql<number>`COUNT(*)`,
          marketingEligible: sql<number>`SUM(CASE WHEN ${cvApplications.marketingConsent} = 1 AND ${cvApplications.marketingUnsubscribedAt} IS NULL AND ${cvApplications.marketingSuppressedAt} IS NULL THEN 1 ELSE 0 END)`,
          analysesQueued: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'queued' THEN 1 ELSE 0 END)`,
          analysesInProgress: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} IN ('extracting', 'analyzing') THEN 1 ELSE 0 END)`,
          analysesCompleted: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'completed' THEN 1 ELSE 0 END)`,
          analysesNeedsReview: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'needs_review' THEN 1 ELSE 0 END)`,
          analysesFailed: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'failed' THEN 1 ELSE 0 END)`,
          contacted: sql<number>`SUM(CASE WHEN ${cvApplications.lastContactedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
          responded: sql<number>`SUM(CASE WHEN ${cvApplications.lastCandidateResponseAt} IS NOT NULL THEN 1 ELSE 0 END)`,
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

      candidate: router({
        sendPortalInvitation: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de données indisponible." });
          const application = (await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, email: cvApplications.email, trackingId: cvApplications.trackingId, language: cvApplications.language })
            .from(cvApplications)
            .where(eq(cvApplications.id, input.id))
            .limit(1))[0];
          if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable." });
          const existingAccount = (await db.select({ emailVerifiedAt: candidateAccounts.emailVerifiedAt })
            .from(candidateAccounts)
            .where(sql`LOWER(${candidateAccounts.email}) = LOWER(${application.email})`)
            .limit(1))[0];
          if (existingAccount?.emailVerifiedAt) throw new TRPCError({ code: "CONFLICT", message: "Un espace candidat actif existe déjà pour cette adresse email." });
          const invitationEvents = await db.select({
            eventType: recruitmentEmailEvents.eventType,
            providerEmailId: recruitmentEmailEvents.providerEmailId,
            payload: recruitmentEmailEvents.payload,
            occurredAt: recruitmentEmailEvents.occurredAt,
          }).from(recruitmentEmailEvents)
            .where(eq(recruitmentEmailEvents.applicationId, application.id))
            .orderBy(desc(recruitmentEmailEvents.occurredAt));
          const invitationDelivery = resolveCandidatePortalInvitationDelivery(invitationEvents);
          if (invitationDelivery.eventType === "email.delivery_unknown") {
            throw new TRPCError({ code: "CONFLICT", message: "La livraison de l’invitation précédente est incertaine. Vérifiez son suivi avant tout nouvel envoi pour éviter un doublon." });
          }
          const invitationAttempt = invitationDelivery.attempts + 1;
          const invitationToken = createCandidateInvitationToken(application.id);
          const invitationUrl = `${getSafeCheckoutOrigin()}/candidate/access?invite=${encodeURIComponent(invitationToken)}`;
          let result: { id: string };
          try {
            result = await sendCandidatePortalAccessEmail({
              to: application.email,
              firstName: application.firstName,
              kind: "invite",
              actionUrl: invitationUrl,
              // In the language of the application form (EN-02).
              language: emailLanguageFor(application.language),
              idempotencyKey: `candidate-portal-invitation-${application.trackingId}-attempt-${invitationAttempt}`,
            });
          } catch (error) {
            const failureCode = candidatePortalAccessEmailFailureCode(error);
            await db.insert(recruitmentEmailEvents).values(buildCandidatePortalInvitationEmailEvent({
              applicationId: application.id,
              candidateEmail: application.email,
              trackingId: application.trackingId,
              deliveryAttempt: invitationAttempt,
            }, {
              status: "failed",
              providerEmailId: null,
              failureCode,
            }, { localEventId: randomUUID() }));
            await logRecruitmentAction({ applicationId: application.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: "candidate_portal_invitation", outcome: failureCode === "delivery_exception" ? "unknown" : "failed", trackingId: application.trackingId, attempt: invitationAttempt } });
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: failureCode === "delivery_exception"
                ? "La livraison de l’invitation est incertaine. Vérifiez son suivi avant tout nouvel envoi pour éviter un doublon."
                : "L’invitation a été refusée par le service d’envoi. L’échec est enregistré pour reprise.",
            });
          }
          const invitationEvent = buildCandidatePortalInvitationEmailEvent({
            applicationId: application.id,
              candidateEmail: application.email,
              trackingId: application.trackingId,
              deliveryAttempt: invitationAttempt,
          }, {
            status: "sent",
            providerEmailId: result.id,
            failureCode: null,
          });
          const [existingInvitationEvent] = await db.select({ id: recruitmentEmailEvents.id })
            .from(recruitmentEmailEvents)
            .where(eq(recruitmentEmailEvents.providerEventId, invitationEvent.providerEventId))
            .limit(1);
          if (!existingInvitationEvent) await db.insert(recruitmentEmailEvents).values(invitationEvent);
          await logRecruitmentAction({ applicationId: application.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: "candidate_portal_invitation", resendId: result.id, trackingId: application.trackingId, attempt: invitationAttempt } });
          return { success: true };
        }),
        detail: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
          const db = await getDb();
          if (!db) return null;
          // The extracted CV text is never sent to the browser (the UI does not
          // use it, and a legacy row could hold an oversized text).
          const { extractedText: _extractedText, ...detailColumns } = getTableColumns(cvApplications);
          const [candidate] = await db.select(detailColumns).from(cvApplications).where(eq(cvApplications.id, input.id)).limit(1);
          if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable" });
          const [audits, campaignRecipients, followUps] = await Promise.all([
            db.select().from(recruitmentAuditLogs).where(eq(recruitmentAuditLogs.applicationId, input.id)).orderBy(desc(recruitmentAuditLogs.createdAt)).limit(100),
            db.select({
              id: recruitmentCampaignRecipients.id,
              campaignId: recruitmentCampaignRecipients.campaignId,
              campaignTitle: recruitmentCampaigns.title,
              deliveryStatus: recruitmentCampaignRecipients.deliveryStatus,
              error: recruitmentCampaignRecipients.error,
              sentAt: recruitmentCampaignRecipients.sentAt,
              deliveredAt: recruitmentCampaignRecipients.deliveredAt,
              lastEventAt: recruitmentCampaignRecipients.lastEventAt,
            }).from(recruitmentCampaignRecipients).leftJoin(recruitmentCampaigns, eq(recruitmentCampaignRecipients.campaignId, recruitmentCampaigns.id)).where(eq(recruitmentCampaignRecipients.applicationId, input.id)).orderBy(desc(recruitmentCampaignRecipients.createdAt)).limit(100),
            db.select().from(recruitmentFollowUpTasks).where(eq(recruitmentFollowUpTasks.applicationId, input.id)).orderBy(recruitmentFollowUpTasks.status, recruitmentFollowUpTasks.dueAt).limit(50),
          ]);
          return { candidate, audits, campaignRecipients, followUps };
        }),
        markResponse: adminProcedure.input(z.object({ id: z.number().int().positive(), note: z.string().trim().max(1000).optional() })).mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const responseAt = new Date();
          await db.update(cvApplications).set({ lastCandidateResponseAt: responseAt, updatedAt: responseAt }).where(eq(cvApplications.id, input.id));
          await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "status_update", metadata: { event: "candidate_response", note: input.note || null } });
          return { success: true, responseAt };
        }),
      }),

      followUps: router({
        list: adminProcedure.input(z.object({ status: z.enum(["suggested", "completed", "dismissed"]).optional() }).optional()).query(async ({ input }) => {
          const db = await getDb();
          if (!db) return [];
          const whereClause = input?.status ? eq(recruitmentFollowUpTasks.status, input.status) : undefined;
          return db.select({
            id: recruitmentFollowUpTasks.id,
            applicationId: recruitmentFollowUpTasks.applicationId,
            campaignId: recruitmentFollowUpTasks.campaignId,
            kind: recruitmentFollowUpTasks.kind,
            dueAt: recruitmentFollowUpTasks.dueAt,
            status: recruitmentFollowUpTasks.status,
            notes: recruitmentFollowUpTasks.notes,
            completedAt: recruitmentFollowUpTasks.completedAt,
            firstName: cvApplications.firstName,
            lastName: cvApplications.lastName,
            specialty: cvApplications.specialty,
            email: cvApplications.email,
          }).from(recruitmentFollowUpTasks).innerJoin(cvApplications, eq(recruitmentFollowUpTasks.applicationId, cvApplications.id)).where(whereClause).orderBy(recruitmentFollowUpTasks.dueAt).limit(200);
        }),
        update: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["suggested", "completed", "dismissed"]), notes: z.string().trim().max(2000).optional() })).mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const [task] = await db.select().from(recruitmentFollowUpTasks).where(eq(recruitmentFollowUpTasks.id, input.id)).limit(1);
          if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Relance introuvable" });
          await db.update(recruitmentFollowUpTasks).set({
            status: input.status,
            notes: input.notes ?? task.notes,
            completedAt: input.status === "suggested" ? null : new Date(),
            completedByOpenId: input.status === "suggested" ? null : ctx.user.openId,
            updatedAt: new Date(),
          }).where(eq(recruitmentFollowUpTasks.id, input.id));
          await logRecruitmentAction({ applicationId: task.applicationId, adminOpenId: ctx.user.openId, action: "status_update", metadata: { event: "follow_up", taskId: task.id, status: input.status } });
          return { success: true };
        }),
      }),

      offerTemplates: router({
        list: adminProcedure.query(async () => {
          const db = await getDb();
          if (!db) return [];
          return db.select().from(recruitmentOfferTemplates).orderBy(desc(recruitmentOfferTemplates.updatedAt)).limit(100);
        }),
        create: adminProcedure.input(z.object({ name: z.string().trim().min(3).max(180), category: z.enum(["europe", "canada", "middle_east", "vvip_offshore", "paramedical", "general"]), language: z.enum(["fr", "en"]), subject: z.string().trim().min(3).max(255), body: z.string().trim().min(10).max(8000) })).mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const [result] = await db.insert(recruitmentOfferTemplates).values({ ...input, createdByOpenId: ctx.user.openId }).returning({ id: recruitmentOfferTemplates.id });
          return { success: true, id: Number(result.id) };
        }),
        update: adminProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(3).max(180), category: z.enum(["europe", "canada", "middle_east", "vvip_offshore", "paramedical", "general"]), language: z.enum(["fr", "en"]), subject: z.string().trim().min(3).max(255), body: z.string().trim().min(10).max(8000), active: z.number().int().min(0).max(1) })).mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          await db.update(recruitmentOfferTemplates).set({ ...input, updatedAt: new Date() }).where(eq(recruitmentOfferTemplates.id, input.id));
          return { success: true };
        }),
      }),

      exportCsv: adminProcedure.input(z.object({ type: z.enum(["pool", "shortlist"]), briefId: z.number().int().positive().optional(), candidateIds: z.array(z.number().int().positive()).max(RECRUITMENT_EXPORT_MAX_CANDIDATES).optional().default([]) })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        let candidateIds = input.candidateIds;
        if (input.type === "shortlist") {
          if (!input.briefId) throw new TRPCError({ code: "BAD_REQUEST", message: "Une mission est requise pour exporter une shortlist." });
          // Ids sent by the client never widen or replace a mission's shortlist.
          candidateIds = await openShortlistedApplicationIds(db, input.briefId);
          if (!candidateIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun candidat présélectionné pour cette mission." });
          // Refused rather than cut short: the file must match the count on the button.
          if (candidateIds.length > RECRUITMENT_EXPORT_MAX_CANDIDATES) throw new TRPCError({ code: "BAD_REQUEST", message: `La shortlist compte ${candidateIds.length} candidats ; ${RECRUITMENT_EXPORT_MAX_CANDIDATES} au maximum par export. Retirez des candidats de la shortlist avant de l’exporter.` });
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
        const includeAiScore = input.type === "pool";
        const header = ["Prénom", "Nom", "Email", "Téléphone", "Spécialité", "Pays ciblés", "Langues", "Expérience (ans)", "Disponibilité", "Mobilité", "Certifications", ...(includeAiScore ? ["Score IA"] : []), "Statut"];
        const csv = [header.map(csvCell).join(";"), ...rows.map(row => [row.firstName, row.lastName, row.email, row.phone, row.specialty, row.targetCountries, row.languages, row.yearsExperience, row.availability, row.mobility, row.certifications, ...(includeAiScore ? [row.aiScore] : []), row.status].map(csvCell).join(";"))].join("\n");
        await Promise.all(rows.map(row => logRecruitmentAction({ applicationId: row.id, adminOpenId: ctx.user.openId, action: "export", metadata: { type: input.type, briefId: input.briefId || null } })));
        return { filename: `${input.type}-${new Date().toISOString().slice(0, 10)}.csv`, csv, count: rows.length };
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
          await db
            .update(cvApplications)
            .set({
              status: input.status,
              ...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes || null } : {}),
              updatedAt: new Date(),
            })
            .where(eq(cvApplications.id, input.id));
          await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "status_update", metadata: { status: input.status } });

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

          const { enqueueCvAnalysis, processDueCvAnalysisJobs } = await import("./recruitmentProcessing");
          const queue = await enqueueCvAnalysis(application.id);
          const processing = await processDueCvAnalysisJobs(1, [application.id]);
          const outcome = reanalysisOutcome(queue, processing);
          await logRecruitmentAction({
            applicationId: application.id,
            adminOpenId: ctx.user.openId,
            action: "reanalyze",
            metadata: { queued: queue.queued, accelerated: queue.accelerated, alreadyRunning: queue.alreadyRunning, processed: processing.processed, outcome: outcome.outcome },
          });
          return { success: true, queued: queue.queued || queue.accelerated, processed: processing.processed, ...outcome };
        }),

      reanalyzeFailed: adminProcedure
        .input(z.object({ limit: z.number().int().min(1).max(25).default(10) }).optional())
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const resumableApplications = await db
            .select({ id: cvApplications.id, trackingId: cvApplications.trackingId })
            .from(cvApplications)
            .where(and(or(inArray(cvApplications.analysisStatus, ["failed", "queued"]), ne(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION), isNull(cvApplications.analysisPromptVersion)), ne(cvApplications.status, "rejected"), ne(cvApplications.status, "archived")))
            .orderBy(cvApplications.updatedAt)
            .limit(input?.limit ?? 10);

          const { enqueueCvAnalysis, processDueCvAnalysisJobs } = await import("./recruitmentProcessing");
          for (const application of resumableApplications) {
            await enqueueCvAnalysis(application.id);
            await logRecruitmentAction({ applicationId: application.id, adminOpenId: ctx.user.openId, action: "reanalyze", metadata: { queued: true, batch: true } });
          }
          const applicationIds = resumableApplications.map(application => application.id);
          // One analysis inline at most (an AI call can take ~35 s): the rest is
          // queued for the cron, so the admin request stays under the 60 s limit.
          const processing = applicationIds.length > 0
            ? await processDueCvAnalysisJobs(1, applicationIds)
            : { processed: 0, results: [] };
          return { success: true, queued: resumableApplications.length, processed: processing.processed };
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
          await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: input.template, language: input.language, customRequest: input.customRequest || null, resendId: result.id } });
          return { success: true };
        }),

      erase: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const { eraseCandidateApplication, CandidateErasureBusyError, CandidateErasureNotFoundError, CandidateErasureStorageError } = await import("./recruitmentErasure");
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
    }),

    // Employer mission briefs and their human-reviewed candidate associations.
    clientBriefs: router({
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
        }))
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return { brief: null, candidates: [], shortlistedCount: 0, pagination: { page: input.page, limit: input.limit, total: 0, totalPages: 0 } };
          const [brief] = await db.select().from(clientBriefs).where(eq(clientBriefs.id, input.briefId)).limit(1);
          if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "Brief employeur introuvable" });
          const candidateConditions = [sql`${cvApplications.status} NOT IN ('rejected', 'archived')`];
          const [countResult] = await db.select({ total: sql<number>`COUNT(*)` }).from(cvApplications).where(and(...candidateConditions));
          const applications = await db.select({
            id: cvApplications.id,
            trackingId: cvApplications.trackingId,
            firstName: cvApplications.firstName,
            lastName: cvApplications.lastName,
            specialty: cvApplications.specialty,
            targetCountries: cvApplications.targetCountries,
            certifications: cvApplications.certifications,
            normalizedCertifications: sql<string | null>`CASE WHEN ${cvApplications.analysisPromptVersion} = ${RECRUITMENT_ANALYSIS_PROMPT_VERSION} THEN ${cvApplications.normalizedCertifications} ELSE NULL END`,
            languages: cvApplications.languages,
            normalizedLanguages: sql<string | null>`CASE WHEN ${cvApplications.analysisPromptVersion} = ${RECRUITMENT_ANALYSIS_PROMPT_VERSION} THEN ${cvApplications.normalizedLanguages} ELSE NULL END`,
            yearsExperience: cvApplications.yearsExperience,
            availability: cvApplications.availability,
            mobility: cvApplications.mobility,
            aiScore: verifiedRecruitmentScore,
            status: cvApplications.status,
          }).from(cvApplications)
            .where(and(...candidateConditions))
            .orderBy(verifiedScoreFirst, desc(cvApplications.createdAt), desc(cvApplications.id))
            .limit(input.limit)
            .offset(input.page * input.limit);
          const applicationIds = applications.map(application => application.id);
          const [certificationRows, languageRows, associations] = applicationIds.length > 0
            ? await Promise.all([
              db.select({ applicationId: cvCandidateCertifications.applicationId, name: cvCandidateCertifications.name })
                .from(cvCandidateCertifications)
                .where(inArray(cvCandidateCertifications.applicationId, applicationIds)),
              db.select({ applicationId: cvCandidateLanguages.applicationId, language: cvCandidateLanguages.language })
                .from(cvCandidateLanguages)
                .where(inArray(cvCandidateLanguages.applicationId, applicationIds)),
              db.select().from(clientBriefCandidates).where(and(eq(clientBriefCandidates.briefId, brief.id), inArray(clientBriefCandidates.applicationId, applicationIds))),
            ])
            : [[], [], []] as const;
          const certificationsByApplication = new Map<number, string[]>();
          for (const certification of certificationRows) {
            certificationsByApplication.set(certification.applicationId, [
              ...(certificationsByApplication.get(certification.applicationId) || []),
              certification.name,
            ]);
          }
          const languagesByApplication = new Map<number, string[]>();
          for (const language of languageRows) {
            languagesByApplication.set(language.applicationId, [
              ...(languagesByApplication.get(language.applicationId) || []),
              language.language,
            ]);
          }
          const associationByApplication = new Map(associations.map(association => [association.applicationId, association]));
          const candidates = applications.map(application => ({
            ...application,
            match: computeBriefCandidateMatch(brief, {
              ...application,
              certificationNames: certificationsByApplication.get(application.id) || [],
              languageNames: languagesByApplication.get(application.id) || [],
            }),
            association: associationByApplication.get(application.id) ?? null,
          }));
          const total = Number(countResult?.total || 0);
          // What the shortlist export would carry, across every page (REC-01).
          const shortlistedCount = (await openShortlistedApplicationIds(db, brief.id)).length;
          return { brief, candidates, shortlistedCount, pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
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
          const [existing] = await db.select().from(clientBriefCandidates)
            .where(and(eq(clientBriefCandidates.briefId, input.briefId), eq(clientBriefCandidates.applicationId, input.applicationId)))
            .limit(1);
          if (existing) {
            await db.update(clientBriefCandidates).set({
              matchScore: input.matchScore ?? existing.matchScore,
              status: input.status,
              notes: input.notes ?? existing.notes,
              updatedAt: new Date(),
            }).where(eq(clientBriefCandidates.id, existing.id));
          } else {
            await db.insert(clientBriefCandidates).values({
              briefId: input.briefId,
              applicationId: input.applicationId,
              matchScore: input.matchScore ?? null,
              status: input.status,
              notes: input.notes ?? null,
            });
          }
          return { success: true };
        }),
    }),

    candidateDocuments: router({
      list: adminProcedure
        .input(z.object({
          status: z.enum(["uploaded", "validating", "analyzing", "needs_review", "reviewed", "rejected", "archived"]).optional(),
          limit: z.number().int().min(1).max(100).default(50),
        }))
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return [];
          const conditions = input.status ? eq(candidateDocuments.status, input.status) : undefined;
          return db.select({
            id: candidateDocuments.id,
            candidateId: candidateDocuments.candidateId,
            candidateEmail: candidateAccounts.email,
            firstName: candidateAccounts.firstName,
            lastName: candidateAccounts.lastName,
            category: candidateDocuments.category,
            categoryOtherLabel: candidateDocuments.categoryOtherLabel,
            originalName: candidateDocuments.originalName,
            mimeType: candidateDocuments.mimeType,
            sizeBytes: candidateDocuments.sizeBytes,
            validationStatus: candidateDocuments.validationStatus,
            status: candidateDocuments.status,
            analysisStatus: candidateDocuments.analysisStatus,
            aiSummary: candidateDocuments.aiSummary,
            aiExtractedData: candidateDocuments.aiExtractedData,
            aiConfidence: candidateDocuments.aiConfidence,
            aiFlags: candidateDocuments.aiFlags,
            aiModel: candidateDocuments.aiModel,
            reviewNotes: candidateDocuments.reviewNotes,
            createdAt: candidateDocuments.createdAt,
            analyzedAt: candidateDocuments.analyzedAt,
          }).from(candidateDocuments).innerJoin(candidateAccounts, eq(candidateDocuments.candidateId, candidateAccounts.id)).where(conditions).orderBy(desc(candidateDocuments.createdAt)).limit(input.limit);
        }),
      review: adminProcedure
        .input(z.object({ id: z.number().int().positive(), status: z.enum(["reviewed", "rejected", "archived"]), notes: z.string().trim().min(1).max(5000) }))
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le coffre documentaire est temporairement indisponible." });
          const document = (await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, input.id)).limit(1))[0];
          if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
          await db.update(candidateDocuments).set({ status: input.status, reviewedByOpenId: ctx.user.openId, reviewedAt: new Date(), reviewNotes: input.notes }).where(eq(candidateDocuments.id, input.id));
          await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "admin", actorReference: ctx.user.openId, action: "reviewed", metadata: JSON.stringify({ status: input.status }) });
          return { success: true };
        }),
      reanalyze: adminProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le coffre documentaire est temporairement indisponible." });
          const document = (await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, input.id)).limit(1))[0];
          if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
          if (!candidateDocumentAllowsAiAnalysis(document.category)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Ce type de document est réservé à la revue humaine : il n’est jamais transmis à l’IA." });
          }
          if (!canRequestCandidateDocumentReanalysis(document)) {
            throw new TRPCError({ code: document.status === "rejected" ? "BAD_REQUEST" : "CONFLICT", message: document.status === "rejected" ? "Un document refusé ne peut pas être relancé." : "Une analyse de ce document est déjà en cours." });
          }
          const { enqueueCandidateDocumentAnalysis } = await import("./candidateDocumentProcessing");
          await enqueueCandidateDocumentAnalysis(document.id);
          await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "admin", actorReference: ctx.user.openId, action: "analysis_requested", metadata: JSON.stringify({ source: "admin_reanalysis" }) });
          return { success: true, queued: true };
        }),
      download: adminProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le coffre documentaire est temporairement indisponible." });
          const document = (await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, input.id)).limit(1))[0];
          if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
          return { url: `/api/admin/candidate-documents/${document.id}/download`, filename: document.originalName };
        }),
    }),

    // List all contact messages
    contacts: router({
      list: adminProcedure
        .input(
          z.object({
            limit: z.number().min(1).max(100).optional().default(50),
            offset: z.number().min(0).optional().default(0),
          })
        )
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return { items: [], total: 0 };

          const items = await db
            .select()
            .from(contactMessages)
            .orderBy(desc(contactMessages.createdAt))
            .limit(input.limit)
            .offset(input.offset);

          const countResult = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(contactMessages);

          return { items, total: countResult[0]?.count || 0 };
        }),

      markRead: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db
            .update(contactMessages)
            .set({ read: 1 })
            .where(eq(contactMessages.id, input.id));

          return { success: true };
        }),
    }),

    // List all GDPR requests
    gdprRequests: router({
      list: adminProcedure
        .input(
          z.object({
            limit: z.number().min(1).max(100).optional().default(50),
            offset: z.number().min(0).optional().default(0),
          })
        )
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return { items: [], total: 0 };

          const items = await db
            .select()
            .from(gdprRequests)
            .orderBy(desc(gdprRequests.createdAt))
            .limit(input.limit)
            .offset(input.offset);

          const countResult = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(gdprRequests);

          return { items, total: countResult[0]?.count || 0 };
        }),

      updateStatus: adminProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "in_progress", "completed", "rejected"]),
            notes: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          const updateData: Record<string, any> = { status: input.status };
          if (input.notes) updateData.notes = input.notes;
          if (input.status === "completed") updateData.responseDate = new Date();

          await db
            .update(gdprRequests)
            .set(updateData)
            .where(eq(gdprRequests.id, input.id));

          return { success: true };
        }),
    }),

    // Dashboard stats
    stats: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { appointments: 0, contacts: 0, gdpr: 0, revenue: 0 };

      const [aptCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(appointments);
      const [contactCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(contactMessages);
      const [gdprCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(gdprRequests);
      const [revenueResult] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(final_price AS DECIMAL(10,2))), 0)` }).from(appointments).where(eq(appointments.paymentStatus, "completed"));

      return {
        appointments: aptCount?.count || 0,
        contacts: contactCount?.count || 0,
        gdpr: gdprCount?.count || 0,
        revenue: revenueResult?.total || 0,
      };
    }),

    // Manage testimonials
    testimonials: router({
      list: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(testimonials).orderBy(desc(testimonials.createdAt));
      }),

      updateStatus: adminProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "approved", "rejected"]),
            featured: z.number().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          const updateData: Record<string, any> = { status: input.status };
          if (input.featured !== undefined) updateData.featured = input.featured;

          await db
            .update(testimonials)
            .set(updateData)
            .where(eq(testimonials.id, input.id));

          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.delete(testimonials).where(eq(testimonials.id, input.id));
          return { success: true };
        }),
    }),

    // Blog management
    blog: router({
      list: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
      }),

      create: adminProcedure
        .input(
          z.object({
            title: z.string().min(1).max(500),
            slug: z.string().min(1).max(255),
            excerpt: z.string().optional(),
            content: z.string().min(1),
            coverImage: z.string().optional(),
            category: z.string().default("general"),
            language: z.string().default("fr"),
            source: z.string().optional(),
            published: z.number().default(0),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.insert(blogPosts).values(input);
          return { success: true };
        }),

      update: adminProcedure
        .input(
          z.object({
            id: z.number(),
            title: z.string().optional(),
            excerpt: z.string().optional(),
            content: z.string().optional(),
            coverImage: z.string().optional(),
            category: z.string().optional(),
            language: z.string().optional(),
            source: z.string().optional(),
            published: z.number().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          const { id, ...data } = input;
          await db.update(blogPosts).set(data).where(eq(blogPosts.id, id));
          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.delete(blogPosts).where(eq(blogPosts.id, input.id));
          return { success: true };
        }),
    }),

    // Availability management
    availability: router({
      listSlots: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(availabilitySlots);
      }),

      addSlot: adminProcedure
        .input(
          z.object({
            dayOfWeek: z.number().int().min(0).max(6),
            startTime: z.string().regex(/^\d{2}:\d{2}$/).refine(value => Number.isFinite(timeToMinutes(value)), "Heure de début invalide (HH:MM)"),
            endTime: z.string().regex(/^\d{2}:\d{2}$/).refine(value => Number.isFinite(timeToMinutes(value)), "Heure de fin invalide (HH:MM)"),
          })
        )
        .mutation(async ({ input }) => {
          // Une plage dont la fin précède le début se termine le lendemain
          // (consultations de nuit) ; une plage de durée nulle est refusée.
          if (input.startTime === input.endTime) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "L’heure de fin doit différer de l’heure de début (une fin plus tôt que le début signifie le lendemain)." });
          }
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          const [duplicate] = await db.select({ id: availabilitySlots.id }).from(availabilitySlots).where(and(
            eq(availabilitySlots.dayOfWeek, input.dayOfWeek),
            eq(availabilitySlots.startTime, input.startTime),
            eq(availabilitySlots.endTime, input.endTime),
          )).limit(1);
          if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "Ce créneau existe déjà." });

          await db.insert(availabilitySlots).values(input);
          return { success: true };
        }),

      deleteSlot: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.delete(availabilitySlots).where(eq(availabilitySlots.id, input.id));
          return { success: true };
        }),

      listBlockedDates: adminProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(blockedDates);
      }),

      addBlockedDate: adminProcedure
        .input(
          z.object({
            date: calendarDateInput,
            // Note interne : jamais renvoyée par l’API publique.
            reason: z.string().trim().max(200).optional(),
            // Bloquer une date n’annule pas les rendez-vous payés de ce jour :
            // l’administrateur doit le confirmer après avertissement.
            acknowledgePaidAppointments: z.boolean().optional().default(false),
          })
        )
        .mutation(async ({ input }) => {
          if (input.date < parisDateKey(new Date())) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Cette date est déjà passée." });
          }
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          const [existing] = await db.select({ id: blockedDates.id }).from(blockedDates).where(eq(blockedDates.date, input.date)).limit(1);
          if (existing) throw new TRPCError({ code: "CONFLICT", message: "Cette date est déjà bloquée." });

          const { start, end } = getParisDateRange(input.date);
          const paidAppointments = await db
            .select({ trackingId: appointments.trackingId, appointmentDate: appointments.appointmentDate })
            .from(appointments)
            .where(and(
              gte(appointments.appointmentDate, start),
              lt(appointments.appointmentDate, end),
              eq(appointments.paymentStatus, "completed"),
              eq(appointments.appointmentStatus, "confirmed"),
            ));
          if (paidAppointments.length > 0 && !input.acknowledgePaidAppointments) {
            const list = paidAppointments
              .map(apt => `${apt.trackingId} à ${new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(apt.appointmentDate)}`)
              .join(", ");
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `${paidAppointments.length} rendez-vous payé(s) ce jour-là (${list}). Bloquer la date ne les annule pas et ne prévient pas les patients : annulez-les et remboursez-les depuis l’onglet Réservations.`,
            });
          }

          await db.insert(blockedDates).values({ date: input.date, reason: input.reason || null });
          return { success: true, paidAppointments: paidAppointments.map(apt => apt.trackingId) };
        }),

      removeBlockedDate: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.delete(blockedDates).where(eq(blockedDates.id, input.id));
          return { success: true };
        }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
