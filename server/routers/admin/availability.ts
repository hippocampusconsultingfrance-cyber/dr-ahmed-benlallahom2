import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import { appointments, availabilitySlots, blockedDates } from "../../../drizzle/schema";
import { eq, and, asc, gte, inArray, lt, sql } from "drizzle-orm";
import { securityEventInsert } from "../../candidateSecurity";
import { PARIS_TIME_ZONE, parisDateKey, calendarDateInput, getParisDateRange, timeToMinutes } from "../parisTime";

/** ADM-21: the longest period blocked at once. */
const MAX_BLOCKED_PERIOD_DAYS = 366;

/** Paid appointments listed in the warning of a period; the others are counted. */
const PAID_APPOINTMENTS_LISTED = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar days from `from` to `to`, both included (YYYY-MM-DD, days of Paris). */
function calendarDaysBetween(from: string, to: string) {
  const days: string[] = [];
  for (let day = Date.parse(`${from}T00:00:00Z`); day <= Date.parse(`${to}T00:00:00Z`); day += DAY_MS) days.push(new Date(day).toISOString().slice(0, 10));
  return days;
}

/** « APT… le 24/12/2026 à 10:00 », Paris time. */
const parisDay = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const parisTime = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const paidAppointmentInPeriod = (apt: { trackingId: string; appointmentDate: Date }) => `${apt.trackingId} le ${parisDay.format(apt.appointmentDate)} à ${parisTime.format(apt.appointmentDate)}`;

// Availability management
export const adminAvailabilityRouter = router({
  listSlots: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    // ADM-21: by day from Monday to Sunday, as the booking page shows them, then by hour.
    return await db.select().from(availabilitySlots).orderBy(
      sql`case when ${availabilitySlots.dayOfWeek} = 0 then 7 else ${availabilitySlots.dayOfWeek} end`,
      asc(availabilitySlots.startTime),
      asc(availabilitySlots.endTime),
    );
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
    // ADM-21: from today, in their order; a past day no longer blocks anything.
    return await db.select().from(blockedDates).where(gte(blockedDates.date, parisDateKey(new Date()))).orderBy(asc(blockedDates.date));
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

  /**
   * ADM-21: every day from `from` to `to` (included, days of Paris) blocked at
   * once, 366 at most; the days already blocked stay as they are. As for one
   * date, the paid appointments of the period are not cancelled: the admin
   * confirms after one warning that lists them. The days and their audit line
   * are written in one batch, all or none (DATA-01).
   */
  addBlockedPeriod: adminProcedure
    .input(
      z.object({
        from: calendarDateInput,
        to: calendarDateInput,
        // Note interne : jamais renvoyée par l’API publique.
        reason: z.string().trim().max(200).optional(),
        acknowledgePaidAppointments: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.to < input.from) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La fin de la période précède son début." });
      }
      if (input.from < parisDateKey(new Date())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cette période commence dans le passé : choisissez un premier jour à partir d’aujourd’hui." });
      }
      const days = calendarDaysBetween(input.from, input.to);
      if (days.length > MAX_BLOCKED_PERIOD_DAYS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Une période compte ${MAX_BLOCKED_PERIOD_DAYS} jours au plus : bloquez-la en plusieurs fois.` });
      }
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const alreadyBlocked = new Set((await db.select({ date: blockedDates.date }).from(blockedDates).where(inArray(blockedDates.date, days))).map(row => row.date));
      const toBlock = days.filter(day => !alreadyBlocked.has(day));
      if (toBlock.length === 0) throw new TRPCError({ code: "CONFLICT", message: "Toutes les dates de cette période sont déjà bloquées." });

      const paidAppointments = await db
        .select({ trackingId: appointments.trackingId, appointmentDate: appointments.appointmentDate })
        .from(appointments)
        .where(and(
          gte(appointments.appointmentDate, getParisDateRange(input.from).start),
          lt(appointments.appointmentDate, getParisDateRange(input.to).end),
          eq(appointments.paymentStatus, "completed"),
          eq(appointments.appointmentStatus, "confirmed"),
        ))
        .orderBy(asc(appointments.appointmentDate));
      if (paidAppointments.length > 0 && !input.acknowledgePaidAppointments) {
        const listed = paidAppointments.slice(0, PAID_APPOINTMENTS_LISTED).map(paidAppointmentInPeriod).join(", ");
        const more = paidAppointments.length - PAID_APPOINTMENTS_LISTED;
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${paidAppointments.length} rendez-vous payé(s) sur cette période (${listed}${more > 0 ? `, et ${more} autre(s)` : ""}). Bloquer la période ne les annule pas et ne prévient pas les patients : annulez-les et remboursez-les depuis l’onglet Réservations.`,
        });
      }

      await db.batch([
        db.insert(blockedDates).values(toBlock.map(date => ({ date, reason: input.reason || null }))),
        securityEventInsert(db, { actorKind: "admin", actorReference: ctx.user.openId, category: "admin_blocked_period_added", outcome: "allowed", metadata: { from: input.from, to: input.to, blocked: toBlock.length, alreadyBlocked: alreadyBlocked.size, paidAppointments: paidAppointments.length } }),
      ]);
      return { success: true, blocked: toBlock.length, alreadyBlocked: alreadyBlocked.size, paidAppointments: paidAppointments.map(apt => apt.trackingId) };
    }),

  removeBlockedDate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      await db.delete(blockedDates).where(eq(blockedDates.id, input.id));
      return { success: true };
    }),
});
