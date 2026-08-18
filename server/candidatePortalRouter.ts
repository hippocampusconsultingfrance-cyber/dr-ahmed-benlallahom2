import { parse as parseCookie } from "cookie";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  candidateAccounts,
  candidateDocumentAuditLogs,
  candidateDocuments,
  candidateSessions,
  cvApplications,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  CANDIDATE_SESSION_COOKIE,
  CANDIDATE_SESSION_MAX_AGE_SECONDS,
  CANDIDATE_TOKEN_MAX_AGE_MS,
  candidateSessionCookieOptions,
  createCandidateToken,
  hashCandidatePassword,
  hashCandidateToken,
  normalizeCandidateEmail,
  validateCandidatePassword,
  verifyCandidatePassword,
} from "./candidateAuth";
import { sendCandidatePortalAccessEmail } from "./_core/notifications";
import { storageGetSignedUrl } from "./storage";
import { publicProcedure, router } from "./_core/trpc";

type CandidateSession = typeof candidateAccounts.$inferSelect;

const genericAccessMessage = "Si vos informations sont valides, vous recevrez les instructions nécessaires.";
const candidateRateWindows = new Map<string, { count: number; resetAt: number }>();

function requestFingerprint(req: { headers: Record<string, unknown> }, scope: string, email: string) {
  const forwarded = req.headers["x-forwarded-for"];
  const source = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = typeof source === "string" ? source.split(",")[0].trim() : "unknown";
  return `${scope}:${ip}:${normalizeCandidateEmail(email)}`;
}

function consumeCandidateRateLimit(key: string, maxAttempts: number, windowMs: number) {
  const now = Date.now();
  const current = candidateRateWindows.get(key);
  if (!current || current.resetAt <= now) {
    candidateRateWindows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= maxAttempts) return false;
  current.count += 1;
  return true;
}

function looksAutomated(input: { website?: string; submittedAt?: number }) {
  if (input.website?.trim()) return true;
  const elapsed = Date.now() - (input.submittedAt ?? 0);
  return elapsed < 1500 || elapsed > 24 * 60 * 60 * 1000;
}

function getRequestProtocol(req: { protocol?: string; headers: Record<string, unknown> }): boolean {
  const forwarded = req.headers["x-forwarded-proto"];
  const forwardedText = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return req.protocol === "https" || forwardedText === "https";
}

function portalOrigin(req: { protocol?: string; headers: Record<string, unknown> }): string {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host;
  const textHost = typeof host === "string" ? host.split(",")[0].trim() : "";
  if (textHost && /^(?:drahmedbenlallahom\.com|www\.drahmedbenlallahom\.com|drbenlallah-esc8d3hd\.manus\.space|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)$/i.test(textHost)) {
    return `${getRequestProtocol(req) ? "https" : "http"}://${textHost}`;
  }
  return "https://drahmedbenlallahom.com";
}

function databaseOrThrow(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le service candidat est temporairement indisponible." });
  return db;
}

function candidateCookieToken(req: { headers: Record<string, unknown> }): string | null {
  const cookieHeader = req.headers.cookie;
  const source = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  return typeof source === "string" ? parseCookie(source)[CANDIDATE_SESSION_COOKIE] ?? null : null;
}

export async function getCandidateSession(req: { headers: Record<string, unknown> }): Promise<CandidateSession | null> {
  const token = candidateCookieToken(req);
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ candidate: candidateAccounts })
    .from(candidateSessions)
    .innerJoin(candidateAccounts, eq(candidateSessions.candidateId, candidateAccounts.id))
    .where(and(
      eq(candidateSessions.tokenHash, hashCandidateToken(token, "session")),
      gt(candidateSessions.expiresAt, new Date()),
      isNull(candidateSessions.revokedAt),
      eq(candidateAccounts.status, "active"),
    ))
    .limit(1);
  return rows[0]?.candidate ?? null;
}

export async function requireCandidateSession(req: { headers: Record<string, unknown> }): Promise<CandidateSession> {
  const candidate = await getCandidateSession(req);
  if (!candidate) throw new TRPCError({ code: "UNAUTHORIZED", message: "Votre session a expiré. Veuillez vous reconnecter." });
  return candidate;
}

