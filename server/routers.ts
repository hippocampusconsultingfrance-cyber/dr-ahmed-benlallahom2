import { createHash, randomUUID } from "node:crypto";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { canRequestCandidateDocumentReanalysis } from "../shared/candidateDocumentReanalysis";
import { getDb } from "./db";
import { candidateAccounts, candidateDocumentAuditLogs, candidateDocuments, contactMessages, gdprRequests, testimonials, appointments, blogPosts, availabilitySlots, blockedDates, cvApplications, cvCandidateCertifications, cvCandidateLanguages, cvGoogleDriveExportJobs, recruitmentAuditLogs, recruitmentMatchProfiles, clientBriefs, clientBriefCandidates, recruitmentCampaigns, recruitmentCampaignRecipients, recruitmentEmailEvents, recruitmentFollowUpTasks, recruitmentOfferTemplates, securityEvents } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";
import { storageGetSignedUrl } from "./storage";
import { canAdminDownloadCv, CV_DOWNLOAD_UNAVAILABLE_MESSAGE } from "./recruitmentDownloadPolicy";
import { eq, and, or, sql, desc, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import Stripe from "stripe";
import {
  sendConfirmationEmail,
  sendOwnerNotificationEmail,
  sendOwnerNotificationSMS,
  sendCustomerConfirmationSMS,
  sendRefundConfirmationEmail,
  sendCandidatePortalAccessEmail,
  sendRecruitmentCampaignEmail,
  sendRecruitmentTemplateEmail,
  type RecruitmentEmailLanguage,
  type RecruitmentEmailTemplate,
} from "./_core/notifications";
import { logRecruitmentAction, matchesRecruitmentProfile, parseRecruitmentJsonArray } from "./recruitmentAudit";
import { computeBriefCandidateMatch } from "./clientBriefMatching";
import { candidatePortalRouter } from "./candidatePortalRouter";
import { enforcePersistentRateLimit, logSecurityEvent, requestIpHash } from "./candidateSecurity";
import { createCandidateInvitationToken } from "./candidateAuth";
import { verifyCandidateTurnstile } from "./candidateTurnstile";
import { googleDriveExportStatus } from "./googleDriveExport";
import { buildCandidatePortalInvitationEmailEvent, candidatePortalAccountMatchesApplication, resolveCandidatePortalActivationDelivery, resolveCandidatePortalInvitationDelivery, resolveCvConfirmationDelivery, retryCvConfirmationEmail } from "./recruitmentEmailTrace";
import { RECRUITMENT_ANALYSIS_PROMPT_VERSION } from "./recruitmentAnalysis";
import { medicalQuestionsRouter } from "./medicalQuestionsRouter";
import { issueAdminMfaChallenge, verifyAdminMfaChallenge } from "./adminMfa";

let stripeClient: Stripe | undefined;

function getStripeClient(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le service de paiement n’est pas configuré." });
  stripeClient ??= new Stripe(apiKey);
  return stripeClient;
}

// Secret-bearing URLs must never be assembled from browser-controlled headers.
const DEFAULT_PUBLIC_ORIGIN = process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";

const PARIS_TIME_ZONE = "Europe/Paris";
const CV_APPLICATION_STATUSES = ["new", "reviewing", "shortlisted", "placed", "rejected", "archived"] as const;
export const PUBLIC_FORM_RATE_LIMITS = {
  contact: { action: "public_contact_submit", maxAttempts: 5, windowMs: 15 * 60 * 1000, blockMs: 60 * 60 * 1000 },
  gdpr: { action: "public_gdpr_submit", maxAttempts: 3, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000 },
} as const;

async function enforcePublicFormRateLimit(input: {
  kind: keyof typeof PUBLIC_FORM_RATE_LIMITS;
  email: string;
  headers: Record<string, unknown>;
}) {
  // Les tests d’intégration réemploient volontairement les mêmes adresses dans
  // plusieurs scénarios indépendants. La protection persistante reste active
  // dans tous les environnements réels ; ses seuils sont couverts séparément.
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return;

  const ipHash = requestIpHash(input.headers);
  const policy = PUBLIC_FORM_RATE_LIMITS[input.kind];
  try {
    await enforcePersistentRateLimit({
      ...policy,
      subject: `${ipHash ?? "unknown"}:${input.email}`,
    });
  } catch {
    await logSecurityEvent({
      actorKind: "anonymous",
      category: `${policy.action}_rate_limit`,
      outcome: "blocked",
      severity: "warning",
      ipHash,
    });
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Veuillez patienter avant de soumettre une nouvelle demande." });
  }
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

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
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

export function parseAppointmentDate(value: string): Date {
  const hasExplicitTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = hasExplicitTimeZone
    ? new Date(value)
    : parisWallClockToUtc(value.length === 10 ? `${value}T00:00:00` : value.slice(0, 19));

  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Invalid appointment date");
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
      await issueAdminMfaChallenge({ openId: ctx.user.openId, email: ctx.user.email, req: ctx.req });
      return { success: true };
    }),
    verify: protectedProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Accès administrateur requis." });
      try {
        await verifyAdminMfaChallenge({ openId: ctx.user.openId, code: input.code, req: ctx.req, res: ctx.res });
        return { success: true };
      } catch {
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
    logout: publicProcedure.mutation(() => ({ success: true } as const)),
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
        if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
          await verifyCandidateTurnstile({ token: input.turnstileToken ?? "", remoteIp: ctx.req.ip });
        }

        // Generate a unique tracking ID (max 20 chars for varchar(20))
        const trackingId = `C${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;

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
        if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
          await verifyCandidateTurnstile({ token: input.turnstileToken ?? "", remoteIp: ctx.req.ip });
        }
        // Generate a unique tracking ID (max 20 chars for varchar(20))
        const trackingId = `G${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;

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
          customerName: z.string().min(1).max(255),
          customerEmail: z.string().email().max(320),
          customerPhone: z.string().min(1).max(50),
          appointmentDate: appointmentDateInput,
          requestDetails: z.string().min(1).max(5000),
        })
      )
      .mutation(async ({ input }) => {
        const date = parseAppointmentDate(input.appointmentDate);
        if (date.getTime() <= Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "La date de consultation doit être future" });
        }

        const basePrice = "100.00";
        const isNightRate = isNightRateForParis(date);
        const finalPrice = isNightRate ? "150.00" : "100.00";

        const trackingId = `APT${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

        const db = await getDb();
        if (!db) {
          throw new Error("Database connection failed");
        }

        try {
          const { getAppointmentHoldExpiry, getExpiredAppointmentHoldUpdate, releaseExpiredAppointmentHolds } = await import("./appointmentHolds");
          await releaseExpiredAppointmentHolds();
          const dateKey = parisDateKey(date);
          const blockedDate = await db
            .select({ id: blockedDates.id })
            .from(blockedDates)
            .where(eq(blockedDates.date, dateKey))
            .limit(1);

          if (blockedDate.length > 0) {
            throw new TRPCError({ code: "CONFLICT", message: "Cette date est indisponible" });
          }

          const activeSlots = await db
            .select({ dayOfWeek: availabilitySlots.dayOfWeek, startTime: availabilitySlots.startTime, endTime: availabilitySlots.endTime })
            .from(availabilitySlots)
            .where(eq(availabilitySlots.isActive, 1));

          if (!isBookableAppointmentTime(date, activeSlots, 30)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: activeSlots.length === 0
                ? "Aucun créneau de consultation n’est actuellement ouvert"
                : "Ce créneau ne correspond pas aux disponibilités configurées",
            });
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
            throw new TRPCError({ code: "CONFLICT", message: "Ce créneau chevauche une réservation existante" });
          }

          const appointmentDateFormatted = date.toISOString().slice(0, 19).replace('T', ' ');
          const slotKey = date.toISOString();
          const holdExpiresAt = getAppointmentHoldExpiry();
          await db.execute(
            sql`INSERT INTO appointments (tracking_id, customer_name, customer_email, customer_phone, consultation_type, request_details, appointment_date, slot_key, duration, base_price, final_price, is_night_rate, payment_status, appointment_status, hold_expires_at) VALUES (${trackingId}, ${input.customerName}, ${input.customerEmail}, ${input.customerPhone}, ${'health_advice'}, ${input.requestDetails}, ${appointmentDateFormatted}, ${slotKey}, ${30}, ${basePrice}, ${finalPrice}, ${isNightRate ? 1 : 0}, ${'pending'}, ${'held'}, ${holdExpiresAt})`
          );

          try {
            const session = await getStripeClient().checkout.sessions.create({
              payment_method_types: ["card"],
              line_items: [{ price_data: { currency: "eur", product_data: { name: "Health Consultation - 30 minutes", description: `Appointment: ${trackingId}` }, unit_amount: Math.round(Number(finalPrice) * 100) }, quantity: 1 }],
              mode: "payment",
              customer_email: input.customerEmail,
              metadata: { trackingId, customerName: input.customerName },
              expires_at: Math.floor(holdExpiresAt.getTime() / 1000),
              success_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=success&trackingId=${encodeURIComponent(trackingId)}`,
              cancel_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=canceled&session_id={CHECKOUT_SESSION_ID}`,
            });
            if (!session.id || !session.url) throw new Error("stripe_checkout_session_unavailable");
            await db.update(appointments).set({ stripeSessionId: session.id }).where(and(eq(appointments.trackingId, trackingId), eq(appointments.appointmentStatus, "held")));
            return { success: true, trackingId, finalPrice: parseFloat(finalPrice), checkoutUrl: session.url };
          } catch (stripeError) {
            await db.update(appointments).set(getExpiredAppointmentHoldUpdate()).where(and(eq(appointments.trackingId, trackingId), eq(appointments.paymentStatus, "pending"), eq(appointments.appointmentStatus, "held")));
            throw stripeError;
          }
        } catch (dbError) {
          console.error("Database insert error:", dbError);
          if (dbError instanceof TRPCError) throw dbError;
          if (String(dbError).toLowerCase().includes("appointments_active_slot_unique") || String(dbError).toLowerCase().includes("duplicate")) {
            throw new TRPCError({ code: "CONFLICT", message: "Ce créneau vient d’être réservé par un autre patient. Veuillez en choisir un autre." });
          }
          throw new Error(`Failed to create appointment: ${dbError instanceof Error ? dbError.message : "Unknown error"}`);
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

          const session = await getStripeClient().checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
              {
                price_data: {
                  currency: "eur",
                  product_data: {
                    name: "Health Consultation - 30 minutes",
                    description: `Appointment: ${input.trackingId}`,
                  },
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
            expires_at: Math.floor(appointment.holdExpiresAt.getTime() / 1000),
            success_url: `${getSafeCheckoutOrigin()}/booking/confirmation?status=success&trackingId=${encodeURIComponent(input.trackingId)}`,
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
          console.error("Stripe error:", error);
          if (error instanceof TRPCError) throw error;
          throw new Error("Failed to create checkout session");
        }
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
        if (!trackingId || session.payment_status === "paid") {
          return { success: true, cancelled: false };
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

    getBlockedDates: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(blockedDates);
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
            trackingId: z.string(),
            appointmentStatus: z.enum(["confirmed", "cancelled", "completed", "no_show"]),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db
            .update(appointments)
            .set({ appointmentStatus: input.appointmentStatus, slotKey: input.appointmentStatus === "cancelled" ? null : undefined })
            .where(eq(appointments.trackingId, input.trackingId));

          return { success: true };
        }),

      refund: adminProcedure
        .input(
          z.object({
            trackingId: z.string().min(1),
            reason: z.string().min(1).max(500),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          const [appointment] = await db
            .select({
              trackingId: appointments.trackingId,
              appointmentDate: appointments.appointmentDate,
              paymentStatus: appointments.paymentStatus,
              appointmentStatus: appointments.appointmentStatus,
              stripePaymentIntentId: appointments.stripePaymentIntentId,
              finalPrice: appointments.finalPrice,
              customerEmail: appointments.customerEmail,
              customerName: appointments.customerName,
            })
            .from(appointments)
            .where(eq(appointments.trackingId, input.trackingId))
            .limit(1);

          if (!appointment) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Rendez-vous introuvable" });
          }
          if (appointment.paymentStatus === "refunded") {
            throw new TRPCError({ code: "CONFLICT", message: "Ce rendez-vous a déjà été remboursé" });
          }
          if (appointment.paymentStatus !== "completed" || !appointment.stripePaymentIntentId) {
            throw new TRPCError({ code: "CONFLICT", message: "Le rendez-vous n’est pas éligible au remboursement" });
          }

          const hoursUntilAppointment = (new Date(appointment.appointmentDate).getTime() - Date.now()) / (60 * 60 * 1000);
          if (hoursUntilAppointment < 24) {
            throw new TRPCError({ code: "CONFLICT", message: "Le remboursement intégral est disponible jusqu’à 24 heures avant la consultation" });
          }

          try {
            const refund = await getStripeClient().refunds.create(
              {
                payment_intent: appointment.stripePaymentIntentId,
                metadata: {
                  trackingId: appointment.trackingId,
                  reason: input.reason,
                },
              },
              { idempotencyKey: `refund_${appointment.trackingId}` }
            );

            const refundAmount = ((refund.amount ?? Math.round(Number(appointment.finalPrice) * 100)) / 100).toFixed(2);
            const now = new Date();
            await db
              .update(appointments)
              .set({
                paymentStatus: "refunded",
                appointmentStatus: "cancelled",
                slotKey: null,
                cancellationReason: input.reason,
                cancelledAt: now,
                refundAmount,
                refundedAt: now,
              })
              .where(
                and(
                  eq(appointments.trackingId, input.trackingId),
                  eq(appointments.paymentStatus, "completed")
                )
              );

            await sendRefundConfirmationEmail(
              appointment.customerEmail,
              appointment.customerName,
              appointment.trackingId,
              new Date(appointment.appointmentDate),
              refundAmount
            );

            return { success: true, refundId: refund.id, refundAmount } as const;
          } catch (error) {
            console.error("Stripe refund error:", error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: "BAD_REQUEST", message: "Le remboursement Stripe a échoué" });
          }
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
            ? { processed: 0 }
            : await processDueCvGoogleDriveExports(1, [application.id]);
          await logRecruitmentAction({
            applicationId: application.id,
            adminOpenId: ctx.user.openId,
            action: "export",
            metadata: { event: "google_drive_retry", ...queue, processed: processing.processed },
          });
          return { success: true, ...queue, processed: processing.processed };
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
            conditions.push(sql`${cvApplications.aiScore} >= ${selectedProfile.minimumScore}`);
            if (selectedProfile.specialty) conditions.push(sql`LOWER(${cvApplications.specialty}) LIKE LOWER(${`%${selectedProfile.specialty}%`})`);
            if (selectedProfile.targetCountry) conditions.push(sql`${cvApplications.targetCountries} LIKE ${`%${selectedProfile.targetCountry}%`}`);
          }
          if (input.minimumScore !== undefined) conditions.push(sql`${cvApplications.aiScore} >= ${input.minimumScore}`);
          if (input.profileId || input.minimumScore !== undefined) conditions.push(eq(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION));
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
              createdAt: cvApplications.createdAt,
              updatedAt: cvApplications.updatedAt,
            })
            .from(cvApplications)
            .where(whereClause)
            .orderBy(desc(cvApplications.createdAt))
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
            if (input?.minimumScore !== undefined) {
              conditions.push(sql`${cvApplications.aiScore} >= ${input.minimumScore}`);
              conditions.push(eq(cvApplications.analysisPromptVersion, RECRUITMENT_ANALYSIS_PROMPT_VERSION));
            }
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
            }).from(cvApplications).where(and(...conditions)).orderBy(desc(verifiedRecruitmentScore), desc(cvApplications.createdAt)).limit(input?.limit || 200);
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
            }).from(cvApplications).where(and(...conditions)).orderBy(desc(verifiedRecruitmentScore), desc(cvApplications.createdAt)).limit(200);
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
            delayed: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delayed' THEN ${recruitmentCampaignRecipients.id} END)`,
            opened: sql<number>`COUNT(DISTINCT CASE WHEN ${recruitmentEmailEvents.eventType} = 'email.opened' THEN ${recruitmentCampaignRecipients.id} END)`,
          }).from(recruitmentCampaignRecipients)
            .leftJoin(recruitmentEmailEvents, eq(recruitmentEmailEvents.campaignRecipientId, recruitmentCampaignRecipients.id))
            .where(inArray(recruitmentCampaignRecipients.campaignId, campaigns.map(campaign => campaign.id)))
            .groupBy(recruitmentCampaignRecipients.campaignId);
          const metricByCampaign = new Map(metrics.map(metric => [metric.campaignId, metric]));
          return campaigns.map(campaign => ({ ...campaign, delivery: metricByCampaign.get(campaign.id) || { total: 0, sent: 0, delivered: 0, failed: 0, delayed: 0, opened: 0 } }));
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
            let sent = 0;
            let failed = 0;
            for (const candidate of audience) {
              const unsubscribeToken = candidate.marketingUnsubscribeToken || randomUUID().replace(/-/g, "");
              if (!candidate.marketingUnsubscribeToken) {
                await db.update(cvApplications).set({ marketingUnsubscribeToken: unsubscribeToken }).where(eq(cvApplications.id, candidate.id));
              }
              const [recipientResult] = await db.insert(recruitmentCampaignRecipients).values({ campaignId, applicationId: candidate.id, recipientEmail: candidate.email, deliveryStatus: "queued" }).returning({ id: recruitmentCampaignRecipients.id });
              const recipientId = Number(recipientResult.id);
              try {
                const email = await sendRecruitmentCampaignEmail({
                  candidateEmail: candidate.email,
                  candidateName: `${candidate.firstName} ${candidate.lastName}`,
                  campaignTitle: input.title,
                  subject: input.subject,
                  body: input.body,
                  language: input.language as RecruitmentEmailLanguage,
                  unsubscribeUrl: `${DEFAULT_PUBLIC_ORIGIN}/recruitment/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
                });
                const contactedAt = new Date();
                await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "sent", providerEmailId: email.id || null, sentAt: contactedAt, lastEventAt: contactedAt }).where(eq(recruitmentCampaignRecipients.id, recipientId));
                await db.update(cvApplications).set({ lastContactedAt: contactedAt }).where(eq(cvApplications.id, candidate.id));
                await db.insert(recruitmentFollowUpTasks).values([
                  { applicationId: candidate.id, campaignId, kind: "follow_up_7", dueAt: new Date(contactedAt.getTime() + 7 * 24 * 60 * 60 * 1000), notes: "Relance suggérée à J+7 — aucun email n’est envoyé automatiquement." },
                  { applicationId: candidate.id, campaignId, kind: "follow_up_14", dueAt: new Date(contactedAt.getTime() + 14 * 24 * 60 * 60 * 1000), notes: "Relance suggérée à J+14 — aucun email n’est envoyé automatiquement." },
                ]);
                await logRecruitmentAction({ applicationId: candidate.id, adminOpenId: ctx.user.openId, action: "email", metadata: { campaignId, resendId: email.id, language: input.language } });
                sent += 1;
              } catch (error) {
                await db.update(recruitmentCampaignRecipients).set({ deliveryStatus: "failed", error: error instanceof Error ? error.message.slice(0, 2000) : "Unknown campaign email failure" }).where(eq(recruitmentCampaignRecipients.id, recipientId));
                failed += 1;
              }
            }
            await db.update(recruitmentCampaigns).set({ status: failed === 0 ? "sent" : sent > 0 ? "partially_sent" : "failed", sentAt: new Date() }).where(eq(recruitmentCampaigns.id, campaignId));
            return { campaignId, total: audience.length, sent, failed };
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
          const application = (await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, email: cvApplications.email, trackingId: cvApplications.trackingId })
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
          const invitationAttempt = resolveCandidatePortalInvitationDelivery(invitationEvents).attempts + 1;
          const invitationToken = createCandidateInvitationToken(application.id);
          const invitationUrl = `${getSafeCheckoutOrigin()}/candidate/access?invite=${encodeURIComponent(invitationToken)}`;
          let result: { id: string };
          try {
            result = await sendCandidatePortalAccessEmail({
              to: application.email,
              firstName: application.firstName,
              kind: "invite",
              actionUrl: invitationUrl,
              idempotencyKey: `candidate-portal-invitation-${application.trackingId}-attempt-${invitationAttempt}`,
            });
          } catch (error) {
            const failureCode = error instanceof Error && error.message.startsWith("Resend candidate access email failed:")
              ? "provider_rejected" as const
              : "delivery_exception" as const;
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
            await logRecruitmentAction({ applicationId: application.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: "candidate_portal_invitation", outcome: "failed", trackingId: application.trackingId, attempt: invitationAttempt } });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "L’invitation n’a pas pu être envoyée. L’échec est enregistré pour reprise." });
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
          const [candidate] = await db.select().from(cvApplications).where(eq(cvApplications.id, input.id)).limit(1);
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

      exportCsv: adminProcedure.input(z.object({ type: z.enum(["pool", "shortlist"]), briefId: z.number().int().positive().optional(), candidateIds: z.array(z.number().int().positive()).max(200).optional().default([]) })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        let candidateIds = input.candidateIds;
        if (input.type === "shortlist") {
          if (!input.briefId) throw new TRPCError({ code: "BAD_REQUEST", message: "Une mission est requise pour exporter une shortlist." });
          const associations = await db.select({ applicationId: clientBriefCandidates.applicationId }).from(clientBriefCandidates).where(and(eq(clientBriefCandidates.briefId, input.briefId), eq(clientBriefCandidates.status, "shortlisted")));
          candidateIds = associations.map(association => association.applicationId);
        }
        const conditions = [sql`${cvApplications.status} NOT IN ('rejected', 'archived')`];
        if (candidateIds.length) conditions.push(inArray(cvApplications.id, candidateIds));
        if (input.type === "pool") {
          conditions.push(eq(cvApplications.marketingConsent, 1), isNull(cvApplications.marketingUnsubscribedAt), isNull(cvApplications.marketingSuppressedAt));
        }
        const rows = await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, phone: cvApplications.phone, specialty: cvApplications.specialty, targetCountries: cvApplications.targetCountries, languages: cvApplications.languages, yearsExperience: cvApplications.yearsExperience, availability: cvApplications.availability, mobility: cvApplications.mobility, certifications: cvApplications.certifications, aiScore: verifiedRecruitmentScore, status: cvApplications.status }).from(cvApplications).where(and(...conditions)).orderBy(desc(verifiedRecruitmentScore), desc(cvApplications.createdAt)).limit(200);
        const header = ["Prénom", "Nom", "Email", "Téléphone", "Spécialité", "Pays ciblés", "Langues", "Expérience (ans)", "Disponibilité", "Mobilité", "Certifications", "Score IA", "Statut"];
        const csv = [header.map(csvCell).join(";"), ...rows.map(row => [row.firstName, row.lastName, row.email, row.phone, row.specialty, row.targetCountries, row.languages, row.yearsExperience, row.availability, row.mobility, row.certifications, row.aiScore, row.status].map(csvCell).join(";"))].join("\n");
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

          await db
            .update(cvApplications)
            .set({ status: input.status, adminNotes: input.adminNotes ?? null, updatedAt: new Date() })
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
          await logRecruitmentAction({
            applicationId: application.id,
            adminOpenId: ctx.user.openId,
            action: "reanalyze",
            metadata: { queued: queue.queued, accelerated: queue.accelerated, alreadyRunning: queue.alreadyRunning, processed: processing.processed },
          });
          return { success: true, queued: queue.queued || queue.accelerated, processed: processing.processed };
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
          const processing = applicationIds.length > 0
            ? await processDueCvAnalysisJobs(Math.min(applicationIds.length, 2), applicationIds)
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
            `${application.firstName} ${application.lastName}`,
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
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const [application] = await db
            .select({ id: cvApplications.id, trackingId: cvApplications.trackingId, cvFileKey: cvApplications.cvFileKey })
            .from(cvApplications)
            .where(eq(cvApplications.id, input.id))
            .limit(1);
          if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable" });
          const storageKeyFingerprint = createHash("sha256").update(application.cvFileKey).digest("hex");
          // The managed storage contract intentionally exposes no delete-object API.
          // Revoking the only application reference removes all app access without
          // scheduling any automatic CV deletion. The audit proof retains no raw key.
          await logRecruitmentAction({
            applicationId: input.id,
            adminOpenId: ctx.user.openId,
            action: "erase",
            metadata: {
              trackingId: application.trackingId,
              storageKeyFingerprint,
              storageDisposition: "dereferenced_managed_storage_no_delete_api",
              erasureMode: "manual_rgpd",
              performedAt: new Date().toISOString(),
            },
          });
          await db.delete(cvApplications).where(eq(cvApplications.id, input.id));
          return { success: true, storageDisposition: "dereferenced", physicalDeletionAvailable: false };
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
          await db.update(clientBriefs).set({ status: input.status }).where(eq(clientBriefs.id, input.id));
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
          if (!db) return { brief: null, candidates: [], pagination: { page: input.page, limit: input.limit, total: 0, totalPages: 0 } };
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
            .orderBy(desc(verifiedRecruitmentScore), desc(cvApplications.createdAt), desc(cvApplications.id))
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
          return { brief, candidates, pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
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
            dayOfWeek: z.number().min(0).max(6),
            startTime: z.string().regex(/^\d{2}:\d{2}$/),
            endTime: z.string().regex(/^\d{2}:\d{2}$/),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

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
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            reason: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");

          await db.insert(blockedDates).values(input);
          return { success: true };
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
