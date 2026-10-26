import { and, eq, gte, inArray, lt, lte, or } from "drizzle-orm";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import {
  sendConfirmationEmail,
  sendCustomerConfirmationSMS,
  sendInvoiceEmail,
  sendOwnerNotificationEmail,
} from "./_core/notifications";
import { notifyOwner } from "./_core/notification";
import { emailLanguageFor } from "./emailLanguage";
import { generateInvoicePDF } from "./invoice";
import { allocateAppointmentInvoice } from "./invoiceNumbering";

const MAX_BATCH = 5;
/** Well above the 60 s function limit: a job still "running" after this was interrupted. */
export const APPOINTMENT_FULFILLMENT_STALE_AFTER_MS = 15 * 60_000;

/**
 * Pause between two jobs of a batch (ABUS-03): the owner notification, the
 * confirmation and the invoice of one payment would otherwise reach Resend in
 * the same second, above its per-second rate limit. Mutable for tests.
 */
export const appointmentFulfillmentPacing = { delayMs: 600 };

/**
 * Independent jobs, processed in this order: the owner learns about the paid
 * booking first, even when the patient email or the invoice fails.
 */
export const APPOINTMENT_FULFILLMENT_JOB_TYPES = ["owner", "confirmation", "invoice"] as const;
type FulfillmentJobType = (typeof APPOINTMENT_FULFILLMENT_JOB_TYPES)[number];

const JOB_LABELS: Record<FulfillmentJobType, string> = {
  owner: "de votre notification de nouvelle réservation",
  confirmation: "de la confirmation au patient",
  invoice: "de la facture au patient",
};

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type FulfillmentJob = typeof appointmentFulfillmentJobs.$inferSelect;
type Appointment = typeof appointments.$inferSelect;

function queueJob(db: Database, appointmentId: number, jobType: FulfillmentJobType) {
  return db.insert(appointmentFulfillmentJobs).values({
    appointmentId,
    jobType,
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    scheduledFor: new Date(),
  }).onConflictDoUpdate({
    target: [appointmentFulfillmentJobs.appointmentId, appointmentFulfillmentJobs.jobType],
    set: { updatedAt: new Date() },
  });
}

export async function enqueueAppointmentFulfillment(appointmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  for (const jobType of APPOINTMENT_FULFILLMENT_JOB_TYPES) {
    try {
      await queueJob(db, appointmentId, jobType);
    } catch (error) {
      // The owner job is the newest type: if it cannot be stored, the
      // confirmation job notifies the owner itself (see ensureOwnerNotification).
      // Patient jobs must be stored, or Stripe has to redeliver the event.
      if (jobType !== "owner") throw error;
      console.error("[AppointmentFulfillment] Owner notification job could not be queued; the confirmation job will notify the owner", error instanceof Error ? error.name : "UnknownError");
    }
  }
}

/**
 * Appointments paid before the owner job existed (or whose owner job could not
 * be stored) still get exactly one owner notification: queue the owner job if
 * it is missing, or send the notification inline when it cannot be queued.
 */
async function ensureOwnerNotification(db: Database, appointment: Appointment, finalPrice: number) {
  try {
    await db.insert(appointmentFulfillmentJobs).values({
      appointmentId: appointment.id,
      jobType: "owner",
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      scheduledFor: new Date(),
    }).onConflictDoNothing({ target: [appointmentFulfillmentJobs.appointmentId, appointmentFulfillmentJobs.jobType] });
  } catch {
    await sendOwnerNotificationEmail(appointment.customerName, appointment.customerEmail, appointment.customerPhone, appointment.trackingId, appointment.appointmentDate, finalPrice, { idempotencyKey: ownerNotificationKey(appointment), language: appointment.language })
      .catch(() => console.error("[AppointmentFulfillment] Inline owner notification failed"));
  }
}

function ownerNotificationKey(appointment: Pick<Appointment, "trackingId">) {
  return `appointment-owner-${appointment.trackingId}`;
}

function retryAt(attempt: number) {
  return new Date(Date.now() + Math.min(60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempt - 1)));
}

/**
 * Atomic claim shared by every caller (Stripe webhook, Vercel cron, Heartbeat):
 * only the worker whose conditional UPDATE matched the exact queued/retry state
 * and attempt count it read may send. A concurrent worker matches zero rows and
 * skips the job, so a confirmation or invoice is never sent twice in parallel.
 */
async function claimFulfillmentJob(db: Database, job: FulfillmentJob): Promise<boolean> {
  const startedAt = new Date();
  const result = await db.update(appointmentFulfillmentJobs).set({
    status: "running",
    attempts: job.attempts + 1,
    startedAt,
    finishedAt: null,
    updatedAt: startedAt,
  }).where(and(
    eq(appointmentFulfillmentJobs.id, job.id),
    inArray(appointmentFulfillmentJobs.status, ["queued", "retry"]),
    eq(appointmentFulfillmentJobs.attempts, job.attempts),
    lte(appointmentFulfillmentJobs.scheduledFor, startedAt),
  ));
  return mutationRowCount(result) === 1;
}

