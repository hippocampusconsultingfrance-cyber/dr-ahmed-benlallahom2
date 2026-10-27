import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { securityEvents } from "../../drizzle/schema";
import { desc } from "drizzle-orm";
import { AdminMfaRateLimitError, issueAdminMfaChallenge, verifyAdminMfaChallenge } from "../adminMfa";

const ADMIN_MFA_RATE_LIMITED_MESSAGE = "Trop de tentatives de double authentification. Patientez 15 minutes avant de réessayer.";

export const adminSecurityRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Accès administrateur requis." });
    return { verified: ctx.mfaVerified, email: ctx.user.email ?? null };
  }),
  begin: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Accès administrateur requis." });
    if (!ctx.user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun email administrateur vérifié n’est disponible pour la double authentification." });
    try {
      await issueAdminMfaChallenge({ openId: ctx.user.openId, email: ctx.user.email, req: ctx.req });
    } catch (error) {
      if (error instanceof AdminMfaRateLimitError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ADMIN_MFA_RATE_LIMITED_MESSAGE });
      console.error("[AdminMfa] Unable to issue a security code", error instanceof Error ? error.message : "unknown");
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le code de sécurité n’a pas pu être envoyé. Réessayez dans quelques instants." });
    }
    return { success: true };
  }),
  verify: protectedProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/) })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Accès administrateur requis." });
    try {
      await verifyAdminMfaChallenge({ openId: ctx.user.openId, code: input.code, req: ctx.req, res: ctx.res });
      return { success: true };
    } catch (error) {
      if (error instanceof AdminMfaRateLimitError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ADMIN_MFA_RATE_LIMITED_MESSAGE });
      throw new TRPCError({ code: "BAD_REQUEST", message: "Le code de sécurité est invalide ou expiré." });
    }
  }),
  events: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional()).query(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Accès administrateur requis." });
    if (!ctx.mfaVerified) throw new TRPCError({ code: "FORBIDDEN", message: "Double authentification administrateur requise." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de données indisponible." });
    const events = await db.select({
      id: securityEvents.id,
      actorKind: securityEvents.actorKind,
      category: securityEvents.category,
      outcome: securityEvents.outcome,
      severity: securityEvents.severity,
      metadata: securityEvents.metadata,
      createdAt: securityEvents.createdAt,
    }).from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(input?.limit ?? 50);
    // RGPD-12: only the row counts of the traces of actions on a person's data leave the server.
    const { personalDataTraceCounts } = await import("../personalDataAdmin");
    return events.map(({ metadata, ...event }) => ({ ...event, counts: personalDataTraceCounts(event.category, metadata) }));
  }),
});
