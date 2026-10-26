import { createHash } from "node:crypto";
import { and, eq, gte, inArray, lt, lte, or } from "drizzle-orm";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import {
  postPaymentEmailRefused,
  sendConfirmationEmail,
  sendCustomerConfirmationSMS,
  sendInvoiceEmail,
  sendOwnerNotificationEmail,
  sendRefundConfirmationEmail,
} from "./_core/notifications";
import { notifyOwner } from "./_core/notification";
import { alertSendSlot, runWithSendSlot } from "./_core/resendDelivery";
import { emailLanguageFor } from "./emailLanguage";
import { archiveInvoicePDF, generateInvoicePDF, renderInvoicePDF, type InvoiceData } from "./invoice";
import { allocateAppointmentInvoice, findAppointmentInvoices, type AppointmentInvoiceRecord } from "./invoiceNumbering";
import { deadlineCutShort, ProcessingDeadlineError, runWithProcessingDeadline, startFitsDeadline } from "./processingDeadline";
import { hasErasedPatientData } from "./personalDataRetention";

const MAX_BATCH = 5;
/** Well above the 60 s function limit: a job still "running" after this was interrupted. */
export const APPOINTMENT_FULFILLMENT_STALE_AFTER_MS = 15 * 60_000;
/**
 * A job still waiting for its first attempt this long after it was due was not
 * sent right after the payment (immediate budget spent before its turn or
 * during its send, under a rate limit or an outage of Resend; processing
 * stopped before its turn): it is listed in « À traiter » (ABUS-03,
 * EXPL-02), as the next automatic attempt may only come with the next
 * scheduled run, without counting an attempt nor alerting the owner.
 */
export const APPOINTMENT_FULFILLMENT_WAITING_AFTER_MS = 5 * 60_000;

/**
 * Pause between two jobs (ABUS-03): the owner notification, the confirmation
 * and the invoice of one payment would otherwise reach Resend in the same
 * second, above its per-second rate limit. Measured from the last job run in
 * this instance, so it also holds between the successive batches of the
 * scheduled run. The jobs of this instance take their turn in one queue, a
 * pause after the start of the previous one, so processings running at once
 * (two webhooks, a webhook and the payment status page) are spaced as well.
 * A job holds its turn while it is claimed, at most claimTurnLimitMs: a
 * database request that does not answer no longer holds up the other
 * processings of the instance, the conditional claim still preventing any
 * duplicate. The same pause also separates the sends themselves (see
 * waitForSendSlot): an invoice leaves once its PDF is built, well after the
 * start of its job. Mutable for tests.
 */
export const appointmentFulfillmentPacing = { delayMs: 600, claimTurnLimitMs: 5_000 };
/** End of the last job run in this instance. */
let lastJobRunAt: number | null = null;
/** Start of the last job that took its turn. */
let lastJobStartAt: number | null = null;
/** Turn of the last job that queued; the next one waits for it. */
let lastJobTurn: Promise<void> = Promise.resolve();
/** Moment the last send of this instance left for Resend. */
let lastSendAt: number | null = null;
/** Slot of the last send that queued; the next one waits for it. */
let lastSendSlot: Promise<void> = Promise.resolve();
/** Sends waiting for their slot. */
let sendsWaiting = 0;

/**
 * Waits for this job's turn, then for the pause after the start of the
 * previous job and after the end of the last one. The turn is held until the
 * returned callback is called, once the job is claimed or found taken by
 * another worker: a job that sends nothing gives its pause back to the next.
 */
async function waitForFulfillmentTurn(): Promise<(claimed: boolean) => void> {
  const previousTurn = lastJobTurn;
  let endTurn!: () => void;
  lastJobTurn = new Promise<void>(resolve => { endTurn = resolve; });
  await previousTurn;
  const delayMs = appointmentFulfillmentPacing.delayMs;
  const now = Date.now();
  const readyAt = Math.max(lastJobStartAt === null ? now : lastJobStartAt + delayMs, lastJobRunAt === null ? now : lastJobRunAt + delayMs);
  // Never more than one pause, even with a clock set back (or stopped, in tests).
  const waitMs = Math.min(readyAt - now, delayMs);
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
  const previousStartAt = lastJobStartAt;
  const startAt = Date.now();
  lastJobStartAt = startAt;
  const turnLimit = setTimeout(endTurn, appointmentFulfillmentPacing.claimTurnLimitMs);
  return claimed => {
    clearTimeout(turnLimit);
    // Past the limit, a later job may have taken its turn: its start stays.
    if (!claimed && lastJobStartAt === startAt) lastJobStartAt = previousStartAt;
    endTurn();
  };
}

/**
 * Waits, right before a job's email leaves, for the pause after the previous
 * send of this instance (ABUS-03). The turn of a job spaces the starts of the
 * jobs; an invoice, sent once its PDF is built, could otherwise leave less than
 * a pause before the next job of another processing. The slot is taken in
 * order and released as soon as the send starts, so one waits at most one
 * pause. A send made again after Resend's retry-after or a short backoff
 * takes a new slot too (runWithSendSlot in processDueAppointmentFulfillmentJobs).
 */