function patientContact(appointment: Appointment) {
  return `Patient : ${appointment.customerName} — ${appointment.customerEmail} — ${appointment.customerPhone}.`;
}

async function runJob(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [job] = await db.select().from(appointmentFulfillmentJobs).where(eq(appointmentFulfillmentJobs.id, id)).limit(1);
  if (!job || job.status !== "running") return { skipped: true };
  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, job.appointmentId)).limit(1);
  if (!appointment || appointment.paymentStatus !== "completed") {
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: new Date(), lastError: "appointment_not_paid_or_missing" }).where(eq(appointmentFulfillmentJobs.id, id));
    return { skipped: true };
  }
  const jobType = job.jobType as FulfillmentJobType;
  const finalPrice = Number(appointment.finalPrice);
  // A backlog drained late must not tell a patient that a consultation which
  // already took place is "confirmed". The owner job and the invoice still run.
  if (jobType === "confirmation" && appointment.appointmentDate.getTime() < Date.now()) {
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: new Date(), lastError: "appointment_already_past_confirmation_skipped" }).where(eq(appointmentFulfillmentJobs.id, id));
    await ensureOwnerNotification(db, appointment, finalPrice);
    if (appointment.emailSent !== 1) {
      await notifyOwner({
        title: `Confirmation non envoyée avant le rendez-vous (${appointment.trackingId})`,
        content: `Le rendez-vous payé ${appointment.trackingId} est passé avant que sa confirmation ait pu être envoyée au patient. Le paiement est bien enregistré ; vérifiez ce rendez-vous dans le tableau de bord et contactez le patient si nécessaire. ${patientContact(appointment)}`,
      }).catch(() => false);
    }
    return { skipped: true };
  }
  // Patient emails in French for a booking made in French, in English otherwise (EN-01).
  const language = emailLanguageFor(appointment.language);
  try {
    if (jobType === "owner") {
      await sendOwnerNotificationEmail(appointment.customerName, appointment.customerEmail, appointment.customerPhone, appointment.trackingId, appointment.appointmentDate, finalPrice, { idempotencyKey: ownerNotificationKey(appointment), language: appointment.language });
    } else if (jobType === "confirmation") {
      await ensureOwnerNotification(db, appointment, finalPrice);
      // The job is created at the payment confirmation: its creation time stamps
      // the attached .ics, identical on every retry (RES-05).
      await sendConfirmationEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, appointment.appointmentDate, finalPrice, undefined, { idempotencyKey: `appointment-confirmation-${appointment.trackingId}`, language, confirmedAt: job.createdAt ?? appointment.appointmentDate });
      const smsSent = await sendCustomerConfirmationSMS(appointment.customerPhone, appointment.trackingId, appointment.appointmentDate);
      await db.update(appointments).set({ emailSent: 1, smsSent: smsSent ? 1 : 0 }).where(eq(appointments.id, appointment.id));
    } else {
      // Numbered once per paid appointment; a retried job reuses the same
      // number, issue date and payment date. The job row is created by the
      // webhook right after the payment confirmation: its creation time is the
      // payment date.
      const invoiceRecord = await allocateAppointmentInvoice({ appointmentId: appointment.id, paidAt: job.createdAt ?? new Date() });
      const invoice = await generateInvoicePDF({
        invoiceNumber: invoiceRecord.invoiceNumber,
        issueDate: invoiceRecord.issuedAt,
        paymentDate: invoiceRecord.paidAt,
        trackingId: appointment.trackingId,
        customerName: appointment.customerName,
        customerEmail: appointment.customerEmail,
        customerPhone: appointment.customerPhone,
        appointmentDate: appointment.appointmentDate,
        consultationType: appointment.consultationType || "Conseil en santé",
        duration: appointment.duration || 30,
        basePrice: Number(appointment.basePrice),
        finalPrice,
        isNightRate: appointment.isNightRate === 1,
      });
      // The PDF stays in French whatever the language of the email (EN-01).
      await sendInvoiceEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, finalPrice, invoice.buffer, invoiceRecord.invoiceNumber, { idempotencyKey: `appointment-invoice-${invoiceRecord.invoiceNumber}`, language });
    }
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: new Date(), lastError: null }).where(eq(appointmentFulfillmentJobs.id, id));
    return { completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4000) : "fulfillment_unknown_error";
    const terminal = job.attempts >= job.maxAttempts;
    await db.update(appointmentFulfillmentJobs).set({ status: terminal ? "failed" : "retry", lastError: message, scheduledFor: retryAt(job.attempts), finishedAt: terminal ? new Date() : null }).where(eq(appointmentFulfillmentJobs.id, id));
    if (jobType === "owner") {
      // The owner alert would use the very channel that just failed.
      console.error("[AppointmentFulfillment] Owner notification failed", { trackingId: appointment.trackingId, terminal });
    } else if (job.attempts === 1 || terminal) {
      // Alert at the first failure (the next automatic attempt may only come
      // with the next scheduled run) and again when retries are exhausted.
      await notifyOwner({
        title: `Échec d’envoi après paiement (${appointment.trackingId})`,
        content: terminal
          ? `L’envoi ${JOB_LABELS[jobType]} du rendez-vous ${appointment.trackingId} a échoué ${job.attempts} fois. Le paiement est bien enregistré ; un envoi manuel au patient est nécessaire. ${patientContact(appointment)}`
          : `L’envoi ${JOB_LABELS[jobType]} du rendez-vous ${appointment.trackingId} vient d’échouer (tentative ${job.attempts} sur ${job.maxAttempts}). Le paiement est bien enregistré. Un nouvel essai automatique aura lieu lors de la prochaine exécution planifiée ; en attendant, vous pouvez contacter le patient. ${patientContact(appointment)}`,
      }, { idempotencyKey: `appointment-${jobType}-failure-${appointment.trackingId}-${terminal ? "final" : "first"}` }).catch(() => false);
    }
    return { completed: false, retry: !terminal };
  }
}

