import { and, eq, gte, inArray, lt, lte, or } from "drizzle-orm";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import {
  postPaymentEmailFailureCode,
  sendConfirmationEmail,
  sendCustomerConfirmationSMS,
  sendInvoiceEmail,
  sendOwnerNotificationEmail,
  sendRefundConfirmationEmail,
} from "./_core/notifications";
import { notifyOwner } from "./_core/notification";
import { emailLanguageFor } from "./emailLanguage";
import { generateInvoicePDF, renderInvoicePDF, type InvoiceData } from "./invoice";
import { allocateAppointmentInvoice, findAppointmentInvoices, type AppointmentInvoiceRecord } from "./invoiceNumbering";

const MAX_BATCH = 5;
/** Well above the 60 s function limit: a job still "running" after this was interrupted. */
export const APPOINTMENT_FULFILLMENT_STALE_AFTER_MS = 15 * 60_000;

/**
 * Pause between two jobs (ABUS-03): the owner notification, the confirmation
 * and the invoice of one payment would otherwise reach Resend in the same
 * second, above its per-second rate limit. Measured from the last job run in
 * this instance, so it also holds between the successive batches of the
 * scheduled run. Mutable for tests.
 */
export const appointmentFulfillmentPacing = { delayMs: 600 };
let lastJobRunAt: number | null = null;

async function paceFulfillmentJob() {
  if (lastJobRunAt === null) return;
  const waitMs = Math.min(appointmentFulfillmentPacing.delayMs, lastJobRunAt + appointmentFulfillmentPacing.delayMs - Date.now());
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
}

/**
 * Attempts per job (EXPL-02). With the daily scheduled run, the six retries
 * after the first attempt span about six days: a provider outage of a day or
 * two no longer loses the confirmation or the invoice.
 */
export const APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS = 7;
/**
 * Wait after the 1st, 2nd… failed attempt: about 57 h in all on a worker that
 * runs often, so a two-day outage is covered there too. Each stays under a
 * day, so the daily run always finds the job due.
 */
export const APPOINTMENT_FULFILLMENT_RETRY_DELAYS_MS = [10 * 60_000, 60 * 60_000, 4 * 3_600_000, 12 * 3_600_000, 20 * 3_600_000, 20 * 3_600_000] as const;

/**
 * Independent jobs, processed in this order: the owner learns about the paid
 * booking first, even when the patient email or the invoice fails.
 */
export const APPOINTMENT_FULFILLMENT_JOB_TYPES = ["owner", "confirmation", "invoice"] as const;
/**
 * Notices of a full refund that reached the site only through Stripe's
 * charge.refunded (RES-06), in this order: the patient email, then the owner
 * alert, which says whether the patient was told. Same queue, attempts and
 * dashboard as the post-payment emails, for a refunded appointment.
 */
export const STRIPE_REFUND_NOTICE_JOB_TYPES = ["refund", "refund_owner"] as const;
type PostPaymentJobType = (typeof APPOINTMENT_FULFILLMENT_JOB_TYPES)[number];
type RefundNoticeJobType = (typeof STRIPE_REFUND_NOTICE_JOB_TYPES)[number];
type FulfillmentJobType = PostPaymentJobType | RefundNoticeJobType;
const JOB_ORDER: readonly FulfillmentJobType[] = [...APPOINTMENT_FULFILLMENT_JOB_TYPES, ...STRIPE_REFUND_NOTICE_JOB_TYPES];

function isRefundNoticeJob(jobType: string): jobType is RefundNoticeJobType {
  return (STRIPE_REFUND_NOTICE_JOB_TYPES as readonly string[]).includes(jobType);
}

/** Payment status an appointment must have for a job to be sent: paid, or refunded for the refund notices. */
function jobPaymentStatus(jobType: string) {
  return isRefundNoticeJob(jobType) ? "refunded" : "completed";
}

