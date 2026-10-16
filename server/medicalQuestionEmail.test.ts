import { afterEach, describe, expect, it, vi } from "vitest";

const resendMocks = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({ error: null }) }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendMocks.send };
  },
}));

import { siteConfig } from "../client/src/data/site-config";
import { buildMedicalQuestionOwnerNotification, resolveMedicalQuestionContact, sendMedicalQuestionAcknowledgementEmail, sendMedicalQuestionResponseEmail } from "./medicalQuestionEmails";

describe("emails du service de questions médicales", () => {
  afterEach(() => {
    resendMocks.send.mockClear();
    vi.unstubAllEnvs();
  });

  it("prépare un email confidentiel avec une limite médicale claire, réponses vers le cabinet (pas le recrutement)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    await sendMedicalQuestionResponseEmail({
      email: "test@example.invalid",
      firstName: "Test",
      trackingId: "MQ-TEST-2026",
      response: "Voici une information générale relue.",
    }, { idempotencyKey: "medical-question-response/1/first" });

    expect(resendMocks.send).toHaveBeenCalledOnce();
    const [payload, options] = resendMocks.send.mock.calls[0];
    expect(payload.to).toEqual(["test@example.invalid"]);
    expect(payload.subject).toContain("MQ-TEST-2026");
    expect(payload.html).toContain("ne remplace pas une consultation");
    expect(payload.html).toContain("Voici une information générale relue.");
    expect(payload.replyTo).toBe(siteConfig.email);
    expect(payload.replyTo).not.toBe("hippocampusconsultingfrance@gmail.com");
    expect(options).toEqual({ idempotencyKey: "medical-question-response/1/first" });
  });

  it("Reply-To et expéditeur réglables par CONSULTATION_REPLY_TO / CONSULTATION_FROM_EMAIL (valeurs invalides ignorées)", () => {
    expect(resolveMedicalQuestionContact({})).toEqual({ from: "Hippocampus Consulting <recrutement@drahmedbenlallahom.com>", replyTo: siteConfig.email });
    expect(resolveMedicalQuestionContact({ CONSULTATION_REPLY_TO: "cabinet@example.test", CONSULTATION_FROM_EMAIL: "Dr Ben Lallahom <consultation@example.test>" })).toEqual({ from: "Dr Ben Lallahom <consultation@example.test>", replyTo: "cabinet@example.test" });
    expect(resolveMedicalQuestionContact({ CONSULTATION_REPLY_TO: "not an email" }).replyTo).toBe(siteConfig.email);
  });

  it("accuse réception avec la référence et un délai indicatif, sans recopier la question", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    await sendMedicalQuestionAcknowledgementEmail({ email: "patient@example.invalid", firstName: "Jeanne", trackingId: "QMED-ABCDEFGH-12345", language: "fr" });
    const [payload, options] = resendMocks.send.mock.calls[0];
    expect(payload.subject).toBe("Votre question a bien été reçue — QMED-ABCDEFGH-12345");
    expect(payload.text).toContain("Référence : QMED-ABCDEFGH-12345");
    expect(payload.text).toContain("Délai indicatif");
    expect(payload.text).toContain("ne traite pas les urgences");
    expect(payload.replyTo).toBe(siteConfig.email);
    expect(options).toEqual({ idempotencyKey: "medical-question-acknowledgement/QMED-ABCDEFGH-12345" });

    vi.stubEnv("MEDICAL_QUESTION_RESPONSE_DELAY_TEXT", "Délai indicatif : réponse sous 10 jours ouvrés.");
    await sendMedicalQuestionAcknowledgementEmail({ email: "patient@example.invalid", firstName: "Jeanne", trackingId: "QMED-ABCDEFGH-12346", language: "fr" });
    expect(resendMocks.send.mock.calls[1][0].text).toContain("réponse sous 10 jours ouvrés");
    await sendMedicalQuestionAcknowledgementEmail({ email: "patient@example.invalid", firstName: "Jane", trackingId: "QMED-ABCDEFGH-12347", language: "en" });
    expect(resendMocks.send.mock.calls[2][0].subject).toBe("Your question has been received — QMED-ABCDEFGH-12347");
  });

  it("alerte le propriétaire sans nom, email ni contenu de santé", () => {
    const notification = buildMedicalQuestionOwnerNotification({ trackingId: "QMED-ABCDEFGH-12345", language: "fr", publicationConsent: false, adminUrl: "https://example.test/admin" });
    expect(notification.title).toBe("Nouvelle question santé à traiter (QMED-ABCDEFGH-12345)");
    expect(notification.content).toContain("https://example.test/admin");
    expect(notification.content).toContain("accord de publication anonymisée : non");
    expect(notification.content).not.toMatch(/@|Jeanne|douleur|anesthésie/i);
  });
});
