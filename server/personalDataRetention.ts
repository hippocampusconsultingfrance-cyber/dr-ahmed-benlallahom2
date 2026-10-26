import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  adminMfaChallenges,
  adminMfaSessions,
  appointmentFulfillmentJobs,
  appointments,
  candidateSessions,
  contactMessages,
  gdprRequests,
  medicalQuestionAuditLogs,
  medicalQuestions,
  securityEvents,
} from "../drizzle/schema";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";

/**
 * Retention of the patient, contact and technical data (RGPD-09): the periods
 * announced by the privacy policy (client/src/pages/LegalPage.tsx, sections 4
 * and 10), applied once a day by the security-posture job. Recruitment data
 * has its own job (recruitmentRetention.ts). Each rule works in small batches
 * and the whole run stops once its time budget is spent; what is left waits
 * for the next day.
 */
/** Access logs: security journal and administrator second-factor records. */
export const ACCESS_LOG_RETENTION_DAYS = 90;
/** Post-payment jobs that completed: their state is only useful to follow the sending. */
export const FULFILLMENT_JOB_RETENTION_DAYS = 30;
/** GDPR requests, counted from their closure (completed or refused). */
export const GDPR_REQUEST_RETENTION_YEARS = 1;
/** Contact messages, counted from the person's latest message. */
export const CONTACT_MESSAGE_RETENTION_YEARS = 3;
/** Free medical questions and their journal, counted from the latest exchange. */
export const MEDICAL_QUESTION_RETENTION_YEARS = 3;
/** Bookings, counted from the consultation date; then only the accounting record stays. */
export const APPOINTMENT_RETENTION_YEARS = 3;
/**
 * Free-text reason of a booking (possibly health data), emptied this long
 * after the consultation date. Not stated by the privacy policy: to be
 * confirmed by the owner.
 */
export const APPOINTMENT_REQUEST_DETAILS_RETENTION_DAYS = 90;

export const PERSONAL_DATA_RETENTION_BATCH_SIZE = 200;
export const PERSONAL_DATA_RETENTION_BUDGET_MS = 20_000;

/** Name left on an anonymised booking (the other identity fields are emptied). */
export const ANONYMISED_APPOINTMENT_NAME = "Anonymisé";
/** Name left on a published question reduced to its anonymised public version. */
export const ANONYMISED_MEDICAL_QUESTION_NAME = "Anonymisé";

const DAY_MS = 24 * 60 * 60 * 1000;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function yearsBefore(now: Date, years: number) {
  const date = new Date(now);
  date.setFullYear(date.getFullYear() - years);
  return date;
}

/**
 * A booking reduced to what the accounting needs: date, amounts, statuses,
 * payment references and invoice number (appointment_invoices) stay; identity,
 * contact details, reason and free texts go. The invoice PDF already stored
 * (invoices/ in Blob, to keep 10 years) is never touched; no rule deletes it,
 * nor these rows, after those 10 years yet.
 */
export function anonymisedAppointmentFields(now = new Date()) {
  return {
    customerName: ANONYMISED_APPOINTMENT_NAME,
    customerEmail: "",
    customerPhone: "",
    requestDetails: "",
    cancellationReason: null,
    meetLink: null,
    updatedAt: now,
  };
}

/** Identity, contact details and private exchange of a question go; its consented anonymised public version stays. */
export function anonymisedMedicalQuestionFields(now = new Date()) {
  return {
    firstName: ANONYMISED_MEDICAL_QUESTION_NAME,
    lastName: "",
    email: "",
    phone: "",
    question: "",
    adminResponse: null,
    respondedByOpenId: null,
    updatedAt: now,
  };
}

type RetentionRun = { db: Database; batchSize: number; hasTime: () => boolean };
type RuleResult = { count: number; complete: boolean };

/** Repeats one batch of a rule until it selects less than a full batch, or the run's time is up. */
async function inBatches(run: RetentionRun, batch: (limit: number) => Promise<{ selected: number; count: number }>): Promise<RuleResult> {
  let count = 0;
  while (run.hasTime()) {
    const result = await batch(run.batchSize);
    count += result.count;
    if (result.selected < run.batchSize) return { count, complete: true };
  }
  return { count, complete: false };
}

async function deleteIds(db: Database, table: PgTable, id: PgColumn, ids: number[]) {
  return ids.length ? mutationRowCount(await db.delete(table).where(inArray(id, ids))) : 0;
}

