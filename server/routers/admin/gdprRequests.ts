import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import { gdprRequests } from "../../../drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";

// List all GDPR requests
export const adminGdprRequestsRouter = router({
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

      return { items, total: Number(countResult[0]?.count ?? 0) };
    }),

  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "in_progress", "completed", "rejected"]),
        notes: z.string().trim().max(5000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      // A refusal is always reasoned (RGPD-12): the reason is kept with the request.
      if (input.status === "rejected" && !input.notes) throw new TRPCError({ code: "BAD_REQUEST", message: "Indiquez le motif du refus avant de refuser la demande." });

      const now = new Date();
      const updateData: Record<string, any> = { status: input.status, updatedAt: now };
      // An empty note clears the saved one; a status change without a note keeps it.
      if (input.notes !== undefined) updateData.notes = input.notes || null;
      // Answer date of a closed request, from which its 1-year retention runs (RGPD-09).
      if (input.status === "completed" || input.status === "rejected") updateData.responseDate = now;

      await db
        .update(gdprRequests)
        .set(updateData)
        .where(eq(gdprRequests.id, input.id));

      return { success: true };
    }),
});
