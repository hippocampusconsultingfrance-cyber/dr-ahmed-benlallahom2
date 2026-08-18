import { getSessionCookieOptions } from "./_core/cookies";
import { randomUUID } from "node:crypto";
import { COOKIE_NAME } from "../shared/const";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { contactMessages, gdprRequests, testimonials, appointments, blogPosts, availabilitySlots, blockedDates, cvApplications, cvCandidateCertifications, cvCandidateLanguages, recruitmentAuditLogs, recruitmentMatchProfiles, clientBriefs, clientBriefCandidates, recruitmentCampaigns, recruitmentCampaignRecipients, recruitmentEmailEvents, recruitmentFollowUpTasks, recruitmentOfferTemplates } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";
import { storageGetSignedUrl } from "./storage";
import { canAdminDownloadCv, CV_DOWNLOAD_UNAVAILABLE_MESSAGE } from "./recruitmentDownloadPolicy";
import { eq, and, sql, desc, gte, inArray, isNull, lt } from "drizzle-orm";
import Stripe from "stripe";
import {
  sendConfirmationEmail,
  sendOwnerNotificationEmail,
  sendOwnerNotificationSMS,
  sendCustomerConfirmationSMS,
  sendRefundConfirmationEmail,
  sendRecruitmentCampaignEmail,
  sendRecruitmentTemplateEmail,
  type RecruitmentEmailLanguage,
  type RecruitmentEmailTemplate,
} from "./_core/notifications";
import { logRecruitmentAction, matchesRecruitmentProfile, parseRecruitmentJsonArray } from "./recruitmentAudit";
import { computeBriefCandidateMatch } from "./clientBriefMatching";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const DEFAULT_PUBLIC_ORIGIN = "https://drahmedbenlallahom.com";
const TRUSTED_HOSTS = new Set([
  "drahmedbenlallahom.com",
  "www.drahmedbenlallahom.com",
  "drbenlallah-esc8d3hd.manus.space",
  "localhost",
  "127.0.0.1",
]);

const PARIS_TIME_ZONE = "Europe/Paris";
const CV_APPLICATION_STATUSES = ["new", "reviewing", "shortlisted", "placed", "rejected", "archived"] as const;

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
    utcMs = wallClockMs - (representedWallClockMs - wallClockMs);
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
  const candidateStart = parts.hour * 60 + parts.minute;

  return slots.some(slot => {
    if (slot.dayOfWeek !== dayOfWeek) return false;
    const slotStart = timeToMinutes(slot.startTime);
    const rawSlotEnd = timeToMinutes(slot.endTime);
    if (!Number.isFinite(slotStart) || !Number.isFinite(rawSlotEnd)) return false;

    const crossesMidnight = rawSlotEnd <= slotStart;
    const slotEnd = crossesMidnight ? rawSlotEnd + 24 * 60 : rawSlotEnd;
    const normalizedCandidateStart = crossesMidnight && candidateStart < slotStart
      ? candidateStart + 24 * 60
      : candidateStart;

    return normalizedCandidateStart >= slotStart && normalizedCandidateStart + durationMinutes <= slotEnd;
  });
}

