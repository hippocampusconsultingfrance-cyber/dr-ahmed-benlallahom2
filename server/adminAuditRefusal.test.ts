import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TRPCError } from "@trpc/server";
import {
  appointmentFulfillmentJobs,
  appointmentInvoices,
  appointments,
  candidateAccounts,
  contactMessages,
  cvApplications,
  gdprRequests,
  medicalQuestionAuditLogs,
  medicalQuestions,
  recruitmentAuditLogs,
  recruitmentEmailEvents,
  recruitmentFollowUpTasks,
  securityEvents,
} from "../drizzle/schema";
import { createMemoryPg, type MemoryPg } from "./testing/memoryPgProxy";
import type { TrpcContext } from "./_core/context";
import { DATABASE_VALUE_MESSAGE, formatTrpcErrorShape } from "./_core/trpc";

// DATA-01 — la base refuse la ligne d'audit d'une action de l'admin (une
// contrainte CHECK posée NOT VALID sur recruitment_audit_logs,
// medical_question_audit_logs ou security_events). Une modification en base
// est écrite avec sa ligne, d'un seul coup : refusée, elle n'est pas
// enregistrée non plus et « rien n'a été modifié » est vrai. Une action déjà
// faite au-dehors (un email parti, une analyse lancée) reste faite : l'admin
// lit qu'elle est faite et que sa trace n'a pas pu être écrite, et l'échec est
// journalisé.

const state = vi.hoisted(() => ({
  memory: null as null | { db: unknown },
  emails: [] as string[],
  invitationFails: false,
  /** What retryCvConfirmationEmail finds or makes of the « accusé de dépôt »: nothing sent (already sent), or sent, refused by Resend. */
  confirmation: "sent" as "sent" | "failed" | "already_sent",
  queued: [] as number[],
  analysed: [] as number[],
  signedUrls: [] as string[],
}));

vi.mock("./db", () => ({ getDb: async () => state.memory?.db ?? null }));
vi.mock("./adminMfa", async importOriginal => ({
  ...await importOriginal<typeof import("./adminMfa")>(),
  isAdminMfaVerified: vi.fn(async () => true),
}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./_core/notifications", async importOriginal => ({
  ...await importOriginal<typeof import("./_core/notifications")>(),
  sendRecruitmentTemplateEmail: vi.fn(async (email: string) => {
    state.emails.push(`template:${email}`);
    return { id: "email-template" };
  }),
  sendCandidatePortalAccessEmail: vi.fn(async (input: { to: string }) => {
    if (state.invitationFails) throw new Error("transport timeout");
    state.emails.push(`invitation:${input.to}`);
    return { id: "email-invitation" };
  }),
}));
vi.mock("./candidateAuth", async importOriginal => ({
  ...await importOriginal<typeof import("./candidateAuth")>(),
  createCandidateInvitationToken: () => "synthetic-invitation-token",
}));
vi.mock("./recruitmentEmailTrace", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentEmailTrace")>(),
  retryCvConfirmationEmail: vi.fn(async (applicationId: number) => {
    if (state.confirmation === "already_sent") return { outcome: "already_sent", attempted: false };
    state.emails.push(`confirmation:${applicationId}`);
    const sent = state.confirmation === "sent";
    return { outcome: state.confirmation, attempted: true, delivery: { status: state.confirmation, providerEmailId: sent ? "email-confirmation" : null, failureCode: sent ? null : "validation_error" } };
  }),
}));
vi.mock("./recruitmentProcessing", async importOriginal => ({
  ...await importOriginal<typeof import("./recruitmentProcessing")>(),
  enqueueCvAnalysis: vi.fn(async (applicationId: number) => {
    state.queued.push(applicationId);
    return { queued: true, accelerated: false, alreadyRunning: false };
  }),
  processDueCvAnalysisJobs: vi.fn(async (_limit: number, applicationIds: number[]) => {
    state.analysed.push(...applicationIds);
    return { processed: 1, results: [{ completed: true, needsReview: false }] };
  }),
}));
vi.mock("./storage", async importOriginal => ({
  ...await importOriginal<typeof import("./storage")>(),
  storageGetSignedUrl: vi.fn(async (key: string) => {
    state.signedUrls.push(key);
    return `https://blob.test/${key}`;
  }),
}));
// An address is corrected only after a refused patient email, the issued invoice archived first.
vi.mock("./appointmentFulfillment", async importOriginal => ({
  ...await importOriginal<typeof import("./appointmentFulfillment")>(),
  hasRefusedPatientEmail: vi.fn(async () => true),
  archiveIssuedAppointmentInvoice: vi.fn(async () => undefined),
}));

