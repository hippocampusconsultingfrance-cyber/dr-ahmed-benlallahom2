import { desc, eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgSelect, PgTable } from "drizzle-orm/pg-core";
import { appointments, candidateAccounts, contactMessages, cvApplications, gdprRequests, medicalQuestionAuditLogs, medicalQuestions } from "../drizzle/schema";
import { HIPPOCAMPUS_LEGAL } from "../shared/legalIdentity";
import { getDb } from "./db";
import { mutationRowCount } from "./dbMutation";
import { isUnconfirmedPaidAppointment } from "./appointmentAdminActions";
import { logSecurityEvent } from "./candidateSecurity";
import { anonymisedAppointmentFields } from "./personalDataRetention";

/**
 * GDPR requests of a patient or a contact (RGPD-12): everything the site
 * keeps under one email address (whatever its case) in the patient and
 * contact tables, its JSON export (access, portability) and its erasure.
 * Recruitment data has its own complete erasure (recruitmentErasure.ts): only
 * the dossiers found are listed here. See docs/PROCEDURE_DEMANDES_RGPD.md.
 */
/** Rows listed per table on screen (the most recent); the export and the erasure cover them all. */
export const PERSONAL_DATA_SEARCH_LIMIT = 200;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** One row more than the screen shows, to know whether the table has more; every row for the export. */
function upToLimit<T extends PgSelect>(query: T, limit: number | null) {
  return limit === null ? query : query.limit(limit + 1);
}

export function normalizePersonEmail(email: string) {
  return email.trim().toLowerCase();
}

function sameEmail(column: PgColumn, email: string) {
  return sql`lower(${column}) = ${normalizePersonEmail(email)}`;
}

async function requireDb(): Promise<Database> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db;
}

/**
 * What the site keeps under one address. On screen (`limit`, by default),
 * each list stops at its PERSONAL_DATA_SEARCH_LIMIT most recent rows and
 * `totals` gives every table's full count; the export reads with `limit: null`,
 * every row. `erasableRows` is what « Effacer / anonymiser » would delete or
 * anonymise now: 0 once only kept data is left (GDPR requests, active upcoming
 * bookings, recruitment dossiers).
 */
