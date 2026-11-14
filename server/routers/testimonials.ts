import { isPublicTestimonialsEnabled } from "../../shared/publicFeatures";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { testimonials } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const testimonialsRouter = router({
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
});