/** Deletes, batch after batch, the rows of `table` matching `where`. */
function purgeRows(run: RetentionRun, table: PgTable, id: PgColumn, where: SQL | undefined) {
  return inBatches(run, async limit => {
    const rows = await run.db.select({ id }).from(table).where(where).orderBy(asc(id)).limit(limit);
    return { selected: rows.length, count: await deleteIds(run.db, table, id, rows.map(row => Number(row.id))) };
  });
}

/**
 * Messages older than the period, unless the same person (same address,
 * whatever the case) wrote again since: the period runs from their latest
 * message. The cursor moves past the messages kept for that reason.
 */
async function purgeContactMessages(run: RetentionRun, cutoff: Date) {
  let afterId = 0;
  return inBatches(run, async limit => {
    const expired = await run.db.select({ id: contactMessages.id, email: contactMessages.email }).from(contactMessages)
      .where(and(lt(contactMessages.createdAt, cutoff), gt(contactMessages.id, afterId)))
      .orderBy(asc(contactMessages.id))
      .limit(limit);
    if (!expired.length) return { selected: 0, count: 0 };
    afterId = expired[expired.length - 1]!.id;
    const emails = Array.from(new Set(expired.map(row => row.email.trim().toLowerCase())));
    const recent = await run.db.select({ email: contactMessages.email }).from(contactMessages)
      .where(and(gte(contactMessages.createdAt, cutoff), inArray(sql`lower(${contactMessages.email})`, emails)));
    const stillInContact = new Set(recent.map(row => row.email.trim().toLowerCase()));
    const ids = expired.filter(row => !stillInContact.has(row.email.trim().toLowerCase())).map(row => row.id);
    return { selected: expired.length, count: await deleteIds(run.db, contactMessages, contactMessages.id, ids) };
  });
}

/**
 * Questions whose latest exchange (submission, change, reply sent) is older
 * than the period are deleted with their journal. A published question
 * (separate consent) keeps only its anonymised public version.
 */
async function purgeMedicalQuestions(run: RetentionRun, cutoff: Date, now: Date) {
  return inBatches(run, async limit => {
    const expired = await run.db.select({ id: medicalQuestions.id, status: medicalQuestions.status, publicationConsent: medicalQuestions.publicationConsent })
      .from(medicalQuestions)
      .where(and(
        lt(medicalQuestions.createdAt, cutoff),
        lt(medicalQuestions.updatedAt, cutoff),
        or(isNull(medicalQuestions.responseSentAt), lt(medicalQuestions.responseSentAt, cutoff)),
        // Already reduced to its public version.
        ne(medicalQuestions.email, ""),
      ))
      .orderBy(asc(medicalQuestions.id))
      .limit(limit);
    const published = expired.filter(row => row.status === "published" && row.publicationConsent === 1).map(row => row.id);
    const deleted = expired.filter(row => !published.includes(row.id)).map(row => row.id);
    if (expired.length) await run.db.delete(medicalQuestionAuditLogs).where(inArray(medicalQuestionAuditLogs.medicalQuestionId, expired.map(row => row.id)));
    if (published.length) await run.db.update(medicalQuestions).set(anonymisedMedicalQuestionFields(now)).where(inArray(medicalQuestions.id, published));
    return { selected: expired.length, count: await deleteIds(run.db, medicalQuestions, medicalQuestions.id, deleted) + published.length };
  });
}

/** Bookings older than the period, not yet anonymised (their email is emptied). */
function anonymiseOldAppointments(run: RetentionRun, cutoff: Date, now: Date) {
  return inBatches(run, async limit => {
    const rows = await run.db.select({ id: appointments.id }).from(appointments)
      .where(and(lt(appointments.appointmentDate, cutoff), ne(appointments.customerEmail, "")))
      .orderBy(asc(appointments.id))
      .limit(limit);
    const ids = rows.map(row => row.id);
    const count = ids.length ? mutationRowCount(await run.db.update(appointments).set(anonymisedAppointmentFields(now)).where(inArray(appointments.id, ids))) : 0;
    return { selected: rows.length, count };
  });
}

function emptyOldRequestDetails(run: RetentionRun, cutoff: Date, now: Date) {
  return inBatches(run, async limit => {
    const rows = await run.db.select({ id: appointments.id }).from(appointments)
      .where(and(lt(appointments.appointmentDate, cutoff), ne(appointments.requestDetails, "")))
      .orderBy(asc(appointments.id))
      .limit(limit);
    const ids = rows.map(row => row.id);
    const count = ids.length ? mutationRowCount(await run.db.update(appointments).set({ requestDetails: "", updatedAt: now }).where(inArray(appointments.id, ids))) : 0;
    return { selected: rows.length, count };
  });
}

