import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appointmentInvoices,
  appointments,
  candidateAccounts,
  contactMessages,
  cvApplications,
  gdprRequests,
  medicalQuestionAuditLogs,
  medicalQuestions,
  securityEvents,
} from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// RGPD-12 — traiter dans l’administration la demande RGPD d’un patient ou d’un
// contact : suppression unitaire, refus motivé, recherche par email, export et
// effacement, chaque action étant tracée sans donnée personnelle.

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
// The in-memory database cannot run the invoice table check: invoices are read from its rows.
vi.mock("./invoiceNumbering", async importOriginal => ({
  ...await importOriginal<typeof import("./invoiceNumbering")>(),
  findAppointmentInvoices: vi.fn(async (ids: number[]) => new Map(state.memory
    ? (state.memory as MemoryPg).rows(appointmentInvoices).filter(row => ids.includes(row.appointment_id as number)).map(row => [row.appointment_id as number, { invoiceNumber: row.invoice_number as string }])
    : [])),
}));

import { appRouter } from "./routers";
import { PERSONAL_DATA_SEARCH_LIMIT } from "./personalDataAdmin";

const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;
let memory: MemoryPg;

function caller() {
  return appRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}

function seedPerson(email: string, name: string) {
  const [message] = memory.seed(contactMessages, [{ tracking_id: `C-${name}`, name, email, phone: "+33600000000", message: `Message de ${name}`, createdAt: new Date(NOW.getTime() - 30 * DAY) }]);
  const [question] = memory.seed(medicalQuestions, [{
    tracking_id: `QMED-${name}`, first_name: name, last_name: "Test", email, phone: "+33611111111",
    question: `Question santé de ${name} avant mon opération`, status: "answered", admin_response: "Information générale.",
  }]);
  memory.seed(medicalQuestionAuditLogs, [{ medical_question_id: question!.id, action: "submitted" }]);
  const [past, upcoming] = memory.seed(appointments, [
    { tracking_id: `APTPAST-${name}`.slice(0, 20), customer_name: name, customer_email: email, customer_phone: "+33622222222", request_details: "Motif médical", appointment_date: new Date(NOW.getTime() - 40 * DAY), base_price: "100.00", final_price: "100.00", payment_status: "completed", appointment_status: "completed" },
    { tracking_id: `APTNEXT-${name}`.slice(0, 20), customer_name: name, customer_email: email, customer_phone: "+33622222222", request_details: "Motif médical", appointment_date: new Date(NOW.getTime() + 10 * DAY), base_price: "100.00", final_price: "100.00", payment_status: "completed", appointment_status: "confirmed" },
  ]);
  memory.seed(appointmentInvoices, [{ appointment_id: past!.id, invoice_series: "FAC-2026", invoice_sequence: past!.id, invoice_number: `FAC-2026-00000${past!.id}`, issued_at: new Date(NOW.getTime() - 41 * DAY), paid_at: new Date(NOW.getTime() - 41 * DAY) }]);
  const [request] = memory.seed(gdprRequests, [{ tracking_id: `G-${name}`, name, email, request_type: "deletion", description: "Merci d’effacer mes données." }]);
  return { message: message!, question: question!, past: past!, upcoming: upcoming!, request: request! };
}

beforeEach(() => {
  memory = createMemoryPg([appointmentInvoices, appointments, candidateAccounts, contactMessages, cvApplications, gdprRequests, medicalQuestionAuditLogs, medicalQuestions, securityEvents]);
  state.memory = memory;
});

/** No trace may hold the person's address, name or message. */
function expectTracesWithoutPersonalData(...forbidden: string[]) {
  for (const event of memory.rows(securityEvents)) {
    const text = JSON.stringify(event).toLowerCase();
    for (const value of forbidden) expect(text).not.toContain(value.toLowerCase());
  }
}