async function waitForSendSlot(mayStart: () => boolean): Promise<boolean> {
  const previousSlot = lastSendSlot;
  let release!: () => void;
  lastSendSlot = new Promise<void>(resolve => { release = resolve; });
  sendsWaiting += 1;
  try {
    await previousSlot;
    const delayMs = appointmentFulfillmentPacing.delayMs;
    // Never more than one pause, even with a clock set back (or stopped, in tests).
    const waitMs = lastSendAt === null ? 0 : Math.min(lastSendAt + delayMs - Date.now(), delayMs);
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    // A send given up at its slot (budget spent) does not hold back the next one.
    if (!mayStart()) return false;
    lastSendAt = Date.now();
    return true;
  } finally {
    sendsWaiting -= 1;
    release();
  }
}

/**
 * Longest wait for a send slot asked now: the pause after the last send, then
 * one pause for each send already waiting for its slot, as each one waits at
 * most one pause after the one before (alertSendSlot).
 */
function longestSendSlotWaitMs() {
  const delayMs = appointmentFulfillmentPacing.delayMs;
  const afterLastSend = lastSendAt === null ? 0 : Math.max(0, Math.min(lastSendAt + delayMs - Date.now(), delayMs));
  return afterLastSend + sendsWaiting * delayMs;
}

/** The send slot of this instance, for the new tries of a job's emails and its owner alerts (runWithSendSlot). */
const SEND_SLOT = { wait: waitForSendSlot, longestWaitMs: longestSendSlotWaitMs };

/**
 * The send slot of a job's email (ABUS-03). Sent right after a payment, the
 * email starts only within the immediate budget, even though its job was
 * claimed in time: a send of another processing (a new try after Resend's
 * retry-after among them) may hold the slot until after the page or the
 * webhook has answered. Past the budget, the slot goes to the next send and
 * the job goes back to the queue, due, without counting the attempt (see
 * runJob), for the next processing or « Renvoyer ».
 */
async function waitForJobSendSlot() {
  if (!startFitsDeadline() || !(await waitForSendSlot(startFitsDeadline))) throw new ProcessingDeadlineError("send_slot");
}

/**
 * Immediate processing (Stripe webhook, payment status page) has a time
 * budget. A job's first wait for Resend (a retry-after, a short backoff) may
 * last until the end of that budget, so a passing rate limit is still retried
 * at once; the next ones only until the budget minus this reserve for each job
 * still to come. A job that would wait longer goes back to the queue, due,
 * without counting the attempt (see runJob). The owner notification, sent
 * first, can no longer use up the time of the patient's confirmation and
 * invoice under a lasting rate limit, and when all goes well it still goes
 * out first. The reserve covers the pause before a job and one send. Mutable
 * for tests.
 */
export const immediateFulfillmentBudget = { reservePerJobMs: 800 };

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
 * Notices of a full refund, in this order: the patient email, then the owner
 * alert, which says whether the patient was told. Both for a refund that
 * reached the site only through Stripe's charge.refunded (RES-06); the patient
 * email only for a refund made from the dashboard, the owner having made it.
 * Same queue, attempts and dashboard as the post-payment emails, for a
 * refunded appointment.
 */
export const STRIPE_REFUND_NOTICE_JOB_TYPES = ["refund", "refund_owner"] as const;
type PostPaymentJobType = (typeof APPOINTMENT_FULFILLMENT_JOB_TYPES)[number];
type RefundNoticeJobType = (typeof STRIPE_REFUND_NOTICE_JOB_TYPES)[number];
type FulfillmentJobType = PostPaymentJobType | RefundNoticeJobType;
const JOB_ORDER: readonly FulfillmentJobType[] = [...APPOINTMENT_FULFILLMENT_JOB_TYPES, ...STRIPE_REFUND_NOTICE_JOB_TYPES];

function isRefundNoticeJob(jobType: string): jobType is RefundNoticeJobType {
  return (STRIPE_REFUND_NOTICE_JOB_TYPES as readonly string[]).includes(jobType);
}

/** Jobs that write to the patient; the others alert the owner. */
const PATIENT_JOB_TYPES: readonly FulfillmentJobType[] = ["confirmation", "invoice", "refund"];

function isPatientJob(jobType: string) {
  return (PATIENT_JOB_TYPES as readonly string[]).includes(jobType);
}

/** Why a patient email was closed unsent: the booking's data was erased, no address is left (RGPD-12). */
const PATIENT_DATA_ERASED = "patient_data_erased";

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

/**
 * Patient email of a refund made from the dashboard (EXPL-02): queued like the
 * one of a refund made in Stripe (RES-06), with its attempts and its state on
 * the appointment and in « À traiter », then attempted right away through the
 * same claim, so it never leaves twice. The refund being done, it never
 * throws: the email's state after this attempt, null when it could not be
 * queued or read.
 */
