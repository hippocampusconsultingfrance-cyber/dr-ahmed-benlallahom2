import { and, eq, gte, inArray, lt, lte, or } from "drizzle-orm";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import {
  sendConfirmationEmail,
  sendCustomerConfirmationSMS,
  sendInvoiceEmail,
  sendOwnerNotificationEmail,
  sendOwnerNotificationSMS,
} from "./_core/notifications";
import { notifyOwner } from "./_core/notification";
import { generateInvoicePDF } from "./invoice";

const MAX_BATCH = 5;
/** Well above the 60 s function limit: a job still "running" after this was interrupted. */
export const APPOINTMENT_FULFILLMENT_STALE_AFTER_MS = 15 * 60_000;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type FulfillmentJob = typeof appointmentFulfillmentJobs.$inferSelect;

export async function enqueueAppointmentFulfillment(appointmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  for (const jobType of ["confirmation", "invoice"] as const) {
    await db.insert(appointmentFulfillmentJobs).values({
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
  // A backlog drained late must not tell a patient (or the owner) that a
  // consultation which already took place is "confirmed". The invoice is still sent.
  if (job.jobType === "confirmation" && appointment.appointmentDate.getTime() < Date.now()) {
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: new Date(), lastError: "appointment_already_past_confirmation_skipped" }).where(eq(appointmentFulfillmentJobs.id, id));
    // The owner's new-booking email/SMS belongs to this same job: without this
    // alert a paid consultation would never have been announced to anyone.
    if (appointment.emailSent !== 1) {
      await notifyOwner({
        title: `Confirmation non envoyée avant le rendez-vous (${appointment.trackingId})`,
        content: `Le rendez-vous payé ${appointment.trackingId} est passé avant que sa confirmation ait pu être envoyée : ni le patient ni vous n’avez reçu la notification automatique. Le paiement est bien enregistré ; vérifiez ce rendez-vous dans le tableau de bord et contactez le patient si nécessaire.`,
      }).catch(() => false);
    }
    return { skipped: true };
  }
  try {
    const finalPrice = Number(appointment.finalPrice);
    if (job.jobType === "confirmation") {
      await sendConfirmationEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, appointment.appointmentDate, finalPrice, appointment.requestDetails);
      const smsSent = await sendCustomerConfirmationSMS(appointment.customerPhone, appointment.trackingId, appointment.appointmentDate);
      await Promise.allSettled([
        sendOwnerNotificationEmail(appointment.customerName, appointment.customerEmail, appointment.customerPhone, appointment.trackingId, appointment.appointmentDate, finalPrice, appointment.requestDetails),
        sendOwnerNotificationSMS(appointment.customerName, appointment.customerPhone, appointment.trackingId, appointment.appointmentDate, finalPrice),
      ]);
      await db.update(appointments).set({ emailSent: 1, smsSent: smsSent ? 1 : 0 }).where(eq(appointments.id, appointment.id));
    } else {
      const invoice = await generateInvoicePDF({
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
        paymentDate: new Date(),
      });
      await sendInvoiceEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, finalPrice, invoice.buffer);
    }
    await db.update(appointmentFulfillmentJobs).set({ status: "completed", finishedAt: new Date(), lastError: null }).where(eq(appointmentFulfillmentJobs.id, id));
    return { completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4000) : "fulfillment_unknown_error";
    const terminal = job.attempts >= job.maxAttempts;
    await db.update(appointmentFulfillmentJobs).set({ status: terminal ? "failed" : "retry", lastError: message, scheduledFor: retryAt(job.attempts), finishedAt: terminal ? new Date() : null }).where(eq(appointmentFulfillmentJobs.id, id));
    if (terminal) {
      await notifyOwner({
        title: `Échec d’envoi après paiement (${appointment.trackingId})`,
        content: `L’envoi ${job.jobType === "confirmation" ? "de la confirmation" : "de la facture"} du rendez-vous ${appointment.trackingId} a échoué ${job.attempts} fois. Le paiement est bien enregistré ; un envoi manuel au patient est nécessaire.`,
      }).catch(() => false);
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
    .orderBy(appointmentFulfillmentJobs.scheduledFor).limit(Math.min(Math.max(1, limit), MAX_BATCH));
  const results = [];
  for (const job of jobs) {
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
      content: `${exhausted} envoi(s) de confirmation ou de facture ont été interrompus après le nombre maximal de tentatives. Vérifiez dans le dashboard les rendez-vous payés sans confirmation et effectuez un envoi manuel si nécessaire.`,
    }).catch(() => false);
  }
  return { recovered, exhausted };
}