const JOB_LABELS: Record<FulfillmentJobType, string> = {
  owner: "de votre notification de nouvelle réservation",
  confirmation: "de la confirmation au patient",
  invoice: "de la facture au patient",
  refund: "de l’email de remboursement au patient",
  refund_owner: "de votre alerte de remboursement",
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
    maxAttempts: APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS,
    scheduledFor: new Date(),
  }).onConflictDoUpdate({
    target: [appointmentFulfillmentJobs.appointmentId, appointmentFulfillmentJobs.jobType],
    set: { updatedAt: new Date() },
  });
}

/** Queues the notices of a refund recorded from Stripe's notification (RES-06); idempotent. */
export async function enqueueStripeRefundNotices(appointmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  for (const jobType of STRIPE_REFUND_NOTICE_JOB_TYPES) await queueJob(db, appointmentId, jobType);
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
      maxAttempts: APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS,
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
  const delays = APPOINTMENT_FULFILLMENT_RETRY_DELAYS_MS;
  return new Date(Date.now() + delays[Math.min(Math.max(1, attempt), delays.length) - 1]);
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

/**
 * Invoice of a paid appointment from its recorded number and dates: the job
 * that emails it and the dashboard download build the same PDF (EXPL-02).
 */
function appointmentInvoiceData(appointment: Appointment, invoiceRecord: AppointmentInvoiceRecord): InvoiceData {
  return {
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
    finalPrice: Number(appointment.finalPrice),
    isNightRate: appointment.isNightRate === 1,
  };
}

function patientContact(appointment: Appointment) {
  return `Patient : ${appointment.customerName} — ${appointment.customerEmail} — ${appointment.customerPhone}.`;
}

async function runJob(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [job] = await db.select().from(appointmentFulfillmentJobs).where(eq(appointmentFulfillmentJobs.id, id)).limit(1);
  if (!job || job.status !== "running") return { skipped: true };
  const jobType = job.jobType as FulfillmentJobType;
  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, job.appointmentId)).limit(1);
  // Loaded only for the refund notices (the webhook module queues the post-payment jobs).
  const stripeRefund = isRefundNoticeJob(jobType) ? await import("./appointmentPaymentWebhook") : null;
  const refundOf = stripeRefund && appointment ? stripeRefund.stripeRecordedRefundOf(appointment) : null;
  // A refund closes the post-payment jobs still waiting; the refund notices
  // only go out for a refund recorded from Stripe's notification.
  if (!appointment || appointment.paymentStatus !== jobPaymentStatus(jobType) || (stripeRefund && !refundOf)) {
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: new Date(), lastError: stripeRefund ? "appointment_not_refunded_from_stripe_or_missing" : "appointment_not_paid_or_missing" }).where(eq(appointmentFulfillmentJobs.id, id));
    return { skipped: true };
  }
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
    } else if (jobType === "refund") {
      // Same key as the dashboard refund: the patient is told once.
      const sent = await sendRefundConfirmationEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, appointment.appointmentDate, appointment.refundAmount ?? appointment.finalPrice, { context: refundOf === "paid" ? "refund" : "unconfirmed_payment", idempotencyKey: `appointment-refund-${appointment.trackingId}`, language });
      if (!sent) throw new Error("refund_email_failed");
    } else if (jobType === "refund_owner") {
      // Queued after the patient email: says whether it went out.
      const [patientJob] = await db.select({ status: appointmentFulfillmentJobs.status, lastError: appointmentFulfillmentJobs.lastError }).from(appointmentFulfillmentJobs)
        .where(and(eq(appointmentFulfillmentJobs.appointmentId, appointment.id), eq(appointmentFulfillmentJobs.jobType, "refund"))).limit(1);
      const patientNotified = patientJob?.status === "completed" && !patientJob.lastError;
      const delivered = await notifyOwner(stripeRefund!.buildStripeRefundAlert({
        trackingId: appointment.trackingId,
        refundAmount: appointment.refundAmount ?? appointment.finalPrice,
        paymentIntentId: appointment.stripePaymentIntentId ?? "non communiqué",
        effect: refundOf === "unconfirmed" ? "unconfirmed_payment" : appointment.appointmentStatus === "cancelled" ? "cancelled" : "status_kept",
        appointmentStatus: appointment.appointmentStatus,
        patientNotified,
      }), {
        // Written at each attempt: one key per wording (status, patient told or
        // not), as Resend refuses a key reused with another content (409).
        idempotencyKey: `appointment-stripe-refund-${appointment.trackingId}-${appointment.appointmentStatus}-${patientNotified ? "notified" : "pending"}`,
      }).catch(() => false);
      if (!delivered) throw new Error("owner_refund_alert_failed");
    } else {
      // Numbered once per paid appointment; a retried job reuses the same
      // number, issue date and payment date. The job row is created by the
      // webhook right after the payment confirmation: its creation time is the
      // payment date.
      const invoiceRecord = await allocateAppointmentInvoice({ appointmentId: appointment.id, paidAt: job.createdAt ?? new Date() });
      const invoice = await generateInvoicePDF(appointmentInvoiceData(appointment, invoiceRecord));
      // The PDF stays in French whatever the language of the email (EN-01).
      await sendInvoiceEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, finalPrice, invoice.buffer, invoiceRecord.invoiceNumber, { idempotencyKey: `appointment-invoice-${invoiceRecord.invoiceNumber}`, language });
    }
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: new Date(), lastError: null }).where(eq(appointmentFulfillmentJobs.id, id));
    return { completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4000) : "fulfillment_unknown_error";
    const terminal = job.attempts >= job.maxAttempts;
    await db.update(appointmentFulfillmentJobs).set({ status: terminal ? "failed" : "retry", lastError: message, scheduledFor: retryAt(job.attempts), finishedAt: terminal ? new Date() : null }).where(eq(appointmentFulfillmentJobs.id, id));
    if (jobType === "owner" || jobType === "refund_owner") {
      // The owner alert would use the very channel that just failed.
      console.error("[AppointmentFulfillment] Owner notification failed", { trackingId: appointment.trackingId, jobType, terminal });
    } else if (job.attempts === 1 || terminal) {
      // Alert at the first failure (the next automatic attempt may only come
      // with the next scheduled run) and again when retries are exhausted. A
      // refusal of this very email (address, content) is not passing: no new
      // attempt is promised for it.
      const refused = postPaymentEmailFailureCode(error) === "provider_rejected";
      const recorded = stripeRefund ? "Le remboursement est bien enregistré" : "Le paiement est bien enregistré";
      await notifyOwner({
        title: `Échec d’envoi après ${stripeRefund ? "remboursement" : "paiement"} (${appointment.trackingId})`,
        content: terminal
          ? `L’envoi ${JOB_LABELS[jobType]} du rendez-vous ${appointment.trackingId} a échoué ${job.attempts} fois. ${recorded} ; un envoi manuel au patient est nécessaire. ${patientContact(appointment)}`
          : refused
            ? `L’envoi ${JOB_LABELS[jobType]} du rendez-vous ${appointment.trackingId} a été refusé par le service d’envoi (adresse email du patient refusée ou invalide, ou configuration de l’envoi). ${recorded}. Ce refus n’est pas passager : vérifiez l’adresse du patient et contactez-le directement. ${patientContact(appointment)}`
            : `L’envoi ${JOB_LABELS[jobType]} du rendez-vous ${appointment.trackingId} vient d’échouer (tentative ${job.attempts} sur ${job.maxAttempts}). ${recorded}. Un nouvel essai automatique aura lieu lors de la prochaine exécution planifiée ; en attendant, vous pouvez contacter le patient. ${patientContact(appointment)}`,
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
    await paceFulfillmentJob();
    if (!(await claimFulfillmentJob(db, job))) continue;
    try {
      results.push(await runJob(job.id));
    } finally {
      lastJobRunAt = Date.now();
    }
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
      content: `${exhausted} envoi(s) après paiement ou remboursement (notification de réservation, confirmation, facture, email ou alerte de remboursement) ont été interrompus après le nombre maximal de tentatives. Vérifiez dans le tableau de bord les rendez-vous concernés (encart « À traiter ») et effectuez un envoi manuel si nécessaire.`,
    }).catch(() => false);
  }
  return { recovered, exhausted };
}

