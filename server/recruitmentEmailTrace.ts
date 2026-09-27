import { randomUUID } from "node:crypto";
import { cvApplications, recruitmentEmailEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { and, desc, eq, exists, isNotNull, like, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createCandidateInvitationToken } from "./candidateAuth";
import {
  sendCvApplicationConfirmationEmail,
  type CvApplicationConfirmationDelivery,
} from "./_core/notifications";

export type TrackedCvConfirmationInput = {
  applicationId: number;
  candidateEmail: string;
  candidateName: string;
  trackingId: string;
  specialty: string;
  targetCountries: string;
  candidatePortalInviteUrl?: string;
  deliveryAttempt?: number;
};

export type CvConfirmationTraceEvent = {
  eventType: string;
  providerEmailId: string | null;
  payload: string | null;
  occurredAt: Date;
};

type CvConfirmationAttemptPayload = {
  kind: "application_confirmation";
  outcome?: "sent" | "failed";
  failureCode?: CvApplicationConfirmationDelivery["failureCode"];
  attempt?: number;
};

type CandidatePortalInvitationAttemptPayload = {
  kind: "candidate_portal_invitation";
  outcome?: "sent" | "failed";
  failureCode?: "provider_rejected" | "delivery_exception";
  attempt?: number;
};

type CandidatePortalActivationAttemptPayload = {
  kind: "candidate_portal_activation";
  outcome?: "sent" | "failed";
  failureCode?: "provider_rejected" | "delivery_exception";
  attempt?: number;
};

const TERMINAL_DELIVERY_EVENTS = new Set(["email.delivered", "email.bounced", "email.complained", "email.suppressed"]);
const MAX_CONFIRMATION_ATTEMPTS = 3;
const CONFIRMATION_PAYLOAD_PATTERN = '%"kind":"application_confirmation"%';

function parseConfirmationAttempt(payload: string | null): CvConfirmationAttemptPayload | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return parsed.kind === "application_confirmation" ? parsed as CvConfirmationAttemptPayload : null;
  } catch {
    return null;
  }
}

function parseCandidatePortalInvitationAttempt(payload: string | null): CandidatePortalInvitationAttemptPayload | CvConfirmationAttemptPayload | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return parsed.kind === "candidate_portal_invitation" || parsed.kind === "application_confirmation"
      ? parsed as CandidatePortalInvitationAttemptPayload | CvConfirmationAttemptPayload
      : null;
  } catch {
    return null;
  }
}

function parseCandidatePortalActivationAttempt(payload: string | null): CandidatePortalActivationAttemptPayload | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return parsed.kind === "candidate_portal_activation" ? parsed as CandidatePortalActivationAttemptPayload : null;
  } catch {
    return null;
  }
}

function resolveLatestAttempt<TPayload extends { attempt?: number; failureCode?: string | null }>(
  events: CvConfirmationTraceEvent[],
  parseAttempt: (payload: string | null) => TPayload | null,
) {
  const attempts = events
    .map(event => ({ event, payload: parseAttempt(event.payload) }))
    .filter((attempt): attempt is { event: CvConfirmationTraceEvent; payload: TPayload } => Boolean(attempt.payload));
  const latestAttempt = [...attempts].sort((left, right) => {
    const sequenceDifference = (right.payload.attempt || 0) - (left.payload.attempt || 0);
    return sequenceDifference || right.event.occurredAt.getTime() - left.event.occurredAt.getTime();
  })[0] || null;
  const latestProviderEmailId = latestAttempt?.event.providerEmailId || null;
  const relevantEvents = latestAttempt
    ? events
      .filter(event => event === latestAttempt.event || Boolean(latestProviderEmailId && event.providerEmailId === latestProviderEmailId))
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    : [];
  const latest = relevantEvents[0] || null;
  const latestPayload = latest ? parseAttempt(latest.payload) : null;
  return {
    eventType: latest?.eventType || null,
    occurredAt: latest?.occurredAt || null,
    failureCode: latestPayload?.failureCode || null,
    attempts: attempts.length,
    providerEmailId: latest?.providerEmailId || null,
  };
}

/** Resolve only the application-confirmation chain, excluding campaigns and manual emails. */
export function resolveCvConfirmationDelivery(events: CvConfirmationTraceEvent[]) {
  return resolveLatestAttempt(events, parseConfirmationAttempt);
}

/** The confirmation email also contains the signed portal invitation link. */
export function resolveCandidatePortalInvitationDelivery(events: CvConfirmationTraceEvent[]) {
  return resolveLatestAttempt(events, parseCandidatePortalInvitationAttempt);
}

/** Resolve the verification-email chain separately from the initial portal invitation. */
export function resolveCandidatePortalActivationDelivery(events: CvConfirmationTraceEvent[]) {
  return resolveLatestAttempt(events, parseCandidatePortalActivationAttempt);
}

export function candidatePortalAccountMatchesApplication(
  account: { linkedApplicationId: number | null; email: string; emailVerifiedAt: Date | null },
  application: { id: number; email: string },
) {
  if (!account.emailVerifiedAt) return false;
  if (account.linkedApplicationId === application.id) return true;
  return account.email.trim().toLowerCase() === application.email.trim().toLowerCase();
}

