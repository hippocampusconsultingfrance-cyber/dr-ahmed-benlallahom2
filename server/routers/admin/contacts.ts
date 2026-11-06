import { adminProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../../db";
import { mutationRowCount } from "../../dbMutation";
import { contactMessages } from "../../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { logSecurityEvent } from "../../candidateSecurity";
import { adminSearchCondition, adminSearchInput } from "../../adminSearch";

// List all contact messages
export const adminContactsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
        /** Only the messages not marked as read yet (ADM-01). */
        unreadOnly: z.boolean().optional().default(false),
        /** Sender name, email or message reference (ADM-02). */
        search: adminSearchInput,
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const whereClause = and(
        input.unreadOnly ? eq(contactMessages.read, 0) : undefined,
        adminSearchCondition(input.search, [contactMessages.name, contactMessages.email, contactMessages.trackingId], { fullName: contactMessages.name }),
      );

      const items = await db
        .select()
        .from(contactMessages)
        .where(whereClause)
        .orderBy(desc(contactMessages.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contactMessages)
        .where(whereClause);

      return { items, total: Number(countResult[0]?.count ?? 0) };
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

  /** Deletes one message (GDPR erasure or withdrawn consent); the trace names no one (RGPD-12). */
  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const deleted = mutationRowCount(await db.delete(contactMessages).where(eq(contactMessages.id, input.id)));
      if (deleted === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Message introuvable : il a peut-être déjà été supprimé." });
      await logSecurityEvent({ actorKind: "admin", actorReference: ctx.user.openId, category: "admin_contact_message_deleted", outcome: "allowed", metadata: { deleted } });

      return { success: true };
    }),
});
