import { and, eq, gt, gte, inArray, isNull, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { appointmentFulfillmentJobs, appointments, candidateAccounts, candidateDocumentProcessingJobs, candidateDocuments, candidateSecurityRateLimits, candidateSessions, contactMessages, cvApplications, cvGoogleDriveExportJobs, cvProcessingJobs, gdprRequests, medicalQuestions, securityEvents } from "../drizzle/schema";
import { CANDIDATE_DOCUMENT_ACTIVE_JOB_STATUSES } from "../shared/candidateDocumentReanalysis";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { emailLanguageFor } from "./emailLanguage";
import { logError } from "./_core/logError";
import { notifyOwner } from "./_core/notification";
import { runWithProcessingDeadline } from "./processingDeadline";
import { PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS, PUBLIC_FORM_VOLUME_LABELS, type PublicFormVolumeKind } from "./publicFormRateLimit";

const HOUR_MS = 60 * 60 * 1000;

export type ReminderWindow = { fromMs: number; toMs: number };

/**
 * Daily Vercel cron (GET): 29 h of lookahead for a job that runs every ~24 h
 * (Hobby crons may fire anywhere within their hour), so each confirmed
 * appointment falls into at least one run; `reminderSent` keeps it to one email.
 */
export const DAILY_REMINDER_WINDOW: ReminderWindow = { fromMs: 1 * HOUR_MS, toMs: 30 * HOUR_MS };

/**
 * A booking made this recently has just received its confirmation (RES-12):
 * the daily run, at a fixed hour, would otherwise send its reminder right
 * after it. Read from the booking's creation, a few minutes before its
 * payment: no column dates the payment.
 */
export const REMINDER_MIN_BOOKING_AGE_MS = 12 * HOUR_MS;
/**
 * How far ahead the next daily run still reaches: Hobby crons fire anywhere
 * within their hour, so it comes at most 25 h later, and looks from 1 h ahead.
 */
const NEXT_DAILY_RUN_REACH_MS = 25 * HOUR_MS + DAILY_REMINDER_WINDOW.fromMs;

/**
 * Whether this run leaves out the reminder of a booking whose patient has just
 * received the confirmation (RES-12): the confirmation, sent within the
 * reminder's window before the consultation, stands for it (booked the day
 * before); or the next daily run still has the consultation in its window
 * and sends it then, away from the confirmation. Any other booking keeps its
 * reminder in this run, the last one before its consultation.
 */
function confirmationStandsForReminder(apt: { createdAt: Date; appointmentDate: Date }, window: ReminderWindow, now: Date) {
  if (now.getTime() - apt.createdAt.getTime() >= REMINDER_MIN_BOOKING_AGE_MS) return false;
  return apt.appointmentDate.getTime() - apt.createdAt.getTime() < window.toMs
    || apt.appointmentDate.getTime() - now.getTime() >= NEXT_DAILY_RUN_REACH_MS;
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
 * the patient does not get it twice. The reservation is dated by updatedAt,
 * which a later change to the booking also moves (the patient's email
 * corrected from the dashboard): a reservation the stopped run left more than
 * 24 hours before can then still be taken back, and Resend no longer knows
 * the key. A column of its own would date it exactly (needs a migration).
 */
export const REMINDER_RESERVATION_RETAKE_LIMIT_MS = 23 * HOUR_MS;

/**
 * Sends the reminders of the confirmed appointments in the window. Each one is
 * reserved before its email (the hourly Heartbeat and the daily cron never both
 * send it) and marked sent after (DATA-02). A reservation a stopped run left
 * behind, without its email recorded as sent, is taken back by a later run,
 * under the same idempotency key; `onlyReserved` takes back those alone. A
 * booking whose patient has just received the confirmation gets its reminder
 * from a later run, or none when the confirmation stands for it (RES-12).
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

  const due = await db.select().from(appointments).where(
    and(
      eq(appointments.paymentStatus, "completed"),
      eq(appointments.appointmentStatus, "confirmed"),
      options.onlyReserved ? staleReservation : or(eq(appointments.reminderSent, 0), staleReservation),
      gte(appointments.appointmentDate, from),
      lte(appointments.appointmentDate, to)
    )
  );
  // A reservation left by a stopped run is taken back: that run chose to send it.
  const upcoming = due.filter(apt => apt.reminderSent !== 0 || !confirmationStandsForReminder(apt, window, now));

  console.log(`[Reminder] Found ${upcoming.length} appointments to remind`);

  const { sendReminderEmail } = await import("./_core/notifications");
  const { patientEmailIdempotencyKey } = await import("./appointmentFulfillment");
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
      // Keyed on the address as written, like the other patient emails: a reminder tried again after the
      // address was corrected (EXPL-02) leaves under a new key, which Resend does not refuse (409, ABUS-03).
      await sendReminderEmail(apt.customerEmail, apt.customerName, apt.trackingId, apt.appointmentDate, { language: emailLanguageFor(apt.language), idempotencyKey: patientEmailIdempotencyKey(`appointment-reminder-${apt.trackingId}`, apt.customerEmail) });
    } catch (e) {
      failed += 1;
      logError("[Reminder] Delivery failed", e);
      await db.update(appointments).set({ reminderSent: 0 }).where(and(eq(appointments.id, apt.id), eq(appointments.reminderSent, REMINDER_RESERVED)))
        .catch(releaseError => logError("[Reminder] Claim release failed", releaseError));
      continue;
    }
    sent += 1;
    console.log("[Reminder] Sent successfully");
    // Left reserved if this fails: a later run takes it back under the same key.
    await db.update(appointments).set({ reminderSent: 1 }).where(and(eq(appointments.id, apt.id), eq(appointments.reminderSent, REMINDER_RESERVED)))
      .catch(markError => logError("[Reminder] Sent reminder not recorded", markError));
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

/**
 * DATA-12: bookings created from this date on, and only those, get back the
 * post-payment jobs they lack (requeuePaidAppointmentsWithoutFulfillment). An
 * older one is never replayed: the patient may have been written to another
 * way since; scripts/db-invariants.sql lists them for the owner.
 */
export const PAID_APPOINTMENT_JOB_RECOVERY_SINCE = new Date("2026-11-07T00:00:00Z");
/**
 * DATA-12: and only those created within this window. The retention run
 * deletes a completed post-payment job 30 days after it ends
 * (FULFILLMENT_JOB_RETENTION_DAYS): past that, a booking paid and served
 * normally has no job left, and would get its emails again. A booking of the
 * last week, paid after it was created, still has every job it got; Stripe
 * itself stops redelivering after 3 days.
 */
export const PAID_APPOINTMENT_JOB_RECOVERY_WINDOW_MS = 7 * 24 * HOUR_MS;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Paid, confirmed bookings created since the recovery went live, within its window (and before `createdBefore`), without a confirmation or invoice job. */
function paidAppointmentsWithoutFulfillment(db: Database, now: Date, createdBefore?: Date) {
  const appointmentsWithJob = (jobType: "confirmation" | "invoice") => db.select({ appointmentId: appointmentFulfillmentJobs.appointmentId })
    .from(appointmentFulfillmentJobs)
    .where(eq(appointmentFulfillmentJobs.jobType, jobType));
  const createdSince = Math.max(PAID_APPOINTMENT_JOB_RECOVERY_SINCE.getTime(), now.getTime() - PAID_APPOINTMENT_JOB_RECOVERY_WINDOW_MS);
  return db.select({ id: appointments.id }).from(appointments).where(and(
    eq(appointments.paymentStatus, "completed"),
    eq(appointments.appointmentStatus, "confirmed"),
    gte(appointments.createdAt, new Date(createdSince)),
    ...(createdBefore ? [lt(appointments.createdAt, createdBefore)] : []),
    or(notInArray(appointments.id, appointmentsWithJob("confirmation")), notInArray(appointments.id, appointmentsWithJob("invoice"))),
  ));
}

/**
 * DATA-12: a paid, confirmed booking of the last week whose confirmation or
 * invoice job was never stored (the database refused it once the payment
 * was recorded, and Stripe no longer redelivers the event) gets its jobs
 * back, through the webhook's own idempotent enqueue: a job already there is
 * kept as it is, so nothing is sent twice. The jobs run in the same pass.
 */
export async function requeuePaidAppointmentsWithoutFulfillment(limit = 25, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const missing = await paidAppointmentsWithoutFulfillment(db, now).orderBy(appointments.id).limit(limit);
  const { enqueueAppointmentFulfillment } = await import("./appointmentFulfillment");
  let requeued = 0;
  for (const appointment of missing) {
    try {
      await enqueueAppointmentFulfillment(appointment.id);
      requeued += 1;
    } catch (error) {
      logError("[AppointmentFulfillment] Missing post-payment jobs not queued", error);
    }
  }
  return { requeued };
}

export async function runAppointmentFulfillmentWorker(options: { batchSize: number; maxBatches: number; budgetMs: number }) {
  const { processDueAppointmentFulfillmentJobs, recoverStaleAppointmentFulfillmentJobs } = await import("./appointmentFulfillment");
  const recovery = await recoverStaleAppointmentFulfillmentJobs();
  // A failure here leaves the jobs already queued to their run.
  const missingJobs = await requeuePaidAppointmentsWithoutFulfillment().catch(error => {
    logError("[AppointmentFulfillment] Recovery of paid bookings without jobs failed", error);
    return null;
  });
  const { processed, batches } = await drainInBatches(() => processDueAppointmentFulfillmentJobs(options.batchSize), options);
  // DATA-02: this job runs half a day after the reminder run, still within
  // the key's 24 hours: it takes back the reminders a stopped run left reserved.
  const reminderRecovery = await sendDueAppointmentReminders(DAILY_REMINDER_WINDOW, new Date(), { onlyReserved: true }).catch(error => {
    logError("[Reminder] Recovery of reserved reminders failed", error);
    return null;
  });
  return { recovery, missingJobs, processed, results: batches.flatMap(batch => batch.results), reminderRecovery };
}

/**
 * End of the vault documents' analyses, from the start of their cron (EXPL-12):
 * the 60 s function limit, less the last writes and the monitor's ping (3 s).
 * Each slow step, the AI requests included, is cut to the time left.
 */
export const CANDIDATE_DOCUMENT_PROCESSING_DEADLINE_MS = 50_000;

export async function runCandidateDocumentProcessingWorker(options: { batchSize: number; maxBatches: number; budgetMs: number }) {
  const startedAt = Date.now();
  const { processDueCandidateDocumentAnalysisJobs, recoverStaleCandidateDocumentJobs, recreateMissingCandidateDocumentAnalysisJobs } = await import("./candidateDocumentProcessing");
  // EXPL-12: a job a stopped run left "running" goes back to the queue first;
  // a failure here leaves the documents already queued to their analysis.
  const recovery = await recoverStaleCandidateDocumentJobs().catch(error => {
    logError("[CandidateDocumentProcessing] Interrupted job recovery failed", error);
    return { recovered: 0, exhausted: 0, closed: 0 };
  });
  // DATA-02: a document whose upload stopped before its job gets it first.
  const { recreated } = await recreateMissingCandidateDocumentAnalysisJobs().catch(error => {
    logError("[CandidateDocumentProcessing] Missing job recovery failed", error);
    return { recreated: 0 };
  });
  const { processed, batches } = await runWithProcessingDeadline(
    startedAt + CANDIDATE_DOCUMENT_PROCESSING_DEADLINE_MS,
    () => drainInBatches(() => processDueCandidateDocumentAnalysisJobs(options.batchSize), options),
  );
  return {
    jobsRecovered: recovery.recovered,
    jobsExhausted: recovery.exhausted,
    jobsClosed: recovery.closed,
    jobsRecreated: recreated,
    processed,
    completed: batches.reduce((total, batch) => total + batch.completed, 0),
    retried: batches.reduce((total, batch) => total + batch.retried, 0),
    needsReview: batches.reduce((total, batch) => total + batch.needsReview, 0),
    released: batches.reduce((total, batch) => total + batch.released, 0),
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
  const dataIntegrity = await dataIntegrityPending(db, now);
  const integrityFinding = dataIntegrityFinding(dataIntegrity);
  const findings = [
    ...(recentAlerts.length > 0 ? [`${recentAlerts.length} événement(s) de sécurité à gravité élevée ont été détectés sur les dernières 24 heures. Consultez le journal administrateur.`] : []),
    ...(quotaEvents.length > 0 ? [`Quota Resend épuisé (${resendQuotaLabel(quotaEvents)}) : ${quotaEvents.length} email(s) refusé(s) faute de quota sur les dernières 24 heures. Tant que le quota reste épuisé, aucun email ne part : codes de connexion administrateur, emails aux patients après paiement, alertes. Vérifiez la limite de votre offre dans Resend.`] : []),
    ...busyPublicForms.map(kind => `Seuil quotidien dépassé pour les ${PUBLIC_FORM_VOLUME_LABELS[kind]} : plus de ${PUBLIC_FORM_DAILY_VOLUME_THRESHOLDS[kind]} enregistrements sur les dernières 24 heures. Vérifiez dans l’administration qu’il ne s’agit pas d’envois automatisés.`),
    ...(pending.googleDriveReconnectRequired ? ["Google Drive à reconnecter : Google refuse l’autorisation utilisée pour copier les CV, les copies sont suspendues. Onglet Candidatures, bouton « Reconnexion Google Drive requise » ; les copies repartiront après la reconnexion."] : []),
    ...(pending.cvAnalysesAwaitingAiCredit > 0 ? [`Analyse IA des CV indisponible (facturation du fournisseur) : ${pending.cvAnalysesAwaitingAiCredit >= AWAITING_AI_CREDIT_CAP ? "au moins " : ""}${pending.cvAnalysesAwaitingAiCredit} dossier(s) attendent leur analyse. Rétablissez le moyen de paiement ou le crédit dans Vercel > AI Gateway, puis cliquez sur « Mettre à jour / reprendre l’IA » dans l’onglet Candidatures.`] : []),
    ...(integrityFinding ? [integrityFinding] : []),
  ];
  if (findings.length > 0) await notifyOwner({ title: "Bilan quotidien de sécurité", content: findings.join("\n\n") });
  return { available: true as const, highSeverityEvents24h: recentAlerts.length, resendQuotaEvents24h: quotaEvents.length, busyPublicForms, ...pending, dataIntegrity };
}

/** Each data-integrity count stops past this many (« au moins »). */
const DATA_INTEGRITY_CAP = 100;
/**
 * DATA-14: a state the scheduled runs repair by themselves (a missing or
 * interrupted job) is reported once a whole day of runs has gone by without
 * repairing it, never while a run may still be about to.
 */
const DATA_INTEGRITY_REPAIR_DELAY_MS = 48 * HOUR_MS;
const QUEUE_JOB_STATUSES = ["queued", "running", "retry", "completed", "failed"] as const;

type DataIntegrityCounts = Record<keyof typeof DATA_INTEGRITY_LABELS, number | null>;

const DATA_INTEGRITY_LABELS = {
  paidAppointmentsWithoutJobs: "rendez-vous payé(s) il y a 2 à 7 jours sans confirmation ou facture en file",
  documentsWithoutJob: "document(s) du coffre en attente d’analyse depuis plus de 2 jours sans tâche pour l’analyser",
  interruptedJobs: "tâche(s) restée(s) « en cours » depuis plus de 2 jours (paiements, CV, coffre, copies Drive)",
  jobsWithUnknownStatus: "tâche(s) dont le statut ne fait pas partie de la liste : aucun passage ne les traitera",
  sessionsOfClosedAccounts: "session(s) candidat encore ouverte(s) sur un compte fermé ou effacé",
  sessionsWithoutAccount: "session(s) candidat dont le compte n’existe plus",
} as const;

/**
 * DATA-14: the checks of scripts/db-invariants.sql that no normal state
 * triggers, reported every day while they last, like the owner's other
 * pending actions. Each count stops past DATA_INTEGRITY_CAP; a check that
 * fails is null, and the others are still reported.
 */
async function dataIntegrityPending(db: Database, now: Date): Promise<DataIntegrityCounts> {
  const repairedBefore = new Date(now.getTime() - DATA_INTEGRITY_REPAIR_DELAY_MS);
  const limit = DATA_INTEGRITY_CAP + 1;
  const counted = (check: string, queries: () => Array<PromiseLike<unknown[]>>) => Promise.all(queries())
    .then(results => Math.min(limit, results.reduce((total, rows) => total + rows.length, 0)))
    .catch(error => {
      logError(`[SecurityReview] Data integrity check ${check} failed`, error);
      return null;
    });
  const activeDocumentJobs = db.select({ documentId: candidateDocumentProcessingJobs.documentId }).from(candidateDocumentProcessingJobs)
    .where(inArray(candidateDocumentProcessingJobs.status, [...CANDIDATE_DOCUMENT_ACTIVE_JOB_STATUSES]));
  const [paidAppointmentsWithoutJobs, documentsWithoutJob, interruptedJobs, jobsWithUnknownStatus, sessionsOfClosedAccounts, sessionsWithoutAccount] = await Promise.all([
    counted("paid_appointments_without_jobs", () => [paidAppointmentsWithoutFulfillment(db, now, repairedBefore).limit(limit)]),
    counted("documents_without_job", () => [db.select({ id: candidateDocuments.id }).from(candidateDocuments).where(and(
      eq(candidateDocuments.analysisStatus, "queued"),
      inArray(candidateDocuments.status, ["uploaded", "validating"]),
      ne(candidateDocuments.validationStatus, "rejected"),
      lt(candidateDocuments.createdAt, repairedBefore),
      notInArray(candidateDocuments.id, activeDocumentJobs),
    )).limit(limit)]),
    // Each worker takes back the jobs a stopped run left "running" for 15 min.
    counted("interrupted_jobs", () => [
      db.select({ id: appointmentFulfillmentJobs.id }).from(appointmentFulfillmentJobs).where(and(eq(appointmentFulfillmentJobs.status, "running"), lt(appointmentFulfillmentJobs.startedAt, repairedBefore))).limit(limit),
      db.select({ id: cvProcessingJobs.id }).from(cvProcessingJobs).where(and(eq(cvProcessingJobs.status, "running"), lt(cvProcessingJobs.startedAt, repairedBefore))).limit(limit),
      db.select({ id: candidateDocumentProcessingJobs.id }).from(candidateDocumentProcessingJobs).where(and(eq(candidateDocumentProcessingJobs.status, "running"), lt(candidateDocumentProcessingJobs.startedAt, repairedBefore))).limit(limit),
      db.select({ id: cvGoogleDriveExportJobs.id }).from(cvGoogleDriveExportJobs).where(and(eq(cvGoogleDriveExportJobs.status, "running"), lt(cvGoogleDriveExportJobs.startedAt, repairedBefore))).limit(limit),
    ]),
    // A job put back by hand in SQL with a misspelt status ('queue', 'pending').
    counted("jobs_with_unknown_status", () => [
      db.select({ id: appointmentFulfillmentJobs.id }).from(appointmentFulfillmentJobs).where(notInArray(appointmentFulfillmentJobs.status, [...QUEUE_JOB_STATUSES])).limit(limit),
      db.select({ id: cvProcessingJobs.id }).from(cvProcessingJobs).where(notInArray(cvProcessingJobs.status, [...QUEUE_JOB_STATUSES])).limit(limit),
      db.select({ id: candidateDocumentProcessingJobs.id }).from(candidateDocumentProcessingJobs).where(notInArray(candidateDocumentProcessingJobs.status, [...QUEUE_JOB_STATUSES])).limit(limit),
      db.select({ id: cvGoogleDriveExportJobs.id }).from(cvGoogleDriveExportJobs).where(notInArray(cvGoogleDriveExportJobs.status, [...QUEUE_JOB_STATUSES])).limit(limit),
    ]),
    counted("sessions_of_closed_accounts", () => [db.select({ id: candidateSessions.id }).from(candidateSessions).where(and(
      isNull(candidateSessions.revokedAt),
      gt(candidateSessions.expiresAt, now),
      inArray(candidateSessions.candidateId, db.select({ id: candidateAccounts.id }).from(candidateAccounts).where(ne(candidateAccounts.status, "active"))),
    )).limit(limit)]),
    counted("sessions_without_account", () => [db.select({ id: candidateSessions.id }).from(candidateSessions)
      .where(notInArray(candidateSessions.candidateId, db.select({ id: candidateAccounts.id }).from(candidateAccounts))).limit(limit)]),
  ]);
  return { paidAppointmentsWithoutJobs, documentsWithoutJob, interruptedJobs, jobsWithUnknownStatus, sessionsOfClosedAccounts, sessionsWithoutAccount };
}

function dataIntegrityFinding(counts: DataIntegrityCounts) {
  const found = (Object.keys(DATA_INTEGRITY_LABELS) as Array<keyof DataIntegrityCounts>)
    .filter(check => (counts[check] ?? 0) > 0)
    .map(check => `${counts[check]! > DATA_INTEGRITY_CAP ? `au moins ${DATA_INTEGRITY_CAP}` : counts[check]} ${DATA_INTEGRITY_LABELS[check]}`);
  if (found.length === 0) return null;
  return `Contrôle de cohérence de la base : ${found.join(" ; ")}. Les passages automatiques ne les ont pas réparés : collez scripts/db-invariants.sql dans l’éditeur SQL de Neon pour les retrouver.`;
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
    logError("[SecurityReview] Pending-action check failed", error);
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
