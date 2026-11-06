import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminMfaChallenges,
  adminMfaSessions,
  appointmentFulfillmentJobs,
  appointmentInvoices,
  appointments,
  candidateSessions,
  contactMessages,
  gdprRequests,
  medicalQuestionAuditLogs,
  medicalQuestions,
  securityEvents,
} from "../drizzle/schema";
import { createMemoryPg, pgTimestamp, type MemoryPg } from "./testing/memoryPgProxy";

// RGPD-09 — les durées annoncées par la politique de confidentialité sont
// appliquées chaque jour : pour chaque règle, la ligne échue part, la récente reste.

const state = vi.hoisted(() => ({ memory: null as null | { db: unknown } }));
vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));

import { runPersonalDataRetention } from "./personalDataRetention";

const NOW = new Date("2026-10-26T04:50:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const yearsAgo = (years: number, extraDays = 0) => {
  const date = new Date(NOW);
  date.setFullYear(date.getFullYear() - years);
  return new Date(date.getTime() - extraDays * DAY);
};

let memory: MemoryPg;
const ids = (table: Parameters<MemoryPg["rows"]>[0]) => memory.rows(table).map(row => row.id);
const run = (options: { batchSize?: number; budgetMs?: number } = {}) => runPersonalDataRetention({ now: NOW, ...options });

