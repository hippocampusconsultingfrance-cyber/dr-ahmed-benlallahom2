import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import { appointments, availabilitySlots, blockedDates } from "../../../drizzle/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { PARIS_TIME_ZONE, parisDateKey, calendarDateInput, getParisDateRange, timeToMinutes } from "../parisTime";

// Availability management
export const adminAvailabilityRouter = router({
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
});