export async function sendAppointmentRefundEmail(appointmentId: number): Promise<AppointmentDeliveryState | null> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    await queueJob(db, appointmentId, "refund");
    await processAppointmentFulfillmentNow(appointmentId);
    const deliveries = (await getAppointmentDeliveries([appointmentId])).get(appointmentId) ?? [];
    return deliveries.find(delivery => delivery.jobType === "refund")?.state ?? null;
  } catch (error) {
    console.error("[AppointmentFulfillment] Refund email could not be queued or sent", error instanceof Error ? error.name : "UnknownError");
    return null;
  }
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

/**
 * Idempotency key of an email to the patient: one per booking (or invoice) and
 * address. Every attempt to the same address reuses it, so the email never
 * leaves twice; once the address is corrected from the dashboard after a
 * refusal (EXPL-02), « Renvoyer » writes to the new one under a new key, which
 * Resend would otherwise refuse as reused with another content (409).
 */
export function patientEmailIdempotencyKey(key: string, customerEmail: string) {
  return `${key}-${createHash("sha256").update(customerEmail.trim().toLowerCase()).digest("hex").slice(0, 16)}`;
}

function retryAt(attempt: number) {
  const delays = APPOINTMENT_FULFILLMENT_RETRY_DELAYS_MS;
  return new Date(Date.now() + delays[Math.min(Math.max(1, attempt), delays.length) - 1]);
}

/** Start of the last error of a job ended at once because the email service refused its email (EXPL-02). */
const PROVIDER_REJECTED_ERROR = "provider_rejected:";

function isRefusedJob(job: Pick<FulfillmentJob, "status" | "lastError"> | undefined) {
  return job?.status === "failed" && Boolean(job.lastError?.startsWith(PROVIDER_REJECTED_ERROR));
}

/**
 * Whether the email service refused an email to the patient of this
 * appointment that « Renvoyer » sends again (confirmation and invoice of a
 * paid appointment, refund email of a refunded one): the only case in which
 * the dashboard corrects the patient's address (EXPL-02), as its card.
 */
export async function hasRefusedPatientEmail(appointment: Pick<Appointment, "id" | "paymentStatus">): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const jobs = await db.select({ jobType: appointmentFulfillmentJobs.jobType, status: appointmentFulfillmentJobs.status, lastError: appointmentFulfillmentJobs.lastError })
    .from(appointmentFulfillmentJobs)
    .where(and(eq(appointmentFulfillmentJobs.appointmentId, appointment.id), eq(appointmentFulfillmentJobs.status, "failed")));
  return jobs.some(job => isPatientJob(job.jobType) && jobPaymentStatus(job.jobType) === appointment.paymentStatus && isRefusedJob(job));
}

/**
 * The refund a refunded appointment's notices are about: recorded from
 * Stripe's notification (RES-06), for the patient email and the owner alert,
 * or made from the dashboard, for the patient email only. The patient email is
 * read from the appointment, the same at every attempt. Null for neither.
 */