beforeEach(() => {
  memory = createMemoryPg([adminMfaChallenges, adminMfaSessions, appointmentFulfillmentJobs, appointmentInvoices, appointments, candidateSessions, contactMessages, gdprRequests, medicalQuestionAuditLogs, medicalQuestions, securityEvents], { now: () => NOW });
  state.memory = memory;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

function seedAppointment(trackingId: string, appointmentDate: Date, extra: Record<string, unknown> = {}) {
  return memory.seed(appointments, [{
    tracking_id: trackingId, customer_name: "Jeanne Patiente", customer_email: "jeanne@test.local", customer_phone: "+33600000000",
    request_details: "Je suis diabétique et je dois être opérée du genou", appointment_date: appointmentDate, base_price: "100.00", final_price: "100.00",
    payment_status: "completed", appointment_status: "completed", stripe_payment_intent_id: `pi_${trackingId}`, meet_link: "https://meet.test/abc",
    createdAt: appointmentDate, updatedAt: appointmentDate, ...extra,
  }])[0]!;
}

function seedQuestion(trackingId: string, createdAt: Date, extra: Record<string, unknown> = {}) {
  return memory.seed(medicalQuestions, [{
    tracking_id: trackingId, first_name: "Paul", last_name: "Patient", email: "paul@test.local", phone: "+33611111111",
    question: "Puis-je prendre mon traitement le matin d’une anesthésie générale ?", status: "answered", created_at: createdAt, updated_at: createdAt, ...extra,
  }])[0]!;
}

describe("RGPD-09 — journaux d’accès : 90 jours", () => {
  it("supprime les événements de sécurité de plus de 90 jours et garde les récents", async () => {
    const [old, recent] = memory.seed(securityEvents, [
      { security_event_actor_kind: "anonymous", category: "candidate_login", security_event_outcome: "failed", created_at: daysAgo(91) },
      { security_event_actor_kind: "anonymous", category: "candidate_login", security_event_outcome: "failed", created_at: daysAgo(89) },
    ]);
    const report = await run();
    expect(ids(securityEvents)).toEqual([recent!.id]);
    expect(ids(securityEvents)).not.toContain(old!.id);
    expect(report).toMatchObject({ securityEvents: 1, complete: true });
  });

  it("supprime les codes de double authentification expirés ou de plus de 90 jours, garde le code en cours", async () => {
    const [, , current] = memory.seed(adminMfaChallenges, [
      { open_id: "user_owner", code_hash: "a".repeat(64), expires_at: new Date(NOW.getTime() - 60_000), created_at: new Date(NOW.getTime() - 11 * 60_000) },
      { open_id: "user_owner", code_hash: "b".repeat(64), expires_at: daysAgo(100), created_at: daysAgo(100) },
      { open_id: "user_owner", code_hash: "c".repeat(64), expires_at: new Date(NOW.getTime() + 9 * 60_000), created_at: new Date(NOW.getTime() - 60_000) },
    ]);
    expect(await run()).toMatchObject({ adminMfaChallenges: 2 });
    expect(ids(adminMfaChallenges)).toEqual([current!.id]);
  });

  it("supprime les sessions administrateur expirées et garde la session active", async () => {
    const [, active] = memory.seed(adminMfaSessions, [
      { open_id: "user_owner", token_hash: "d".repeat(64), expires_at: daysAgo(1), created_at: daysAgo(1.5) },
      { open_id: "user_owner", token_hash: "e".repeat(64), expires_at: new Date(NOW.getTime() + 3_600_000), created_at: NOW },
    ]);
    expect(await run()).toMatchObject({ adminMfaSessions: 1 });
    expect(ids(adminMfaSessions)).toEqual([active!.id]);
  });
});

describe("RGPD-09 — sessions candidat et envois après paiement", () => {
  it("supprime les sessions candidat expirées, garde les sessions valides", async () => {
    const [, valid] = memory.seed(candidateSessions, [
      { candidate_id: 1, token_hash: "f".repeat(64), expires_at: daysAgo(1) },
      { candidate_id: 1, token_hash: "0".repeat(64), expires_at: new Date(NOW.getTime() + DAY) },
    ]);
    expect(await run()).toMatchObject({ candidateSessions: 1 });
    expect(ids(candidateSessions)).toEqual([valid!.id]);
  });

  it("supprime les envois terminés depuis plus de 30 jours, garde les récents et les échecs à traiter", async () => {
    const [, recent, failed] = memory.seed(appointmentFulfillmentJobs, [
      { appointment_id: 1, job_type: "confirmation", status: "completed", finished_at: daysAgo(31) },
      { appointment_id: 2, job_type: "confirmation", status: "completed", finished_at: daysAgo(29) },
      { appointment_id: 3, job_type: "invoice", status: "failed", finished_at: daysAgo(60) },
    ]);
    expect(await run()).toMatchObject({ fulfillmentJobs: 1 });
    expect(ids(appointmentFulfillmentJobs)).toEqual([recent!.id, failed!.id]);
  });
});

describe("RGPD-09 — demandes RGPD : 1 an après clôture", () => {
  it("supprime les demandes closes depuis plus d’un an, garde les récentes et celles encore ouvertes", async () => {
    const base = { name: "Demandeur", email: "demandeur@test.local", request_type: "deletion" };
    const [, , recent, open] = memory.seed(gdprRequests, [
      { ...base, tracking_id: "GOLDDONE", status: "completed", response_date: yearsAgo(1, 1), createdAt: yearsAgo(1, 20), updatedAt: yearsAgo(1, 1) },
      // Refused before the closure date was recorded: its last change counts.
      { ...base, tracking_id: "GOLDREFUSED", status: "rejected", response_date: null, createdAt: yearsAgo(1, 30), updatedAt: yearsAgo(1, 30) },
      { ...base, tracking_id: "GRECENT", status: "completed", response_date: daysAgo(200), createdAt: yearsAgo(1, 30), updatedAt: daysAgo(200) },
      { ...base, tracking_id: "GOPEN", status: "in_progress", createdAt: yearsAgo(2), updatedAt: yearsAgo(2) },
    ]);
    expect(await run()).toMatchObject({ gdprRequests: 2 });
    expect(ids(gdprRequests)).toEqual([recent!.id, open!.id]);
  });
});

describe("RGPD-09 — messages de contact : 3 ans après le dernier contact", () => {
  it("supprime le message de plus de 3 ans, garde le récent et ceux d’une personne revenue depuis", async () => {
    const message = (trackingId: string, email: string, createdAt: Date) => ({ tracking_id: trackingId, name: "Contact", email, message: "Bonjour, j’aimerais un renseignement.", createdAt });
    const [, oldButReturned, recent, returned] = memory.seed(contactMessages, [
      message("COLD", "ancien@test.local", yearsAgo(3, 1)),
      message("COLDBACK", "Fidele@Test.local", yearsAgo(4)),
      message("CRECENT", "recent@test.local", yearsAgo(2)),
      message("CBACK", "fidele@test.local", daysAgo(10)),
    ]);
    expect(await run()).toMatchObject({ contactMessages: 1 });
    expect(ids(contactMessages)).toEqual([oldButReturned!.id, recent!.id, returned!.id]);
  });
});

describe("RGPD-09 — questions santé : 3 ans après le dernier échange", () => {
  it("supprime la question échue et son journal, garde la récente et celle dont la réponse date de moins de 3 ans", async () => {
    const old = seedQuestion("QMED-OLD", yearsAgo(3, 5), { response_sent_at: yearsAgo(3, 4) });
    const recent = seedQuestion("QMED-RECENT", yearsAgo(1));
    const lateAnswer = seedQuestion("QMED-LATE", yearsAgo(4), { response_sent_at: yearsAgo(2) });
    memory.seed(medicalQuestionAuditLogs, [
      { medical_question_id: old.id, action: "submitted", created_at: yearsAgo(3, 5) },
      { medical_question_id: old.id, action: "response_sent", created_at: yearsAgo(3, 4) },
      { medical_question_id: recent.id, action: "submitted", created_at: yearsAgo(1) },
    ]);

    expect(await run()).toMatchObject({ medicalQuestions: 1 });
    expect(ids(medicalQuestions)).toEqual([recent.id, lateAnswer.id]);
    expect(memory.rows(medicalQuestionAuditLogs).map(row => row.medical_question_id)).toEqual([recent.id]);
  });

  it("réduit une question publiée avec accord à sa version publique anonymisée", async () => {
    const published = seedQuestion("QMED-PUBLISHED", yearsAgo(4), {
      status: "published", publication_consent: 1, response_sent_at: yearsAgo(4), published_at: yearsAgo(4),
      admin_response: "Réponse privée adressée à Paul.", public_question: "Peut-on prendre son traitement ?", public_response: "Oui, en général, sur avis médical.",
    });
    memory.seed(medicalQuestionAuditLogs, [{ medical_question_id: published.id, action: "published", created_at: yearsAgo(4) }]);

    expect(await run()).toMatchObject({ medicalQuestions: 1 });
    expect(memory.rows(medicalQuestions)).toEqual([expect.objectContaining({
      id: published.id, status: "published", first_name: "Anonymisé", last_name: "", email: "", phone: "", question: "", admin_response: null,
      public_question: "Peut-on prendre son traitement ?", public_response: "Oui, en général, sur avis médical.",
    })]);
    expect(memory.rows(medicalQuestionAuditLogs)).toEqual([]);
    // Already reduced: the next run leaves it alone.
    expect(await run()).toMatchObject({ medicalQuestions: 0 });
  });
});

describe("RGPD-09 — réservations : minimum comptable après 3 ans", () => {
  it("anonymise le rendez-vous de plus de 3 ans en gardant date, montant, statuts et facture, et laisse le récent", async () => {
    const old = seedAppointment("APTOLD", yearsAgo(3, 2), { cancellation_reason: "Patiente hospitalisée", refund_amount: "0" });
    const recent = seedAppointment("APTRECENT", yearsAgo(2));
    memory.seed(appointmentInvoices, [{ appointment_id: old.id, invoice_series: "FAC-2023", invoice_sequence: 1, invoice_number: "FAC-2023-000001", issued_at: yearsAgo(3, 3), paid_at: yearsAgo(3, 3) }]);

    expect(await run()).toMatchObject({ appointmentsAnonymised: 1 });
    const [anonymised, kept] = memory.rows(appointments);
    expect(anonymised).toMatchObject({
      id: old.id, tracking_id: "APTOLD", customer_name: "Anonymisé", customer_email: "", customer_phone: "", request_details: "",
      cancellation_reason: null, meet_link: null,
      appointment_date: pgTimestamp(yearsAgo(3, 2)), final_price: "100.00", payment_status: "completed", appointment_status: "completed", stripe_payment_intent_id: "pi_APTOLD",
    });
    expect(memory.rows(appointmentInvoices)).toEqual([expect.objectContaining({ appointment_id: old.id, invoice_number: "FAC-2023-000001" })]);
    expect(kept).toMatchObject({ id: recent.id, customer_name: "Jeanne Patiente", customer_email: "jeanne@test.local", customer_phone: "+33600000000" });
    expect(await run()).toMatchObject({ appointmentsAnonymised: 0 });
  });

  it("vide le motif de consultation 90 jours après le rendez-vous, pas avant, ni pour un rendez-vous à venir", async () => {
    const old = seedAppointment("APT91", daysAgo(91));
    const recent = seedAppointment("APT89", daysAgo(89));
    const upcoming = seedAppointment("APTNEXT", new Date(NOW.getTime() + 5 * DAY), { appointment_status: "confirmed" });

    expect(await run()).toMatchObject({ requestDetailsEmptied: 1, appointmentsAnonymised: 0 });
    const byId = new Map(memory.rows(appointments).map(row => [row.id, row]));
    expect(byId.get(old.id)).toMatchObject({ request_details: "", customer_name: "Jeanne Patiente", customer_email: "jeanne@test.local" });
    expect(byId.get(recent.id)).toMatchObject({ request_details: "Je suis diabétique et je dois être opérée du genou" });
    expect(byId.get(upcoming.id)).toMatchObject({ request_details: "Je suis diabétique et je dois être opérée du genou" });
  });
});

describe("RGPD-09 — par lots, dans un budget de temps", () => {
  it("traite tout l’arriéré par petits lots", async () => {
    memory.seed(securityEvents, Array.from({ length: 7 }, () => ({ security_event_actor_kind: "system", category: "x", security_event_outcome: "allowed", created_at: daysAgo(200) })));
    const deletes = () => memory.statements.filter(statement => statement.sql.startsWith("delete from \"security_events\"")).length;

    expect(await run({ batchSize: 3 })).toMatchObject({ securityEvents: 7, complete: true });
    expect(ids(securityEvents)).toEqual([]);
    expect(deletes()).toBe(3);
  });

  it("s’arrête quand le budget est épuisé et laisse le reste au passage suivant", async () => {
    memory.seed(securityEvents, [{ security_event_actor_kind: "system", category: "x", security_event_outcome: "allowed", created_at: daysAgo(200) }]);
    expect(await run({ budgetMs: 0 })).toMatchObject({ securityEvents: 0, complete: false });
    expect(ids(securityEvents)).toHaveLength(1);
    expect(await run()).toMatchObject({ securityEvents: 1, complete: true });
  });
});