/**
 * What the dashboard shows for a job (EXPL-02): sent; failed for good;
 * failed and waiting for its next automatic attempt; not attempted yet; being
 * sent right now; interrupted (still "running" long after its worker stopped);
 * or deliberately not sent (consultation already past, appointment no longer
 * paid).
 */
export type AppointmentDeliveryState = "sent" | "failed" | "retrying" | "pending" | "sending" | "interrupted" | "not_sent";

const DELIVERY_STATES: Record<string, AppointmentDeliveryState> = { failed: "failed", retry: "retrying", queued: "pending", running: "sending" };

export type AppointmentDelivery = {
  jobType: FulfillmentJobType;
  state: AppointmentDeliveryState;
  attempts: number;
  maxAttempts: number;
  /** Next automatic attempt of a job waiting for a retry. */
  nextAttemptAt: Date | null;
  /** Why a job was deliberately not sent: consultation already past, or appointment no longer paid. */
  notSentReason: "appointment_past" | "not_paid" | null;
};

/** Same rule as recoverStaleAppointmentFulfillmentJobs: no worker runs that long. */
function isInterruptedJob(job: Pick<FulfillmentJob, "status" | "startedAt">, now: Date) {
  return job.status === "running" && job.startedAt !== null && job.startedAt.getTime() <= now.getTime() - APPOINTMENT_FULFILLMENT_STALE_AFTER_MS;
}