describe("RGPD-12 — suppression d’un message et d’une question santé", () => {
  it("supprime un message de contact et trace l’action sans donnée personnelle", async () => {
    const jeanne = seedPerson("jeanne@test.local", "Jeanne");
    const paul = seedPerson("paul@test.local", "Paul");

    await expect(caller().admin.contacts.delete({ id: jeanne.message.id as number })).resolves.toEqual({ success: true });
    expect(memory.rows(contactMessages).map(row => row.id)).toEqual([paul.message.id]);
    expect(memory.rows(securityEvents)).toEqual([expect.objectContaining({ security_event_actor_kind: "admin", actor_reference: "user_owner", category: "admin_contact_message_deleted", security_event_outcome: "allowed" })]);
    expectTracesWithoutPersonalData("jeanne", "Message de");
    await expect(caller().admin.contacts.delete({ id: jeanne.message.id as number })).rejects.toThrow("Message introuvable");
  });

  it("supprime une question santé avec son journal, et trace l’action sans donnée personnelle", async () => {
    const jeanne = seedPerson("jeanne@test.local", "Jeanne");
    const paul = seedPerson("paul@test.local", "Paul");

    await caller().medicalQuestions.admin.delete({ id: jeanne.question.id as number });
    expect(memory.rows(medicalQuestions).map(row => row.id)).toEqual([paul.question.id]);
    expect(memory.rows(medicalQuestionAuditLogs).map(row => row.medical_question_id)).toEqual([paul.question.id]);
    expect(memory.rows(securityEvents)).toEqual([expect.objectContaining({ actor_reference: "user_owner", category: "admin_medical_question_deleted" })]);
    expectTracesWithoutPersonalData("jeanne", "Question santé");
  });
});

describe("RGPD-12 — refus motivé et date de réponse", () => {
  it("refuse un refus sans motif, puis enregistre le motif et la date de réponse", async () => {
    const { request } = seedPerson("jeanne@test.local", "Jeanne");
    const gdpr = caller().admin.gdprRequests;

    await expect(gdpr.updateStatus({ id: request.id as number, status: "rejected" })).rejects.toThrow("Indiquez le motif du refus");
    await expect(gdpr.updateStatus({ id: request.id as number, status: "rejected", notes: "   " })).rejects.toThrow("Indiquez le motif du refus");
    expect(memory.rows(gdprRequests)[0]).toMatchObject({ status: "pending", notes: null, response_date: null });

    await gdpr.updateStatus({ id: request.id as number, status: "rejected", notes: "Identité non vérifiable malgré notre demande du 2 novembre." });
    expect(memory.rows(gdprRequests)[0]).toMatchObject({ status: "rejected", notes: "Identité non vérifiable malgré notre demande du 2 novembre." });
    expect(memory.rows(gdprRequests)[0]!.response_date).not.toBeNull();
  });

  it("garde la note d’une demande traitée et date la réponse", async () => {
    const { request } = seedPerson("jeanne@test.local", "Jeanne");
    await caller().admin.gdprRequests.updateStatus({ id: request.id as number, status: "in_progress", notes: "Export envoyé le 3 novembre." });
    expect(memory.rows(gdprRequests)[0]).toMatchObject({ status: "in_progress", notes: "Export envoyé le 3 novembre.", response_date: null });
    await caller().admin.gdprRequests.updateStatus({ id: request.id as number, status: "completed" });
    expect(memory.rows(gdprRequests)[0]).toMatchObject({ status: "completed", notes: "Export envoyé le 3 novembre." });
    expect(memory.rows(gdprRequests)[0]!.response_date).not.toBeNull();
  });

  it("efface une note enregistrée par erreur quand elle est vidée", async () => {
    const { request } = seedPerson("jeanne@test.local", "Jeanne");
    const gdpr = caller().admin.gdprRequests;
    await gdpr.updateStatus({ id: request.id as number, status: "in_progress", notes: "Note saisie sur la mauvaise demande : Paul Durand." });
    await gdpr.updateStatus({ id: request.id as number, status: "in_progress", notes: "" });
    expect(memory.rows(gdprRequests)[0]).toMatchObject({ status: "in_progress", notes: null });
    // Refusing still needs a reason.
    await expect(gdpr.updateStatus({ id: request.id as number, status: "rejected", notes: "" })).rejects.toThrow("Indiquez le motif du refus");
  });
});

