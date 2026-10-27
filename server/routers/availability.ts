import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { appointments, availabilitySlots, blockedDates } from "../../drizzle/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { parisDateKey, calendarDateInput, getParisDateRange } from "./parisTime";
import { occupiesSlot } from "./appointments";

// Availability / Calendar
export const availabilityRouter = router({
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
            occupiesSlot(),
          )
        );

      return results.map(r => r.appointmentDate);
  }),
});