async function refundNoticeOf(appointment: Pick<Appointment, "paymentStatus" | "cancellationReason">) {
  // Loaded only for the refund notices (the webhook module queues the post-payment jobs).
  const stripeRefundOf = (await import("./appointmentPaymentWebhook")).stripeRecordedRefundOf(appointment);
  if (stripeRefundOf) return { stripeRefundOf, email: { context: stripeRefundOf === "paid" ? "refund" as const : "unconfirmed_payment" as const } };
  const email = (await import("./appointmentAdminActions")).dashboardRefundEmailOf(appointment);
  return email ? { stripeRefundOf: null, email } : null;
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
 * that emails it and the dashboard download build the same PDF, and give the
 * copy stored at its issue once there is one (EXPL-02).
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
  const refundNotice = isRefundNoticeJob(jobType) && appointment ? await refundNoticeOf(appointment) : null;
  // A refund closes the post-payment jobs still waiting; the patient refund
  // email only goes out for a refund recorded from Stripe or the dashboard,
  // the owner refund alert for one recorded from Stripe.
  const refundNoticeMissing = jobType === "refund" ? !refundNotice : jobType === "refund_owner" && !refundNotice?.stripeRefundOf;
  if (!appointment || appointment.paymentStatus !== jobPaymentStatus(jobType) || refundNoticeMissing) {
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: new Date(), lastError: isRefundNoticeJob(jobType) ? "appointment_refund_not_recorded_or_missing" : "appointment_not_paid_or_missing" }).where(eq(appointmentFulfillmentJobs.id, id));
    return { skipped: true };
  }
  // RGPD-12: a booking reduced to its accounting record has no address left.
  // Its patient emails are closed unsent; the owner's still go out.
  if (isPatientJob(jobType) && hasErasedPatientData(appointment)) {
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: new Date(), lastError: PATIENT_DATA_ERASED }).where(eq(appointmentFulfillmentJobs.id, id));
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
      await waitForJobSendSlot();
      await sendOwnerNotificationEmail(appointment.customerName, appointment.customerEmail, appointment.customerPhone, appointment.trackingId, appointment.appointmentDate, finalPrice, { idempotencyKey: ownerNotificationKey(appointment), language: appointment.language });
    } else if (jobType === "confirmation") {
      await ensureOwnerNotification(db, appointment, finalPrice);
      await waitForJobSendSlot();
      // The job is created at the payment confirmation: its creation time stamps
      // the attached .ics, identical on every retry (RES-05).
      await sendConfirmationEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, appointment.appointmentDate, finalPrice, undefined, { idempotencyKey: patientEmailIdempotencyKey(`appointment-confirmation-${appointment.trackingId}`, appointment.customerEmail), language, confirmedAt: job.createdAt ?? appointment.appointmentDate });
      const smsSent = await sendCustomerConfirmationSMS(appointment.customerPhone, appointment.trackingId, appointment.appointmentDate);
      await db.update(appointments).set({ emailSent: 1, smsSent: smsSent ? 1 : 0 }).where(eq(appointments.id, appointment.id));
    } else if (jobType === "refund") {
      await waitForJobSendSlot();
      // One key whatever the refund's origin: the patient is told once. Its
      // failure carries its cause, so a refused address is told apart (RES-06).
      await sendRefundConfirmationEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, appointment.appointmentDate, appointment.refundAmount ?? appointment.finalPrice, { ...refundNotice!.email, idempotencyKey: patientEmailIdempotencyKey(`appointment-refund-${appointment.trackingId}`, appointment.customerEmail), language });
    } else if (jobType === "refund_owner") {
      // Queued after the patient email: says whether it went out.
      const [patientJob] = await db.select({ status: appointmentFulfillmentJobs.status, lastError: appointmentFulfillmentJobs.lastError }).from(appointmentFulfillmentJobs)
        .where(and(eq(appointmentFulfillmentJobs.appointmentId, appointment.id), eq(appointmentFulfillmentJobs.jobType, "refund"))).limit(1);
      const patientEmail = patientJob?.status === "completed" && !patientJob.lastError ? "sent" : isRefusedJob(patientJob) ? "refused" : "pending";
      const patientDataErased = hasErasedPatientData(appointment);
      const { buildStripeRefundAlert } = await import("./appointmentPaymentWebhook");
      await waitForJobSendSlot();
      const delivered = await notifyOwner(buildStripeRefundAlert({
        trackingId: appointment.trackingId,
        refundAmount: appointment.refundAmount ?? appointment.finalPrice,
        paymentIntentId: appointment.stripePaymentIntentId ?? "non communiqué",
        effect: refundNotice!.stripeRefundOf === "unconfirmed" ? "unconfirmed_payment" : appointment.appointmentStatus === "cancelled" ? "cancelled" : "status_kept",
        appointmentStatus: appointment.appointmentStatus,
        patientEmail,
        patientDataErased,
      }), {
        // Written at each attempt: one key per wording (status, patient told,
        // refused, not yet, or no longer reachable), as Resend refuses a key
        // reused with another content (409).
        idempotencyKey: `appointment-stripe-refund-${appointment.trackingId}-${appointment.appointmentStatus}-${patientDataErased ? "erased" : patientEmail === "sent" ? "notified" : patientEmail}`,
        // Not asked again after the immediate budget: the job goes back to the queue (ABUS-03).
        stopAtDeadline: true,
      }).catch(() => false);
      if (!delivered) throw new Error("owner_refund_alert_failed");
    } else {
      // Numbered once per paid appointment; a retried job reuses the same
      // number, issue date and payment date. The job row is created by the
      // webhook right after the payment confirmation: its creation time is the
      // payment date.
      const invoiceRecord = await allocateAppointmentInvoice({ appointmentId: appointment.id, paidAt: job.createdAt ?? new Date() });
      // At its first issue, built and sent even while the store cannot be
      // checked: no copy of a number just allocated can be stored (EXPL-02).
      const invoice = await generateInvoicePDF(appointmentInvoiceData(appointment, invoiceRecord), undefined, { issuedNow: invoiceRecord.issuedNow });
      // Its pause counts from here, once the PDF is built.
      await waitForJobSendSlot();
      // The PDF stays in French whatever the language of the email (EN-01).
      await sendInvoiceEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, finalPrice, invoice.buffer, invoiceRecord.invoiceNumber, { idempotencyKey: patientEmailIdempotencyKey(`appointment-invoice-${invoiceRecord.invoiceNumber}`, appointment.customerEmail), language });
    }
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: new Date(), lastError: null }).where(eq(appointmentFulfillmentJobs.id, id));
    return { completed: true };
  } catch (error) {
    if (deadlineCutShort()) {
      // Sent right after a payment, the job ran out of its time budget before
      // its send slot or its own retries (ABUS-03): neither the email nor the
      // provider failed for good. It goes back to the queue as it was, due,
      // without counting this attempt nor alerting the owner, for the next
      // processing (another webhook, the scheduled run). Still unsent a few
      // minutes later, it is listed in « À traiter »
      // (listAppointmentDeliveriesToHandle).
      await db.update(appointmentFulfillmentJobs).set({ status: job.attempts > 1 ? "retry" : "queued", attempts: job.attempts - 1, startedAt: null }).where(eq(appointmentFulfillmentJobs.id, id));
      console.warn("[AppointmentFulfillment] Immediate processing out of time; job left for the next run", { trackingId: appointment.trackingId, jobType });
      return { completed: false, retry: true, deadlineReached: true };
    }
    const message = error instanceof Error ? error.message.slice(0, 4000) : "fulfillment_unknown_error";
    // A refusal of this very email (address, content) does not pass with
    // time (EXPL-02): the job ends now, as refused, instead of failing again
    // at each automatic attempt; « Renvoyer » sends it again once the address
    // is corrected on the appointment (updateAppointmentCustomerEmailByAdmin).
    // A refused sending configuration (API key, sender domain)
    // stops every email until it is corrected: it keeps its automatic attempts.
    const refused = postPaymentEmailRefused(error);
    const terminal = refused || job.attempts >= job.maxAttempts;
    await db.update(appointmentFulfillmentJobs).set({ status: terminal ? "failed" : "retry", lastError: refused ? `${PROVIDER_REJECTED_ERROR}${message}` : message, scheduledFor: retryAt(job.attempts), finishedAt: terminal ? new Date() : null }).where(eq(appointmentFulfillmentJobs.id, id));
    if (jobType === "owner" || jobType === "refund_owner") {
      // The owner alert would use the very channel that just failed.
      console.error("[AppointmentFulfillment] Owner notification failed", { trackingId: appointment.trackingId, jobType, terminal });
    } else if (job.attempts === 1 || terminal) {
      // Alert at the first failure (the next automatic attempt may only come
      // with the next scheduled run), at a refusal, for which no new attempt
      // is promised, and when retries are exhausted. It takes its send slot,
      // a pause after the email that failed (ABUS-03).
      const recorded = isRefundNoticeJob(jobType) ? "Le remboursement est bien enregistré" : "Le paiement est bien enregistré";
      // The invoice storage, not the email service, is named when it kept the invoice from going out.
      const storage = failedOnInvoiceStorage(message);
      const cause = storage ? " : sa copie archivée dans le stockage des factures (Vercel Blob) n’a pas pu être vérifiée ou lue, et elle n’est pas refaite à sa place ; vérifiez dans Vercel que le stockage Blob est actif" : "";
      await alertSendSlot();
      await notifyOwner({
        title: `Échec d’envoi après ${isRefundNoticeJob(jobType) ? "remboursement" : "paiement"} (${appointment.trackingId})`,
        content: refused
          ? `L’envoi ${JOB_LABELS[jobType]} du rendez-vous ${appointment.trackingId} a été refusé par le service d’envoi (adresse email du patient refusée ou invalide, ou contenu de l’email refusé). ${recorded}. Ce refus n’est pas passager : vérifiez l’adresse du patient et contactez-le directement. Le site ne le renverra pas de lui-même : corrigez l’adresse sur le rendez-vous (onglet Réservations, « Corriger l’email du patient »), puis « Renvoyer » l’envoie à la nouvelle adresse. ${patientContact(appointment)}`
          : terminal
            ? `L’envoi ${JOB_LABELS[jobType]} du rendez-vous ${appointment.trackingId} a échoué ${job.attempts} fois${cause}. ${recorded} ; un envoi manuel au patient est nécessaire. ${patientContact(appointment)}`
            : `L’envoi ${JOB_LABELS[jobType]} du rendez-vous ${appointment.trackingId} vient d’échouer (tentative ${job.attempts} sur ${job.maxAttempts})${cause}. ${recorded}. Un nouvel essai automatique aura lieu lors de la prochaine exécution planifiée ; en attendant, vous pouvez contacter le patient. ${patientContact(appointment)}`,
      }, {
        // One key per wording: a refusal may follow a first failure of the same job.
        idempotencyKey: `appointment-${jobType}-failure-${appointment.trackingId}-${refused ? "refused" : terminal ? "final" : "first"}${storage ? "-storage" : ""}`,
      }).catch(() => false);
    }
    return { completed: false, retry: !terminal };
  }
}