describe("RGPD-12 — rechercher une personne par email", () => {
  it("liste ses données dans toutes les tables, quelle que soit la casse, sans celles des autres", async () => {
    const jeanne = seedPerson("Jeanne.Martin@Test.local", "Jeanne");
    seedPerson("paul@test.local", "Paul");
    memory.seed(cvApplications, [{ tracking_id: "CVJEANNE0001", first_name: "Jeanne", last_name: "Martin", email: "jeanne.martin@test.local", specialty: "Anesthésie", target_countries: "[]", cv_file_key: "recruitment/cv/x.pdf", cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000 }]);

    const found = await caller().admin.personalData.find({ email: "  JEANNE.martin@test.LOCAL " });
    expect(found.email).toBe("jeanne.martin@test.local");
    expect(found.contactMessages.map(row => row.trackingId)).toEqual(["C-Jeanne"]);
    expect(found.medicalQuestions.map(row => row.trackingId)).toEqual(["QMED-Jeanne"]);
    expect(found.gdprRequests.map(row => row.trackingId)).toEqual(["G-Jeanne"]);
    expect(found.appointments.map(row => [row.trackingId, row.invoiceNumber])).toEqual([
      [jeanne.upcoming.tracking_id, null],
      [jeanne.past.tracking_id, `FAC-2026-00000${jeanne.past.id}`],
    ]);
    expect(found.recruitment).toEqual({ applications: [expect.objectContaining({ trackingId: "CVJEANNE0001" })], candidateAccountWithoutApplication: false });
  });

  it("signale un espace candidat ouvert sans candidature", async () => {
    memory.seed(candidateAccounts, [{ email: "solo@test.local", password_hash: "x".repeat(60) }]);
    const found = await caller().admin.personalData.find({ email: "Solo@test.local" });
    expect(found.recruitment).toEqual({ applications: [], candidateAccountWithoutApplication: true });
  });

  it("exporte ses données en JSON, sans identifiant interne, et trace l’export sans donnée personnelle", async () => {
    seedPerson("jeanne@test.local", "Jeanne");
    seedPerson("paul@test.local", "Paul");

    const exported = await caller().admin.personalData.export({ email: "JEANNE@test.local" });
    expect(exported.filename).toMatch(/^donnees-personnelles-\d{4}-\d{2}-\d{2}\.json$/);
    const content = JSON.parse(exported.content);
    expect(content).toMatchObject({ controller: "Hippocampus Consulting SARL", email: "jeanne@test.local" });
    expect(content.contactMessages).toEqual([expect.objectContaining({ trackingId: "C-Jeanne", message: "Message de Jeanne", email: "jeanne@test.local" })]);
    expect(content.medicalQuestions).toEqual([expect.objectContaining({ question: "Question santé de Jeanne avant mon opération", adminResponse: "Information générale." })]);
    expect(content.appointments).toHaveLength(2);
    expect(content.appointments[0]).toMatchObject({ language: "fr", cancellationReason: null });
    expect(content.contactMessages[0]).toMatchObject({ read: 0 });
    expect(content.gdprRequests[0]).toHaveProperty("notes", null);
    expect(exported.content).not.toContain("Paul");
    expect(content.contactMessages[0]).not.toHaveProperty("id");
    expect(memory.rows(securityEvents)).toEqual([expect.objectContaining({ actor_reference: "user_owner", category: "admin_personal_data_exported" })]);
    expectTracesWithoutPersonalData("jeanne");
  });
});

describe("RGPD-12 — au-delà des lignes affichées", () => {
  it("liste les plus récents avec le total de chaque table, et exporte toutes les lignes", async () => {
    seedPerson("jeanne@test.local", "Jeanne");
    const extra = PERSONAL_DATA_SEARCH_LIMIT + 4;
    memory.seed(contactMessages, Array.from({ length: extra }, (_, index) => ({
      tracking_id: `C-JEANNE-${index}`, name: "Jeanne", email: index % 2 ? "JEANNE@test.local" : "jeanne@test.local", phone: null,
      message: `Relance ${index}`, createdAt: new Date(NOW.getTime() - (index + 1) * 60_000),
    })));

    const found = await caller().admin.personalData.find({ email: "jeanne@test.local" });
    expect(found.contactMessages).toHaveLength(PERSONAL_DATA_SEARCH_LIMIT);
    expect(found.contactMessages[0]!.trackingId).toBe("C-JEANNE-0");
    expect(found.totals).toEqual({ contactMessages: extra + 1, medicalQuestions: 1, gdprRequests: 1, appointments: 2, recruitmentApplications: 0 });

    const exported = await caller().admin.personalData.export({ email: "jeanne@test.local" });
    const content = JSON.parse(exported.content);
    expect(content.contactMessages).toHaveLength(extra + 1);
    expect(new Set(content.contactMessages.map((message: { trackingId: string }) => message.trackingId)).size).toBe(extra + 1);
    expect(JSON.parse(memory.rows(securityEvents)[0]!.metadata as string)).toEqual({ contactMessages: extra + 1, medicalQuestions: 1, gdprRequests: 1, appointments: 2, recruitmentApplications: 0 });
  });
});

