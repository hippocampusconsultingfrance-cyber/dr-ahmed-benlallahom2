import { and, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
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

/** `reminderSent`: 0 to send, 2 reserved by a run that is sending it, 1 sent. */
const REMINDER_RESERVED = 2;
/** A reservation older than this was left by a run that stopped (a run sends each email within seconds). */
export const REMINDER_RESERVATION_STALE_MS = 15 * 60 * 1000;
/**
 * Resend keeps the reminder's idempotency key 24 hours: a reservation is
 * taken back only while a reminder it may have sent would be recognised, so
 * the patient never gets it twice.
 */
export const REMINDER_RESERVATION_RETAKE_LIMIT_MS = 23 * HOUR_MS;

/**
 * Sends the reminders of the confirmed appointments in the window. Each one is
 * reserved before its email (the hourly Heartbeat and the daily cron never both
 * send it) and marked sent after (DATA-02). A reservation a stopped run left
 * behind, without its email recorded as sent, is taken back by a later run,
 * under the same idempotency key; `onlyReserved` takes back those alone.
 */
export async function sendDueAppointmentReminders(window: ReminderWindow, now = new Date(), options: { onlyReserved?: boolean } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const { from, to } = reminderWindowBounds(window, now);
  const staleReservation = and(
    eq(appointments.reminderSent, REMINDER_RESERVED),
    lt(appointments.updatedAt, new Date(now.getTime() - REMINDER_RESERVATION_STALE_MS)),
    gt(appointments.updatedAt, new Date(now.getTime() - REMINDER_RESERVATION_RETAKE_LIMIT_MS)),
  );

  const upcoming = await db.select().from(appointments).where(
    and(
      eq(appointments.paymentStatus, "completed"),
      eq(appointments.appointmentStatus, "confirmed"),
      options.onlyReserved ? staleReservation : or(eq(appointments.reminderSent, 0), staleReservation),
      gte(appointments.appointmentDate, from),
      lte(appointments.appointmentDate, to)
    )
  );

  console.log(`[Reminder] Found ${upcoming.length} appointments to remind`);

  const { sendReminderEmail } = await import("./_core/notifications");
  let sent = 0;
  let failed = 0;
  for (const apt of upcoming) {
    // Reserve before sending, dated by updatedAt: a concurrent run that
    // reserved it first (or took it back just now) wins.
    const claim = await db.update(appointments)
      .set({ reminderSent: REMINDER_RESERVED, updatedAt: now })
      .where(and(eq(appointments.id, apt.id), apt.reminderSent === 0 ? eq(appointments.reminderSent, 0) : staleReservation));
    if (mutationRowCount(claim) !== 1) continue;
    try {
      await sendReminderEmail(apt.customerEmail, apt.customerName, apt.trackingId, apt.appointmentDate, { language: emailLanguageFor(apt.language) });
    } catch (e) {
      failed += 1;
      console.error("[Reminder] Delivery failed:", safeErrorName(e));
      await db.update(appointments).set({ reminderSent: 0 }).where(and(eq(appointments.id, apt.id), eq(appointments.reminderSent, REMINDER_RESERVED)))
        .catch(releaseError => console.error("[Reminder] Claim release failed:", safeErrorName(releaseError)));
      continue;
    }
    sent += 1;
    console.log("[Reminder] Sent successfully");
    // Left reserved if this fails: a later run takes it back under the same key.
    await db.update(appointments).set({ reminderSent: 1 }).where(and(eq(appointments.id, apt.id), eq(appointments.reminderSent, REMINDER_RESERVED)))
      .catch(markError => console.error("[Reminder] Sent reminder not recorded:", safeErrorName(markError)));
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
  // DATA-02: this job runs half a day after the reminder run, still within
  // the key's 24 hours: it takes back the reminders a stopped run left reserved.
  const reminderRecovery = await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, new Date(), { onlyReserved: true }).catch(error => {
    console.error("[Reminder] Recovery of reserved reminders failed:", safeErrorName(error));
    return null;
  });
  return { recovery, processed, results: batches.flatMap(batch => batch.results), reminderRecovery };
}

export async function runCandidateDocumentProcessingWorker(options: { batchSize: number; maxBatches: number; budgetMs: number }) {
  const { processDueCandidateDocumentAnalysisJobs, recreateMissingCandidateDocumentAnalysisJobs } = await import("./candidateDocumentProcessing");
  // DATA-02: a document whose upload stopped before its job gets it first.
  const { recreated } = await recreateMissingCandidateDocumentAnalysisJobs();
  const { processed, batches } = await drainInBatches(() => processDueCandidateDocumentAnalysisJobs(options.batchSize), options);
  return {
    jobsRecreated: recreated,
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
  const recentAlerts = await db.select({ id: securityEvents.id, category: securityEvents.category, metadata: securityEvents.metadata }).from(securityEvents).where(and(gte(securityEvents.createdAt, since), sql`${securityEvents.severity} IN ('high', 'critical')`));
  // ABUS-03: a used-up Resend quota is named, not only counted among the events.
  const quotaEvents = recentAlerts.filter(event => event.category === "resend_quota_exceeded");
  const busyPublicForms = await publicFormsAboveDailyThreshold(db, since);
  const pending = await ownerActionsPending();
  const findings = [
    ...(recentAlerts.length > 0 ? [`${recentAlerts.length} événement(s) de sécurité à gravité élevée ont été détectés sur les dernières 24 heures. Consultez le journal administrateur.`] : []),
    ...(quotaEvents.length > 0 ? [`Quota Resend épuisé (${resendQuotaLabel(quotaEvents)}) : ${quotaEvents.length} email(s) refusé(s) faute de quota sur les dernières 24 heures. Tant que le quota reste épuisé, aucun email ne part : codes de connexion administrateur, emails aux patients après paiement, alertes. Vérifiez la limite de votre offre dans Resend.`] : []),
    ...busyPublicForms.map(kind => `Seuil quotidien dépassé pour les ${PUBLIC_FORM_VOLUME_LABELS[kind]} : plus de ${PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS[kind]} enregistrements sur les dernières 24 heures. Vérifiez dans l’administration qu’il ne s’agit pas d’envois automatisés.`),
    ...(pending.googleDriveReconnectRequired ? ["Google Drive à reconnecter : Google refuse l’autorisation utilisée pour copier les CV, les copies sont suspendues. Onglet Candidatures, bouton « Reconnexion Google Drive requise » ; les copies repartiront après la reconnexion."] : []),
    ...(pending.cvAnalysesAwaitingAiCredit > 0 ? [`Analyse IA des CV indisponible (facturation du fournisseur) : ${pending.cvAnalysesAwaitingAiCredit >= AWAITING_AI_CREDIT_CAP ? "au moins " : ""}${pending.cvAnalysesAwaitingAiCredit} dossier(s) attendent leur analyse. Rétablissez le moyen de paiement ou le crédit dans Vercel > AI Gateway, puis cliquez sur « Mettre à jour / reprendre l’IA » dans l’onglet Candidatures.`] : []),
  ];
  if (findings.length > 0) await notifyOwner({ title: "Bilan quotidien de sécurité", content: findings.join("\n\n") });
  return { available: true as const, highSeverityEvents24h: recentAlerts.length, resendQuotaEvents24h: quotaEvents.length, busyPublicForms, ...pending };
}

function resendQuotaLabel(events: Array<{ metadata: string | null }>) {
  const quotas = new Set<string>(events.map(event => {
    try {
      return (JSON.parse(event.metadata ?? "{}") as { quota?: unknown }).quota === "monthly" ? "mensuel" : "quotidien";
    } catch {
      return "quotidien";
    }
  }));
  return ["quotidien", "mensuel"].filter(quota => quotas.has(quota)).join(" et ");
}

const AWAITING_AI_CREDIT_CAP = 1_000;

/**
 * States the owner has to fix, reported every day while they last: their
 * single alert email may have been lost (Resend down or out of quota at that
 * moment). A check that fails leaves the rest of the review unchanged.
 */
async function ownerActionsPending() {
  const unavailable = <T>(fallback: T) => (error: unknown) => {
    console.error("[SecurityReview] Pending-action check failed:", safeErrorName(error));
    return fallback;
  };
  const [googleDriveReconnectRequired, cvAnalysesAwaitingAiCredit] = await Promise.all([
    import("./googleDriveExport").then(({ googleDriveReconnectionRequired }) => googleDriveReconnectionRequired()).catch(unavailable(false)),
    import("./recruitmentProcessing").then(({ countCvAnalysesAwaitingAiCredit }) => countCvAnalysesAwaitingAiCredit(AWAITING_AI_CREDIT_CAP)).catch(unavailable(0)),
  ]);
  return { googleDriveReconnectRequired, cvAnalysesAwaitingAiCredit };
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
