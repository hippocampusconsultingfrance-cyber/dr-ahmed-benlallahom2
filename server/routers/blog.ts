import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { blogPosts } from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

// Blog / Actualités
export const blogRouter = router({
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
});
