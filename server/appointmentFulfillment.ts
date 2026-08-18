import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { appointmentFulfillmentJobs, appointments } from "../drizzle/schema";
import { getDb } from "./db";
import {
  sendConfirmationEmail,
  sendCustomerConfirmationSMS,
  sendInvoiceEmail,
  sendOwnerNotificationEmail,
  sendOwnerNotificationSMS,
} from "./_core/notifications";
import { generateInvoicePDF } from "./invoice";

const MAX_BATCH = 5;

export async function enqueueAppointmentFulfillment(appointmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  for (const jobType of ["confirmation", "invoice"] as const) {
    await db.execute(sql`
      INSERT INTO appointment_fulfillment_jobs (appointment_id, job_type, status, attempts, max_attempts, scheduled_for)
      VALUES (${appointmentId}, ${jobType}, 'queued', 0, 3, NOW())
      ON DUPLICATE KEY UPDATE updated_at = NOW()
    `);
  }
}

function retryAt(attempt: number) {
  return new Date(Date.now() + Math.min(60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempt - 1)));
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
  try {
    const finalPrice = Number(appointment.finalPrice);
    if (job.jobType === "confirmation") {
      await Promise.all([
        sendConfirmationEmail(appointment.customerEmail, appointment.customerName, appointment.trackingId, appointment.appointmentDate, finalPrice, appointment.requestDetails),
        sendCustomerConfirmationSMS(appointment.customerPhone, appointment.trackingId, appointment.appointmentDate),
        sendOwnerNotificationEmail(appointment.customerName, appointment.customerEmail, appointment.customerPhone, appointment.trackingId, appointment.appointmentDate, finalPrice, appointment.requestDetails),
        sendOwnerNotificationSMS(appointment.customerName, appointment.customerPhone, appointment.trackingId, appointment.appointmentDate, finalPrice),
      ]);
      await db.update(appointments).set({ emailSent: 1, smsSent: 1 }).where(eq(appointments.id, appointment.id));
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
    return { completed: false, retry: !terminal };
  }
}

export async function processDueAppointmentFulfillmentJobs(limit = MAX_BATCH) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const jobs = await db.select().from(appointmentFulfillmentJobs)
    .where(and(inArray(appointmentFulfillmentJobs.status, ["queued", "retry"]), lte(appointmentFulfillmentJobs.scheduledFor, new Date())))
    .orderBy(appointmentFulfillmentJobs.scheduledFor).limit(Math.min(Math.max(1, limit), MAX_BATCH));
  const results = [];
  for (const job of jobs) {
    await db.update(appointmentFulfillmentJobs).set({ status: "running", attempts: job.attempts + 1, startedAt: new Date(), finishedAt: null })
      .where(and(eq(appointmentFulfillmentJobs.id, job.id), inArray(appointmentFulfillmentJobs.status, ["queued", "retry"])));
    results.push(await runJob(job.id));
  }
  return { processed: results.length, results };
}