function getSafeCheckoutOrigin(req: { headers: Record<string, string | string[] | undefined> }): string {
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const candidate = typeof originHeader === "string"
    ? originHeader
    : typeof refererHeader === "string"
      ? refererHeader
      : "";

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const trusted = TRUSTED_HOSTS.has(host) || host.endsWith(".manus.computer");
    return trusted ? url.origin : DEFAULT_PUBLIC_ORIGIN;
  } catch {
    return DEFAULT_PUBLIC_ORIGIN;
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
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
        })
      )
      .mutation(async ({ input }) => {
        // Server-side GDPR consent validation
        if (input.gdprConsent !== 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le consentement RGPD est requis' });
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
        })
      )
      .mutation(async ({ input }) => {
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

        const trackingId = `APT${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;

        const db = await getDb();
        if (!db) {
          throw new Error("Database connection failed");
        }

        try {
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

          if (activeSlots.length > 0 && !isWithinAvailability(date, activeSlots, 30)) {
            throw new TRPCError({ code: "CONFLICT", message: "Ce créneau ne correspond pas aux disponibilités configurées" });
          }

          const appointmentEnd = new Date(date.getTime() + 30 * 60 * 1000);
          const existingAppointments = await db
            .select({ id: appointments.id })
            .from(appointments)
            .where(
              and(
                sql`appointment_date < ${appointmentEnd}`,
                sql`DATE_ADD(appointment_date, INTERVAL duration MINUTE) > ${date}`,
                sql`payment_status IN ('pending', 'completed')`,
                sql`appointment_status IN ('confirmed', 'completed')`
              )
            )
            .limit(1);

          if (existingAppointments.length > 0) {
            throw new TRPCError({ code: "CONFLICT", message: "Ce créneau chevauche une réservation existante" });
          }

          const appointmentDateFormatted = date.toISOString().slice(0, 19).replace('T', ' ');
          await db.execute(
            sql`INSERT INTO appointments (tracking_id, customer_name, customer_email, customer_phone, consultation_type, request_details, appointment_date, duration, base_price, final_price, is_night_rate, payment_status, appointment_status) VALUES (${trackingId}, ${input.customerName}, ${input.customerEmail}, ${input.customerPhone}, ${'health_advice'}, ${input.requestDetails}, ${appointmentDateFormatted}, ${30}, ${basePrice}, ${finalPrice}, ${isNightRate ? 1 : 0}, ${'pending'}, ${'confirmed'})`
          );
        } catch (dbError) {
          console.error("Database insert error:", dbError);
          if (dbError instanceof TRPCError) throw dbError;
          throw new Error(`Failed to create appointment: ${dbError instanceof Error ? dbError.message : "Unknown error"}`);
        }

        // Notifications will be sent AFTER payment confirmation via webhook
        // (see webhook handler in server/_core/index.ts)

        return {
          success: true,
          trackingId,
          finalPrice: parseFloat(finalPrice),
        };
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
      .mutation(async ({ input, ctx }) => {
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
            })
            .from(appointments)
            .where(eq(appointments.trackingId, input.trackingId))
            .limit(1);
          const appointment = appointmentResult[0];

          if (!appointment) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Rendez-vous introuvable" });
          }
          if (appointment.paymentStatus !== "pending" || appointment.appointmentStatus !== "confirmed") {
            throw new TRPCError({ code: "CONFLICT", message: "Ce rendez-vous ne peut plus être payé" });
          }

          const expectedPrice = Number(appointment.finalPrice);
          if (!Number.isFinite(expectedPrice) || Math.round(expectedPrice * 100) !== Math.round(input.finalPrice * 100)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Le montant du paiement ne correspond pas au rendez-vous" });
          }
          if (appointment.customerEmail !== input.customerEmail || appointment.customerName !== input.customerName) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Les informations du paiement ne correspondent pas au rendez-vous" });
          }

          const amountInCents = Math.round(expectedPrice * 100);

          const session = await stripe.checkout.sessions.create({
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
            allow_promotion_codes: true,
            customer_email: input.customerEmail,
            metadata: {
              trackingId: input.trackingId,
              customerName: input.customerName,
            },
            success_url: `${getSafeCheckoutOrigin(ctx.req)}/booking/confirmation?status=success&trackingId=${encodeURIComponent(input.trackingId)}`,
            cancel_url: `${getSafeCheckoutOrigin(ctx.req)}/booking/confirmation?status=canceled&session_id={CHECKOUT_SESSION_ID}`,
          });

          if (session.id) {
            await db
              .update(appointments)
              .set({ stripeSessionId: session.id })
              .where(eq(appointments.trackingId, input.trackingId));
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
          session = await stripe.checkout.sessions.retrieve(input.sessionId);
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Session Stripe invalide" });
        }

        const trackingId = session.metadata?.trackingId;
        if (!trackingId || session.payment_status === "paid") {
          return { success: true, cancelled: false };
        }

        const result = await db
          .update(appointments)
          .set({ appointmentStatus: "cancelled" })
          .where(
            and(
              eq(appointments.trackingId, trackingId),
              eq(appointments.stripeSessionId, input.sessionId),
              eq(appointments.paymentStatus, "pending"),
              eq(appointments.appointmentStatus, "confirmed")
            )
          );

        return { success: true, cancelled: Number(result[0]?.affectedRows ?? 0) > 0 };
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
              sql`payment_status IN ('pending', 'completed')`,
              sql`appointment_status IN ('confirmed', 'completed')`
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
        if (!candidate.marketingUnsubscribedAt) {
          await db.update(cvApplications).set({ marketingConsent: 0, marketingUnsubscribedAt: new Date(), updatedAt: new Date() }).where(eq(cvApplications.id, candidate.id));
        }
        return { success: true, alreadyUnsubscribed: Boolean(candidate.marketingUnsubscribedAt) };
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
            .set({ appointmentStatus: input.appointmentStatus })
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
            const refund = await stripe.refunds.create(
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
          if (input.language) conditions.push(sql`(${cvApplications.normalizedLanguages} LIKE ${`%${input.language}%`} OR ${cvApplications.languages} LIKE ${`%${input.language}%`})`);
          if (input.certification) conditions.push(sql`(${cvApplications.normalizedCertifications} LIKE ${`%${input.certification}%`} OR ${cvApplications.certifications} LIKE ${`%${input.certification}%`})`);

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
              aiScore: cvApplications.aiScore,
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
                    return Array.isArray(parsed.skills) ? parsed.skills.filter((value: unknown): value is string => typeof value === "string") : [];
                  } catch { return []; }
                })(),
                profile,
              }))
            : rawItems;
          const items = profile ? matchedItems.slice(input.offset, input.offset + input.limit) : matchedItems;
          const countResult = profile ? [{ count: matchedItems.length }] : await db.select({ count: sql<number>`COUNT(*)` }).from(cvApplications).where(whereClause);
          return { items, total: countResult[0]?.count || 0 };
        }),

      pool: router({
        list: adminProcedure
          .input(z.object({
            specialty: z.string().trim().max(160).optional(),
            country: z.string().trim().max(80).optional(),
            minimumScore: z.number().int().min(0).max(100).optional(),
            limit: z.number().int().min(1).max(200).optional().default(200),
          }).optional())
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
            if (input?.minimumScore !== undefined) conditions.push(sql`${cvApplications.aiScore} >= ${input.minimumScore}`);
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
              aiScore: cvApplications.aiScore,
              status: cvApplications.status,
              marketingConsent: cvApplications.marketingConsent,
              createdAt: cvApplications.createdAt,
            }).from(cvApplications).where(and(...conditions)).orderBy(desc(cvApplications.aiScore), desc(cvApplications.createdAt)).limit(input?.limit || 200);
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
              if (input.minimumScore !== undefined) conditions.push(sql`${cvApplications.aiScore} >= ${input.minimumScore}`);
            }
            return db.select({
              id: cvApplications.id,
              firstName: cvApplications.firstName,
              lastName: cvApplications.lastName,
              email: cvApplications.email,
              specialty: cvApplications.specialty,
              aiScore: cvApplications.aiScore,
            }).from(cvApplications).where(and(...conditions)).orderBy(desc(cvApplications.aiScore), desc(cvApplications.createdAt)).limit(200);
          }),

        list: adminProcedure.query(async () => {
          const db = await getDb();
          if (!db) return [];
          const campaigns = await db.select().from(recruitmentCampaigns).orderBy(desc(recruitmentCampaigns.createdAt)).limit(50);
          if (!campaigns.length) return [];
          const metrics = await db.select({
            campaignId: recruitmentCampaignRecipients.campaignId,
            total: sql<number>`COUNT(*)`,
            delivered: sql<number>`SUM(CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delivered' THEN 1 ELSE 0 END)`,
            sent: sql<number>`SUM(CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} IN ('sent', 'delivered') THEN 1 ELSE 0 END)`,
            failed: sql<number>`SUM(CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} IN ('failed', 'bounced', 'complained', 'suppressed') THEN 1 ELSE 0 END)`,
            delayed: sql<number>`SUM(CASE WHEN ${recruitmentCampaignRecipients.deliveryStatus} = 'delayed' THEN 1 ELSE 0 END)`,
          }).from(recruitmentCampaignRecipients)
            .where(inArray(recruitmentCampaignRecipients.campaignId, campaigns.map(campaign => campaign.id)))
            .groupBy(recruitmentCampaignRecipients.campaignId);
          const metricByCampaign = new Map(metrics.map(metric => [metric.campaignId, metric]));
          return campaigns.map(campaign => ({ ...campaign, delivery: metricByCampaign.get(campaign.id) || { total: 0, sent: 0, delivered: 0, failed: 0, delayed: 0 } }));
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
              if (input.minimumScore !== undefined) conditions.push(sql`${cvApplications.aiScore} >= ${input.minimumScore}`);
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
            });
            const campaignId = Number((campaignResult as any).insertId);
            let sent = 0;
            let failed = 0;
            for (const candidate of audience) {
              const unsubscribeToken = candidate.marketingUnsubscribeToken || randomUUID().replace(/-/g, "");
              if (!candidate.marketingUnsubscribeToken) {
                await db.update(cvApplications).set({ marketingUnsubscribeToken: unsubscribeToken }).where(eq(cvApplications.id, candidate.id));
              }
              const [recipientResult] = await db.insert(recruitmentCampaignRecipients).values({ campaignId, applicationId: candidate.id, recipientEmail: candidate.email, deliveryStatus: "queued" });
              const recipientId = Number((recipientResult as any).insertId);
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
          analysesCompleted: sql<number>`SUM(CASE WHEN ${cvApplications.analysisStatus} = 'completed' THEN 1 ELSE 0 END)`,
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
          const [result] = await db.insert(recruitmentOfferTemplates).values({ ...input, createdByOpenId: ctx.user.openId });
          return { success: true, id: Number((result as any).insertId) };
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
        if (input.type === "pool" && !candidateIds.length) {
          conditions.push(eq(cvApplications.marketingConsent, 1), isNull(cvApplications.marketingUnsubscribedAt), isNull(cvApplications.marketingSuppressedAt));
        }
        const rows = await db.select({ id: cvApplications.id, firstName: cvApplications.firstName, lastName: cvApplications.lastName, email: cvApplications.email, phone: cvApplications.phone, specialty: cvApplications.specialty, targetCountries: cvApplications.targetCountries, languages: cvApplications.languages, yearsExperience: cvApplications.yearsExperience, availability: cvApplications.availability, mobility: cvApplications.mobility, certifications: cvApplications.certifications, aiScore: cvApplications.aiScore, status: cvApplications.status }).from(cvApplications).where(and(...conditions)).orderBy(desc(cvApplications.aiScore), desc(cvApplications.createdAt)).limit(200);
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
            });
            return { success: true, id: Number((result[0] as any)?.insertId || 0) };
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

          const { enqueueCvAnalysis } = await import("./recruitmentProcessing");
          await enqueueCvAnalysis(application.id);
          await logRecruitmentAction({ applicationId: application.id, adminOpenId: ctx.user.openId, action: "reanalyze", metadata: { queued: true } });
          return { success: true, queued: true };
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
          await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "email", metadata: { template: input.template, language: input.language, customRequest: Boolean(input.customRequest), resendId: result.id } });
          return { success: true };
        }),

      erase: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          const [application] = await db
            .select({ id: cvApplications.id, trackingId: cvApplications.trackingId })
            .from(cvApplications)
            .where(eq(cvApplications.id, input.id))
            .limit(1);
          if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Candidature introuvable" });
          await logRecruitmentAction({ applicationId: input.id, adminOpenId: ctx.user.openId, action: "erase", metadata: { trackingId: application.trackingId } });
          // The storage contract has no object-delete endpoint. Removing the only
          // database reference makes the private object unreachable in the app.
          await db.delete(cvApplications).where(eq(cvApplications.id, input.id));
          return { success: true };
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
          await db.update(clientBriefs).set(input.status === "shortlist_sent" ? { status: input.status, shortlistSentAt: new Date() } : { status: input.status }).where(eq(clientBriefs.id, input.id));
          return { success: true };
        }),
      candidates: adminProcedure
        .input(z.object({ briefId: z.number().int().positive() }))
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return { brief: null, candidates: [] };
          const [brief] = await db.select().from(clientBriefs).where(eq(clientBriefs.id, input.briefId)).limit(1);
          if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "Brief employeur introuvable" });
          const applications = await db.select({
            id: cvApplications.id,
            trackingId: cvApplications.trackingId,
            firstName: cvApplications.firstName,
            lastName: cvApplications.lastName,
            specialty: cvApplications.specialty,
            targetCountries: cvApplications.targetCountries,
            languages: cvApplications.languages,
            normalizedLanguages: cvApplications.normalizedLanguages,
            mobility: cvApplications.mobility,
            yearsExperience: cvApplications.yearsExperience,
            certifications: cvApplications.certifications,
            normalizedCertifications: cvApplications.normalizedCertifications,
            availability: cvApplications.availability,
            aiScore: cvApplications.aiScore,
            status: cvApplications.status,
          }).from(cvApplications).where(sql`${cvApplications.status} NOT IN ('rejected', 'archived')`).limit(250);
          const applicationIds = applications.map(application => application.id);
          const certificationRows = applicationIds.length > 0
            ? await db.select({ applicationId: cvCandidateCertifications.applicationId, name: cvCandidateCertifications.name })
              .from(cvCandidateCertifications)
              .where(inArray(cvCandidateCertifications.applicationId, applicationIds))
            : [];
          const languageRows = applicationIds.length > 0
            ? await db.select({ applicationId: cvCandidateLanguages.applicationId, language: cvCandidateLanguages.language })
              .from(cvCandidateLanguages)
              .where(inArray(cvCandidateLanguages.applicationId, applicationIds))
            : [];
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
          const associations = await db.select().from(clientBriefCandidates).where(eq(clientBriefCandidates.briefId, brief.id));
          const associationByApplication = new Map(associations.map(association => [association.applicationId, association]));
          const candidates = applications.map(application => ({
            ...application,
            match: computeBriefCandidateMatch(brief, { ...application, certificationNames: certificationsByApplication.get(application.id) || [], languageNames: languagesByApplication.get(application.id) || [] }),
            association: associationByApplication.get(application.id) ?? null,
          })).sort((left, right) => right.match.score - left.match.score);
          return { brief, candidates };
        }),
      associateCandidate: adminProcedure
        .input(z.object({
          briefId: z.number().int().positive(),
          applicationId: z.number().int().positive(),
          matchScore: z.number().int().min(0).max(100).optional(),
          matchBreakdown: z.string().trim().max(2_000).optional(),
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
              matchBreakdown: input.matchBreakdown ?? existing.matchBreakdown,
              status: input.status,
              notes: input.notes ?? existing.notes,
              updatedAt: new Date(),
            }).where(eq(clientBriefCandidates.id, existing.id));
          } else {
            await db.insert(clientBriefCandidates).values({
              briefId: input.briefId,
              applicationId: input.applicationId,
              matchScore: input.matchScore ?? null,
              matchBreakdown: input.matchBreakdown ?? null,
              status: input.status,
              notes: input.notes ?? null,
            });
          }
          return { success: true };
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
