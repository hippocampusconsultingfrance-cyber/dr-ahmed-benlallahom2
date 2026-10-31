import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { securityEvents } from "../../drizzle/schema";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "../testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "../testSupport/candidatePortal";

process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;

// ABUS-03 : limite de débit et quota Resend. Seul le transport Resend est simulé.
const state = vi.hoisted(() => ({ db: null as unknown, send: vi.fn() }));
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: state.send } })) }));
vi.mock("../db", () => ({ getDb: async () => state.db }));
vi.mock("./notification", async importOriginal => ({ ...await importOriginal<typeof import("./notification")>(), notifyOwner: vi.fn(async () => true) }));

const {
  candidatePortalAccessEmailFailureCode,
  postPaymentDeliveryRetry,
  resendRateLimitRetry,
  sendAdminMfaCodeEmail,
  sendCandidatePortalAccessEmail,
  sendConfirmationEmail,
  sendCvApplicationConfirmationEmail,
  sendOwnerNotificationEmail,
  sendRecruitmentCampaignEmail,
  sendRecruitmentTemplateEmail,
} = await import("./notifications");
const { sendMedicalQuestionAcknowledgementEmail, sendMedicalQuestionResponseEmail } = await import("../medicalQuestionEmails");
const { buildCvConfirmationEmailEvent } = await import("../recruitmentEmailTrace");
const { runSecurityPostureReview } = await import("../scheduledJobs");