describe("RGPD-12 — ce que l’effacement ferait", () => {
  it("compte les lignes à effacer, et rien quand il ne reste que des demandes RGPD ou des rendez-vous à venir", async () => {
    const jeanne = seedPerson("jeanne@test.local", "Jeanne");
    // Message, question and past booking: the upcoming confirmed one is left.
    expect((await caller().admin.personalData.find({ email: "jeanne@test.local" })).erasableRows).toBe(3);

    await caller().admin.personalData.erase({ email: "jeanne@test.local" });
    const after = await caller().admin.personalData.find({ email: "jeanne@test.local" });
    expect(after).toMatchObject({ erasableRows: 0, totals: { contactMessages: 0, medicalQuestions: 0, gdprRequests: 1, appointments: 1 } });

    memory.rows(appointments).find(row => row.id === jeanne.upcoming.id)!.appointment_status = "cancelled";
    expect((await caller().admin.personalData.find({ email: "jeanne@test.local" })).erasableRows).toBe(1);

    memory.seed(gdprRequests, [{ tracking_id: "G-SOLO", name: "Solo", email: "solo@test.local", request_type: "access" }]);
    expect(await caller().admin.personalData.find({ email: "solo@test.local" })).toMatchObject({ erasableRows: 0, totals: { gdprRequests: 1 } });
  });
});

describe("RGPD-12 — journal de sécurité de l’administration", () => {
  it("montre les compteurs des actions sur les données d’une personne, et seulement eux", async () => {
    const jeanne = seedPerson("jeanne@test.local", "Jeanne");
    await caller().admin.contacts.delete({ id: jeanne.message.id as number });
    await caller().admin.personalData.erase({ email: "jeanne@test.local" });
    memory.seed(securityEvents, [{ security_event_actor_kind: "anonymous", actor_reference: "empreinte-ip", category: "candidate_login", security_event_outcome: "blocked", metadata: JSON.stringify({ attempts: 3, email: "jeanne@test.local" }) }]);

    const events = await caller().adminSecurity.events({ limit: 10 });
    const byCategory = new Map(events.map(event => [event.category, event]));
    expect(byCategory.get("admin_contact_message_deleted")!.counts).toEqual({ deleted: 1 });
    expect(byCategory.get("admin_personal_data_erased")!.counts).toEqual({ contactMessagesDeleted: 0, medicalQuestionsDeleted: 1, appointmentsAnonymised: 1, upcomingAppointmentsKept: 1, recruitmentApplicationsLeft: 0 });
    expect(byCategory.get("candidate_login")!.counts).toBeNull();
    for (const event of events) expect(event).not.toHaveProperty("metadata");
    expect(JSON.stringify(events)).not.toContain("jeanne");
  });
});

