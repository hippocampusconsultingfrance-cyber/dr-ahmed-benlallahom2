import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appointments, candidateDocuments, contactMessages, cvApplications, gdprRequests, medicalQuestions } from "../../../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "../../testing/memoryPgProxy";
import type { TrpcContext } from "../../_core/context";

// ADM-06 — vue d’ensemble de l’administration : ce qui attend une action
// (rendez-vous confirmés du jour et du lendemain, questions santé, messages non
// lus, demandes RGPD et leur échéance, documents à revoir, nouvelles
// candidatures), puis les indicateurs : chiffre d’affaires du mois et du mois
// précédent, consultations des 7 prochains jours, conversion des réservations,
// candidatures par semaine, délai de réponse aux questions ; jours et mois de
// Paris. Vraie procédure sur une base en mémoire.

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));

vi.mock("../../db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("../../adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("../../adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("../../_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));

const { appRouter } = await import("../../routers");

let memory: MemoryPg;

const stats = () => appRouter.createCaller({
  user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
  mfaVerified: true,
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
}).admin.stats();

let appointmentNumber = 0;
function seedAppointment(appointmentDate: string, overrides: Record<string, unknown> = {}) {
  appointmentNumber += 1;
  memory.seed(appointments, [{
    tracking_id: `APTSTATS${String(appointmentNumber).padStart(4, "0")}`,
    customer_name: "Patient Test",
    customer_email: "patient@example.test",
    customer_phone: "+33600000000",
    request_details: "Demande d’avis",
    appointment_date: new Date(appointmentDate),
    base_price: "100.00",
    final_price: "100.00",
    payment_status: "completed",
    appointment_status: "confirmed",
    ...overrides,
  }]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  memory = createMemoryPg([appointments, candidateDocuments, contactMessages, cvApplications, gdprRequests, medicalQuestions]);
  state.memory = memory;
});
afterEach(() => {
  vi.useRealTimers();
  state.memory = null;
});

