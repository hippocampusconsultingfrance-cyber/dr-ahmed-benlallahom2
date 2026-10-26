import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { candidateSecurityRateLimits, medicalQuestionAuditLogs, medicalQuestions, securityEvents } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  ownerNotifications: [] as Array<{ title: string; content: string }>,
  acknowledgements: [] as Array<Record<string, unknown>>,
  responses: [] as Array<{ input: Record<string, unknown>; options: Record<string, unknown> }>,
  ackFails: false,
  responseFails: false,
}));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => true) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async (payload: { title: string; content: string }) => { state.ownerNotifications.push(payload); return true; }) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined) }));
vi.mock("./medicalQuestionEmails", async importOriginal => ({
  ...await importOriginal<typeof import("./medicalQuestionEmails")>(),
  sendMedicalQuestionAcknowledgementEmail: vi.fn(async (input: Record<string, unknown>) => {
    if (state.ackFails) throw new Error("resend_down");
    state.acknowledgements.push(input);
  }),
  sendMedicalQuestionResponseEmail: vi.fn(async (input: Record<string, unknown>, options: Record<string, unknown>) => {
    if (state.responseFails) throw new Error("medical_question_response_email_failed:validation_error");
    state.responses.push({ input, options });
  }),
}));

import { appRouter } from "./routers";

let memory: MemoryPg;

