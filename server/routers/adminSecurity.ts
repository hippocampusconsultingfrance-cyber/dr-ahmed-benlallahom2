import { logError } from "../_core/logError";
import type { TrpcContext } from "../_core/context";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { clerkClient, getAuth } from "@clerk/express";
import { z } from "zod";
import { getDb } from "../db";
import { securityEvents } from "../../drizzle/schema";
import { and, desc, eq, gte, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { AdminMfaRateLimitError, issueAdminMfaChallenge, revokeOtherAdminMfaSessions, verifyAdminMfaChallenge } from "../adminMfa";
import { logSecurityEvent, requestIpHash } from "../candidateSecurity";

const ADMIN_MFA_RATE_LIMITED_MESSAGE = "Trop de tentatives de double authentification. Patientez 15 minutes avant de réessayer.";

/** At most this many of the administrator's Clerk sessions are read: far more devices than one account signs in from. */
const ADMIN_SESSION_LIST_LIMIT = 100;

/** ADM-15: the span of the Sécurité tab's count of high and critical events. */
const RECENT_HIGH_EVENTS_WINDOW_MS = 24 * 60 * 60 * 1000;

const ADMIN_SESSIONS_UNAVAILABLE_MESSAGE = "Les sessions n’ont pas pu être lues auprès de Clerk. Réessayez, ou révoquez-les dans le tableau de bord Clerk (Users, puis Sessions).";

function requireVerifiedAdmin(ctx: Pick<TrpcContext, "user" | "mfaVerified">) {
  if (ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Accès administrateur requis." });
  if (!ctx.mfaVerified) throw new TRPCError({ code: "FORBIDDEN", message: "Double authentification administrateur requise." });
  return ctx.user;
}

/** The administrator's active Clerk sessions (the first factor of the admin). */
async function activeAdminSessions(openId: string) {
  const { data } = await clerkClient.sessions.getSessionList({ userId: openId, status: "active", limit: ADMIN_SESSION_LIST_LIMIT });
  return data;
}

/**
 * ADM-15: the journal's filters. Successful candidate sign-ins, most of the
 * journal, are left out unless asked for; the others narrow it to the
 * administrator's own events and to warnings and above.
 */
const eventsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  adminOnly: z.boolean().default(false),
  warningsAndAbove: z.boolean().default(false),
  includeCandidateSignIns: z.boolean().default(false),
  /** The page after this event: the older events, newest first. */
  beforeId: z.number().int().positive().optional(),
});

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
      logError("[AdminMfa] Unable to issue a security code", error);
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
  events: protectedProcedure.input(eventsInput.optional()).query(async ({ input, ctx }) => {
    requireVerifiedAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de données indisponible." });
    const filters = eventsInput.parse(input ?? {});
    const conditions: SQL[] = [];
    if (filters.adminOnly) conditions.push(eq(securityEvents.actorKind, "admin"));
    if (filters.warningsAndAbove) conditions.push(inArray(securityEvents.severity, ["warning", "high", "critical"]));
    if (!filters.includeCandidateSignIns) conditions.push(or(ne(securityEvents.category, "candidate_login"), ne(securityEvents.outcome, "allowed"))!);
    if (filters.beforeId) conditions.push(lt(securityEvents.id, filters.beforeId));
    const events = await db.select({
      id: securityEvents.id,
      actorKind: securityEvents.actorKind,
      category: securityEvents.category,
      outcome: securityEvents.outcome,
      severity: securityEvents.severity,
      metadata: securityEvents.metadata,
      createdAt: securityEvents.createdAt,
    }).from(securityEvents).where(and(...conditions)).orderBy(desc(securityEvents.id)).limit(filters.limit);
    // RGPD-12: only the row counts of the traces of actions on a person's data leave the server.
    const { personalDataTraceCounts } = await import("../personalDataAdmin");
    return events.map(({ metadata, ...event }) => ({ ...event, counts: personalDataTraceCounts(event.category, metadata) }));
  }),
  /**
   * ADM-15: the high and critical events of the last 24 hours, counted over
   * the whole journal, whatever its filters and page show.
   */
  recentHighEvents: protectedProcedure.query(async ({ ctx }) => {
    requireVerifiedAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de données indisponible." });
    const [recent] = await db.select({ count: sql<number>`count(*)` }).from(securityEvents).where(and(
      inArray(securityEvents.severity, ["high", "critical"]),
      gte(securityEvents.createdAt, new Date(Date.now() - RECENT_HIGH_EVENTS_WINDOW_MS)),
    ));
    return { count: Number(recent?.count ?? 0) };
  }),
  /**
   * ADM-14: the devices signed in to the administrator's account, this one
   * first, then by last activity. Clerk places each one by its address; the
   * address itself does not leave the server.
   */
  sessions: protectedProcedure.query(async ({ ctx }) => {
    const user = requireVerifiedAdmin(ctx);
    const currentSessionId = getAuth(ctx.req).sessionId ?? null;
    let sessions;
    try {
      sessions = await activeAdminSessions(user.openId);
    } catch (error) {
      logError("[AdminSessions] Unable to list the Clerk sessions", error, { req: ctx.req });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ADMIN_SESSIONS_UNAVAILABLE_MESSAGE });
    }
    return sessions.map(session => {
      const activity = session.latestActivity;
      return {
        id: session.id,
        current: session.id === currentSessionId,
        lastActiveAt: new Date(session.lastActiveAt),
        browser: [activity?.browserName, activity?.browserVersion].filter(Boolean).join(" ") || null,
        device: activity?.deviceType || null,
        location: [activity?.city, activity?.country].filter(Boolean).join(", ") || null,
      };
    }).sort((first, second) => Number(second.current) - Number(first.current) || second.lastActiveAt.getTime() - first.lastActiveAt.getTime());
  }),
  /**
   * ADM-14: « Révoquer toutes les autres sessions ». The security codes of the
   * other devices stop counting first, whatever Clerk answers: a device whose
   * Clerk session already ended (revoked in Clerk's dashboard, expired) keeps
   * its code for up to 8 hours, and signed in again with the password would
   * not need a new one. Clerk then signs every other device out at its next
   * request; this browser keeps both. A Clerk session that could not be
   * revoked, or a Clerk that did not answer, is said, for the owner to revoke
   * them in Clerk's dashboard.
   */
  revokeOtherSessions: protectedProcedure.mutation(async ({ ctx }) => {
    const user = requireVerifiedAdmin(ctx);
    const currentSessionId = getAuth(ctx.req).sessionId;
    if (!currentSessionId) throw new TRPCError({ code: "BAD_REQUEST", message: "La session de ce navigateur est introuvable : reconnectez-vous, puis réessayez." });
    const securitySessions = await revokeOtherAdminMfaSessions({ openId: user.openId, req: ctx.req });
    let sessions: Awaited<ReturnType<typeof activeAdminSessions>> | null = null;
    try {
      sessions = await activeAdminSessions(user.openId);
    } catch (error) {
      logError("[AdminSessions] Unable to list the Clerk sessions", error, { req: ctx.req });
    }
    const results = await Promise.allSettled((sessions ?? []).filter(session => session.id !== currentSessionId).map(session => clerkClient.sessions.revokeSession(session.id)));
    for (const result of results) {
      if (result.status === "rejected") logError("[AdminSessions] Unable to revoke a Clerk session", result.reason, { req: ctx.req });
    }
    const outcome = {
      revoked: results.filter(result => result.status === "fulfilled").length,
      notRevoked: results.filter(result => result.status === "rejected").length,
      securitySessions,
      clerkUnavailable: sessions === null,
    };
    await logSecurityEvent({ actorKind: "admin", actorReference: user.openId, category: "admin_sessions_revoked_others", outcome: "allowed", severity: "warning", ipHash: requestIpHash(ctx.req.headers), metadata: outcome }).catch(() => undefined);
    return outcome;
  }),
});
