import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: sendEmail } })),
}));

vi.mock("./notification", () => ({
  notifyOwner: vi.fn(),
}));

import { sendCvApplicationConfirmationEmail } from "./notifications";
import { RECRUITMENT_RETENTION_YEARS } from "../recruitmentRetention";

const hrefs = (html: string) => Array.from(html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g), ([, href, label]) => [label, href!.replaceAll("&amp;", "&")]);

describe("information RGPD de « Candidature reçue » (RGPD-24)", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_cv_confirmation");
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ data: { id: "email-confirmation" }, error: null });
  });

  it("dit la durée de conservation codée et le rôle de l’analyse, avec la politique de confidentialité et le formulaire RGPD", async () => {
    await sendCvApplicationConfirmationEmail("candidate@example.com", "Camille", "CVRGPD0001", "https://drahmedbenlallahom.com/candidate/access?invite=abc.def", "key-fr");
    const french = sendEmail.mock.calls[0][0].html as string;
    expect(french).toContain(`Vos données de candidature sont conservées ${RECRUITMENT_RETENTION_YEARS} ans après votre dernière activité.`);
    expect(french).toContain("Elle ne produit aucune décision d’embauche ou de rejet sans revue humaine.");
    expect(hrefs(french)).toEqual(expect.arrayContaining([
      ["Politique de confidentialité", "https://drahmedbenlallahom.com/legal?tab=privacy&lang=fr"],
      ["Exercer mes droits RGPD", "https://drahmedbenlallahom.com/gdpr?lang=fr"],
    ]));
    // The presentation to client facilities waits for its legal text (RGPD-03).
    expect(french).not.toMatch(/établissements clients|présenté/);

    await sendCvApplicationConfirmationEmail("candidate@example.com", "Aisha", "CVRGPD0002", undefined, "key-en", "en");
    const english = sendEmail.mock.calls[1][0].html as string;
    expect(english).toContain(`Your application data is kept for ${RECRUITMENT_RETENTION_YEARS} years after your latest activity.`);
    expect(english).toContain("It produces no hiring or rejection decision without human review.");
    expect(hrefs(english)).toEqual(expect.arrayContaining([
      ["Privacy policy", "https://drahmedbenlallahom.com/legal?tab=privacy&lang=en"],
      ["Exercise my GDPR rights", "https://drahmedbenlallahom.com/gdpr?lang=en"],
    ]));
  });
});

describe("aperçu et titre de « Candidature reçue » (MAIL-12, A11Y-21)", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_cv_confirmation");
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ data: { id: "email-confirmation" }, error: null });
  });

  it("donne en aperçu le numéro de suivi, jamais le prénom saisi, et titre le document de son sujet", async () => {
    await sendCvApplicationConfirmationEmail("candidate@example.com", "Camille", "CVRGPD0003", undefined, "key-preview");
    const { html, subject } = sendEmail.mock.calls[0][0] as { html: string; subject: string };
    const preview = /<body[^>]*>\s*<div style="display:none;[^"]*">([^&<]*)/.exec(html)?.[1];
    expect(preview).toBe("Candidature enregistrée sous le numéro de suivi CVRGPD0003");
    expect(html).toContain(`<title>${subject}</title>`);
    expect(html).toContain('<html lang="fr">');
  });
});

describe("sendCvApplicationConfirmationEmail", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_cv_confirmation");
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ data: { id: "email-confirmation" }, error: null });
  });

  it("sends an idempotent confirmation with attribute-free webhook correlation tags", async () => {
    const result = await sendCvApplicationConfirmationEmail(
      "candidate@example.com",
      "Camille",
      "CVABC123XYZ",
      undefined,
      "cv-confirmation-test-key",
    );

    expect(result).toEqual({ status: "sent", providerEmailId: "email-confirmation", failureCode: null });
    expect(sendEmail.mock.calls[0][0].tags).toEqual([
      { name: "email_kind", value: "application_confirmation" },
      { name: "application_ref", value: "CVABC123XYZ" },
    ]);
    expect(sendEmail.mock.calls[0][1]).toEqual({ idempotencyKey: "cv-confirmation-test-key" });
    expect(JSON.stringify(sendEmail.mock.calls[0][0].tags)).not.toContain("candidate@example.com");
    expect(JSON.stringify(sendEmail.mock.calls[0][0].tags)).not.toContain("Camille");
  });

  it("retries an ambiguous SDK network response with the exact same request and key", async () => {
    sendEmail
      .mockResolvedValueOnce({ data: null, error: { name: "application_error", statusCode: null, message: "network" } })
      .mockResolvedValueOnce({ data: { id: "email-after-retry" }, error: null });

    await expect(sendCvApplicationConfirmationEmail(
      "candidate@example.com", "Camille", "CVABC123XYZ", undefined, "cv-confirmation-test-key",
    )).resolves.toEqual({ status: "sent", providerEmailId: "email-after-retry", failureCode: null });

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[1][0]).toEqual(sendEmail.mock.calls[0][0]);
    expect(sendEmail.mock.calls[1][1]).toEqual(sendEmail.mock.calls[0][1]);
  });

  it("does not retry an explicit provider rejection", async () => {
    sendEmail.mockResolvedValueOnce({ data: null, error: { name: "validation_error", statusCode: 422, message: "rejected" } });

    await expect(sendCvApplicationConfirmationEmail(
      "candidate@example.com", "Camille", "CVABC123XYZ", undefined, "cv-confirmation-test-key",
    )).resolves.toEqual({ status: "failed", providerEmailId: null, failureCode: "provider_rejected" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("keeps a double ambiguous delivery distinct from a confirmed rejection", async () => {
    sendEmail.mockResolvedValue({ data: null, error: { name: "application_error", statusCode: 503, message: "temporary" } });

    await expect(sendCvApplicationConfirmationEmail(
      "candidate@example.com", "Camille", "CVABC123XYZ", undefined, "cv-confirmation-test-key",
    )).resolves.toEqual({ status: "failed", providerEmailId: null, failureCode: "delivery_exception" });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