export function buildCandidatePortalInvitationEmailEvent(
  input: { applicationId: number; candidateEmail: string; trackingId: string; deliveryAttempt?: number },
  delivery: { status: "sent" | "failed"; providerEmailId: string | null; failureCode: "provider_rejected" | "delivery_exception" | null },
  options: { now?: Date; localEventId?: string } = {},
) {
  return {
    providerEventId: delivery.providerEmailId
      ? `send:${delivery.providerEmailId}`
      : `local:${options.localEventId || randomUUID()}`,
    providerEmailId: delivery.providerEmailId,
    campaignRecipientId: null,
    applicationId: input.applicationId,
    eventType: delivery.status === "sent" ? "email.sent" : "email.failed",
    recipientEmail: input.candidateEmail.trim().toLowerCase(),
    payload: JSON.stringify({
      kind: "candidate_portal_invitation",
      outcome: delivery.status,
      failureCode: delivery.failureCode,
      trackingId: input.trackingId,
      attempt: input.deliveryAttempt,
    }),
    occurredAt: options.now || new Date(),
  };
}

export function buildCandidatePortalActivationEmailEvent(
  input: { applicationId: number; candidateEmail: string; trackingId: string },
  delivery: { status: "sent" | "failed"; providerEmailId: string | null; failureCode: "provider_rejected" | "delivery_exception" | null },
  options: { now?: Date; localEventId?: string } = {},
) {
  return {
    providerEventId: delivery.providerEmailId
      ? `send:${delivery.providerEmailId}`
      : `local:${options.localEventId || randomUUID()}`,
    providerEmailId: delivery.providerEmailId,
    campaignRecipientId: null,
    applicationId: input.applicationId,
    eventType: delivery.status === "sent" ? "email.sent" : "email.failed",
    recipientEmail: input.candidateEmail.trim().toLowerCase(),
    payload: JSON.stringify({
      kind: "candidate_portal_activation",
      outcome: delivery.status,
      failureCode: delivery.failureCode,
      trackingId: input.trackingId,
    }),
    occurredAt: options.now || new Date(),
  };
}

export function cvConfirmationRetryDelayMs(attempts: number) {
  return [0, 5 * 60_000, 60 * 60_000, 24 * 60 * 60_000][Math.min(Math.max(attempts, 0), 3)];
}

export function canRetryCvConfirmation(
  delivery: ReturnType<typeof resolveCvConfirmationDelivery>,
  now = new Date(),
) {
  if (delivery.eventType !== "email.failed" || delivery.attempts >= MAX_CONFIRMATION_ATTEMPTS || !delivery.occurredAt) return false;
  return delivery.occurredAt.getTime() + cvConfirmationRetryDelayMs(delivery.attempts) <= now.getTime();
}

export function buildCvConfirmationEmailEvent(
  input: Pick<TrackedCvConfirmationInput, "applicationId" | "candidateEmail" | "trackingId" | "deliveryAttempt">,
  delivery: CvApplicationConfirmationDelivery,
  options: { now?: Date; localEventId?: string } = {},
) {
  return {
    providerEventId: delivery.providerEmailId
      ? `send:${delivery.providerEmailId}`
      : `local:${options.localEventId || randomUUID()}`,
    providerEmailId: delivery.providerEmailId,
    campaignRecipientId: null,
    applicationId: input.applicationId,
    eventType: delivery.status === "sent" ? "email.sent" : "email.failed",
    recipientEmail: input.candidateEmail.trim().toLowerCase(),
    payload: JSON.stringify({
      kind: "application_confirmation",
      outcome: delivery.status,
      failureCode: delivery.failureCode,
      trackingId: input.trackingId,
      attempt: input.deliveryAttempt,
    }),
    occurredAt: options.now || new Date(),
  };
}

export async function sendTrackedCvApplicationConfirmationEmail(
  input: TrackedCvConfirmationInput,
): Promise<CvApplicationConfirmationDelivery> {
  const delivery = await sendCvApplicationConfirmationEmail(
    input.candidateEmail,
    input.candidateName,
    input.trackingId,
    input.specialty,
    input.targetCountries,
    input.candidatePortalInviteUrl,
    `cv-application-confirmation-${input.trackingId}-attempt-${input.deliveryAttempt || 1}`,
  );

  try {
    const db = await getDb();
    if (db) {
      await db.insert(recruitmentEmailEvents).values(buildCvConfirmationEmailEvent(input, delivery));
    }
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error("Recruitment confirmation trace error:", errorName);
  }

  return delivery;
}

async function loadConfirmationEvents(applicationId: number): Promise<CvConfirmationTraceEvent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db.select({
    eventType: recruitmentEmailEvents.eventType,
    providerEmailId: recruitmentEmailEvents.providerEmailId,
    payload: recruitmentEmailEvents.payload,
    occurredAt: recruitmentEmailEvents.occurredAt,
  }).from(recruitmentEmailEvents)
    .where(eq(recruitmentEmailEvents.applicationId, applicationId))
    .orderBy(desc(recruitmentEmailEvents.occurredAt));
}

type RecruitmentDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function buildFailedConfirmationRetryCandidateQuery(db: RecruitmentDb) {
  const confirmationAttempts = alias(recruitmentEmailEvents, "confirmation_attempt_events");
  const linkedConfirmationAttempt = db.select({ id: confirmationAttempts.id })
    .from(confirmationAttempts)
    .where(and(
      eq(confirmationAttempts.applicationId, recruitmentEmailEvents.applicationId),
      eq(confirmationAttempts.providerEmailId, recruitmentEmailEvents.providerEmailId),
      like(confirmationAttempts.payload, CONFIRMATION_PAYLOAD_PATTERN),
    ));
  return db.select({ applicationId: recruitmentEmailEvents.applicationId })
    .from(recruitmentEmailEvents)
    .where(and(
      eq(recruitmentEmailEvents.eventType, "email.failed"),
      isNotNull(recruitmentEmailEvents.applicationId),
      or(
        like(recruitmentEmailEvents.payload, CONFIRMATION_PAYLOAD_PATTERN),
        exists(linkedConfirmationAttempt),
      ),
    ))
    .orderBy(desc(recruitmentEmailEvents.occurredAt))
    .limit(100);
}

export async function retryCvConfirmationEmail(
  applicationId: number,
  options: { requireDue?: boolean; now?: Date; allowUntracked?: boolean } = {},
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [application] = await db.select({
    id: cvApplications.id,
    firstName: cvApplications.firstName,
    lastName: cvApplications.lastName,
    email: cvApplications.email,
    trackingId: cvApplications.trackingId,
    specialty: cvApplications.specialty,
    targetCountries: cvApplications.targetCountries,
  }).from(cvApplications).where(eq(cvApplications.id, applicationId)).limit(1);
  if (!application) return { outcome: "not_found" as const, attempted: false };

  const current = resolveCvConfirmationDelivery(await loadConfirmationEvents(applicationId));
  if (current.eventType === "email.sent" || current.eventType === "email.delivered") {
    return { outcome: "already_sent" as const, attempted: false, current };
  }
  if (current.eventType && TERMINAL_DELIVERY_EVENTS.has(current.eventType)) {
    return { outcome: "blocked" as const, attempted: false, current };
  }
  const maySendUntracked = !current.eventType && options.allowUntracked;
  if (current.eventType !== "email.failed" && !maySendUntracked) {
    return { outcome: "untracked" as const, attempted: false, current };
  }
  if (current.eventType === "email.failed" && current.attempts >= MAX_CONFIRMATION_ATTEMPTS) {
    return { outcome: "exhausted" as const, attempted: false, current };
  }
  if (current.eventType === "email.failed" && options.requireDue && !canRetryCvConfirmation(current, options.now)) {
    return { outcome: "not_due" as const, attempted: false, current };
  }

  let targetCountries = "Non précisé";
  try {
    const parsed = JSON.parse(application.targetCountries);
    if (Array.isArray(parsed)) targetCountries = parsed.filter(value => typeof value === "string").join(", ") || targetCountries;
  } catch {
    // Keep a neutral fallback; malformed legacy metadata must not block delivery.
  }
  const publicOrigin = process.env.PUBLIC_APP_ORIGIN?.trim() || "https://drahmedbenlallahom.com";
  const delivery = await sendTrackedCvApplicationConfirmationEmail({
    applicationId: application.id,
    candidateEmail: application.email,
    candidateName: `${application.firstName} ${application.lastName}`,
    trackingId: application.trackingId,
    specialty: application.specialty,
    targetCountries,
    candidatePortalInviteUrl: `${publicOrigin}/candidate/access?invite=${encodeURIComponent(createCandidateInvitationToken(application.id))}`,
    // Reuse attempt 1 for an untracked submission so Resend can deduplicate a
    // previous, unrecorded request during its idempotency window.
    deliveryAttempt: current.eventType === "email.failed" ? current.attempts + 1 : 1,
  });
  return { outcome: delivery.status, attempted: true, delivery };
}

/** Durable cron retry based on the existing email-event ledger; no candidate data is copied. */
export async function retryDueFailedCvConfirmationEmails(limit = 3, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const failedEvents = await buildFailedConfirmationRetryCandidateQuery(db);
  const applicationIds = Array.from(new Set(failedEvents.map(event => event.applicationId).filter((value): value is number => typeof value === "number")));
  const results = [];
  for (const applicationId of applicationIds) {
    if (results.filter(result => result.attempted).length >= Math.min(Math.max(limit, 1), 5)) break;
    results.push(await retryCvConfirmationEmail(applicationId, { requireDue: true, now }));
  }
  const failed = results.filter(result => result.outcome === "failed").length;
  const exhausted = results.filter(result => result.outcome === "exhausted").length;
  if (failed || exhausted) console.warn("[RecruitmentConfirmation] unresolved delivery failures", { failed, exhausted });
  return { processed: results.filter(result => result.attempted).length, failed, exhausted };
}