export async function findPersonalData(email: string, options: { limit?: number | null; now?: Date } = {}) {
  const db = await requireDb();
  const limit = options.limit === undefined ? PERSONAL_DATA_SEARCH_LIMIT : options.limit;
  const now = options.now ?? new Date();
  const countRows = async (table: PgTable, column: PgColumn) => {
    const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(table).where(sameEmail(column, email));
    return Number(row?.count ?? 0);
  };
  /** The rows to show, and the table's total when they had to be cut. */
  const listed = async <T>(rows: T[], table: PgTable, column: PgColumn) => (limit !== null && rows.length > limit
    ? { rows: rows.slice(0, limit), total: await countRows(table, column) }
    : { rows, total: rows.length });

  const contacts = await listed(await upToLimit(db.select({
    id: contactMessages.id,
    trackingId: contactMessages.trackingId,
    name: contactMessages.name,
    email: contactMessages.email,
    phone: contactMessages.phone,
    message: contactMessages.message,
    gdprConsent: contactMessages.gdprConsent,
    read: contactMessages.read,
    createdAt: contactMessages.createdAt,
  }).from(contactMessages).where(sameEmail(contactMessages.email, email)).orderBy(desc(contactMessages.createdAt)).$dynamic(), limit), contactMessages, contactMessages.email);
  const questions = await listed(await upToLimit(db.select({
    id: medicalQuestions.id,
    trackingId: medicalQuestions.trackingId,
    firstName: medicalQuestions.firstName,
    lastName: medicalQuestions.lastName,
    email: medicalQuestions.email,
    phone: medicalQuestions.phone,
    question: medicalQuestions.question,
    language: medicalQuestions.language,
    privacyConsent: medicalQuestions.privacyConsent,
    publicationConsent: medicalQuestions.publicationConsent,
    status: medicalQuestions.status,
    adminResponse: medicalQuestions.adminResponse,
    publicQuestion: medicalQuestions.publicQuestion,
    publicResponse: medicalQuestions.publicResponse,
    responseSentAt: medicalQuestions.responseSentAt,
    publishedAt: medicalQuestions.publishedAt,
    createdAt: medicalQuestions.createdAt,
  }).from(medicalQuestions).where(sameEmail(medicalQuestions.email, email)).orderBy(desc(medicalQuestions.createdAt)).$dynamic(), limit), medicalQuestions, medicalQuestions.email);
  const requests = await listed(await upToLimit(db.select({
    id: gdprRequests.id,
    trackingId: gdprRequests.trackingId,
    name: gdprRequests.name,
    email: gdprRequests.email,
    phone: gdprRequests.phone,
    requestType: gdprRequests.requestType,
    description: gdprRequests.description,
    status: gdprRequests.status,
    notes: gdprRequests.notes,
    responseDate: gdprRequests.responseDate,
    createdAt: gdprRequests.createdAt,
  }).from(gdprRequests).where(sameEmail(gdprRequests.email, email)).orderBy(desc(gdprRequests.createdAt)).$dynamic(), limit), gdprRequests, gdprRequests.email);
  // Every booking's state, to count them and those the erasure would anonymise.
  const bookingStates = await db.select({
    appointmentDate: appointments.appointmentDate,
    appointmentStatus: appointments.appointmentStatus,
    paymentStatus: appointments.paymentStatus,
    stripePaymentIntentId: appointments.stripePaymentIntentId,
  }).from(appointments).where(sameEmail(appointments.customerEmail, email));
  const bookingRows = await upToLimit(db.select({
    id: appointments.id,
    trackingId: appointments.trackingId,
    customerName: appointments.customerName,
    customerEmail: appointments.customerEmail,
    customerPhone: appointments.customerPhone,
    consultationType: appointments.consultationType,
    requestDetails: appointments.requestDetails,
    appointmentDate: appointments.appointmentDate,
    duration: appointments.duration,
    finalPrice: appointments.finalPrice,
    paymentStatus: appointments.paymentStatus,
    appointmentStatus: appointments.appointmentStatus,
    refundAmount: appointments.refundAmount,
    refundedAt: appointments.refundedAt,
    cancellationReason: appointments.cancellationReason,
    cancelledAt: appointments.cancelledAt,
    language: appointments.language,
    createdAt: appointments.createdAt,
  }).from(appointments).where(sameEmail(appointments.customerEmail, email)).orderBy(desc(appointments.appointmentDate)).$dynamic(), limit);
  const bookings = limit === null ? bookingRows : bookingRows.slice(0, limit);
  const { findAppointmentInvoices } = await import("./invoiceNumbering");
  const invoices = await findAppointmentInvoices(bookings.map(booking => booking.id)).catch(error => {
    console.error("[PersonalData] Issued invoices could not be read", error instanceof Error ? error.name : "UnknownError");
    return new Map<number, { invoiceNumber: string }>();
  });
  const applications = await listed(await upToLimit(db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId, createdAt: cvApplications.createdAt })
    .from(cvApplications).where(sameEmail(cvApplications.email, email)).orderBy(desc(cvApplications.createdAt)).$dynamic(), limit), cvApplications, cvApplications.email);
  // Candidate accounts store the address normalised (trimmed, lower case).
  const accounts = await db.select({ id: candidateAccounts.id, linkedApplicationId: candidateAccounts.linkedApplicationId })
    .from(candidateAccounts).where(eq(candidateAccounts.email, normalizePersonEmail(email)));
  const erasableBookings = bookingStates.filter(booking => !isActiveUpcomingBooking(booking, now)).length;

  return {
    email: normalizePersonEmail(email),
    contactMessages: contacts.rows,
    medicalQuestions: questions.rows,
    gdprRequests: requests.rows,
    appointments: bookings.map(booking => ({ ...booking, invoiceNumber: invoices.get(booking.id)?.invoiceNumber ?? null })),
    recruitment: {
      applications: applications.rows,
      candidateAccountWithoutApplication: accounts.some(account => account.linkedApplicationId === null) && applications.total === 0,
    },
    totals: {
      contactMessages: contacts.total,
      medicalQuestions: questions.total,
      gdprRequests: requests.total,
      appointments: bookingStates.length,
      recruitmentApplications: applications.total,
    },
    erasableRows: contacts.total + questions.total + erasableBookings,
  };
}

export type PersonalData = Awaited<ReturnType<typeof findPersonalData>>;

/** JSON given to the person (access, portability): their data, without internal identifiers. */
export function buildPersonalDataExport(data: PersonalData, generatedAt = new Date()) {
  const withoutId = <T extends { id: number }>({ id: _id, ...row }: T) => row;
  return {
    generatedAt: generatedAt.toISOString(),
    controller: HIPPOCAMPUS_LEGAL.name,
    email: data.email,
    contactMessages: data.contactMessages.map(withoutId),
    medicalQuestions: data.medicalQuestions.map(withoutId),
    gdprRequests: data.gdprRequests.map(withoutId),
    appointments: data.appointments.map(withoutId),
    recruitmentApplications: data.recruitment.applications.map(withoutId),
  };
}

