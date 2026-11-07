import { adminProcedure } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../../db";
import { appointments, candidateDocuments, contactMessages, cvApplications, gdprRequests, medicalQuestions } from "../../../drizzle/schema";
import { and, asc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { getParisDateRange, getParisParts, pad, parisDateKey } from "../parisTime";
// The one-month answer deadline the RGPD tab shows (pure date arithmetic, RGPD-12).
import { gdprRequestDeadline } from "../../../client/src/components/gdprRequestAdmin";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const OPEN_MEDICAL_QUESTION_STATUSES = ["submitted", "drafting"] as const;
const OPEN_GDPR_REQUEST_STATUSES = ["pending", "in_progress"] as const;
/** Payments the practice received: a refunded one counts for what was kept. */
const RECEIVED_PAYMENT_STATUSES = ["completed", "refunded"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rolling window of the booking conversion and of the answer time to questions. */
const RECENT_WINDOW_DAYS = 30;

/** « 2026-11-14 », the Paris calendar day `days` days after the given one. */
function dayKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** « 2026-11 », the Paris calendar month `offset` months away from the given one. */
function monthKey(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

const monthStart = (key: string) => getParisDateRange(`${key}-01`).start;

/** Cents of an amount stored as decimal text (« 150.00 »). */
const cents = (amount: string | null) => Math.round(Number(amount ?? 0) * 100) || 0;

const euros = (amountInCents: number) => (amountInCents / 100).toFixed(2);

/**
 * What the dashboard overview shows (ADM-06): what waits for an action, then
 * the indicators (revenue, consultations of the coming week, booking
 * conversion, applications per week, answer time to questions). Days and
 * months are those of Paris, whatever the server's time zone. Every figure is
 * counted in the database except the revenue, summed from the paid
 * consultations of two months, and the answer time, averaged over the answers
 * of the last 30 days.
 */
export async function readAdminOverviewStats(db: Database, now = new Date()) {
  const todayKey = parisDateKey(now);
  const today = getParisDateRange(todayKey);
  const tomorrow = getParisDateRange(parisDateKey(today.end));
  // Today (what is left of it) and the six days after.
  const upcomingWeekLastDay = dayKey(todayKey, 6);
  const upcomingWeekEnd = getParisDateRange(upcomingWeekLastDay).end;
  const recentSince = new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS);
  const lastWeekSince = new Date(now.getTime() - 7 * DAY_MS);
  const fourWeeksSince = new Date(now.getTime() - 28 * DAY_MS);
  const { year, month } = getParisParts(now);
  const [previousMonth, currentMonth, nextMonth] = [-1, 0, 1].map(offset => monthKey(year, month, offset));
  const currentMonthStart = monthStart(currentMonth);

  const confirmedOn = (day: { start: Date; end: Date }) => db.select({ count: sql<number>`COUNT(*)` }).from(appointments)
    .where(and(eq(appointments.appointmentStatus, "confirmed"), gte(appointments.appointmentDate, day.start), lt(appointments.appointmentDate, day.end)));
  const applicationsSince = (since: Date) => db.select({ count: sql<number>`COUNT(*)` }).from(cvApplications).where(gte(cvApplications.createdAt, since));
  // Bookings started in the window, but for those whose payment page is still open.
  const bookingStarted = and(gte(appointments.createdAt, recentSince), or(ne(appointments.appointmentStatus, "held"), ne(appointments.paymentStatus, "pending")));
  const openQuestion = inArray(medicalQuestions.status, OPEN_MEDICAL_QUESTION_STATUSES);
  const openGdprRequest = inArray(gdprRequests.status, OPEN_GDPR_REQUEST_STATUSES);

  const [
    [todayCount],
    [tomorrowCount],
    [questionCount],
    [oldestQuestion],
    [unreadCount],
    [gdprCount],
    [oldestGdprRequest],
    [documentCount],
    [newApplicationCount],
    [upcomingWeekCount],
    [startedBookingCount],
    [paidBookingCount],
    [lastWeekApplicationCount],
    [fourWeeksApplicationCount],
    recentAnswers,
    paidConsultations,
  ] = await Promise.all([
    confirmedOn(today),
    confirmedOn(tomorrow),
    db.select({ count: sql<number>`COUNT(*)` }).from(medicalQuestions).where(openQuestion),
    db.select({ createdAt: medicalQuestions.createdAt }).from(medicalQuestions).where(openQuestion).orderBy(asc(medicalQuestions.createdAt)).limit(1),
    db.select({ count: sql<number>`COUNT(*)` }).from(contactMessages).where(eq(contactMessages.read, 0)),
    db.select({ count: sql<number>`COUNT(*)` }).from(gdprRequests).where(openGdprRequest),
    db.select({ createdAt: gdprRequests.createdAt }).from(gdprRequests).where(openGdprRequest).orderBy(asc(gdprRequests.createdAt)).limit(1),
    db.select({ count: sql<number>`COUNT(*)` }).from(candidateDocuments).where(eq(candidateDocuments.status, "needs_review")),
    db.select({ count: sql<number>`COUNT(*)` }).from(cvApplications).where(eq(cvApplications.status, "new")),
    confirmedOn({ start: now, end: upcomingWeekEnd }),
    db.select({ count: sql<number>`COUNT(*)` }).from(appointments).where(bookingStarted),
    db.select({ count: sql<number>`COUNT(*)` }).from(appointments).where(and(bookingStarted, inArray(appointments.paymentStatus, RECEIVED_PAYMENT_STATUSES))),
    applicationsSince(lastWeekSince),
    applicationsSince(fourWeeksSince),
    // A resend moves response_sent_at to its own time: that answer counts from the question to the resend.
    db.select({ createdAt: medicalQuestions.createdAt, responseSentAt: medicalQuestions.responseSentAt }).from(medicalQuestions).where(gte(medicalQuestions.responseSentAt, recentSince)),
    db.select({ appointmentDate: appointments.appointmentDate, paymentStatus: appointments.paymentStatus, finalPrice: appointments.finalPrice, refundAmount: appointments.refundAmount })
      .from(appointments)
      .where(and(inArray(appointments.paymentStatus, RECEIVED_PAYMENT_STATUSES), gte(appointments.appointmentDate, monthStart(previousMonth)), lt(appointments.appointmentDate, monthStart(nextMonth)))),
  ]);

  // Consultations of the month, paid, refunds deducted (the site records full refunds only).
  const revenueInCents = { current: 0, previous: 0 };
  for (const consultation of paidConsultations) {
    const kept = cents(consultation.finalPrice) - (consultation.paymentStatus === "refunded" ? cents(consultation.refundAmount ?? consultation.finalPrice) : 0);
    revenueInCents[consultation.appointmentDate.getTime() >= currentMonthStart.getTime() ? "current" : "previous"] += kept;
  }

  const responseTimes = recentAnswers.map(answer => answer.responseSentAt!.getTime() - answer.createdAt.getTime());

  return {
    appointments: {
      today: Number(todayCount?.count ?? 0),
      tomorrow: Number(tomorrowCount?.count ?? 0),
      upcomingWeek: { count: Number(upcomingWeekCount?.count ?? 0), lastDay: upcomingWeekLastDay },
    },
    medicalQuestions: {
      open: Number(questionCount?.count ?? 0),
      oldestReceivedAt: oldestQuestion?.createdAt ?? null,
      recentAnswers: {
        count: responseTimes.length,
        averageResponseMs: responseTimes.length ? Math.round(responseTimes.reduce((total, ms) => total + ms, 0) / responseTimes.length) : null,
      },
    },
    unreadMessages: Number(unreadCount?.count ?? 0),
    // The oldest open request has the nearest deadline.
    gdprRequests: { open: Number(gdprCount?.count ?? 0), nextDeadline: oldestGdprRequest ? gdprRequestDeadline(oldestGdprRequest.createdAt) : null },
    documentsToReview: Number(documentCount?.count ?? 0),
    applications: {
      new: Number(newApplicationCount?.count ?? 0),
      lastWeek: Number(lastWeekApplicationCount?.count ?? 0),
      lastFourWeeks: Number(fourWeeksApplicationCount?.count ?? 0),
    },
    bookingConversion: { started: Number(startedBookingCount?.count ?? 0), paid: Number(paidBookingCount?.count ?? 0) },
    revenue: {
      currentMonth: { month: currentMonth, amount: euros(revenueInCents.current) },
      previousMonth: { month: previousMonth, amount: euros(revenueInCents.previous) },
    },
  };
}

export type AdminOverviewStats = Awaited<ReturnType<typeof readAdminOverviewStats>>;

// Dashboard stats
export const adminStatsProcedure = adminProcedure.query(async () => {
  const db = await getDb();
  // No zeros standing for « nothing to do » when the counts cannot be read.
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de données indisponible." });
  return readAdminOverviewStats(db);
});