export type PersonalDataRetentionReport = {
  securityEvents: number;
  adminMfaChallenges: number;
  adminMfaSessions: number;
  candidateSessions: number;
  fulfillmentJobs: number;
  gdprRequests: number;
  contactMessages: number;
  medicalQuestions: number;
  appointmentsAnonymised: number;
  requestDetailsEmptied: number;
  /** False when the time budget ran out: the rest is handled by the next run. */
  complete: boolean;
};

export async function runPersonalDataRetention(options: { now?: Date; batchSize?: number; budgetMs?: number } = {}): Promise<PersonalDataRetentionReport> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? PERSONAL_DATA_RETENTION_BUDGET_MS;
  const run: RetentionRun = {
    db,
    batchSize: Math.max(1, options.batchSize ?? PERSONAL_DATA_RETENTION_BATCH_SIZE),
    hasTime: () => Date.now() - startedAt < budgetMs,
  };
  const accessLogCutoff = new Date(now.getTime() - ACCESS_LOG_RETENTION_DAYS * DAY_MS);
  const gdprCutoff = yearsBefore(now, GDPR_REQUEST_RETENTION_YEARS);

  // Oldest personal data first: health and identity, then the technical records.
  const results = {
    medicalQuestions: await purgeMedicalQuestions(run, yearsBefore(now, MEDICAL_QUESTION_RETENTION_YEARS), now),
    contactMessages: await purgeContactMessages(run, yearsBefore(now, CONTACT_MESSAGE_RETENTION_YEARS)),
    appointmentsAnonymised: await anonymiseOldAppointments(run, yearsBefore(now, APPOINTMENT_RETENTION_YEARS), now),
    requestDetailsEmptied: await emptyOldRequestDetails(run, new Date(now.getTime() - APPOINTMENT_REQUEST_DETAILS_RETENTION_DAYS * DAY_MS), now),
    gdprRequests: await purgeRows(run, gdprRequests, gdprRequests.id, and(
      inArray(gdprRequests.status, ["completed", "rejected"]),
      // Closure date: the answer date, else the last change of the request.
      or(
        and(isNotNull(gdprRequests.responseDate), lt(gdprRequests.responseDate, gdprCutoff)),
        and(isNull(gdprRequests.responseDate), lt(gdprRequests.updatedAt, gdprCutoff)),
      ),
    )),
    securityEvents: await purgeRows(run, securityEvents, securityEvents.id, lt(securityEvents.createdAt, accessLogCutoff)),
    adminMfaChallenges: await purgeRows(run, adminMfaChallenges, adminMfaChallenges.id, or(lt(adminMfaChallenges.expiresAt, now), lt(adminMfaChallenges.createdAt, accessLogCutoff))),
    adminMfaSessions: await purgeRows(run, adminMfaSessions, adminMfaSessions.id, or(lt(adminMfaSessions.expiresAt, now), lt(adminMfaSessions.createdAt, accessLogCutoff))),
    candidateSessions: await purgeRows(run, candidateSessions, candidateSessions.id, lt(candidateSessions.expiresAt, now)),
    fulfillmentJobs: await purgeRows(run, appointmentFulfillmentJobs, appointmentFulfillmentJobs.id, and(
      eq(appointmentFulfillmentJobs.status, "completed"),
      lt(appointmentFulfillmentJobs.finishedAt, new Date(now.getTime() - FULFILLMENT_JOB_RETENTION_DAYS * DAY_MS)),
    )),
  };
  const report: PersonalDataRetentionReport = {
    securityEvents: results.securityEvents.count,
    adminMfaChallenges: results.adminMfaChallenges.count,
    adminMfaSessions: results.adminMfaSessions.count,
    candidateSessions: results.candidateSessions.count,
    fulfillmentJobs: results.fulfillmentJobs.count,
    gdprRequests: results.gdprRequests.count,
    contactMessages: results.contactMessages.count,
    medicalQuestions: results.medicalQuestions.count,
    appointmentsAnonymised: results.appointmentsAnonymised.count,
    requestDetailsEmptied: results.requestDetailsEmptied.count,
    complete: Object.values(results).every(result => result.complete),
  };
  console.info("[PersonalDataRetention] run summary", report);
  return report;
}