export async function processDueAppointmentFulfillmentJobs(limit = MAX_BATCH, options: { appointmentId?: number } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = new Date();
  const dueJobs = and(
    inArray(appointmentFulfillmentJobs.status, ["queued", "retry"]),
    lte(appointmentFulfillmentJobs.scheduledFor, now),
    lt(appointmentFulfillmentJobs.attempts, appointmentFulfillmentJobs.maxAttempts),
    ...(options.appointmentId === undefined ? [] : [eq(appointmentFulfillmentJobs.appointmentId, options.appointmentId)]),
  );
  const jobs = await db.select().from(appointmentFulfillmentJobs)
    .where(dueJobs)
    .orderBy(appointmentFulfillmentJobs.scheduledFor, appointmentFulfillmentJobs.id).limit(Math.min(Math.max(1, limit), MAX_BATCH));
  const results = [];
  for (const job of jobs) {
    if (results.length > 0) await new Promise(resolve => setTimeout(resolve, appointmentFulfillmentPacing.delayMs));
    if (!(await claimFulfillmentJob(db, job))) continue;
    results.push(await runJob(job.id));
  }
  return { processed: results.length, results };
}

/** Same claim/idempotency path as the scheduled worker, restricted to one appointment. */
export function processAppointmentFulfillmentNow(appointmentId: number) {
  return processDueAppointmentFulfillmentJobs(MAX_BATCH, { appointmentId });
}

/**
 * Requeues jobs whose worker was interrupted (function timeout, frozen instance
 * after the webhook answered Stripe). Exhausted jobs are closed as failed.
 */
export async function recoverStaleAppointmentFulfillmentJobs(staleAfterMs = APPOINTMENT_FULFILLMENT_STALE_AFTER_MS, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const staleBefore = new Date(now.getTime() - staleAfterMs);
  const candidates = await db.select({
    id: appointmentFulfillmentJobs.id,
    status: appointmentFulfillmentJobs.status,
    attempts: appointmentFulfillmentJobs.attempts,
    maxAttempts: appointmentFulfillmentJobs.maxAttempts,
  }).from(appointmentFulfillmentJobs).where(or(
    and(eq(appointmentFulfillmentJobs.status, "running"), lte(appointmentFulfillmentJobs.startedAt, staleBefore)),
    and(inArray(appointmentFulfillmentJobs.status, ["queued", "retry"]), gte(appointmentFulfillmentJobs.attempts, appointmentFulfillmentJobs.maxAttempts)),
  )).orderBy(appointmentFulfillmentJobs.id).limit(25);

  let recovered = 0;
  let exhausted = 0;
  for (const candidate of candidates) {
    const terminal = candidate.attempts >= candidate.maxAttempts;
    const result = await db.update(appointmentFulfillmentJobs).set({
      status: terminal ? "failed" : "retry",
      scheduledFor: now,
      startedAt: null,
      finishedAt: terminal ? now : null,
      lastError: terminal ? "worker_interrupted_attempts_exhausted" : "worker_interrupted",
      updatedAt: now,
    }).where(and(
      eq(appointmentFulfillmentJobs.id, candidate.id),
      eq(appointmentFulfillmentJobs.status, candidate.status),
      eq(appointmentFulfillmentJobs.attempts, candidate.attempts),
      ...(candidate.status === "running" ? [lte(appointmentFulfillmentJobs.startedAt, staleBefore)] : []),
    ));
    if (mutationRowCount(result) !== 1) continue;
    if (terminal) exhausted += 1;
    else recovered += 1;
  }
  if (exhausted > 0) {
    await notifyOwner({
      title: "Envois post-paiement interrompus",
      content: `${exhausted} envoi(s) après paiement (notification de réservation, confirmation ou facture) ont été interrompus après le nombre maximal de tentatives. Vérifiez dans le tableau de bord les rendez-vous payés sans confirmation et effectuez un envoi manuel si nécessaire.`,
    }).catch(() => false);
  }
  return { recovered, exhausted };
}
