import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { cvApplications, recruitmentAuditLogs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const recruitmentPreferencesRouter = router({
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
      const alreadyUnsubscribed = Boolean(candidate.marketingUnsubscribedAt);
      if (!alreadyUnsubscribed) {
        await db.update(cvApplications).set({ marketingConsent: 0, marketingUnsubscribedAt: new Date(), updatedAt: new Date() }).where(eq(cvApplications.id, candidate.id));
      }
      await db.insert(recruitmentAuditLogs).values({
        applicationId: candidate.id,
        adminOpenId: "public:unsubscribe",
        action: "unsubscribe",
        metadata: JSON.stringify({ source: "recruitment_preferences", alreadyUnsubscribed }),
      });
      return { success: true, alreadyUnsubscribed };
    }),
});
