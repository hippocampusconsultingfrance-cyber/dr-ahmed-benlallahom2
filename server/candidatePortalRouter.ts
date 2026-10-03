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
  recruitmentEmailEvents,
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
  verifyCandidateInvitationToken,
  verifyCandidatePassword,
} from "./candidateAuth";
import {
  buildCandidatePortalAccessIdempotencyKey,
  candidatePortalAccessEmailFailureCode,
  sendCandidatePortalAccessEmail,
} from "./_core/notifications";
import { storageGetSignedUrl } from "./storage";
import { publicProcedure, router } from "./_core/trpc";
import { candidateRequestIp, verifyCandidateTurnstile } from "./candidateTurnstile";
import { enforcePersistentRateLimit, hashSecurityValue, isCompromisedPassword, logSecurityEvent, requestIpHash } from "./candidateSecurity";
import { buildCandidatePortalActivationEmailEvent } from "./recruitmentEmailTrace";

type CandidateSession = typeof candidateAccounts.$inferSelect;

const genericAccessMessage = "Si vos informations sont valides, vous recevrez les instructions nécessaires par email. Pensez à vérifier votre dossier Spam ou Courriers indésirables si le message n’apparaît pas dans votre boîte de réception.";

function getRequestProtocol(req: { protocol?: string; headers: Record<string, unknown> }): boolean {
  const forwarded = req.headers["x-forwarded-proto"];
  const forwardedText = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return req.protocol === "https" || forwardedText === "https";
}

function portalOrigin(): string {
  return process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";
}

function databaseOrThrow(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Le service candidat est temporairement indisponible." });
  return db;
}

async function candidateDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.error("candidate_database_operation_failed", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Le service candidat est temporairement indisponible. Veuillez réessayer dans quelques instants.",
    });
  }
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
    deviceLabel: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 180) : "Navigateur inconnu",
    ipHash: requestIpHash(req.headers),
    expiresAt,
  });
  res.cookie(CANDIDATE_SESSION_COOKIE, token, candidateSessionCookieOptions(getRequestProtocol(req)));
}

const passwordInput = z.string().min(1).max(128);
const genericAuthInput = z.object({ email: z.string().email().max(320), password: passwordInput });
const turnstileInput = z.object({ turnstileToken: z.string().min(20).max(4096) });

async function logCandidateEmailDelivery(input: {
  candidateId: number;
  category: "candidate_verification_delivery" | "candidate_password_reset_delivery";
  outcome: "allowed" | "failed";
  ipHash: string | null;
  providerMessageId?: string;
  failureCode?: "provider_rejected" | "delivery_exception";
}) {
  const deliveryUncertain = input.failureCode === "delivery_exception";
  await logSecurityEvent({
    actorKind: "candidate",
    actorReference: String(input.candidateId),
    category: input.category,
    outcome: deliveryUncertain ? "allowed" : input.outcome,
    severity: deliveryUncertain ? "info" : input.outcome === "failed" ? "warning" : "info",
    ipHash: input.ipHash,
    metadata: input.providerMessageId
      ? { providerMessageId: input.providerMessageId }
      : deliveryUncertain ? { deliveryStatus: "unknown" } : undefined,
  }).catch((error: unknown) => {
    console.error("candidate_email_delivery_audit_failed", error instanceof Error ? error.name : "UnknownError");
  });
}

async function recordCandidateActivationDelivery(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  application: { id: number; trackingId: string } | null | undefined,
  candidateEmail: string,
  delivery: { status: "sent" | "failed"; providerEmailId: string | null; failureCode: "provider_rejected" | "delivery_exception" | null },
) {
  if (!application) return;
  await db.insert(recruitmentEmailEvents).values(buildCandidatePortalActivationEmailEvent({
    applicationId: application.id,
    candidateEmail,
    trackingId: application.trackingId,
  }, delivery)).catch((error: unknown) => {
    console.error("candidate_activation_delivery_trace_failed", error instanceof Error ? error.name : "UnknownError");
  });
}

