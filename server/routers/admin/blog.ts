import { adminProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { blogPosts } from "../../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// Blog management
export const adminBlogRouter = router({
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
});