/**
 * `deadlineAt`: end of the time budget of an immediate processing (see
 * immediateFulfillmentBudget); without it (scheduled run, « Renvoyer ») a job
 * waits for Resend as long as its own retries allow. Once that budget is
 * spent, no new job starts: the request it serves has answered, and work left
 * after the answer may be frozen with the function. The jobs not started stay
 * due, as they were, for the next processing.
 */
export async function processDueAppointmentFulfillmentJobs(limit = MAX_BATCH, options: { appointmentId?: number; deadlineAt?: number } = {}) {
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
  const { deadlineAt } = options;
  const budgetSpent = () => deadlineAt !== undefined && Date.now() >= deadlineAt;
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    if (budgetSpent()) break;
    const endTurn = await waitForFulfillmentTurn();
    if (budgetSpent()) {
      // Spent while waiting for the turn: the pause goes back to the next job.
      endTurn(false);
      break;
    }
    let claimed = false;
    try {
      claimed = await claimFulfillmentJob(db, job);
    } finally {
      endTurn(claimed);
    }
    if (!claimed) continue;
    // A send made again within the job (retry-after, short backoff) and its owner alerts take their slot as well.
    const run = () => runWithSendSlot(SEND_SLOT, () => runJob(job.id));
    try {
      results.push(await (deadlineAt === undefined
        ? run()
        : runWithProcessingDeadline(deadlineAt - (jobs.length - 1 - index) * immediateFulfillmentBudget.reservePerJobMs, run, Date.now, { firstPauseDeadlineAt: deadlineAt })));
    } finally {
      lastJobRunAt = Date.now();
    }
  }
  return { processed: results.length, results };
}