export const candidatePortalRouter = router({
  register: publicProcedure
    .input(genericAuthInput.extend({
      firstName: z.string().trim().min(1).max(120),
      lastName: z.string().trim().min(1).max(120),
      termsAccepted: z.boolean().refine(value => value, "L’acceptation des conditions est requise."),
      documentConsent: z.boolean().refine(value => value, "Le consentement au traitement documentaire est requis."),
      invitationToken: z.string().min(24).max(600).optional(),
    }).merge(turnstileInput))
    .mutation(async ({ input, ctx }) => {
      const email = normalizeCandidateEmail(input.email);
      const ipHash = requestIpHash(ctx.req.headers);
      try {
        await enforcePersistentRateLimit({ action: "candidate_register", subject: `${email}:${ipHash ?? "unknown"}`, maxAttempts: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
      } catch {
        await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_register_rate_limited", outcome: "blocked", severity: "warning", ipHash });
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de tentatives. Veuillez réessayer plus tard." });
      }
      try {
        await verifyCandidateTurnstile({ token: input.turnstileToken, remoteIp: candidateRequestIp(ctx.req.headers) });
      } catch {
        await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_register_turnstile", outcome: "blocked", severity: "warning", ipHash });
        throw new TRPCError({ code: "BAD_REQUEST", message: "La vérification anti-bot doit être renouvelée avant de créer votre accès." });
      }
      const passwordError = validateCandidatePassword(input.password);
      if (passwordError) throw new TRPCError({ code: "BAD_REQUEST", message: "Choisissez un mot de passe d’au moins 15 caractères." });
      try {
        if (await isCompromisedPassword(input.password)) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce mot de passe a déjà été compromis. Choisissez-en un autre, long et unique." });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Le contrôle de sécurité du mot de passe est temporairement indisponible." });
      }
      const db = databaseOrThrow(await getDb());
      const now = new Date();
      const verificationToken = createCandidateToken();
      const verificationTokenHash = hashCandidateToken(verificationToken, "verification");
      const verificationExpiresAt = new Date(now.getTime() + CANDIDATE_TOKEN_MAX_AGE_MS);
      const invitation = input.invitationToken ? verifyCandidateInvitationToken(input.invitationToken) : null;
      if (input.invitationToken && !invitation) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette invitation est invalide ou expirée. Demandez un nouveau lien à notre équipe." });
      const invitedApplication = invitation
        ? (await candidateDatabaseOperation(() => db.select({ id: cvApplications.id, email: cvApplications.email, trackingId: cvApplications.trackingId }).from(cvApplications).where(eq(cvApplications.id, invitation.applicationId)).limit(1)))[0]
        : null;
      if (invitation && (!invitedApplication || normalizeCandidateEmail(invitedApplication.email) !== email)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cette invitation ne correspond pas à cette adresse email." });
      }
      const matchingApplication = invitedApplication ?? (await candidateDatabaseOperation(() => db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId }).from(cvApplications).where(eq(cvApplications.email, email)).limit(1)))[0] ?? null;
      const matchingApplicationId = matchingApplication?.id ?? null;
      const existing = await candidateDatabaseOperation(() => db.select().from(candidateAccounts).where(eq(candidateAccounts.email, email)).limit(1));

      let candidateId: number | null = null;
      let activationFirstName = input.firstName;
      let previousVerificationState: { tokenHash: string | null; expiresAt: Date | null } | null = null;
      if (existing[0]) {
        if (!existing[0].emailVerifiedAt && existing[0].status === "active") {
          previousVerificationState = {
            tokenHash: existing[0].verificationTokenHash,
            expiresAt: existing[0].verificationExpiresAt,
          };
          activationFirstName = existing[0].firstName ?? input.firstName;
          await candidateDatabaseOperation(() => db.update(candidateAccounts).set({
            verificationTokenHash,
            verificationExpiresAt,
          }).where(eq(candidateAccounts.id, existing[0].id)));
          candidateId = existing[0].id;
        }
      } else {
        const passwordHash = await hashCandidatePassword(input.password);
        const result = await candidateDatabaseOperation(() => db.insert(candidateAccounts).values({
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
          verificationTokenHash,
          verificationExpiresAt,
          linkedApplicationId: matchingApplicationId,
          termsAcceptedAt: now,
          documentConsentAt: now,
        }).returning({ id: candidateAccounts.id }));
        candidateId = Number(result[0].id);
      }

      if (candidateId) {
        const verifyUrl = `${portalOrigin()}/candidate/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(verificationToken)}`;
        try {
          const delivery = await sendCandidatePortalAccessEmail({
            to: email,
            firstName: activationFirstName,
            kind: "verify",
            actionUrl: verifyUrl,
            applicationReference: matchingApplication?.trackingId,
            idempotencyKey: buildCandidatePortalAccessIdempotencyKey("verify", verificationTokenHash),
          });
          await recordCandidateActivationDelivery(db, matchingApplication, email, { status: "sent", providerEmailId: delivery.id, failureCode: null });
          await logCandidateEmailDelivery({ candidateId, category: "candidate_verification_delivery", outcome: "allowed", ipHash, providerMessageId: delivery.id });
        } catch (error) {
          const failureCode = candidatePortalAccessEmailFailureCode(error);
          if (failureCode === "provider_rejected") {
            await candidateDatabaseOperation(() => db.update(candidateAccounts).set({
              verificationTokenHash: previousVerificationState?.tokenHash ?? null,
              verificationExpiresAt: previousVerificationState?.expiresAt ?? null,
            }).where(and(eq(candidateAccounts.id, candidateId), eq(candidateAccounts.verificationTokenHash, verificationTokenHash))));
          }
          await recordCandidateActivationDelivery(db, matchingApplication, email, { status: "failed", providerEmailId: null, failureCode });
          console.error("candidate_verification_email_failed", error instanceof Error ? error.name : "UnknownError");
          await logCandidateEmailDelivery({ candidateId, category: "candidate_verification_delivery", outcome: "failed", failureCode, ipHash });
        }
        await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidateId), category: "candidate_account_created", outcome: "allowed", ipHash });
      }
      return { message: genericAccessMessage };
    }),

  resendVerification: publicProcedure
    .input(z.object({ email: z.string().email().max(320) }).merge(turnstileInput))
    .mutation(async ({ input, ctx }) => {
      const email = normalizeCandidateEmail(input.email);
      const ipHash = requestIpHash(ctx.req.headers);
      try {
        await enforcePersistentRateLimit({ action: "candidate_verification_resend", subject: `${email}:${ipHash ?? "unknown"}`, maxAttempts: 4, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
      } catch {
        await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_verification_resend_rate_limited", outcome: "blocked", severity: "warning", ipHash });
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de demandes. Veuillez réessayer plus tard." });
      }
      try {
        await verifyCandidateTurnstile({ token: input.turnstileToken, remoteIp: candidateRequestIp(ctx.req.headers) });
      } catch {
        await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_verification_resend_turnstile", outcome: "blocked", severity: "warning", ipHash });
        throw new TRPCError({ code: "BAD_REQUEST", message: "La vérification anti-bot doit être renouvelée avant de demander un lien." });
      }
      const db = databaseOrThrow(await getDb());
      const candidate = (await db.select().from(candidateAccounts).where(and(eq(candidateAccounts.email, email), eq(candidateAccounts.status, "active"))).limit(1))[0];
      if (candidate && !candidate.emailVerifiedAt) {
        const application = (await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId }).from(cvApplications).where(
          candidate.linkedApplicationId ? eq(cvApplications.id, candidate.linkedApplicationId) : eq(cvApplications.email, email),
        ).limit(1))[0] ?? null;
        const token = createCandidateToken();
        const tokenHash = hashCandidateToken(token, "verification");
        const expiresAt = new Date(Date.now() + CANDIDATE_TOKEN_MAX_AGE_MS);
        await db.update(candidateAccounts).set({ verificationTokenHash: tokenHash, verificationExpiresAt: expiresAt }).where(eq(candidateAccounts.id, candidate.id));
        const verifyUrl = `${portalOrigin()}/candidate/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
        try {
          const delivery = await sendCandidatePortalAccessEmail({
            to: email,
            firstName: candidate.firstName ?? "",
            kind: "verify",
            actionUrl: verifyUrl,
            applicationReference: application?.trackingId,
            idempotencyKey: buildCandidatePortalAccessIdempotencyKey("verify", tokenHash),
          });
          await recordCandidateActivationDelivery(db, application, email, { status: "sent", providerEmailId: delivery.id, failureCode: null });
          await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_verification_resent", outcome: "allowed", ipHash });
        } catch (error) {
          const failureCode = candidatePortalAccessEmailFailureCode(error);
          if (failureCode === "provider_rejected") {
            await db.update(candidateAccounts).set({
              verificationTokenHash: candidate.verificationTokenHash,
              verificationExpiresAt: candidate.verificationExpiresAt,
            }).where(and(eq(candidateAccounts.id, candidate.id), eq(candidateAccounts.verificationTokenHash, tokenHash)));
          }
          await recordCandidateActivationDelivery(db, application, email, { status: "failed", providerEmailId: null, failureCode });
          console.error("candidate_verification_resend_failed", error instanceof Error ? error.name : "UnknownError");
          await logSecurityEvent({
            actorKind: "candidate",
            actorReference: String(candidate.id),
            category: "candidate_verification_resent",
            outcome: failureCode === "delivery_exception" ? "allowed" : "failed",
            severity: failureCode === "delivery_exception" ? "info" : "warning",
            ipHash,
            metadata: failureCode === "delivery_exception" ? { deliveryStatus: "unknown" } : undefined,
          });
        }
      }
      return { message: genericAccessMessage };
    }),

  resolveInvitation: publicProcedure
    .input(z.object({ token: z.string().min(24).max(600) }))
    .query(async ({ input }) => {
      const invitation = verifyCandidateInvitationToken(input.token);
      if (!invitation) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette invitation est invalide ou expirée." });
      const db = databaseOrThrow(await getDb());
      const application = (await db.select({ email: cvApplications.email, firstName: cvApplications.firstName, lastName: cvApplications.lastName }).from(cvApplications).where(eq(cvApplications.id, invitation.applicationId)).limit(1))[0];
      if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Cette candidature n’est plus disponible." });
      return application;
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
    const ipHash = requestIpHash(ctx.req.headers);
    try {
      await enforcePersistentRateLimit({ action: "candidate_login", subject: `${email}:${ipHash ?? "unknown"}`, maxAttempts: 10, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 });
    } catch {
      await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_login_rate_limited", outcome: "blocked", severity: "warning", ipHash });
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de tentatives. Veuillez réessayer dans quelques minutes." });
    }
    const candidate = (await db.select().from(candidateAccounts).where(eq(candidateAccounts.email, email)).limit(1))[0];
    const genericError = new TRPCError({ code: "UNAUTHORIZED", message: "Email ou mot de passe incorrect." });
    if (!candidate || candidate.status !== "active" || !candidate.emailVerifiedAt) {
      await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_login", outcome: "failed", severity: "warning", ipHash });
      throw genericError;
    }
    if (candidate.lockedUntil && candidate.lockedUntil > new Date()) {
      await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_login_locked", outcome: "blocked", severity: "warning", ipHash });
      throw genericError;
    }
    const valid = await verifyCandidatePassword(input.password, candidate.passwordHash);
    if (!valid) {
      const failedLoginCount = candidate.failedLoginCount + 1;
      await db.update(candidateAccounts).set({
        failedLoginCount,
        lockedUntil: failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
      }).where(eq(candidateAccounts.id, candidate.id));
      await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_login", outcome: "failed", severity: failedLoginCount >= 5 ? "high" : "warning", ipHash });
      throw genericError;
    }
    await db.update(candidateAccounts).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(candidateAccounts.id, candidate.id));
    await createCandidateSession(candidate.id, ctx.req, ctx.res);
    await logCandidateAudit({ candidateId: candidate.id, action: "login", metadata: { method: "password" } });
    await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_login", outcome: "allowed", ipHash });
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

  requestPasswordReset: publicProcedure.input(z.object({ email: z.string().email().max(320), turnstileToken: z.string().min(20).max(4096) })).mutation(async ({ input, ctx }) => {
    const email = normalizeCandidateEmail(input.email);
    const ipHash = requestIpHash(ctx.req.headers);
    try {
      await enforcePersistentRateLimit({ action: "candidate_password_reset", subject: `${email}:${ipHash ?? "unknown"}`, maxAttempts: 4, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
    } catch {
      await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_password_reset_rate_limited", outcome: "blocked", severity: "warning", ipHash });
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Trop de demandes. Veuillez réessayer plus tard." });
    }
    try {
      await verifyCandidateTurnstile({ token: input.turnstileToken, remoteIp: candidateRequestIp(ctx.req.headers) });
    } catch {
      await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(email), category: "candidate_password_reset_turnstile", outcome: "blocked", severity: "warning", ipHash });
      throw new TRPCError({ code: "BAD_REQUEST", message: "La vérification anti-bot doit être renouvelée avant de demander un lien." });
    }
    const db = databaseOrThrow(await getDb());
    const candidate = (await db.select().from(candidateAccounts).where(and(eq(candidateAccounts.email, email), eq(candidateAccounts.status, "active"))).limit(1))[0];
    if (candidate?.emailVerifiedAt) {
      const token = createCandidateToken();
      const tokenHash = hashCandidateToken(token, "reset");
      await db.update(candidateAccounts).set({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + CANDIDATE_TOKEN_MAX_AGE_MS),
      }).where(eq(candidateAccounts.id, candidate.id));
      const resetUrl = `${portalOrigin()}/candidate/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
      try {
        const delivery = await sendCandidatePortalAccessEmail({
          to: email,
          firstName: candidate.firstName ?? "",
          kind: "reset",
          actionUrl: resetUrl,
          idempotencyKey: buildCandidatePortalAccessIdempotencyKey("reset", tokenHash),
        });
        await logCandidateEmailDelivery({ candidateId: candidate.id, category: "candidate_password_reset_delivery", outcome: "allowed", ipHash, providerMessageId: delivery.id });
      } catch (error) {
        const failureCode = candidatePortalAccessEmailFailureCode(error);
        if (failureCode === "provider_rejected") {
          await db.update(candidateAccounts).set({
            passwordResetTokenHash: candidate.passwordResetTokenHash,
            passwordResetExpiresAt: candidate.passwordResetExpiresAt,
          }).where(and(eq(candidateAccounts.id, candidate.id), eq(candidateAccounts.passwordResetTokenHash, tokenHash)));
        }
        console.error("candidate_reset_email_failed", error instanceof Error ? error.name : "UnknownError");
        await logCandidateEmailDelivery({ candidateId: candidate.id, category: "candidate_password_reset_delivery", outcome: "failed", failureCode, ipHash });
      }
      await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_password_reset_requested", outcome: "allowed", ipHash });
    }
    return { message: genericAccessMessage };
  }),

  resetPassword: publicProcedure.input(z.object({ email: z.string().email().max(320), token: z.string().min(20).max(200), password: passwordInput })).mutation(async ({ input, ctx }) => {
    const passwordError = validateCandidatePassword(input.password);
    if (passwordError) throw new TRPCError({ code: "BAD_REQUEST", message: "Choisissez un mot de passe d’au moins 15 caractères." });
    try {
      if (await isCompromisedPassword(input.password)) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce mot de passe a déjà été compromis. Choisissez-en un autre, long et unique." });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Le contrôle de sécurité du mot de passe est temporairement indisponible." });
    }
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

  sessions: publicProcedure.query(async ({ ctx }) => {
    const candidate = await requireCandidateSession(ctx.req);
    const db = databaseOrThrow(await getDb());
    const currentToken = candidateCookieToken(ctx.req);
    const currentTokenHash = currentToken ? hashCandidateToken(currentToken, "session") : null;
    const sessions = await db.select({ id: candidateSessions.id, deviceLabel: candidateSessions.deviceLabel, createdAt: candidateSessions.createdAt, lastSeenAt: candidateSessions.lastSeenAt, expiresAt: candidateSessions.expiresAt, tokenHash: candidateSessions.tokenHash }).from(candidateSessions).where(and(eq(candidateSessions.candidateId, candidate.id), isNull(candidateSessions.revokedAt), gt(candidateSessions.expiresAt, new Date()))).orderBy(desc(candidateSessions.lastSeenAt));
    return sessions.map(({ tokenHash, ...session }) => ({ ...session, current: tokenHash === currentTokenHash }));
  }),

  revokeSession: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const candidate = await requireCandidateSession(ctx.req);
    const db = databaseOrThrow(await getDb());
    const session = (await db.select().from(candidateSessions).where(and(eq(candidateSessions.id, input.id), eq(candidateSessions.candidateId, candidate.id), isNull(candidateSessions.revokedAt))).limit(1))[0];
    if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session introuvable." });
    await db.update(candidateSessions).set({ revokedAt: new Date() }).where(eq(candidateSessions.id, session.id));
    const currentToken = candidateCookieToken(ctx.req);
    if (currentToken && session.tokenHash === hashCandidateToken(currentToken, "session")) ctx.res.clearCookie(CANDIDATE_SESSION_COOKIE, { ...candidateSessionCookieOptions(getRequestProtocol(ctx.req)), maxAge: -1 });
    await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_session_revoked", outcome: "allowed", ipHash: requestIpHash(ctx.req.headers) });
    return { success: true };
  }),

  revokeAllSessions: publicProcedure.mutation(async ({ ctx }) => {
    const candidate = await requireCandidateSession(ctx.req);
    const db = databaseOrThrow(await getDb());
    await db.update(candidateSessions).set({ revokedAt: new Date() }).where(and(eq(candidateSessions.candidateId, candidate.id), isNull(candidateSessions.revokedAt)));
    ctx.res.clearCookie(CANDIDATE_SESSION_COOKIE, { ...candidateSessionCookieOptions(getRequestProtocol(ctx.req)), maxAge: -1 });
    await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_sessions_revoked_all", outcome: "allowed", ipHash: requestIpHash(ctx.req.headers) });
    return { success: true };
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