import { appRouter } from "./routers";

let memory: MemoryPg;

function caller() {
  return appRouter.createCaller({
    user: { openId: "user_owner", role: "admin" } as TrpcContext["user"],
    mfaVerified: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  });
}
const admin = () => caller().admin;
const questions = () => caller().medicalQuestions.admin;

/** The next line of this journal is refused, as a CHECK constraint refuses it (23514). */
const refuseNextLine = (table: "recruitment_audit_logs" | "medical_question_audit_logs" | "security_events") =>
  memory.failNext(new RegExp(`^insert into "${table}"`), 1, "23514");

/** The refusal of a write the procedure did not handle: « rien n'a été modifié ». */
const refusedAsUnchanged = { code: "BAD_REQUEST", message: DATABASE_VALUE_MESSAGE, cause: { reason: "value_not_allowed" } };

/** An action done whose trace was refused: said done, and not traced. */
const doneNotTraced = (done: string) => ({
  code: "INTERNAL_SERVER_ERROR",
  message: `${done} Sa trace n’a pas pu être écrite dans le journal d’audit.`,
  cause: { reason: "audit_not_recorded" },
});

let seeded = 0;
function seedApplication(extra: Record<string, unknown> = {}) {
  seeded += 1;
  return memory.seed(cvApplications, [{
    tracking_id: `CVAUDIT${String(seeded).padStart(5, "0")}`, first_name: "Amal", last_name: "Haddad", email: `amal${seeded}@test.local`, specialty: "Anesthésie", target_countries: "[]",
    cv_file_key: `recruitment/cv/audit${seeded}.pdf`, cv_original_name: "cv.pdf", cv_mime_type: "application/pdf", cv_size_bytes: 1000, file_validation_status: "accepted", ...extra,
  }])[0]!.id as number;
}

function seedQuestion(extra: Record<string, unknown> = {}) {
  seeded += 1;
  return memory.seed(medicalQuestions, [{
    tracking_id: `QMED-AUDIT${String(seeded).padStart(3, "0")}-00000`, first_name: "Jeanne", last_name: "Martin", email: `jeanne${seeded}@test.local`, phone: "+33600000000",
    question: "Peut-on boire de l’eau avant une anesthésie générale programmée ?", status: "submitted", ...extra,
  }])[0]!.id as number;
}

const application = (id: number) => memory.rows(cvApplications).find(row => row.id === id)!;
const question = (id: number) => memory.rows(medicalQuestions).find(row => row.id === id);
const auditLines = () => memory.rows(recruitmentAuditLogs).map(row => ({ applicationId: row.application_id, action: row.action, metadata: row.metadata ? JSON.parse(String(row.metadata)) : null }));

