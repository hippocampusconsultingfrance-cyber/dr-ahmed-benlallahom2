import { adminProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { testimonials } from "../../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// Manage testimonials
export const adminTestimonialsRouter = router({
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
});
