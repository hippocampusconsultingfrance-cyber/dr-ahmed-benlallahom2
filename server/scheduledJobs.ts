import { and, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { appointments, candidateAccounts, candidateSecurityRateLimits, contactMessages, cvApplications, gdprRequests, medicalQuestions, securityEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { emailLanguageFor } from "./emailLanguage";
import { notifyOwner } from "./_core/notification";
import { PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS, PUBLIC_FORM_VOLUME_LABELS, type PublicFormVolumeKind } from "./publicFormRateLimit";

const HOUR_MS = 60 * 60 * 1000;

export type ReminderWindow = { fromMs: number; toMs: number };

/** Hourly Heartbeat (POST): appointments 22–26 h ahead, as originally designed. */
export const HOURLY_REMINDER_WINDOW: ReminderWindow = { fromMs: 22 * HOUR_MS, toMs: 26 * HOUR_MS };

/**
 * Daily Vercel cron (GET): 29 h of lookahead for a job that runs every ~24 h
 * (Hobby crons may fire anywhere within their hour), so each confirmed
 * appointment falls into at least one run; `reminderSent` keeps it to one email.
 */
export const DAILY_REMINDER_WINDOW: ReminderWindow = { fromMs: 1 * HOUR_MS, toMs: 30 * HOUR_MS };

function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

export function reminderWindowBounds(window: ReminderWindow, now = new Date()) {
  return { from: new Date(now.getTime() + window.fromMs), to: new Date(now.getTime() + window.toMs) };
}

export async function sendDueAppointmentReminders(window: ReminderWindow, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const { from, to } = reminderWindowBounds(window, now);

  const upcoming = await db.select().from(appointments).where(
    and(
      eq(appointments.paymentStatus, "completed"),
      eq(appointments.appointmentStatus, "confirmed"),
      eq(appointments.reminderSent, 0),
      gte(appointments.appointmentDate, from),
      lte(appointments.appointmentDate, to)
    )
  );

  console.log(`[Reminder] Found ${upcoming.length} appointments to remind`);

  const { sendReminderEmail } = await import("./_core/notifications");
  let sent = 0;
  let failed = 0;
  for (const apt of upcoming) {
    // Claim before sending so the hourly Heartbeat and the daily cron can never
    // both email the same patient; a failed delivery releases the claim for a retry.
    const claim = await db.update(appointments)
      .set({ reminderSent: 1 })
      .where(and(eq(appointments.id, apt.id), eq(appointments.reminderSent, 0)));
    if (mutationRowCount(claim) !== 1) continue;
    try {
      await sendReminderEmail(apt.customerEmail, apt.customerName, apt.trackingId, apt.appointmentDate, { language: emailLanguageFor(apt.language) });
      sent += 1;
      console.log("[Reminder] Sent successfully");
    } catch (e) {
      failed += 1;
      console.error("[Reminder] Delivery failed:", safeErrorName(e));
      await db.update(appointments).set({ reminderSent: 0 }).where(eq(appointments.id, apt.id))
        .catch(releaseError => console.error("[Reminder] Claim release failed:", safeErrorName(releaseError)));
    }
  }

  return { reminded: upcoming.length, sent, failed };
}

/**
 * Runs successive small batches until nothing is left or the time budget is
 * spent, so a once-a-day cron can drain a backlog without hitting the 60 s
 * function limit.
 */
export async function drainInBatches<T extends { processed: number }>(
  runBatch: () => Promise<T>,
  options: { maxBatches: number; budgetMs: number },
) {
  const startedAt = Date.now();
  const batches: T[] = [];
  for (let index = 0; index < options.maxBatches; index++) {
    const batch = await runBatch();
    batches.push(batch);
    if (batch.processed === 0 || Date.now() - startedAt >= options.budgetMs) break;
  }
  return { processed: batches.reduce((total, batch) => total + batch.processed, 0), batches };
}

export async function runAppointmentFulfillmentWorker(options: { batchSize: number; maxBatches: number; budgetMs: number }) {
  const { processDueAppointmentFulfillmentJobs, recoverStaleAppointmentFulfillmentJobs } = await import("./appointmentFulfillment");
  const recovery = await recoverStaleAppointmentFulfillmentJobs();
  const { processed, batches } = await drainInBatches(() => processDueAppointmentFulfillmentJobs(options.batchSize), options);
  return { recovery, processed, results: batches.flatMap(batch => batch.results) };
}

export async function runCandidateDocumentProcessingWorker(options: { batchSize: number; maxBatches: number; budgetMs: number }) {
  const { processDueCandidateDocumentAnalysisJobs } = await import("./candidateDocumentProcessing");
  const { processed, batches } = await drainInBatches(() => processDueCandidateDocumentAnalysisJobs(options.batchSize), options);
  return {
    processed,
    completed: batches.reduce((total, batch) => total + batch.completed, 0),
    retried: batches.reduce((total, batch) => total + batch.retried, 0),
    needsReview: batches.reduce((total, batch) => total + batch.needsReview, 0),
  };
}

export async function runSecurityPostureReview(now = new Date()) {
  const db = await getDb();
  if (!db) return { available: false as const };
  const cleanupBefore = new Date(now.getTime() - 48 * HOUR_MS);
  // Every rate-limit window is at most 24 h, and a longer owner-alert slot stays
  // blocked while it lasts: rows idle for 48 h and not currently blocked
  // (including never-blocked rows, whose blockedUntil is NULL) are inert.
  await db.delete(candidateSecurityRateLimits).where(and(
    lt(candidateSecurityRateLimits.lastAttemptAt, cleanupBefore),
    or(isNull(candidateSecurityRateLimits.blockedUntil), lt(candidateSecurityRateLimits.blockedUntil, now)),
  ));
  const since = new Date(now.getTime() - 24 * HOUR_MS);
  const recentAlerts = await db.select({ id: securityEvents.id }).from(securityEvents).where(and(gte(securityEvents.createdAt, since), sql`${securityEvents.severity} IN ('high', 'critical')`));
  const busyPublicForms = await publicFormsAboveDailyThreshold(db, since);
  const findings = [
    ...(recentAlerts.length > 0 ? [`${recentAlerts.length} événement(s) de sécurité à gravité élevée ont été détectés sur les dernières 24 heures. Consultez le journal administrateur.`] : []),
    ...busyPublicForms.map(kind => `Seuil quotidien dépassé pour les ${PUBLIC_FORM_VOLUME_LABELS[kind]} : plus de ${PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS[kind]} enregistrements sur les dernières 24 heures. Vérifiez dans l’administration qu’il ne s’agit pas d’envois automatisés.`),
  ];
  if (findings.length > 0) await notifyOwner({ title: "Bilan quotidien de sécurité", content: findings.join("\n\n") });
  return { available: true as const, highSeverityEvents24h: recentAlerts.length, busyPublicForms };
}

/**
 * ABUS-01: public forms whose accepted requests of the last 24 hours exceed
 * their daily threshold (counted up to the threshold + 1 only).
 */
async function publicFormsAboveDailyThreshold(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, since: Date) {
  const recent = {
    contact: () => db.select({ id: contactMessages.id }).from(contactMessages).where(gte(contactMessages.createdAt, since)),
    gdpr: () => db.select({ id: gdprRequests.id }).from(gdprRequests).where(gte(gdprRequests.createdAt, since)),
    medicalQuestion: () => db.select({ id: medicalQuestions.id }).from(medicalQuestions).where(gte(medicalQuestions.createdAt, since)),
    recruitmentApply: () => db.select({ id: cvApplications.id }).from(cvApplications).where(gte(cvApplications.createdAt, since)),
    candidateRegister: () => db.select({ id: candidateAccounts.id }).from(candidateAccounts).where(gte(candidateAccounts.createdAt, since)),
  } satisfies Record<PublicFormVolumeKind, unknown>;
  const busy: PublicFormVolumeKind[] = [];
  for (const kind of Object.keys(recent) as PublicFormVolumeKind[]) {
    const threshold = PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS[kind];
    const rows = await recent[kind]().limit(threshold + 1);
    if (rows.length > threshold) busy.push(kind);
  }
  return busy;
}