function deliveryOf(job: FulfillmentJob, now: Date): AppointmentDelivery {
  const state = job.status === "completed" ? job.lastError ? "not_sent" : "sent"
    : isInterruptedJob(job, now) ? "interrupted" : DELIVERY_STATES[job.status] ?? "pending";
  return {
    jobType: job.jobType as FulfillmentJobType,
    state,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    nextAttemptAt: job.status === "retry" ? job.scheduledFor : null,
    notSentReason: state !== "not_sent" ? null : job.lastError === "appointment_already_past_confirmation_skipped" ? "appointment_past" : "not_paid",
  };
}

/** Delivery state of the post-payment jobs of each appointment, in processing order. */
export async function getAppointmentDeliveries(appointmentIds: number[]): Promise<Map<number, AppointmentDelivery[]>> {
  const deliveries = new Map<number, AppointmentDelivery[]>();
  if (appointmentIds.length === 0) return deliveries;
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const jobs = await db.select().from(appointmentFulfillmentJobs).where(inArray(appointmentFulfillmentJobs.appointmentId, appointmentIds));
  const order = (jobType: string) => JOB_ORDER.indexOf(jobType as FulfillmentJobType);
  const now = new Date();
  for (const job of [...jobs].sort((a, b) => order(a.jobType) - order(b.jobType))) {
    deliveries.set(job.appointmentId, [...(deliveries.get(job.appointmentId) ?? []), deliveryOf(job, now)]);
  }
  return deliveries;
}

export type AppointmentFulfillmentRetry =
  | { outcome: "not_found" }
  | { outcome: "not_paid" }
  | { outcome: "retried"; requeued: number; requeuedJobTypes: FulfillmentJobType[]; deliveries: AppointmentDelivery[] };

/**
 * « Renvoyer » from the dashboard (EXPL-02): the jobs of a paid appointment
 * that did not go out (failed, waiting for their next attempt, or interrupted)
 * go back to the queue with a full attempt budget and run now, through the
 * same claim and idempotency keys as the scheduled worker. A job already sent,
 * or being sent right now, is left alone. For a refunded appointment, only the
 * notices of a refund recorded from Stripe (RES-06).
 */