function caller(admin = false) {
  return appRouter.createCaller({
    user: admin ? ({ openId: "user_owner", role: "admin" } as TrpcContext["user"]) : null,
    mfaVerified: admin,
    req: { protocol: "https", headers: { "x-forwarded-for": "203.0.113.5" }, ip: "203.0.113.5" } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}

const QUESTION = { firstName: "Jeanne", lastName: "Martin", email: "jeanne@test.local", phone: "+33600000000", question: "Peut-on boire de l’eau avant une anesthésie générale programmée le matin ?", language: "fr" as const, privacyConsent: true as const, urgencyAcknowledged: true as const, turnstileToken: "turnstile-token-ok-000000000000" };

describe("service gratuit de questions santé", () => {
  beforeEach(() => {
    process.env.CANDIDATE_AUTH_PEPPER ||= "test-pepper-medical-questions-0123456789";
    memory = createMemoryPg([medicalQuestions, medicalQuestionAuditLogs, securityEvents, candidateSecurityRateLimits]);
    state.memory = memory;
    state.ownerNotifications = [];
    state.acknowledgements = [];
    state.responses = [];
    state.ackFails = false;
    state.responseFails = false;
  });
  afterEach(() => vi.useRealTimers());

  it("accepte une question sans accord de publication, prévient le propriétaire sans contenu de santé et accuse réception (LEGAL-11, PUB-FORM-01)", async () => {
    const result = await caller().medicalQuestions.submit({ ...QUESTION, publicationConsent: false });
    expect(result.trackingId).toMatch(/^QMED-/);
    expect(result.acknowledgementSent).toBe(true);
    expect(memory.rows(medicalQuestions)[0]).toMatchObject({ publication_consent: 0, privacy_consent: 1 });
    expect(state.ownerNotifications).toHaveLength(1);
    const owner = state.ownerNotifications[0]!;
    expect(owner.title).toContain(result.trackingId);
    for (const forbidden of ["Jeanne", "Martin", "jeanne@test.local", "+33600000000", "anesthésie générale", "boire"]) {
      expect(`${owner.title}\n${owner.content}`).not.toContain(forbidden);
    }
    expect(state.acknowledgements).toEqual([{ email: "jeanne@test.local", firstName: "Jeanne", trackingId: result.trackingId, language: "fr" }]);
    // No email in clear in the security journal (LEGAL-13).
    expect(memory.rows(securityEvents).map(row => row.actor_reference)).not.toContain("jeanne@test.local");
    expect(memory.rows(medicalQuestionAuditLogs).map(row => row.action)).toEqual(["submitted", "acknowledgement_sent"]);
  });

  it("un accusé de réception impossible n’empêche pas l’enregistrement de la question", async () => {
    state.ackFails = true;
    const result = await caller().medicalQuestions.submit({ ...QUESTION, publicationConsent: true });
    expect(result.acknowledgementSent).toBe(false);
    expect(memory.rows(medicalQuestions)).toHaveLength(1);
    expect(memory.rows(medicalQuestionAuditLogs).map(row => row.action)).toContain("acknowledgement_failed");
  });

  it("ne publie jamais sans accord, n’envoie pas deux fois, et sépare renvoi et publication (ADM-MQ-01)", async () => {
    const { trackingId } = await caller().medicalQuestions.submit({ ...QUESTION, publicationConsent: false });
    const id = memory.rows(medicalQuestions)[0]!.id as number;
    const admin = caller(true).medicalQuestions.admin;
    const answer = { id, adminResponse: "Information générale : suivez les consignes de jeûne données par l’équipe d’anesthésie.", publicQuestion: "Q", publicResponse: "R" };
    await expect(admin.sendValidatedResponse({ ...answer, publish: true })).rejects.toThrow("accord explicite");
    await expect(admin.sendValidatedResponse({ ...answer, publish: false })).resolves.toMatchObject({ success: true, published: false, resent: false });
    expect(state.responses).toHaveLength(1);
    expect(state.responses[0]!.options).toEqual({ idempotencyKey: `medical-question-response/${id}/first` });
    // Second click: refused, no email.
    await expect(admin.sendValidatedResponse({ ...answer, publish: false })).rejects.toThrow("déjà été envoyée");
    expect(state.responses).toHaveLength(1);
    // Deliberate resend: one more email, keyed on the previous sending.
    await expect(admin.sendValidatedResponse({ ...answer, publish: false, resend: true })).resolves.toMatchObject({ resent: true });
    expect(state.responses).toHaveLength(2);
    expect(String(state.responses[1]!.options.idempotencyKey)).toMatch(new RegExp(`^medical-question-response/${id}/after-\\d+$`));
    // Publication needs the person's agreement, and never emails.
    await expect(admin.updatePublication({ id, publicQuestion: "Q", publicResponse: "R" })).rejects.toThrow("accord explicite");
    expect(trackingId).toMatch(/^QMED-/);
  });

  it("enregistre la réponse avant l’envoi ; un email parti sans être enregistré est repris sous la même clé, puis au-delà de 24 h enregistré sans second email (DATA-02)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-20T08:00:00Z"), toFake: ["Date"] });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const admin = caller(true).medicalQuestions.admin;
    const answer = "Information générale : suivez les consignes de jeûne données par l’équipe d’anesthésie.";
    await caller().medicalQuestions.submit({ ...QUESTION, publicationConsent: false });
    await caller().medicalQuestions.submit({ ...QUESTION, email: "paul@test.local", firstName: "Paul", publicationConsent: false });
    const [first, second] = memory.rows(medicalQuestions);

    // The email leaves, then its recording is refused.
    memory.failNext(/^update "medical_questions" set .*"response_sent_at" = /);
    await expect(admin.sendValidatedResponse({ id: first!.id as number, adminResponse: answer, publish: false })).rejects.toThrow("L’email est parti, mais son enregistrement a échoué");
    expect(state.responses.map(response => response.options)).toEqual([{ idempotencyKey: `medical-question-response/${first!.id}/first` }]);
    // The answer was recorded before the email: the question waits as a draft, not as a new one.
    expect(first).toMatchObject({ status: "drafting", admin_response: answer, response_sent_at: null });

    // A few hours later the same click sends under the same key (Resend keeps the first email) and records it.
    vi.setSystemTime(new Date("2026-10-20T11:00:00Z"));
    await expect(admin.sendValidatedResponse({ id: first!.id as number, adminResponse: answer, publish: false })).resolves.toMatchObject({ success: true, published: false, resent: false, unconfirmedSentAt: null });
    expect(state.responses.map(response => response.options.idempotencyKey)).toEqual([`medical-question-response/${first!.id}/first`, `medical-question-response/${first!.id}/first`]);
    expect(first).toMatchObject({ status: "answered", response_sent_at: "2026-10-20 11:00:00.000" });

    // Same interruption for the second question, retried two days later: Resend no longer knows the key.
    memory.failNext(/^update "medical_questions" set .*"response_sent_at" = /);
    await expect(admin.sendValidatedResponse({ id: second!.id as number, adminResponse: answer, publish: false })).rejects.toThrow("enregistrement a échoué");
    expect(state.responses).toHaveLength(3);
    vi.setSystemTime(new Date("2026-10-22T11:00:00Z"));
    const late = await admin.sendValidatedResponse({ id: second!.id as number, adminResponse: `${answer} Texte modifié.`, publish: false });
    expect(late).toMatchObject({ success: true, published: false, resent: false, unconfirmedSentAt: new Date("2026-10-20T11:00:00Z") });
    // No second email; recorded on the day it was tried, with the text that left.
    expect(state.responses).toHaveLength(3);
    expect(second).toMatchObject({ status: "answered", admin_response: answer, response_sent_at: "2026-10-20 11:00:00.000" });
    expect(memory.rows(medicalQuestionAuditLogs).filter(row => row.medical_question_id === second!.id).map(row => row.action))
      .toEqual(["submitted", "acknowledgement_sent", "response_send_started", "response_send_unconfirmed"]);
    // From there, only a deliberate resend emails the person again.
    await expect(admin.sendValidatedResponse({ id: second!.id as number, adminResponse: answer, publish: false })).rejects.toThrow("déjà été envoyée");
    expect(state.responses).toHaveLength(3);
    error.mockRestore();
  });

  it("un envoi refusé par le service d’email ne compte pas comme peut-être parti : il est retenté plus tard (DATA-02)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-20T08:00:00Z"), toFake: ["Date"] });
    const admin = caller(true).medicalQuestions.admin;
    await caller().medicalQuestions.submit({ ...QUESTION, publicationConsent: false });
    const id = memory.rows(medicalQuestions)[0]!.id as number;
    state.responseFails = true;
    await expect(admin.sendValidatedResponse({ id, adminResponse: "Information générale relue par le médecin, sans urgence.", publish: false })).rejects.toThrow("L’email n’a pas pu être envoyé");
    // Nothing left: the question is as it was before the attempt.
    expect(memory.rows(medicalQuestions)[0]).toMatchObject({ status: "submitted", admin_response: null, response_sent_at: null });
    state.responseFails = false;
    vi.setSystemTime(new Date("2026-10-22T08:00:00Z"));
    await expect(admin.sendValidatedResponse({ id, adminResponse: "Information générale relue par le médecin, sans urgence.", publish: false })).resolves.toMatchObject({ unconfirmedSentAt: null });
    expect(state.responses).toHaveLength(1);
    expect(memory.rows(medicalQuestions)[0]).toMatchObject({ status: "answered", response_sent_at: "2026-10-22 08:00:00.000" });
    expect(memory.rows(medicalQuestionAuditLogs).map(row => row.action)).toEqual(["submitted", "acknowledgement_sent", "response_send_started", "response_send_failed", "response_send_started", "response_sent"]);
  });

  it("un envoi refusé avec un texte modifié laisse enregistrée la réponse que la personne a reçue (DATA-02)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-20T08:00:00Z"), toFake: ["Date"] });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const admin = caller(true).medicalQuestions.admin;
    const answer = "Information générale : suivez les consignes de jeûne données par l’équipe d’anesthésie.";
    const edited = `${answer} Texte modifié, jamais parti.`;
    await caller().medicalQuestions.submit({ ...QUESTION, publicationConsent: false });
    await caller().medicalQuestions.submit({ ...QUESTION, email: "paul@test.local", firstName: "Paul", publicationConsent: false });
    const [resent, interrupted] = memory.rows(medicalQuestions);

    // A deliberate resend with an edited text, refused by the email service.
    await admin.sendValidatedResponse({ id: resent!.id as number, adminResponse: answer, publish: false });
    vi.setSystemTime(new Date("2026-10-21T08:00:00Z"));
    state.responseFails = true;
    await expect(admin.sendValidatedResponse({ id: resent!.id as number, adminResponse: edited, publish: false, resend: true })).rejects.toThrow("L’email n’a pas pu être envoyé");
    expect(resent).toMatchObject({ status: "answered", admin_response: answer, response_sent_at: "2026-10-20 08:00:00.000" });

    // An email left without being recorded; the retry with an edited text is
    // refused (same key, other content), and Resend's memory of the key passes.
    state.responseFails = false;
    memory.failNext(/^update "medical_questions" set .*"response_sent_at" = /);
    await expect(admin.sendValidatedResponse({ id: interrupted!.id as number, adminResponse: answer, publish: false })).rejects.toThrow("enregistrement a échoué");
    vi.setSystemTime(new Date("2026-10-21T11:00:00Z"));
    state.responseFails = true;
    await expect(admin.sendValidatedResponse({ id: interrupted!.id as number, adminResponse: edited, publish: false })).rejects.toThrow("L’email n’a pas pu être envoyé");
    expect(interrupted).toMatchObject({ status: "drafting", admin_response: answer, response_sent_at: null });
    state.responseFails = false;
    vi.setSystemTime(new Date("2026-10-23T08:00:00Z"));
    await expect(admin.sendValidatedResponse({ id: interrupted!.id as number, adminResponse: edited, publish: false })).resolves.toMatchObject({ unconfirmedSentAt: new Date("2026-10-21T08:00:00Z") });
    // Recorded with the text that left, on the day it left; only two emails ever went out.
    expect(interrupted).toMatchObject({ status: "answered", admin_response: answer, response_sent_at: "2026-10-21 08:00:00.000" });
    expect(state.responses.map(response => response.input.response)).toEqual([answer, answer]);
    error.mockRestore();
  });

  it("met à jour la publication d’une question consentie sans renvoyer d’email", async () => {
    await caller().medicalQuestions.submit({ ...QUESTION, publicationConsent: true });
    const id = memory.rows(medicalQuestions)[0]!.id as number;
    const admin = caller(true).medicalQuestions.admin;
    await expect(admin.updatePublication({ id, publicQuestion: "Q", publicResponse: "R" })).rejects.toThrow("Envoyez d’abord");
    await admin.sendValidatedResponse({ id, adminResponse: "Information générale relue par le médecin, sans urgence.", publicQuestion: "", publicResponse: "", publish: false });
    await admin.updatePublication({ id, publicQuestion: "Peut-on boire avant une anesthésie ?", publicResponse: "Suivez les consignes de jeûne." });
    expect(memory.rows(medicalQuestions)[0]).toMatchObject({ status: "published", public_question: "Peut-on boire avant une anesthésie ?" });
    expect(state.responses).toHaveLength(1);
    const published = await caller().medicalQuestions.published({ limit: 5 });
    expect(published.map(item => item.question)).toEqual(["Peut-on boire avant une anesthésie ?"]);
  });
});