const sent = { data: { id: "email_ok" }, error: null, headers: {} };
const rateLimited = (retryAfter?: string) => ({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" }, headers: retryAfter === undefined ? {} : { "retry-after": retryAfter } });
const quotaExceeded = (name: "daily_quota_exceeded" | "monthly_quota_exceeded") => ({ data: null, error: { name, statusCode: 429, message: "You have reached your quota" }, headers: {} });

function db() { return state.db as InMemoryDrizzle; }
const quotaEvents = () => db().rows(securityEvents).filter(event => event.category === "resend_quota_exceeded");

const confirmation = () => sendConfirmationEmail("patient@example.test", "Patient Test", "APTLIMIT0001", new Date("2026-11-20T09:00:00Z"), 100, undefined, { idempotencyKey: "appointment-confirmation-APTLIMIT0001" });
const ownerBooking = () => sendOwnerNotificationEmail("Patient Test", "patient@example.test", "+33600000000", "APTLIMIT0001", new Date("2026-11-20T09:00:00Z"), 100, { idempotencyKey: "appointment-owner-APTLIMIT0001" });
const access = () => sendCandidatePortalAccessEmail({ to: "candidate@example.test", firstName: "Camille", kind: "verify", actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=t", idempotencyKey: "candidate-portal-activation-abc" });
const questionAcknowledgement = () => sendMedicalQuestionAcknowledgementEmail({ email: "person@example.test", firstName: "Marie", trackingId: "QMED-LIMIT-0001", language: "fr" });
const campaign = () => sendRecruitmentCampaignEmail({ candidateEmail: "candidate@example.test", candidateFirstName: "Camille", campaignTitle: "Poste en réanimation", subject: "Nouvelle opportunité", body: "Un poste est ouvert.", language: "fr", unsubscribeUrl: "https://drahmedbenlallahom.com/recruitment/unsubscribe?token=abc" });

beforeEach(() => {
  state.db = createInMemoryDrizzle();
  state.send.mockReset();
  vi.stubEnv("RESEND_API_KEY", "re_test_resend_limits");
  postPaymentDeliveryRetry.delaysMs = [0, 0];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resendRateLimitRetry.defaultDelayMs = 1_000;
  resendRateLimitRetry.maxDelayMs = 5_000;
});

describe("limite de débit Resend (429 rate_limit_exceeded) : échec passager", () => {
  it("renvoie l’email après le délai retry-after demandé, avec la même clé d’idempotence", async () => {
    vi.useFakeTimers();
    state.send.mockResolvedValueOnce(rateLimited("2")).mockResolvedValueOnce(sent);

    const delivery = confirmation();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(state.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(delivery).resolves.toBeUndefined();

    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.send.mock.calls[1][1]).toEqual({ idempotencyKey: "appointment-confirmation-APTLIMIT0001" });
    expect(quotaEvents()).toEqual([]);
  });

  it("attend une seconde sans en-tête retry-after, et laisse aux essais suivants un délai trop long", async () => {
    vi.useFakeTimers();
    state.send.mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(sent);
    const delivery = access();
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(delivery).resolves.toEqual({ id: "email_ok" });
    expect(state.send).toHaveBeenCalledTimes(2);

    state.send.mockReset();
    state.send.mockResolvedValue(rateLimited("60"));
    const refused = await access().catch((error: unknown) => error);
    expect(candidatePortalAccessEmailFailureCode(refused)).toBe("rate_limited");
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("après paiement, laisse au nouvel essai du job un retry-after trop long au lieu d’insister avant ce délai", async () => {
    state.send.mockResolvedValue(rateLimited("60"));
    await expect(confirmation()).rejects.toMatchObject({ cause: expect.objectContaining({ failureCode: "rate_limited" }) });
    expect(state.send).toHaveBeenCalledTimes(1);

    // Un délai court est respecté à chaque essai de la boucle, qui continue.
    state.send.mockReset();
    state.send.mockResolvedValue(rateLimited("0"));
    await expect(confirmation()).rejects.toMatchObject({ cause: expect.objectContaining({ failureCode: "rate_limited" }) });
    expect(state.send).toHaveBeenCalledTimes(2 * (postPaymentDeliveryRetry.delaysMs.length + 1));
  });

  it("la notification de réservation payée au propriétaire attend le délai retry-after avant de renvoyer, puis est délivrée", async () => {
    vi.useFakeTimers();
    state.send.mockResolvedValueOnce(rateLimited("2")).mockResolvedValueOnce(sent);

    const delivery = ownerBooking();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(state.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(delivery).resolves.toBeUndefined();

    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.send.mock.calls[1][0]).toMatchObject({ subject: "Nouvelle réservation payée : Patient Test - 100 €" });
    expect(state.send.mock.calls.map(call => call[1])).toEqual([{ idempotencyKey: "appointment-owner-APTLIMIT0001" }, { idempotencyKey: "appointment-owner-APTLIMIT0001" }]);
  });

  it("la notification de réservation payée n’insiste pas avant un retry-after trop long, ni après un refus ou un quota : son job réessaiera", async () => {
    state.send.mockResolvedValue(rateLimited("60"));
    await expect(ownerBooking()).rejects.toThrow("owner_notification_failed");
    expect(state.send).toHaveBeenCalledTimes(1);

    for (const refusal of [quotaExceeded("daily_quota_exceeded"), { data: null, error: { name: "validation_error", statusCode: 422, message: "invalid recipient" }, headers: {} }]) {
      state.send.mockReset();
      state.send.mockResolvedValue(refusal);
      await expect(ownerBooking()).rejects.toThrow("owner_notification_failed");
      expect(state.send).toHaveBeenCalledTimes(1);
    }
    expect(quotaEvents().map(event => JSON.parse(String(event.metadata)))).toEqual([{ quota: "daily", emailKind: "post_payment" }]);
  });

  it("garde comme non envoyée une confirmation de candidature encore limitée, pour un nouvel essai planifié", async () => {
    resendRateLimitRetry.defaultDelayMs = 0;
    state.send.mockResolvedValue(rateLimited());

    const delivery = await sendCvApplicationConfirmationEmail("candidate@example.test", "Camille", "CVLIMIT0001");

    expect(delivery).toEqual({ status: "failed", providerEmailId: null, failureCode: "rate_limited" });
    // « email.failed » (rien n’est parti) et non « livraison à confirmer » : la relance planifiée le reprend.
    expect(buildCvConfirmationEmailEvent({ applicationId: 1, candidateEmail: "candidate@example.test", trackingId: "CVLIMIT0001" }, delivery).eventType).toBe("email.failed");
  });
});

describe("quota Resend épuisé : code « quota » distinct, journalisé en gravité élevée", () => {
  it("n’insiste pas pour un email après paiement et le signale au bilan quotidien de sécurité", async () => {
    state.send.mockResolvedValue(quotaExceeded("daily_quota_exceeded"));

    await expect(confirmation()).rejects.toMatchObject({ message: "confirmation_email_failed", cause: expect.objectContaining({ failureCode: "quota" }) });

    expect(state.send).toHaveBeenCalledTimes(1);
    expect(quotaEvents()).toHaveLength(1);
    expect(quotaEvents()[0]).toMatchObject({ actorKind: "system", outcome: "failed", severity: "high" });
    expect(JSON.parse(String(quotaEvents()[0].metadata))).toEqual({ quota: "daily", emailKind: "post_payment" });
    await expect(runSecurityPostureReview()).resolves.toMatchObject({ highSeverityEvents24h: 1 });
  });

  it("distingue le quota d’un refus pour la confirmation de candidature et l’email d’accès candidat", async () => {
    state.send.mockResolvedValue(quotaExceeded("monthly_quota_exceeded"));

    await expect(sendCvApplicationConfirmationEmail("candidate@example.test", "Camille", "CVQUOTA0001"))
      .resolves.toEqual({ status: "failed", providerEmailId: null, failureCode: "quota" });
    const refused = await access().catch((error: unknown) => error);
    expect(candidatePortalAccessEmailFailureCode(refused)).toBe("quota");

    expect(state.send).toHaveBeenCalledTimes(2);
    expect(quotaEvents().map(event => JSON.parse(String(event.metadata)))).toEqual([
      { quota: "monthly", emailKind: "cv_confirmation" },
      { quota: "monthly", emailKind: "candidate_access" },
    ]);
  });

  it("journalise aussi le quota qui bloque le code de connexion administrateur", async () => {
    state.send.mockResolvedValue(quotaExceeded("daily_quota_exceeded"));

    await expect(sendAdminMfaCodeEmail("admin@example.test", "123456")).rejects.toThrow(/^admin_mfa_email_failed:/);

    expect(JSON.parse(String(quotaEvents()[0]?.metadata))).toEqual({ quota: "daily", emailKind: "admin_mfa" });
  });

  it("ne confond pas un refus définitif du message avec un quota", async () => {
    state.send.mockResolvedValue({ data: null, error: { name: "validation_error", statusCode: 422, message: "invalid recipient" }, headers: {} });

    await expect(sendCvApplicationConfirmationEmail("candidate@example.test", "Camille", "CVREFUS0001"))
      .resolves.toMatchObject({ failureCode: "provider_rejected" });
    expect(quotaEvents()).toEqual([]);
  });
});

describe("emails des questions santé et du recrutement : même lecture des refus Resend", () => {
  it("renvoie l’accusé de réception d’une question après un retry-after court, avec sa clé d’idempotence", async () => {
    vi.useFakeTimers();
    state.send.mockResolvedValueOnce(rateLimited("1")).mockResolvedValueOnce(sent);

    const delivery = questionAcknowledgement();
    await vi.advanceTimersByTimeAsync(999);
    expect(state.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(delivery).resolves.toBeUndefined();

    expect(state.send.mock.calls.map(call => call[1])).toEqual([
      { idempotencyKey: "medical-question-acknowledgement/QMED-LIMIT-0001" },
      { idempotencyKey: "medical-question-acknowledgement/QMED-LIMIT-0001" },
    ]);
  });

  it("renvoie aussi un email de campagne limité, et n’insiste pas avant un retry-after trop long", async () => {
    vi.useFakeTimers();
    state.send.mockResolvedValueOnce(rateLimited("2")).mockResolvedValueOnce(sent);
    const delivery = campaign();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(delivery).resolves.toEqual({ id: "email_ok" });
    expect(state.send).toHaveBeenCalledTimes(2);

    state.send.mockReset();
    state.send.mockResolvedValue(rateLimited("60"));
    await expect(sendRecruitmentTemplateEmail("candidate@example.test", "Camille", "CVLIMIT0002", "profile_interest")).rejects.toThrow("Resend recruitment email failed");
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("journalise le quota épuisé par l’accusé de réception, la réponse à une question ou une campagne, sans nouvel essai", async () => {
    state.send.mockResolvedValue(quotaExceeded("daily_quota_exceeded"));

    await expect(questionAcknowledgement()).rejects.toThrow(/^medical_question_acknowledgement_email_failed:/);
    await expect(sendMedicalQuestionResponseEmail({ email: "person@example.test", firstName: "Marie", trackingId: "QMED-LIMIT-0001", response: "Réponse." })).rejects.toThrow(/^medical_question_response_email_failed:/);
    await expect(campaign()).rejects.toThrow("Resend campaign email failed");

    expect(state.send).toHaveBeenCalledTimes(3);
    expect(quotaEvents().map(event => JSON.parse(String(event.metadata)))).toEqual([
      { quota: "daily", emailKind: "medical_question" },
      { quota: "daily", emailKind: "medical_question" },
      { quota: "daily", emailKind: "recruitment_campaign" },
    ]);
  });
});
