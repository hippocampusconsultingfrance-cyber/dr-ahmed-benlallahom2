import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { cvApplications, recruitmentAuditLogs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_PUBLIC_ORIGIN } from "./publicOrigin";

/** The candidate's unsubscribe token (cv_applications.marketing_unsubscribe_token), as its link carries it. */
export const recruitmentUnsubscribeToken = z.string().trim().min(24).max(80);

/**
 * Where a recruitment campaign's List-Unsubscribe header points (RGPD-19): an
 * API address, as a mail client posts to it (RFC 8058) and only /api reaches
 * the server on Vercel (server/routes/recruitmentUnsubscribe.ts).
 */
export const RECRUITMENT_ONE_CLICK_UNSUBSCRIBE_PATH = "/api/recruitment/unsubscribe";

/**
 * The two unsubscribe addresses of a campaign email, with the same token:
 * the page of the link in the email, which asks for a confirmation, and the
 * one-click address of its List-Unsubscribe header.
 */
export function recruitmentUnsubscribeLinks(token: string) {
  const query = `?token=${encodeURIComponent(token)}`;
  return {
    unsubscribeUrl: `${DEFAULT_PUBLIC_ORIGIN}/recruitment/unsubscribe${query}`,
    oneClickUnsubscribeUrl: `${DEFAULT_PUBLIC_ORIGIN}${RECRUITMENT_ONE_CLICK_UNSUBSCRIBE_PATH}${query}`,
  };
}

/**
 * Withdraws the marketing consent of the candidate whose unsubscribe token
 * this is, from the page of the link or in one click from the mail client
 * (`source`), without signing in; null when no candidate has it. Audited each
 * time, an unsubscription already recorded included.
 */
export async function unsubscribeFromRecruitmentMarketing(token: string, source: "recruitment_preferences" | "list_unsubscribe_one_click") {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [candidate] = await db.select({ id: cvApplications.id, marketingUnsubscribedAt: cvApplications.marketingUnsubscribedAt })
    .from(cvApplications)
    .where(eq(cvApplications.marketingUnsubscribeToken, token))
    .limit(1);
  if (!candidate) return null;
  const alreadyUnsubscribed = Boolean(candidate.marketingUnsubscribedAt);
  if (!alreadyUnsubscribed) {
    await db.update(cvApplications).set({ marketingConsent: 0, marketingUnsubscribedAt: new Date(), updatedAt: new Date() }).where(eq(cvApplications.id, candidate.id));
  }
  await db.insert(recruitmentAuditLogs).values({
    applicationId: candidate.id,
    adminOpenId: "public:unsubscribe",
    action: "unsubscribe",
    metadata: JSON.stringify({ source, alreadyUnsubscribed }),
  });
  return { alreadyUnsubscribed };
}

export const recruitmentPreferencesRouter = router({
  unsubscribe: publicProcedure
    .input(z.object({ token: recruitmentUnsubscribeToken }))
    .mutation(async ({ input }) => {
      const result = await unsubscribeFromRecruitmentMarketing(input.token, "recruitment_preferences");
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Lien de désinscription invalide ou expiré." });
      return { success: true, alreadyUnsubscribed: result.alreadyUnsubscribed };
    }),
});