export async function retryAppointmentFulfillment(trackingId: string): Promise<AppointmentFulfillmentRetry> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [appointment] = await db.select({ id: appointments.id, paymentStatus: appointments.paymentStatus, cancellationReason: appointments.cancellationReason })
    .from(appointments).where(eq(appointments.trackingId, trackingId)).limit(1);
  if (!appointment) return { outcome: "not_found" };
  const stripeRefund = appointment.paymentStatus === "refunded" && (await import("./appointmentPaymentWebhook")).stripeRecordedRefundOf(appointment);
  if (appointment.paymentStatus !== "completed" && !stripeRefund) return { outcome: "not_paid" };
  const jobTypes = JOB_ORDER.filter(jobType => jobPaymentStatus(jobType) === appointment.paymentStatus);
  const now = new Date();
  const requeued = await db.update(appointmentFulfillmentJobs).set({
    status: "queued",
    attempts: 0,
    maxAttempts: APPOINTMENT_FULFILLMENT_MAX_ATTEMPTS,
    scheduledFor: now,
    startedAt: null,
    finishedAt: null,
    lastError: null,
    updatedAt: now,
  }).where(and(
    eq(appointmentFulfillmentJobs.appointmentId, appointment.id),
    inArray(appointmentFulfillmentJobs.jobType, jobTypes),
    or(
      inArray(appointmentFulfillmentJobs.status, ["queued", "retry", "failed"]),
      and(eq(appointmentFulfillmentJobs.status, "running"), lte(appointmentFulfillmentJobs.startedAt, new Date(now.getTime() - APPOINTMENT_FULFILLMENT_STALE_AFTER_MS))),
    ),
  )).returning({ jobType: appointmentFulfillmentJobs.jobType });
  if (requeued.length > 0) await processAppointmentFulfillmentNow(appointment.id);
  return {
    outcome: "retried",
    requeued: requeued.length,
    // What this retry sent or skipped, told apart from the jobs already sent before it.
    requeuedJobTypes: requeued.map(job => job.jobType as FulfillmentJobType),
    deliveries: (await getAppointmentDeliveries([appointment.id])).get(appointment.id) ?? [],
  };
}

/**
 * Refund of an appointment (dashboard or Stripe, EXPL-02): its post-payment
 * jobs still waiting for an attempt (queued, waiting for a retry, or
 * interrupted) are closed right away as not sent, as the next run would do
 * without sending anything, so the dashboard stops showing them as failed and
 * waiting for a retry. A job being sent right now is left to its worker, and
 * the notices of a refund made in Stripe (RES-06), which are meant for a
 * refunded appointment, are never closed here.
 */
export async function closeUnsentAppointmentFulfillment(appointmentId: number, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.update(appointmentFulfillmentJobs).set({
    status: "completed",
    finishedAt: now,
    lastError: "appointment_not_paid_or_missing",
    updatedAt: now,
  }).where(and(
    eq(appointmentFulfillmentJobs.appointmentId, appointmentId),
    inArray(appointmentFulfillmentJobs.jobType, [...APPOINTMENT_FULFILLMENT_JOB_TYPES]),
    or(
      inArray(appointmentFulfillmentJobs.status, ["queued", "retry"]),
      and(eq(appointmentFulfillmentJobs.status, "running"), lte(appointmentFulfillmentJobs.startedAt, new Date(now.getTime() - APPOINTMENT_FULFILLMENT_STALE_AFTER_MS))),
    ),
  ));
  return mutationRowCount(result);
}

/**
 * Paid appointments whose post-payment emails did not go out, oldest first:
 * the « À traiter » panel reads them from the database, not from an alert
 * email sent through the very channel that failed (EXPL-02). « failed »: the
 * attempts ran out. « retrying »: an attempt failed (or was interrupted) and
 * the next automatic one may only come with the next scheduled run, days
 * before the attempts run out. Refunded appointments too, for the notices of
 * a refund recorded from Stripe (RES-06).
 */