async function logCandidateAudit(input: {
  candidateId: number;
  documentId?: number | null;
  action: "upload" | "download" | "view" | "analysis_requested" | "analysis_completed" | "reviewed" | "erased" | "login" | "logout";
  actorType?: "candidate" | "admin" | "system";
  actorReference?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(candidateDocumentAuditLogs).values({
    candidateId: input.candidateId,
    documentId: input.documentId ?? null,
    actorType: input.actorType ?? "candidate",
    actorReference: input.actorReference ?? null,
    action: input.action,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

async function createCandidateSession(candidateId: number, req: { protocol?: string; headers: Record<string, unknown> }, res: { cookie: Function }) {
  const db = databaseOrThrow(await getDb());
  const token = createCandidateToken();
  const expiresAt = new Date(Date.now() + CANDIDATE_SESSION_MAX_AGE_SECONDS * 1000);
  await db.insert(candidateSessions).values({
    candidateId,
    tokenHash: hashCandidateToken(token, "session"),
    expiresAt,
  });
  res.cookie(CANDIDATE_SESSION_COOKIE, token, candidateSessionCookieOptions(getRequestProtocol(req)));
}

const passwordInput = z.string().min(1).max(128);
const genericAuthInput = z.object({ email: z.string().email().max(320), password: passwordInput });
const publicFormSecurityInput = z.object({ website: z.string().max(160).optional().default(""), submittedAt: z.number().int().positive() });

export const candidatePortalRouter = router({
  register: publicProcedure
    .input(genericAuthInput.extend({
      firstName: z.string().trim().min(1).max(120),
      lastName: z.string().trim().min(1).max(120),
      termsAccepted: z.boolean().refine(value => value, "L’acceptation des conditions est requise."),
      documentConsent: z.boolean().refine(value => value, "Le consentement au traitement documentaire est requis."),
    }).merge(publicFormSecurityInput))
    .mutation(async ({ input, ctx }) => {
      const email = normalizeCandidateEmail(input.email);
      if (looksAutomated(input) || !consumeCandidateRateLimit(requestFingerprint(ctx.req, "register", email), 3, 20 * 60 * 1000)) return { message: genericAccessMessage };
      const passwordError = validateCandidatePassword(input.password);
      if (passwordError) throw new TRPCError({ code: "BAD_REQUEST", message: "Choisissez un mot de passe d’au moins 15 caractères." });
      const db = databaseOrThrow(await getDb());
      const now = new Date();
      const verificationToken = createCandidateToken();
      const verificationExpiresAt = new Date(now.getTime() + CANDIDATE_TOKEN_MAX_AGE_MS);
      const existing = await db.select().from(candidateAccounts).where(eq(candidateAccounts.email, email)).limit(1);

      let candidateId: number | null = null;
      if (existing[0]) {
        if (!existing[0].emailVerifiedAt && existing[0].status === "active") {
          await db.update(candidateAccounts).set({
            firstName: input.firstName,
            lastName: input.lastName,
            passwordHash: await hashCandidatePassword(input.password),
            verificationTokenHash: hashCandidateToken(verificationToken, "verification"),
            verificationExpiresAt,
            termsAcceptedAt: now,
            documentConsentAt: now,
          }).where(eq(candidateAccounts.id, existing[0].id));
          candidateId = existing[0].id;
        }
      } else {
        const matchingApplication = await db.select({ id: cvApplications.id }).from(cvApplications).where(eq(cvApplications.email, email)).limit(1);
        const result = await db.insert(candidateAccounts).values({
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash: await hashCandidatePassword(input.password),
          verificationTokenHash: hashCandidateToken(verificationToken, "verification"),
          verificationExpiresAt,
          linkedApplicationId: matchingApplication[0]?.id ?? null,
          termsAcceptedAt: now,
          documentConsentAt: now,
        });
        candidateId = Number(result[0].insertId);
      }

      if (candidateId) {
        const verifyUrl = `${portalOrigin(ctx.req)}/candidate/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(verificationToken)}`;
        await sendCandidatePortalAccessEmail({ to: email, firstName: input.firstName, kind: "verify", actionUrl: verifyUrl }).catch(error => console.error("candidate_verification_email_failed", error));
      }
      return { message: genericAccessMessage };
    }),

  verifyEmail: publicProcedure
    .input(z.object({ email: z.string().email().max(320), token: z.string().min(20).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const db = databaseOrThrow(await getDb());
      const candidate = (await db.select().from(candidateAccounts).where(and(
        eq(candidateAccounts.email, normalizeCandidateEmail(input.email)),
        eq(candidateAccounts.verificationTokenHash, hashCandidateToken(input.token, "verification")),
        gt(candidateAccounts.verificationExpiresAt, new Date()),
        eq(candidateAccounts.status, "active"),
      )).limit(1))[0];
      if (!candidate) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce lien de vérification est invalide ou expiré." });
      await db.update(candidateAccounts).set({ emailVerifiedAt: new Date(), verificationTokenHash: null, verificationExpiresAt: null }).where(eq(candidateAccounts.id, candidate.id));
      await createCandidateSession(candidate.id, ctx.req, ctx.res);
      await logCandidateAudit({ candidateId: candidate.id, action: "login", metadata: { method: "email_verification" } });
      return { success: true };
    }),

  login: publicProcedure.input(genericAuthInput).mutation(async ({ input, ctx }) => {
    const db = databaseOrThrow(await getDb());
    const email = normalizeCandidateEmail(input.email);
    const candidate = (await db.select().from(candidateAccounts).where(eq(candidateAccounts.email, email)).limit(1))[0];
    const genericError = new TRPCError({ code: "UNAUTHORIZED", message: "Email ou mot de passe incorrect." });
    if (!consumeCandidateRateLimit(requestFingerprint(ctx.req, "login", email), 8, 15 * 60 * 1000)) throw genericError;
    if (!candidate || candidate.status !== "active" || !candidate.emailVerifiedAt) throw genericError;
    if (candidate.lockedUntil && candidate.lockedUntil > new Date()) throw genericError;
    const valid = await verifyCandidatePassword(input.password, candidate.passwordHash);
    if (!valid) {
      const failedLoginCount = candidate.failedLoginCount + 1;
      await db.update(candidateAccounts).set({
        failedLoginCount,
        lockedUntil: failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
      }).where(eq(candidateAccounts.id, candidate.id));
      throw genericError;
    }
    await db.update(candidateAccounts).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(candidateAccounts.id, candidate.id));
    await createCandidateSession(candidate.id, ctx.req, ctx.res);
    await logCandidateAudit({ candidateId: candidate.id, action: "login", metadata: { method: "password" } });
    return { success: true };
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const candidate = await getCandidateSession(ctx.req);
    const db = await getDb();
    const token = candidateCookieToken(ctx.req);
    if (candidate && db && token) {
      await db.update(candidateSessions).set({ revokedAt: new Date() }).where(eq(candidateSessions.tokenHash, hashCandidateToken(token, "session")));
      await logCandidateAudit({ candidateId: candidate.id, action: "logout" });
    }
    ctx.res.clearCookie(CANDIDATE_SESSION_COOKIE, { ...candidateSessionCookieOptions(getRequestProtocol(ctx.req)), maxAge: -1 });
    return { success: true };
  }),

  requestPasswordReset: publicProcedure.input(z.object({ email: z.string().email().max(320) }).merge(publicFormSecurityInput)).mutation(async ({ input, ctx }) => {
    if (looksAutomated(input) || !consumeCandidateRateLimit(requestFingerprint(ctx.req, "reset", input.email), 3, 20 * 60 * 1000)) return { message: genericAccessMessage };
    const db = databaseOrThrow(await getDb());
    const email = normalizeCandidateEmail(input.email);
    const candidate = (await db.select().from(candidateAccounts).where(and(eq(candidateAccounts.email, email), eq(candidateAccounts.status, "active"))).limit(1))[0];
    if (candidate?.emailVerifiedAt) {
      const token = createCandidateToken();
      await db.update(candidateAccounts).set({
        passwordResetTokenHash: hashCandidateToken(token, "reset"),
        passwordResetExpiresAt: new Date(Date.now() + CANDIDATE_TOKEN_MAX_AGE_MS),
      }).where(eq(candidateAccounts.id, candidate.id));
      const resetUrl = `${portalOrigin(ctx.req)}/candidate/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
      await sendCandidatePortalAccessEmail({ to: email, firstName: candidate.firstName ?? "", kind: "reset", actionUrl: resetUrl }).catch(error => console.error("candidate_reset_email_failed", error));
    }
    return { message: genericAccessMessage };
  }),

  resetPassword: publicProcedure.input(z.object({ email: z.string().email().max(320), token: z.string().min(20).max(200), password: passwordInput })).mutation(async ({ input, ctx }) => {
    const passwordError = validateCandidatePassword(input.password);
    if (passwordError) throw new TRPCError({ code: "BAD_REQUEST", message: "Choisissez un mot de passe d’au moins 15 caractères." });
    const db = databaseOrThrow(await getDb());
    const candidate = (await db.select().from(candidateAccounts).where(and(
      eq(candidateAccounts.email, normalizeCandidateEmail(input.email)),
      eq(candidateAccounts.passwordResetTokenHash, hashCandidateToken(input.token, "reset")),
      gt(candidateAccounts.passwordResetExpiresAt, new Date()),
      eq(candidateAccounts.status, "active"),
    )).limit(1))[0];
    if (!candidate) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce lien de réinitialisation est invalide ou expiré." });
    await db.update(candidateAccounts).set({
      passwordHash: await hashCandidatePassword(input.password),
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
    }).where(eq(candidateAccounts.id, candidate.id));
    await db.update(candidateSessions).set({ revokedAt: new Date() }).where(and(eq(candidateSessions.candidateId, candidate.id), isNull(candidateSessions.revokedAt)));
    await createCandidateSession(candidate.id, ctx.req, ctx.res);
    await logCandidateAudit({ candidateId: candidate.id, action: "login", metadata: { method: "password_reset" } });
    return { success: true };
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    const candidate = await getCandidateSession(ctx.req);
    if (!candidate) return null;
    return { id: candidate.id, email: candidate.email, firstName: candidate.firstName, lastName: candidate.lastName, emailVerifiedAt: candidate.emailVerifiedAt, linkedApplicationId: candidate.linkedApplicationId, documentConsentAt: candidate.documentConsentAt };
  }),

  documents: publicProcedure.query(async ({ ctx }) => {
    const candidate = await requireCandidateSession(ctx.req);
    const db = databaseOrThrow(await getDb());
    const documents = await db.select({
      id: candidateDocuments.id,
      category: candidateDocuments.category,
      categoryOtherLabel: candidateDocuments.categoryOtherLabel,
      originalName: candidateDocuments.originalName,
      mimeType: candidateDocuments.mimeType,
      sizeBytes: candidateDocuments.sizeBytes,
      validationStatus: candidateDocuments.validationStatus,
      status: candidateDocuments.status,
      aiSummary: candidateDocuments.aiSummary,
      aiConfidence: candidateDocuments.aiConfidence,
      aiFlags: candidateDocuments.aiFlags,
      analysisStatus: candidateDocuments.analysisStatus,
      analyzedAt: candidateDocuments.analyzedAt,
      reviewNotes: candidateDocuments.reviewNotes,
      createdAt: candidateDocuments.createdAt,
    }).from(candidateDocuments).where(eq(candidateDocuments.candidateId, candidate.id)).orderBy(desc(candidateDocuments.createdAt));
    return documents;
  }),

  documentDownload: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const candidate = await requireCandidateSession(ctx.req);
    const db = databaseOrThrow(await getDb());
    const document = (await db.select().from(candidateDocuments).where(and(eq(candidateDocuments.id, input.id), eq(candidateDocuments.candidateId, candidate.id))).limit(1))[0];
    if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
    await logCandidateAudit({ candidateId: candidate.id, documentId: document.id, action: "download" });
    return { url: await storageGetSignedUrl(document.storageKey), filename: document.originalName };
  }),
});