/** Every row of the address, however many: the screen's limit does not apply to the export. */
export async function exportPersonalData(input: { email: string; actorOpenId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const data = await findPersonalData(input.email, { limit: null, now });
  await logSecurityEvent({
    actorKind: "admin",
    actorReference: input.actorOpenId,
    category: "admin_personal_data_exported",
    outcome: "allowed",
    metadata: { contactMessages: data.contactMessages.length, medicalQuestions: data.medicalQuestions.length, gdprRequests: data.gdprRequests.length, appointments: data.appointments.length, recruitmentApplications: data.recruitment.applications.length },
  });
  return {
    filename: `donnees-personnelles-${now.toISOString().slice(0, 10)}.json`,
    content: JSON.stringify(buildPersonalDataExport(data, now), null, 2),
  };
}

type BookingToErase = Pick<typeof appointments.$inferSelect, "appointmentDate" | "appointmentStatus" | "paymentStatus" | "stripePaymentIntentId">;

/**
 * A booking the erasure leaves for the administrator to settle first: still to
 * take place and confirmed, or held while its payment may still arrive (an
 * expired hold stays held until Stripe says it can no longer be paid, then it
 * is cancelled), or paid after its slot was released and awaiting its refund.
 * Any other booking, past, cancelled or abandoned, is anonymised.
 */
function isActiveUpcomingBooking(booking: BookingToErase, now: Date) {
  if (booking.appointmentDate.getTime() < now.getTime()) return false;
  return booking.appointmentStatus === "confirmed" || booking.appointmentStatus === "held" || isUnconfirmedPaidAppointment(booking);
}

/**
 * Erasure for one address: contact messages and medical questions (with
 * their journal) are deleted; past, cancelled and abandoned bookings are
 * reduced to the accounting record, like after 3 years (the invoice and its
 * stored PDF stay); active upcoming bookings (isActiveUpcomingBooking) are
 * left for the administrator to cancel or refund first. GDPR requests are
 * kept as the record of the handling (1 year after closure), and recruitment
 * dossiers are erased from their own routine. The trace holds no personal data.
 */
export async function erasePersonalData(input: { email: string; actorOpenId: string; now?: Date }) {
  const db = await requireDb();
  const now = input.now ?? new Date();
  const contactMessagesDeleted = mutationRowCount(await db.delete(contactMessages).where(sameEmail(contactMessages.email, input.email)));
  const questionIds = (await db.select({ id: medicalQuestions.id }).from(medicalQuestions).where(sameEmail(medicalQuestions.email, input.email))).map(row => row.id);
  let medicalQuestionsDeleted = 0;
  if (questionIds.length) {
    await db.delete(medicalQuestionAuditLogs).where(inArray(medicalQuestionAuditLogs.medicalQuestionId, questionIds));
    medicalQuestionsDeleted = mutationRowCount(await db.delete(medicalQuestions).where(inArray(medicalQuestions.id, questionIds)));
  }
  const bookings = await db.select({
    id: appointments.id,
    trackingId: appointments.trackingId,
    appointmentDate: appointments.appointmentDate,
    appointmentStatus: appointments.appointmentStatus,
    paymentStatus: appointments.paymentStatus,
    stripePaymentIntentId: appointments.stripePaymentIntentId,
  }).from(appointments).where(sameEmail(appointments.customerEmail, input.email));
  const upcoming = bookings.filter(booking => isActiveUpcomingBooking(booking, now));
  const ended = bookings.filter(booking => !isActiveUpcomingBooking(booking, now));
  const appointmentsAnonymised = ended.length
    ? mutationRowCount(await db.update(appointments).set(anonymisedAppointmentFields(now)).where(inArray(appointments.id, ended.map(booking => booking.id))))
    : 0;
  const [gdprRequestsKept] = await db.select({ count: sql<number>`COUNT(*)` }).from(gdprRequests).where(sameEmail(gdprRequests.email, input.email));
  const applications = await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId }).from(cvApplications).where(sameEmail(cvApplications.email, input.email));
  const report = {
    contactMessagesDeleted,
    medicalQuestionsDeleted,
    appointmentsAnonymised,
    upcomingAppointments: upcoming.map(booking => booking.trackingId),
    gdprRequestsKept: Number(gdprRequestsKept?.count ?? 0),
    recruitmentApplications: applications.map(application => application.trackingId),
  };
  await logSecurityEvent({
    actorKind: "admin",
    actorReference: input.actorOpenId,
    category: "admin_personal_data_erased",
    outcome: "allowed",
    metadata: {
      contactMessagesDeleted,
      medicalQuestionsDeleted,
      appointmentsAnonymised,
      upcomingAppointmentsKept: upcoming.length,
      recruitmentApplicationsLeft: applications.length,
    },
  });
  return report;
}

/** Traces of the administrator's actions on a person's data, which hold row counts only. */
export const PERSONAL_DATA_TRACE_CATEGORIES: ReadonlySet<string> = new Set([
  "admin_personal_data_exported",
  "admin_personal_data_erased",
  "admin_contact_message_deleted",
  "admin_medical_question_deleted",
]);

/**
 * Row counts of such a trace, shown in the Security tab (who, when, how many
 * rows); null for any other event, whose metadata stays on the server.
 */
export function personalDataTraceCounts(category: string, metadata: string | null): Record<string, number> | null {
  if (!PERSONAL_DATA_TRACE_CATEGORIES.has(category) || !metadata) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => Number.isSafeInteger(entry[1]) && entry[1] >= 0));
}