describe("ADM-06 — compteurs « à traiter » de la vue d’ensemble", () => {
  it("compte les rendez-vous confirmés du jour et du lendemain de Paris, pas du jour UTC", async () => {
    // Sunday 8 November 2026, 00:30 in Paris; still Saturday 7 in UTC.
    vi.setSystemTime(new Date("2026-11-07T23:30:00Z"));
    seedAppointment("2026-11-07T22:30:00Z"); // Saturday 7, 23:30 in Paris: yesterday.
    seedAppointment("2026-11-07T23:00:00Z"); // Sunday 8, 00:00: today.
    seedAppointment("2026-11-08T22:59:00Z"); // Sunday 8, 23:59: today.
    seedAppointment("2026-11-08T10:00:00Z", { appointment_status: "held", payment_status: "pending" });
    seedAppointment("2026-11-08T11:00:00Z", { appointment_status: "cancelled", payment_status: "refunded", refund_amount: "100.00" });
    seedAppointment("2026-11-08T12:00:00Z", { appointment_status: "completed" });
    seedAppointment("2026-11-08T23:00:00Z"); // Monday 9, 00:00: tomorrow.
    seedAppointment("2026-11-09T23:00:00Z"); // Tuesday 10, 00:00: the day after.

    await expect(stats()).resolves.toMatchObject({ appointments: { today: 2, tomorrow: 1 } });
  });

  it("suit les jours de Paris au changement d’heure : le lendemain d’un jour de 23 heures", async () => {
    // Sunday 29 March 2026, clocks go forward in Paris: that day ends at 22:00 UTC.
    vi.setSystemTime(new Date("2026-03-29T08:00:00Z"));
    seedAppointment("2026-03-29T21:30:00Z"); // Sunday 29, 23:30 in Paris: today.
    seedAppointment("2026-03-29T22:30:00Z"); // Monday 30, 00:30 in Paris: tomorrow.
    seedAppointment("2026-03-30T21:59:00Z"); // Monday 30, 23:59: tomorrow.
    seedAppointment("2026-03-30T22:00:00Z"); // Tuesday 31, 00:00: the day after.

    await expect(stats()).resolves.toMatchObject({ appointments: { today: 1, tomorrow: 2 } });
  });

  it("donne les questions à répondre et la plus ancienne, les messages non lus, les documents à revoir", async () => {
    vi.setSystemTime(new Date("2026-11-07T09:00:00Z"));
    const question = (status: string, createdAt: string) => ({ tracking_id: `QMED-${status}-${createdAt}`, first_name: "Jeanne", last_name: "Test", email: "jeanne@example.test", phone: "+33611111111", question: "Ma question", status, created_at: new Date(createdAt) });
    memory.seed(medicalQuestions, [
      question("answered", "2026-09-01T08:00:00Z"),
      question("submitted", "2026-11-02T08:00:00Z"),
      question("drafting", "2026-10-20T08:00:00Z"),
      question("published", "2026-08-01T08:00:00Z"),
      question("rejected", "2026-07-01T08:00:00Z"),
    ]);
    memory.seed(contactMessages, [0, 1, 0].map((read, index) => ({ tracking_id: `CONTACT${index}`, name: "Paul", email: "paul@example.test", message: "Bonjour", read })));
    const document = (status: string, index: number) => ({ candidate_id: 1, category: "diploma", original_name: `diplome-${index}.pdf`, storage_key: `key-${index}`, mime_type: "application/pdf", size_bytes: 1_000, checksum: `sum-${index}`, status });
    memory.seed(candidateDocuments, ["needs_review", "reviewed", "needs_review", "analyzing", "rejected"].map(document));

    await expect(stats()).resolves.toMatchObject({
      medicalQuestions: { open: 2, oldestReceivedAt: new Date("2026-10-20T08:00:00Z") },
      unreadMessages: 2,
      documentsToReview: 2,
    });
  });

  it("donne les demandes RGPD ouvertes et l’échéance de la plus ancienne, même dépassée", async () => {
    vi.setSystemTime(new Date("2026-11-07T09:00:00Z"));
    const request = (status: string, createdAt: string) => ({ tracking_id: `G-${status}-${createdAt.slice(0, 10)}`, name: "Claire", email: "claire@example.test", request_type: "access", status, createdAt: new Date(createdAt) });
    memory.seed(gdprRequests, [
      request("completed", "2026-09-01T08:00:00Z"),
      request("in_progress", "2026-10-20T08:00:00Z"),
      // Received on 1 October in Paris: due by the end of 1 November in Paris (an hour behind UTC since 25 October).
      request("pending", "2026-10-01T08:00:00Z"),
      request("rejected", "2026-08-01T08:00:00Z"),
    ]);

    await expect(stats()).resolves.toMatchObject({ gdprRequests: { open: 2, nextDeadline: new Date("2026-11-01T22:59:59.999Z") } });

    memory.rows(gdprRequests).splice(0);
    await expect(stats()).resolves.toMatchObject({ gdprRequests: { open: 0, nextDeadline: null } });
  });

  it("additionne le chiffre d’affaires du mois et du mois précédent de Paris, remboursements déduits", async () => {
    // Sunday 8 November 2026, 00:30 in Paris.
    vi.setSystemTime(new Date("2026-11-07T23:30:00Z"));
    seedAppointment("2026-11-03T10:00:00Z", { final_price: "150.10" });
    seedAppointment("2026-10-31T23:30:00Z"); // 1 November, 00:30 in Paris.
    seedAppointment("2026-11-25T10:00:00Z", { final_price: "200.20" }); // Paid ahead, later this month.
    seedAppointment("2026-11-12T10:00:00Z", { payment_status: "refunded", appointment_status: "cancelled", refund_amount: "100.00" });
    seedAppointment("2026-11-13T10:00:00Z", { payment_status: "refunded", appointment_status: "cancelled", refund_amount: null }); // Refunded in full.
    seedAppointment("2026-11-14T10:00:00Z", { payment_status: "pending", appointment_status: "held" });
    seedAppointment("2026-11-15T10:00:00Z", { payment_status: "failed", appointment_status: "cancelled" });
    seedAppointment("2026-10-31T22:30:00Z"); // 31 October, 23:30 in Paris.
    seedAppointment("2026-10-15T10:00:00Z", { final_price: "150.00", payment_status: "refunded", appointment_status: "cancelled", refund_amount: "150.00" });
    seedAppointment("2026-10-10T10:00:00Z", { final_price: "120.00", appointment_status: "cancelled" }); // Cancelled, payment kept.
    seedAppointment("2026-09-30T21:30:00Z"); // 30 September, 23:30 in Paris.
    seedAppointment("2026-11-30T23:30:00Z"); // 1 December, 00:30 in Paris.

    await expect(stats()).resolves.toMatchObject({
      revenue: {
        currentMonth: { month: "2026-11", amount: "450.30" },
        previousMonth: { month: "2026-10", amount: "220.00" },
      },
    });
  });

  it("passe au mois précédent de l’année d’avant en janvier", async () => {
    vi.setSystemTime(new Date("2027-01-10T10:00:00Z"));
    seedAppointment("2026-12-20T10:00:00Z", { final_price: "100.00" });
    seedAppointment("2027-01-05T10:00:00Z", { final_price: "50.00" });

    await expect(stats()).resolves.toMatchObject({
      revenue: { currentMonth: { month: "2027-01", amount: "50.00" }, previousMonth: { month: "2026-12", amount: "100.00" } },
    });
  });

  it("compte les consultations confirmées à venir jusqu’au sixième jour après aujourd’hui à Paris, au changement d’heure", async () => {
    // Tuesday 20 October 2026, 12:00 in Paris; clocks go back on Sunday 25.
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    seedAppointment("2026-10-20T09:00:00Z"); // 11:00 in Paris: already past.
    seedAppointment("2026-10-20T16:00:00Z");
    seedAppointment("2026-10-22T10:00:00Z", { appointment_status: "cancelled", payment_status: "refunded", refund_amount: "100.00" });
    seedAppointment("2026-10-23T10:00:00Z", { appointment_status: "held", payment_status: "pending" });
    seedAppointment("2026-10-26T22:30:00Z"); // Monday 26, 23:30 in Paris (UTC+1 since Sunday).
    seedAppointment("2026-10-26T23:00:00Z"); // Tuesday 27, 00:00: a week later.

    await expect(stats()).resolves.toMatchObject({ appointments: { upcomingWeek: { count: 2, lastDay: "2026-10-26" } } });
  });

  it("compte les nouvelles candidatures, et celles reçues sur 7 jours et sur 4 semaines", async () => {
    vi.setSystemTime(new Date("2026-11-07T09:00:00Z"));
    const application = (status: string, createdAt: string, index: number) => ({
      tracking_id: `CVSTATS${index}`, first_name: "Amina", last_name: "Test", email: `amina${index}@example.test`, specialty: "Anesthésie",
      target_countries: "FR", cv_file_key: `cv-${index}`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1_000, status, createdAt: new Date(createdAt),
    });
    memory.seed(cvApplications, [
      application("new", "2026-11-06T10:00:00Z", 1),
      application("reviewing", "2026-10-31T09:00:00Z", 2), // Exactly 7 days ago.
      application("new", "2026-10-31T08:59:00Z", 3),
      application("rejected", "2026-10-10T09:00:00Z", 4), // Exactly 4 weeks ago.
      application("new", "2026-10-10T08:59:00Z", 5),
    ]);

    await expect(stats()).resolves.toMatchObject({ applications: { new: 3, lastWeek: 2, lastFourWeeks: 4 } });
  });

  it("rapporte les réservations payées aux réservations commencées sur 30 jours, sauf celles encore au paiement", async () => {
    vi.setSystemTime(new Date("2026-11-07T09:00:00Z"));
    const booking = (createdAt: string, overrides: Record<string, unknown> = {}) => seedAppointment("2026-11-20T10:00:00Z", { createdAt: new Date(createdAt), ...overrides });
    booking("2026-11-01T10:00:00Z");
    booking("2026-10-20T10:00:00Z", { payment_status: "refunded", appointment_status: "cancelled", refund_amount: "100.00" });
    booking("2026-10-25T10:00:00Z", { payment_status: "failed", appointment_status: "cancelled" });
    booking("2026-11-03T10:00:00Z", { payment_status: "pending", appointment_status: "cancelled" }); // Hold released unpaid.
    booking("2026-11-07T08:50:00Z", { payment_status: "pending", appointment_status: "held" }); // Payment page still open.
    booking("2026-10-08T08:59:00Z"); // Just over 30 days ago.

    await expect(stats()).resolves.toMatchObject({ bookingConversion: { started: 4, paid: 2 } });
  });

  it("donne le délai moyen de réponse aux questions répondues sur 30 jours", async () => {
    vi.setSystemTime(new Date("2026-11-07T09:00:00Z"));
    const question = (createdAt: string, responseSentAt: string | null, index: number) => ({
      tracking_id: `QMEDTIME${index}`, first_name: "Jeanne", last_name: "Test", email: "jeanne@example.test", phone: "+33611111111", question: "Ma question",
      status: responseSentAt ? "answered" : "submitted", created_at: new Date(createdAt), response_sent_at: responseSentAt ? new Date(responseSentAt) : null,
    });
    memory.seed(medicalQuestions, [
      question("2026-11-01T08:00:00Z", "2026-11-02T08:00:00Z", 1), // 1 day.
      question("2026-10-20T08:00:00Z", "2026-10-23T08:00:00Z", 2), // 3 days.
      question("2026-09-01T08:00:00Z", "2026-10-01T08:00:00Z", 3), // Answered before the window.
      question("2026-11-05T08:00:00Z", null, 4),
    ]);

    await expect(stats()).resolves.toMatchObject({ medicalQuestions: { recentAnswers: { count: 2, averageResponseMs: 2 * 24 * 60 * 60 * 1000 } } });

    memory.rows(medicalQuestions).splice(0);
    await expect(stats()).resolves.toMatchObject({ medicalQuestions: { recentAnswers: { count: 0, averageResponseMs: null } } });
  });

  it("répond une erreur, pas des zéros, quand la base est indisponible", async () => {
    state.memory = null;
    await expect(stats()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