beforeEach(() => {
  memory = createMemoryPg([
    appointmentFulfillmentJobs, appointmentInvoices, appointments, candidateAccounts, contactMessages, cvApplications, gdprRequests,
    medicalQuestionAuditLogs, medicalQuestions, recruitmentAuditLogs, recruitmentEmailEvents, recruitmentFollowUpTasks, securityEvents,
  ]);
  state.memory = memory;
  state.emails = [];
  state.invitationFails = false;
  state.confirmation = "sent";
  state.queued = [];
  state.analysed = [];
  state.signedUrls = [];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("DATA-01 — une modification en base et sa ligne d'audit, d'un seul coup", () => {
  it("n'enregistre ni le statut d'une candidature, ni la réponse d'un candidat, ni une relance quand la base refuse leur ligne d'audit", async () => {
    const id = seedApplication();
    const [task] = memory.seed(recruitmentFollowUpTasks, [{ application_id: id, kind: "follow_up_7", due_at: new Date(Date.UTC(2026, 10, 1)), status: "suggested", notes: "Rappeler" }]);

    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.updateStatus({ id, status: "shortlisted", adminNotes: "À appeler lundi" })).rejects.toMatchObject(refusedAsUnchanged);
    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.candidate.markResponse({ id, note: "A répondu par téléphone" })).rejects.toMatchObject(refusedAsUnchanged);
    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.followUps.update({ id: task!.id as number, status: "completed", notes: "Fait" })).rejects.toMatchObject(refusedAsUnchanged);
    // Nothing was changed, as the screen says.
    expect(application(id)).toMatchObject({ status: "new", admin_notes: null, last_candidate_response_at: null });
    expect(memory.rows(recruitmentFollowUpTasks)[0]).toMatchObject({ status: "suggested", notes: "Rappeler", completed_at: null, completed_by_open_id: null });
    expect(auditLines()).toEqual([]);

    // Accepted, each change with its line.
    await expect(admin().recruitment.updateStatus({ id, status: "shortlisted", adminNotes: "À appeler lundi" })).resolves.toEqual({ success: true });
    await admin().recruitment.candidate.markResponse({ id, note: "A répondu par téléphone" });
    await expect(admin().recruitment.followUps.update({ id: task!.id as number, status: "completed", notes: "Fait" })).resolves.toEqual({ success: true });
    expect(application(id)).toMatchObject({ status: "shortlisted", admin_notes: "À appeler lundi" });
    expect(application(id).last_candidate_response_at).not.toBeNull();
    expect(memory.rows(recruitmentFollowUpTasks)[0]).toMatchObject({ status: "completed", notes: "Fait", completed_by_open_id: "user_owner" });
    expect(auditLines()).toEqual([
      { applicationId: id, action: "status_update", metadata: { status: "shortlisted" } },
      { applicationId: id, action: "status_update", metadata: { event: "candidate_response", note: "A répondu par téléphone" } },
      { applicationId: id, action: "status_update", metadata: { event: "follow_up", taskId: task!.id, status: "completed" } },
    ]);
  });

  it("n'enregistre ni le brouillon, ni la publication, ni son retrait, ni le classement d'une question santé quand la base refuse leur entrée de journal", async () => {
    const drafted = seedQuestion();
    const answered = seedQuestion({ status: "answered", admin_response: "Réponse envoyée.", response_sent_at: new Date(Date.UTC(2026, 9, 20)), publication_consent: 1 });
    const filed = seedQuestion({ status: "drafting", admin_response: "Brouillon" });
    const journal = (id: number) => memory.rows(medicalQuestionAuditLogs).filter(row => row.medical_question_id === id).map(row => row.action);

    refuseNextLine("medical_question_audit_logs");
    await expect(questions().saveDraft({ id: drafted, adminResponse: "Il est possible de boire de l’eau jusqu’à 2 h avant." })).rejects.toMatchObject(refusedAsUnchanged);
    expect(question(drafted)).toMatchObject({ status: "submitted", admin_response: null, responded_by_open_id: null });
    refuseNextLine("medical_question_audit_logs");
    await expect(questions().updatePublication({ id: answered, publicQuestion: "Boire avant une anesthésie ?", publicResponse: "Jusqu’à 2 h avant, de l’eau." })).rejects.toMatchObject(refusedAsUnchanged);
    expect(question(answered)).toMatchObject({ status: "answered", public_question: null, public_response: null, published_at: null });
    refuseNextLine("medical_question_audit_logs");
    await expect(questions().reject({ id: filed, reason: "abusif" })).rejects.toMatchObject(refusedAsUnchanged);
    expect(question(filed)).toMatchObject({ status: "drafting" });
    expect(memory.rows(medicalQuestionAuditLogs)).toEqual([]);

    // Accepted, each change with its entry.
    await questions().saveDraft({ id: drafted, adminResponse: "Il est possible de boire de l’eau jusqu’à 2 h avant." });
    await questions().updatePublication({ id: answered, publicQuestion: "Boire avant une anesthésie ?", publicResponse: "Jusqu’à 2 h avant, de l’eau." });
    await questions().reject({ id: filed });
    // Filed twice, a single entry.
    await questions().reject({ id: filed });
    expect(question(drafted)).toMatchObject({ status: "drafting", admin_response: "Il est possible de boire de l’eau jusqu’à 2 h avant." });
    expect(question(answered)).toMatchObject({ status: "published", public_question: "Boire avant une anesthésie ?" });
    expect(question(filed)).toMatchObject({ status: "rejected" });

    // Taking the publication down: refused with its entry, it stays published.
    refuseNextLine("medical_question_audit_logs");
    await expect(questions().unpublish({ id: answered })).rejects.toMatchObject(refusedAsUnchanged);
    expect(question(answered)).toMatchObject({ status: "published", public_question: "Boire avant une anesthésie ?", public_response: "Jusqu’à 2 h avant, de l’eau." });
    await questions().unpublish({ id: answered });
    expect(question(answered)).toMatchObject({ status: "answered", public_question: null, public_response: null, published_at: null });
    expect([journal(drafted), journal(answered), journal(filed)]).toEqual([["draft_saved"], ["published", "unpublished"], ["rejected"]]);
  });

  it("ne supprime ni une question santé ni un message de contact, ne corrige pas l'adresse d'un rendez-vous et n'efface rien quand la base refuse leur trace de sécurité", async () => {
    const asked = seedQuestion();
    memory.seed(medicalQuestionAuditLogs, [{ medical_question_id: asked, action: "submitted" }]);
    const [message] = memory.seed(contactMessages, [{ tracking_id: "C-AUDIT", name: "Paul", email: "paul@test.local", phone: "+33600000000", message: "Bonjour" }]);
    const [booking] = memory.seed(appointments, [{
      tracking_id: "APTAUDIT01", customer_name: "Paul", customer_email: "paul.typo@test.local", customer_phone: "+33600000000", request_details: "Avis",
      appointment_date: new Date(Date.now() + 10 * 24 * 3_600_000), base_price: "100.00", final_price: "100.00", payment_status: "completed", appointment_status: "confirmed",
    }]);
    // A person's data to erase: a message, a question with its journal, a past booking.
    memory.seed(contactMessages, [{ tracking_id: "C-ERASE", name: "Lina", email: "lina@test.local", phone: "+33600000000", message: "Message de Lina" }]);
    const erased = seedQuestion({ email: "lina@test.local", status: "answered" });
    memory.seed(medicalQuestionAuditLogs, [{ medical_question_id: erased, action: "submitted" }]);
    const [past] = memory.seed(appointments, [{
      tracking_id: "APTERASE01", customer_name: "Lina", customer_email: "lina@test.local", customer_phone: "+33611111111", request_details: "Motif médical",
      appointment_date: new Date(Date.now() - 40 * 24 * 3_600_000), base_price: "100.00", final_price: "100.00", payment_status: "completed", appointment_status: "completed",
    }]);
    const before = {
      questions: memory.rows(medicalQuestions).length, journal: memory.rows(medicalQuestionAuditLogs).length, messages: memory.rows(contactMessages).length,
      bookings: memory.rows(appointments).map(row => ({ ...row })),
    };
    const unchanged = () => {
      expect(memory.rows(medicalQuestions)).toHaveLength(before.questions);
      expect(memory.rows(medicalQuestionAuditLogs)).toHaveLength(before.journal);
      expect(memory.rows(contactMessages)).toHaveLength(before.messages);
      expect(memory.rows(appointments)).toEqual(before.bookings);
      expect(memory.rows(securityEvents)).toEqual([]);
    };

    refuseNextLine("security_events");
    await expect(questions().delete({ id: asked })).rejects.toMatchObject(refusedAsUnchanged);
    unchanged();
    refuseNextLine("security_events");
    await expect(admin().contacts.delete({ id: message!.id as number })).rejects.toMatchObject(refusedAsUnchanged);
    unchanged();
    refuseNextLine("security_events");
    await expect(admin().appointments.updateCustomerEmail({ trackingId: "APTAUDIT01", customerEmail: "paul@test.local" })).rejects.toMatchObject(refusedAsUnchanged);
    unchanged();
    refuseNextLine("security_events");
    await expect(admin().personalData.erase({ email: "lina@test.local" })).rejects.toMatchObject(refusedAsUnchanged);
    unchanged();

    // Accepted, each one with its trace.
    await expect(questions().delete({ id: asked })).resolves.toEqual({ success: true });
    await expect(admin().contacts.delete({ id: message!.id as number })).resolves.toEqual({ success: true });
    await expect(admin().appointments.updateCustomerEmail({ trackingId: "APTAUDIT01", customerEmail: "paul@test.local" })).resolves.toEqual({ success: true, unchanged: false });
    await expect(admin().personalData.erase({ email: "lina@test.local" })).resolves.toMatchObject({ contactMessagesDeleted: 1, medicalQuestionsDeleted: 1, appointmentsAnonymised: 1 });
    expect(question(asked)).toBeUndefined();
    expect(question(erased)).toBeUndefined();
    expect(memory.rows(medicalQuestionAuditLogs)).toEqual([]);
    expect(memory.rows(contactMessages)).toEqual([]);
    expect(memory.rows(appointments).find(row => row.id === booking!.id)).toMatchObject({ customer_email: "paul@test.local" });
    expect(memory.rows(appointments).find(row => row.id === past!.id)!.customer_email).not.toBe("lina@test.local");
    expect(memory.rows(securityEvents).map(row => [row.category, JSON.parse(String(row.metadata))])).toEqual([
      ["admin_medical_question_deleted", { deleted: 1 }],
      ["admin_contact_message_deleted", { deleted: 1 }],
      ["admin_appointment_email_corrected", { trackingId: "APTAUDIT01" }],
      ["admin_personal_data_erased", { contactMessagesDeleted: 1, medicalQuestionsDeleted: 1, appointmentsAnonymised: 1, upcomingAppointmentsKept: 0, recruitmentApplicationsLeft: 0 }],
    ]);
    // Gone already: no trace of a deletion that deletes nothing.
    await expect(questions().delete({ id: asked })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(admin().contacts.delete({ id: message!.id as number })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(memory.rows(securityEvents)).toHaveLength(4);
  });
});

describe("DATA-01 — une action faite au-dehors dont la ligne d'audit est refusée", () => {
  it("l'email parti, l'admin lit qu'il est envoyé et que sa trace n'a pas pu être écrite, jamais « rien n'a été modifié », et l'échec est journalisé", async () => {
    const id = seedApplication({ email: "amal@test.local" });

    refuseNextLine("recruitment_audit_logs");
    const refused = await admin().recruitment.sendTemplateEmail({ id, template: "profile_interest" }).catch((error: TRPCError) => error);
    expect(refused).toMatchObject(doneNotTraced("L’email est envoyé."));
    expect(state.emails).toEqual(["template:amal@test.local"]);
    // What the browser receives: this message, with its reason, not the generic internal error.
    expect(formatTrpcErrorShape({ message: (refused as TRPCError).message, data: { code: (refused as TRPCError).code } }, refused as TRPCError)).toEqual({
      message: "L’email est envoyé. Sa trace n’a pas pu être écrite dans le journal d’audit.",
      data: { code: "INTERNAL_SERVER_ERROR", reason: "audit_not_recorded" },
    });
    expect(console.error).toHaveBeenCalledWith("[Recruitment] Action done, its audit lines not recorded", expect.objectContaining({ actions: ["email"], count: 1, code: "23514" }));

    // The « accusé de dépôt » as it ended: resent, or refused by Resend, whose refusal the admin still reads.
    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.confirmationEmail.retry({ id })).rejects.toMatchObject(doneNotTraced("L’accusé de dépôt est renvoyé."));
    state.confirmation = "failed";
    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.confirmationEmail.retry({ id })).rejects.toMatchObject(doneNotTraced("Resend a refusé l’e-mail. Vérifiez la configuration et le suivi."));
    expect(state.emails).toEqual(["template:amal@test.local", `confirmation:${id}`, `confirmation:${id}`]);
    // Already sent, nothing was sent again: refused, its line rightly says that nothing was changed.
    state.confirmation = "already_sent";
    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.confirmationEmail.retry({ id })).rejects.toMatchObject(refusedAsUnchanged);
    expect(state.emails).toHaveLength(3);
    expect(auditLines()).toEqual([]);

    // Traced as usual otherwise.
    await expect(admin().recruitment.sendTemplateEmail({ id, template: "profile_interest" })).resolves.toEqual({ success: true });
    expect(auditLines()).toEqual([{ applicationId: id, action: "email", metadata: expect.objectContaining({ template: "profile_interest", resendId: "email-template" }) }]);
  });

  it("l'invitation au portail partie, ou son envoi incertain, est dit tel quel avec sa trace manquante, et son suivi reste enregistré pour éviter un doublon", async () => {
    const sent = seedApplication({ email: "sent@test.local" });
    const uncertain = seedApplication({ email: "uncertain@test.local" });

    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.candidate.sendPortalInvitation({ id: sent })).rejects.toMatchObject(doneNotTraced("L’invitation est envoyée."));
    expect(state.emails).toEqual(["invitation:sent@test.local"]);
    // The delivery's trace, which blocks a duplicate, is kept.
    expect(memory.rows(recruitmentEmailEvents).filter(row => row.application_id === sent)).toHaveLength(1);

    state.invitationFails = true;
    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.candidate.sendPortalInvitation({ id: uncertain })).rejects.toMatchObject(doneNotTraced("La livraison de l’invitation est incertaine. Vérifiez son suivi avant tout nouvel envoi pour éviter un doublon."));
    expect(memory.rows(recruitmentEmailEvents).filter(row => row.application_id === uncertain)).toMatchObject([{ event_type: "email.delivery_unknown" }]);
    // Uncertain, a new invitation is refused, trace or not.
    await expect(admin().recruitment.candidate.sendPortalInvitation({ id: uncertain })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(auditLines()).toEqual([]);
  });

  it("l'analyse relancée d'un dossier est dite faite, avec son résultat, quand sa trace est refusée, et une analyse déjà en cours n'a rien modifié", async () => {
    const id = seedApplication();
    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.reanalyze({ id })).rejects.toMatchObject(doneNotTraced("L’analyse est relancée et son résultat actualisé."));
    expect([state.queued, state.analysed]).toEqual([[id], [id]]);

    // Already running, nothing was queued nor analysed.
    const { enqueueCvAnalysis, processDueCvAnalysisJobs } = await import("./recruitmentProcessing");
    vi.mocked(enqueueCvAnalysis).mockResolvedValueOnce({ queued: false, accelerated: false, alreadyRunning: true });
    vi.mocked(processDueCvAnalysisJobs).mockResolvedValueOnce({ processed: 0, results: [] } as unknown as Awaited<ReturnType<typeof processDueCvAnalysisJobs>>);
    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.reanalyze({ id })).rejects.toMatchObject(refusedAsUnchanged);
    expect(auditLines()).toEqual([]);
  });

  it("la relance des analyses en échec s'arrête à la trace refusée et dit pour combien de dossiers l'analyse est déjà relancée", async () => {
    seedApplication({ analysis_status: "failed" });
    seedApplication({ analysis_status: "failed" });
    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.reanalyzeFailed({ limit: 5 })).rejects.toMatchObject(doneNotTraced("L’analyse de 1 dossier(s) est relancée."));
    // Queued, not yet analysed, and the next one not touched.
    expect([state.queued.length, state.analysed]).toEqual([1, []]);
    await expect(admin().recruitment.reanalyzeFailed({ limit: 5 })).resolves.toMatchObject({ success: true, queued: 2, processed: 1 });
    expect(auditLines().map(line => line.metadata)).toEqual([{ queued: true, batch: true }, { queued: true, batch: true }]);
  });

  it("le lien de téléchargement d'un CV n'est donné qu'une fois le téléchargement tracé : refusé, aucun lien n'est fait et « rien n'a été modifié » est vrai", async () => {
    const id = seedApplication();
    refuseNextLine("recruitment_audit_logs");
    await expect(admin().recruitment.getDownloadUrl({ id })).rejects.toMatchObject(refusedAsUnchanged);
    expect(state.signedUrls).toEqual([]);
    await expect(admin().recruitment.getDownloadUrl({ id })).resolves.toEqual({ url: `https://blob.test/${application(id).cv_file_key}`, fileName: "cv.pdf" });
    expect(auditLines()).toEqual([{ applicationId: id, action: "download", metadata: { fileName: "cv.pdf" } }]);
  });
});
