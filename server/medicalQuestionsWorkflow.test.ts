import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateSecurityRateLimits, medicalQuestionAuditLogs, medicalQuestions, securityEvents } from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";

// Parcours des questions santé appelé comme le site et le tableau de bord :
// accord de publication facultatif et distinct, double authentification
// vérifiée par chaque procédure d’administration, publication seulement avec
// l’accord, version publique sans coordonnées, retrait sans perte du dossier.

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  mfaCookieValid: true,
  turnstileAccepted: true,
  responses: [] as Array<Record<string, unknown>>,
}));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({ ...await importOriginal<typeof import("./adminMfa")>(), isAdminMfaVerified: vi.fn(async () => state.mfaCookieValid) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => { if (!state.turnstileAccepted) throw new Error("turnstile_rejected"); }) }));
vi.mock("./medicalQuestionEmails", async importOriginal => ({
  ...await importOriginal<typeof import("./medicalQuestionEmails")>(),
  sendMedicalQuestionAcknowledgementEmail: vi.fn(async () => undefined),
  sendMedicalQuestionResponseEmail: vi.fn(async (input: Record<string, unknown>) => { state.responses.push(input); }),
}));

const { appRouter } = await import("./routers");

let memory: MemoryPg;

function caller(admin = false) {
  return appRouter.createCaller({
    user: admin ? ({ openId: "user_owner", role: "admin" } as TrpcContext["user"]) : null,
    mfaVerified: admin,
    req: { protocol: "https", headers: { "x-forwarded-for": "203.0.113.70" }, ip: "203.0.113.70" } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}

const QUESTION = {
  firstName: "Jeanne", lastName: "Martin", email: "jeanne@test.local", phone: "+33600000000",
  question: "Peut-on boire de l’eau avant une anesthésie générale programmée le matin ?",
  language: "fr" as const, privacyConsent: true as const, urgencyAcknowledged: true as const, turnstileToken: "turnstile-token-ok-000000000000",
};
const ANSWER = { adminResponse: "Information générale : suivez les consignes de jeûne données par l’équipe d’anesthésie.", publicQuestion: "Peut-on boire avant une anesthésie ?", publicResponse: "Suivez les consignes de jeûne." };

const questionRow = () => memory.rows(medicalQuestions)[0]!;
const auditActions = () => memory.rows(medicalQuestionAuditLogs).map(row => ({ action: row.action, metadata: row.metadata ? JSON.parse(String(row.metadata)) : null }));

beforeEach(() => {
  process.env.CANDIDATE_AUTH_PEPPER ||= "test-pepper-medical-questions-0123456789";
  memory = createMemoryPg([medicalQuestions, medicalQuestionAuditLogs, securityEvents, candidateSecurityRateLimits]);
  state.memory = memory;
  state.mfaCookieValid = true;
  state.turnstileAccepted = true;
  state.responses = [];
});

describe("workflow de questions-réponses médicales", () => {
  it("refuse une question sans contrôle anti-robot valide, sans rien enregistrer", async () => {
    state.turnstileAccepted = false;
    await expect(caller().medicalQuestions.submit(QUESTION)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(memory.rows(medicalQuestions)).toEqual([]);
  });

  it("impose une validation humaine, MFA et consentement avant publication", async () => {
    // The publication agreement is separate and optional (LEGAL-11): a question without it is accepted.
    await caller().medicalQuestions.submit(QUESTION);
    expect(questionRow()).toMatchObject({ publication_consent: 0, privacy_consent: 1, status: "submitted" });
    const id = questionRow().id as number;

    // Each admin procedure checks the MFA session itself, not only the context flag.
    state.mfaCookieValid = false;
    await expect(caller(true).medicalQuestions.admin.sendValidatedResponse({ id, ...ANSWER, publish: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(true).medicalQuestions.admin.get({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.responses).toEqual([]);
    state.mfaCookieValid = true;

    await expect(caller(true).medicalQuestions.admin.sendValidatedResponse({ id, ...ANSWER, publish: true })).rejects.toThrow("accord explicite");
    expect(state.responses).toEqual([]);
    expect(questionRow()).toMatchObject({ status: "submitted", public_question: null });
  });

  it("publie la réponse validée d’une question consentie après l’avoir envoyée à la personne", async () => {
    await caller().medicalQuestions.submit({ ...QUESTION, publicationConsent: true });
    const id = questionRow().id as number;

    await expect(caller(true).medicalQuestions.admin.sendValidatedResponse({ id, ...ANSWER, publish: true })).resolves.toMatchObject({ success: true, published: true });

    expect(state.responses).toEqual([expect.objectContaining({ email: "jeanne@test.local", response: ANSWER.adminResponse })]);
    expect(questionRow()).toMatchObject({ status: "published", public_question: ANSWER.publicQuestion, public_response: ANSWER.publicResponse });
    expect(auditActions().map(entry => entry.action)).toContain("response_sent_and_published");
  });

  it("versionne un stockage privé sans coordonnées dans la requête publique", async () => {
    await caller().medicalQuestions.submit({ ...QUESTION, publicationConsent: true });
    await caller(true).medicalQuestions.admin.sendValidatedResponse({ id: questionRow().id as number, ...ANSWER, publish: true });
    // A row marked published without the person's agreement is never served.
    memory.seed(medicalQuestions, [{ tracking_id: "QMED-NOCONSENT-00000", first_name: "Paul", last_name: "Durand", email: "paul@test.local", phone: "+33611111111", question: "Une autre question assez longue pour être valable.", language: "fr", privacy_consent: 1, publication_consent: 0, urgency_acknowledged: 1, status: "published", public_question: "Question sans accord", public_response: "Réponse sans accord", published_at: "2026-10-20 08:00:00.000" }]);

    const published = await caller().medicalQuestions.published({ limit: 10 });

    expect(published).toEqual([{ id: questionRow().id, question: ANSWER.publicQuestion, response: ANSWER.publicResponse, language: "fr", publishedAt: expect.anything() }]);
    for (const privateValue of ["jeanne@test.local", "+33600000000", "Jeanne", "Martin", QUESTION.question, ANSWER.adminResponse]) {
      expect(JSON.stringify(published)).not.toContain(privateValue);
    }
  });

  it("permet de retirer une publication sans supprimer le dossier privé ni son audit", async () => {
    await caller().medicalQuestions.submit({ ...QUESTION, publicationConsent: true });
    const id = questionRow().id as number;
    await caller(true).medicalQuestions.admin.sendValidatedResponse({ id, ...ANSWER, publish: true });
    const journalBefore = auditActions().length;

    await expect(caller(true).medicalQuestions.admin.unpublish({ id })).resolves.toEqual({ success: true });

    expect(questionRow()).toMatchObject({ status: "answered", public_question: null, public_response: null, published_at: null, email: "jeanne@test.local", admin_response: ANSWER.adminResponse });
    expect(auditActions()).toHaveLength(journalBefore + 1);
    expect(auditActions().at(-1)).toEqual({ action: "unpublished", metadata: { retainedPrivateRecord: true } });
    await expect(caller().medicalQuestions.published({ limit: 10 })).resolves.toEqual([]);
  });
});