describe("RGPD-12 — effacer / anonymiser une personne", () => {
  it("supprime messages et questions, anonymise les rendez-vous passés en gardant la facture, laisse le reste", async () => {
    const jeanne = seedPerson("jeanne@test.local", "Jeanne");
    const paul = seedPerson("paul@test.local", "Paul");
    memory.seed(cvApplications, [{ tracking_id: "CVJEANNE0001", first_name: "Jeanne", last_name: "Test", email: "Jeanne@test.local", specialty: "Anesthésie", target_countries: "[]", cv_file_key: "recruitment/cv/x.pdf", cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000 }]);

    const report = await caller().admin.personalData.erase({ email: "JEANNE@test.local" });
    expect(report).toEqual({
      contactMessagesDeleted: 1,
      medicalQuestionsDeleted: 1,
      appointmentsAnonymised: 1,
      upcomingAppointments: [jeanne.upcoming.tracking_id],
      gdprRequestsKept: 1,
      recruitmentApplications: ["CVJEANNE0001"],
    });

    expect(memory.rows(contactMessages).map(row => row.id)).toEqual([paul.message.id]);
    expect(memory.rows(medicalQuestions).map(row => row.id)).toEqual([paul.question.id]);
    expect(memory.rows(medicalQuestionAuditLogs).map(row => row.medical_question_id)).toEqual([paul.question.id]);
    const byId = new Map(memory.rows(appointments).map(row => [row.id, row]));
    expect(byId.get(jeanne.past.id)).toMatchObject({ customer_name: "Anonymisé", customer_email: "", customer_phone: "", request_details: "", final_price: "100.00", payment_status: "completed", appointment_status: "completed" });
    expect(byId.get(jeanne.upcoming.id)).toMatchObject({ customer_name: "Jeanne", customer_email: "jeanne@test.local", appointment_status: "confirmed" });
    expect(byId.get(paul.past.id)).toMatchObject({ customer_name: "Paul", customer_email: "paul@test.local" });
    expect(memory.rows(appointmentInvoices).map(row => row.appointment_id)).toEqual([jeanne.past.id, paul.past.id]);
    expect(memory.rows(gdprRequests)).toHaveLength(2);
    expect(memory.rows(cvApplications)).toHaveLength(1);

    expect(memory.rows(securityEvents)).toEqual([expect.objectContaining({ actor_reference: "user_owner", category: "admin_personal_data_erased" })]);
    expect(JSON.parse(memory.rows(securityEvents)[0]!.metadata as string)).toEqual({ contactMessagesDeleted: 1, medicalQuestionsDeleted: 1, appointmentsAnonymised: 1, upcomingAppointmentsKept: 1, recruitmentApplicationsLeft: 1 });
    expectTracesWithoutPersonalData("jeanne");

    // Nothing left to find but the upcoming booking and the GDPR request.
    const after = await caller().admin.personalData.find({ email: "jeanne@test.local" });
    expect([after.contactMessages.length, after.medicalQuestions.length, after.appointments.length, after.gdprRequests.length]).toEqual([0, 0, 1, 1]);
  });

  it("anonymise aussi un rendez-vous futur annulé et un créneau abandonné, et ne garde que ceux encore en cours", async () => {
    const future = new Date(NOW.getTime() + 5 * DAY);
    const booking = (trackingId: string, extra: Record<string, unknown>) => ({
      tracking_id: trackingId, customer_name: "Jeanne", customer_email: "jeanne@test.local", customer_phone: "+33622222222", request_details: "Motif médical",
      appointment_date: future, base_price: "100.00", final_price: "100.00", ...extra,
    });
    const [cancelled, abandoned, confirmed, holding, expiredHold, toRefund] = memory.seed(appointments, [
      // Cancelled by the practitioner and refunded, date still ahead.
      booking("APTCANCEL", { payment_status: "refunded", appointment_status: "cancelled", cancellation_reason: "Annulation / remboursement par le praticien : indisponible", cancelled_at: NOW, refund_amount: "100.00", refunded_at: NOW, stripe_payment_intent_id: "pi_cancel" }),
      // Booking started and never paid: its hold released by the cleanup.
      booking("APTABANDON", { payment_status: "pending", appointment_status: "cancelled", stripe_session_id: "cs_abandon", cancelled_at: NOW }),
      booking("APTCONFIRM", { payment_status: "completed", appointment_status: "confirmed", stripe_payment_intent_id: "pi_confirm" }),
      booking("APTHOLD", { payment_status: "pending", appointment_status: "held", stripe_session_id: "cs_hold", hold_expires_at: new Date(NOW.getTime() + 20 * 60 * 1000) }),
      // Expired, but Stripe has not said yet that it can no longer be paid.
      booking("APTHOLDEXP", { payment_status: "pending", appointment_status: "held", stripe_session_id: "cs_hold_expired", hold_expires_at: new Date(NOW.getTime() - 60 * 1000) }),
      // Paid after its slot was released: the patient must be refunded.
      booking("APTREFUND", { payment_status: "pending", appointment_status: "cancelled", stripe_session_id: "cs_late", stripe_payment_intent_id: "pi_late", cancelled_at: NOW }),
    ]);

    const report = await caller().admin.personalData.erase({ email: "jeanne@test.local" });
    expect(report.appointmentsAnonymised).toBe(2);
    expect([...report.upcomingAppointments].sort()).toEqual(["APTCONFIRM", "APTHOLD", "APTHOLDEXP", "APTREFUND"]);

    const byId = new Map(memory.rows(appointments).map(row => [row.id, row]));
    for (const row of [cancelled, abandoned]) {
      expect(byId.get(row!.id)).toMatchObject({ customer_name: "Anonymisé", customer_email: "", customer_phone: "", request_details: "", cancellation_reason: null, appointment_status: "cancelled" });
    }
    expect(byId.get(cancelled!.id)).toMatchObject({ payment_status: "refunded", refund_amount: "100.00", stripe_payment_intent_id: "pi_cancel" });
    for (const row of [confirmed, holding, expiredHold, toRefund]) {
      expect(byId.get(row!.id)).toMatchObject({ customer_name: "Jeanne", customer_email: "jeanne@test.local", request_details: "Motif médical" });
    }
    expect(JSON.parse(memory.rows(securityEvents)[0]!.metadata as string)).toMatchObject({ appointmentsAnonymised: 2, upcomingAppointmentsKept: 4 });

    // Once refunded, the late payment's booking is erased in turn.
    memory.rows(appointments).find(row => row.id === toRefund!.id)!.payment_status = "refunded";
    const again = await caller().admin.personalData.erase({ email: "jeanne@test.local" });
    expect(again.appointmentsAnonymised).toBe(1);
    expect([...again.upcomingAppointments].sort()).toEqual(["APTCONFIRM", "APTHOLD", "APTHOLDEXP"]);
  });
});