export async function listAppointmentDeliveriesToHandle(limit = 20, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  // No cap here: the failed post-payment jobs of refunded appointments stay
  // failed, and a cap applied before the payment filter would push the new
  // failures out.
  const candidates = await db.select({
    appointmentId: appointmentFulfillmentJobs.appointmentId,
    jobType: appointmentFulfillmentJobs.jobType,
    status: appointmentFulfillmentJobs.status,
    scheduledFor: appointmentFulfillmentJobs.scheduledFor,
  }).from(appointmentFulfillmentJobs)
    .where(or(
      inArray(appointmentFulfillmentJobs.status, ["failed", "retry"]),
      and(eq(appointmentFulfillmentJobs.status, "running"), lte(appointmentFulfillmentJobs.startedAt, new Date(now.getTime() - APPOINTMENT_FULFILLMENT_STALE_AFTER_MS))),
    ))
    .orderBy(appointmentFulfillmentJobs.updatedAt, appointmentFulfillmentJobs.id);
  const candidateIds = Array.from(new Set(candidates.map(job => job.appointmentId)));
  const handled = candidateIds.length === 0 ? [] : await db.select({ id: appointments.id, trackingId: appointments.trackingId, customerName: appointments.customerName, appointmentDate: appointments.appointmentDate, paymentStatus: appointments.paymentStatus })
    .from(appointments)
    .where(and(inArray(appointments.id, candidateIds), inArray(appointments.paymentStatus, ["completed", "refunded"])));
  const byId = new Map(handled.map(({ id, paymentStatus, ...appointment }) => [id, { appointment, paymentStatus }]));
  // A job still to send for its appointment's payment status: post-payment
  // emails of a paid appointment, refund notices of a refunded one.
  const jobs = candidates.filter(job => byId.get(job.appointmentId)?.paymentStatus === jobPaymentStatus(job.jobType));
  const failed = new Map<number, FulfillmentJobType[]>();
  // Earliest next automatic attempt; null when only interrupted jobs wait for the next scheduled run.
  const retrying = new Map<number, { jobTypes: FulfillmentJobType[]; nextAttemptAt: Date | null }>();
  for (const job of jobs) {
    const jobType = job.jobType as FulfillmentJobType;
    if (job.status === "failed") {
      failed.set(job.appointmentId, [...(failed.get(job.appointmentId) ?? []), jobType]);
      continue;
    }
    const previous = retrying.get(job.appointmentId);
    const nextAttemptAt = job.status === "retry" ? job.scheduledFor : null;
    retrying.set(job.appointmentId, {
      jobTypes: [...(previous?.jobTypes ?? []), jobType],
      nextAttemptAt: previous?.nextAttemptAt && (!nextAttemptAt || previous.nextAttemptAt < nextAttemptAt) ? previous.nextAttemptAt : nextAttemptAt,
    });
  }
  const page = <T>(items: T[]) => ({ total: items.length, items: items.slice(0, limit) });
  return {
    failed: page(Array.from(failed.entries()).map(([appointmentId, jobTypes]) => ({ ...byId.get(appointmentId)!.appointment, jobTypes }))),
    retrying: page(Array.from(retrying.entries()).map(([appointmentId, delivery]) => ({ ...byId.get(appointmentId)!.appointment, ...delivery }))),
  };
}

/**
 * « Télécharger la facture » (EXPL-02): the invoice already issued for this
 * appointment, rebuilt from its recorded number and dates, identical to the
 * PDF emailed to the patient. Never allocates a number: null when no invoice
 * was issued yet.
 */
export async function regenerateAppointmentInvoice(trackingId: string): Promise<{ invoiceNumber: string; buffer: Buffer } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [appointment] = await db.select().from(appointments).where(eq(appointments.trackingId, trackingId)).limit(1);
  if (!appointment) return null;
  const invoiceRecord = (await findAppointmentInvoices([appointment.id])).get(appointment.id);
  if (!invoiceRecord) return null;
  return { invoiceNumber: invoiceRecord.invoiceNumber, buffer: await renderInvoicePDF(appointmentInvoiceData(appointment, invoiceRecord)) };
}
