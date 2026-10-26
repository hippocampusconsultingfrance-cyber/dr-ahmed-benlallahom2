import { desc, eq, inArray, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
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
export const PERSONAL_DATA_SEARCH_LIMIT = 200;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

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

export async function findPersonalData(email: string) {
  const db = await requireDb();
  const limit = PERSONAL_DATA_SEARCH_LIMIT;
  const contacts = await db.select({
    id: contactMessages.id,
    trackingId: contactMessages.trackingId,
    name: contactMessages.name,
    email: contactMessages.email,
    phone: contactMessages.phone,
    message: contactMessages.message,
    gdprConsent: contactMessages.gdprConsent,
    read: contactMessages.read,
    createdAt: contactMessages.createdAt,
  }).from(contactMessages).where(sameEmail(contactMessages.email, email)).orderBy(desc(contactMessages.createdAt)).limit(limit);
  const questions = await db.select({
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
  }).from(medicalQuestions).where(sameEmail(medicalQuestions.email, email)).orderBy(desc(medicalQuestions.createdAt)).limit(limit);
  const requests = await db.select({
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
  }).from(gdprRequests).where(sameEmail(gdprRequests.email, email)).orderBy(desc(gdprRequests.createdAt)).limit(limit);
  const bookings = await db.select({
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
  }).from(appointments).where(sameEmail(appointments.customerEmail, email)).orderBy(desc(appointments.appointmentDate)).limit(limit);
  const { findAppointmentInvoices } = await import("./invoiceNumbering");
  const invoices = await findAppointmentInvoices(bookings.map(booking => booking.id)).catch(error => {
    console.error("[PersonalData] Issued invoices could not be read", error instanceof Error ? error.name : "UnknownError");
    return new Map<number, { invoiceNumber: string }>();
  });
  const applications = await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId, createdAt: cvApplications.createdAt })
    .from(cvApplications).where(sameEmail(cvApplications.email, email)).orderBy(desc(cvApplications.createdAt)).limit(limit);
  // Candidate accounts store the address normalised (trimmed, lower case).
  const accounts = await db.select({ id: candidateAccounts.id, linkedApplicationId: candidateAccounts.linkedApplicationId })
    .from(candidateAccounts).where(eq(candidateAccounts.email, normalizePersonEmail(email)));

  return {
    email: normalizePersonEmail(email),
    contactMessages: contacts,
    medicalQuestions: questions,
    gdprRequests: requests,
    appointments: bookings.map(booking => ({ ...booking, invoiceNumber: invoices.get(booking.id)?.invoiceNumber ?? null })),
    recruitment: {
      applications,
      candidateAccountWithoutApplication: accounts.some(account => account.linkedApplicationId === null) && applications.length === 0,
    },
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

export async function exportPersonalData(input: { email: string; actorOpenId: string; now?: Date }) {
  const data = await findPersonalData(input.email);
  const now = input.now ?? new Date();
  await logSecurityEvent({
    actorKind: "admin",
    actorReference: input.actorOpenId,
    category: "admin_personal_data_exported",
    outcome: "allowed",
    metadata: { contactMessages: data.contactMessages.length, medicalQuestions: data.medicalQuestions.length, gdprRequests: data.gdprRequests.length, appointments: data.appointments.length },
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