/**
 * Whether an email of this appointment has been due for at least `dueForMs`
 * and is still waiting in the queue: left there by the processing that should
 * have sent it (immediate budget spent), not about to be sent by a processing
 * still under way. The payment status page sends those again
 * (appointmentPublicStatus.ts).
 */
export async function hasDeliveriesLeftInQueue(appointmentId: number, dueForMs: number, now = new Date()): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [leftover] = await db.select({ id: appointmentFulfillmentJobs.id }).from(appointmentFulfillmentJobs).where(and(
    eq(appointmentFulfillmentJobs.appointmentId, appointmentId),
    inArray(appointmentFulfillmentJobs.status, ["queued", "retry"]),
    lte(appointmentFulfillmentJobs.scheduledFor, new Date(now.getTime() - dueForMs)),
    lt(appointmentFulfillmentJobs.attempts, appointmentFulfillmentJobs.maxAttempts),
  )).limit(1);
  return Boolean(leftover);
}

/** Same claim/idempotency path as the scheduled worker, restricted to one appointment. */
export function processAppointmentFulfillmentNow(appointmentId: number, options: { deadlineAt?: number } = {}) {
  return processDueAppointmentFulfillmentJobs(MAX_BATCH, { appointmentId, deadlineAt: options.deadlineAt });
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
 * refused by the email service (address, content), with no new automatic
 * attempt; failed and waiting for its next automatic attempt; not
 * attempted yet; being sent right now; interrupted (still "running" long after
 * its worker stopped); or deliberately not sent (consultation already past,
 * appointment no longer paid, patient data erased).
 */
export type AppointmentDeliveryState = "sent" | "failed" | "refused" | "retrying" | "pending" | "sending" | "interrupted" | "not_sent";

const DELIVERY_STATES: Record<string, AppointmentDeliveryState> = { failed: "failed", retry: "retrying", queued: "pending", running: "sending" };

export type AppointmentDelivery = {
  jobType: FulfillmentJobType;
  state: AppointmentDeliveryState;
  attempts: number;
  maxAttempts: number;
  /** Next automatic attempt of a job waiting for a retry. */
  nextAttemptAt: Date | null;
  /** Why a job was deliberately not sent: consultation already past, appointment no longer paid, or patient data erased (RGPD-12). */
  notSentReason: "appointment_past" | "not_paid" | "patient_data_erased" | null;
  /**
   * A job that did not go out because of the invoice storage (Vercel Blob),
   * not the email service: the copy stored at the invoice's issue could not be
   * checked or read, and the invoice is not rebuilt in its place (EXPL-02).
   */
  failureCause: "invoice_storage" | null;
};

/**
 * A job that did not go out because of the invoice storage (Vercel Blob), not
 * the email service: the copy stored at the invoice's issue could not be
 * checked or read, and the invoice is not rebuilt in its place (EXPL-02).
 */
function failedOnInvoiceStorage(lastError: string | null | undefined) {
  return Boolean(lastError?.startsWith("storage_"));
}

/** Same rule as recoverStaleAppointmentFulfillmentJobs: no worker runs that long. */
function isInterruptedJob(job: Pick<FulfillmentJob, "status" | "startedAt">, now: Date) {
  return job.status === "running" && job.startedAt !== null && job.startedAt.getTime() <= now.getTime() - APPOINTMENT_FULFILLMENT_STALE_AFTER_MS;
}

function deliveryOf(job: FulfillmentJob, now: Date): AppointmentDelivery {
  const state = job.status === "completed" ? job.lastError ? "not_sent" : "sent"
    : isRefusedJob(job) ? "refused"
      : isInterruptedJob(job, now) ? "interrupted" : DELIVERY_STATES[job.status] ?? "pending";
  return {
    jobType: job.jobType as FulfillmentJobType,
    state,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    nextAttemptAt: job.status === "retry" ? job.scheduledFor : null,
    notSentReason: state !== "not_sent" ? null
      : job.lastError === "appointment_already_past_confirmation_skipped" ? "appointment_past"
      : job.lastError === PATIENT_DATA_ERASED ? "patient_data_erased" : "not_paid",
    failureCause: (state === "retrying" || state === "failed") && failedOnInvoiceStorage(job.lastError) ? "invoice_storage" : null,
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
 * that did not go out (failed, refused by the email service, waiting for their
 * next attempt, or interrupted) go back to the queue with a full attempt
 * budget and run now, through the same claim and idempotency keys as the
 * scheduled worker. A job already sent, or being sent right now, is left
 * alone. For a refunded appointment, only the notices of its refund, recorded
 * from Stripe (RES-06) or made from the dashboard. Once the patient's data is
 * erased (RGPD-12), only the owner's notices: the patient has no address.
 */
export async function retryAppointmentFulfillment(trackingId: string): Promise<AppointmentFulfillmentRetry> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [appointment] = await db.select({ id: appointments.id, paymentStatus: appointments.paymentStatus, cancellationReason: appointments.cancellationReason, customerEmail: appointments.customerEmail })
    .from(appointments).where(eq(appointments.trackingId, trackingId)).limit(1);
  if (!appointment) return { outcome: "not_found" };
  const refundNotice = appointment.paymentStatus === "refunded" ? await refundNoticeOf(appointment) : null;
  if (appointment.paymentStatus !== "completed" && !refundNotice) return { outcome: "not_paid" };
  const patientDataErased = hasErasedPatientData(appointment);
  const jobTypes = JOB_ORDER.filter(jobType => jobPaymentStatus(jobType) === appointment.paymentStatus && !(patientDataErased && isPatientJob(jobType)));
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
 * Erasure of a patient's data (RGPD-12): the patient emails of the bookings it
 * anonymised that did not go out (queued, waiting for a retry, failed for good
 * or interrupted) are closed as not sent, as no address is left to write to,
 * and leave « À traiter ». A job being sent right now is left to its worker,
 * and the owner's notices are kept.
 */
export async function closeErasedPatientFulfillment(appointmentIds: number[], now = new Date()) {
  if (appointmentIds.length === 0) return 0;
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.update(appointmentFulfillmentJobs).set({
    status: "completed",
    finishedAt: now,
    lastError: PATIENT_DATA_ERASED,
    updatedAt: now,
  }).where(and(
    inArray(appointmentFulfillmentJobs.appointmentId, appointmentIds),
    inArray(appointmentFulfillmentJobs.jobType, [...PATIENT_JOB_TYPES]),
    or(
      inArray(appointmentFulfillmentJobs.status, ["queued", "retry", "failed"]),
      and(eq(appointmentFulfillmentJobs.status, "running"), lte(appointmentFulfillmentJobs.startedAt, new Date(now.getTime() - APPOINTMENT_FULFILLMENT_STALE_AFTER_MS))),
    ),
  ));
  return mutationRowCount(result);
}

/**
 * Paid appointments whose post-payment emails did not go out, oldest first:
 * the « À traiter » panel reads them from the database, not from an alert
 * email sent through the very channel that failed (EXPL-02). « failed »: the
 * attempts ran out. « refused »: the email service refused the email
 * (address, content), with no new automatic attempt.
 * « retrying »: an attempt failed (or was interrupted) and the next automatic
 * one may only come with the next scheduled run, days before the attempts run
 * out. « waiting »: not attempted yet, due for APPOINTMENT_FULFILLMENT_WAITING_AFTER_MS
 * (see there). Refunded appointments too, for the notices of their refund (RES-06).
 * `storageJobTypes`: the jobs of the group that the invoice storage, not the
 * email service, kept from going out; another job of the same appointment, or
 * of another group, is not said to be held by it.
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
    lastError: appointmentFulfillmentJobs.lastError,
    scheduledFor: appointmentFulfillmentJobs.scheduledFor,
  }).from(appointmentFulfillmentJobs)
    .where(or(
      inArray(appointmentFulfillmentJobs.status, ["failed", "retry"]),
      and(eq(appointmentFulfillmentJobs.status, "running"), lte(appointmentFulfillmentJobs.startedAt, new Date(now.getTime() - APPOINTMENT_FULFILLMENT_STALE_AFTER_MS))),
      and(eq(appointmentFulfillmentJobs.status, "queued"), lte(appointmentFulfillmentJobs.scheduledFor, new Date(now.getTime() - APPOINTMENT_FULFILLMENT_WAITING_AFTER_MS))),
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
  const refused = new Map<number, FulfillmentJobType[]>();
  // Earliest next automatic attempt; null when only interrupted jobs wait for the next scheduled run.
  const retrying = new Map<number, { jobTypes: FulfillmentJobType[]; nextAttemptAt: Date | null }>();
  // Earliest moment a job still waiting for its first attempt was due.
  const waiting = new Map<number, { jobTypes: FulfillmentJobType[]; dueSince: Date }>();
  // Jobs of the failed and retrying groups the invoice storage kept from going out.
  const failedOnStorage = new Map<number, FulfillmentJobType[]>();
  const retryingOnStorage = new Map<number, FulfillmentJobType[]>();
  for (const job of jobs) {
    const jobType = job.jobType as FulfillmentJobType;
    const onStorage = job.status === "failed" ? failedOnStorage : job.status === "retry" ? retryingOnStorage : null;
    if (onStorage && failedOnInvoiceStorage(job.lastError)) onStorage.set(job.appointmentId, [...(onStorage.get(job.appointmentId) ?? []), jobType]);
    if (job.status === "failed") {
      const group = isRefusedJob(job) ? refused : failed;
      group.set(job.appointmentId, [...(group.get(job.appointmentId) ?? []), jobType]);
      continue;
    }
    if (job.status === "queued") {
      const previous = waiting.get(job.appointmentId);
      waiting.set(job.appointmentId, {
        jobTypes: [...(previous?.jobTypes ?? []), jobType],
        dueSince: previous && previous.dueSince < job.scheduledFor ? previous.dueSince : job.scheduledFor,
      });
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
  // Appointments oldest first; each one's emails in processing order (notification, confirmation, invoice…).
  const inJobOrder = (jobTypes: FulfillmentJobType[]) => [...jobTypes].sort((a, b) => JOB_ORDER.indexOf(a) - JOB_ORDER.indexOf(b));
  const withJobTypes = (group: Map<number, FulfillmentJobType[]>, onStorage = new Map<number, FulfillmentJobType[]>()) => page(Array.from(group.entries()).map(([appointmentId, jobTypes]) => ({ ...byId.get(appointmentId)!.appointment, jobTypes: inJobOrder(jobTypes), storageJobTypes: inJobOrder(onStorage.get(appointmentId) ?? []) })));
  return {
    failed: withJobTypes(failed, failedOnStorage),
    refused: withJobTypes(refused),
    retrying: page(Array.from(retrying.entries()).map(([appointmentId, delivery]) => ({ ...byId.get(appointmentId)!.appointment, ...delivery, jobTypes: inJobOrder(delivery.jobTypes), storageJobTypes: inJobOrder(retryingOnStorage.get(appointmentId) ?? []) }))),
    waiting: page(Array.from(waiting.entries()).map(([appointmentId, delivery]) => ({ ...byId.get(appointmentId)!.appointment, ...delivery, jobTypes: inJobOrder(delivery.jobTypes) }))),
  };
}

/**
 * « Télécharger la facture » (EXPL-02): the invoice already issued for this
 * appointment, the copy stored at its issue, identical to the PDF emailed to
 * the patient even after the address was corrected; when none was stored
 * yet, built from its recorded number and dates and the appointment's current
 * data, then stored once (generateInvoicePDF). Throws while the stored copy
 * cannot be checked or read (storage outage): never rebuilt in its place. On
 * a booking reduced to its accounting record (RGPD-12), rebuilt without the
 * identity, the stored copy neither read nor written, as the GDPR procedure
 * states. Never allocates a number: null when no invoice was issued yet.
 */
export async function regenerateAppointmentInvoice(trackingId: string): Promise<{ invoiceNumber: string; buffer: Buffer } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const [appointment] = await db.select().from(appointments).where(eq(appointments.trackingId, trackingId)).limit(1);
  if (!appointment) return null;
  const invoiceRecord = (await findAppointmentInvoices([appointment.id])).get(appointment.id);
  if (!invoiceRecord) return null;
  const data = appointmentInvoiceData(appointment, invoiceRecord);
  if (hasErasedPatientData(appointment)) return { invoiceNumber: invoiceRecord.invoiceNumber, buffer: await renderInvoicePDF(data) };
  return { invoiceNumber: invoiceRecord.invoiceNumber, buffer: (await generateInvoicePDF(data)).buffer };
}

/**
 * Before the patient's details of an appointment change (address corrected
 * from the dashboard, EXPL-02), the invoice already issued for it is stored
 * as it was issued, from the details it carries now: one issued during a
 * storage outage was emailed without a stored copy, and its first build after
 * the change would otherwise store the new details under the same number. A
 * copy already stored is kept. Throws while the store cannot say whether one
 * is there or cannot take it (archiveInvoicePDF): the details must not change
 * yet. Nothing to do when no invoice was issued.
 */
export async function archiveIssuedAppointmentInvoice(appointment: Appointment): Promise<void> {
  const invoiceRecord = (await findAppointmentInvoices([appointment.id])).get(appointment.id);
  if (invoiceRecord) await archiveInvoicePDF(appointmentInvoiceData(appointment, invoiceRecord));
}
