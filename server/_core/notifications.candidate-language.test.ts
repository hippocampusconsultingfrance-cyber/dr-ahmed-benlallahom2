import { beforeEach, describe, expect, it, vi } from "vitest";

// EN-02 — les quatre emails candidat (candidature reçue, invitation, activation,
// réinitialisation) partent en anglais quand la langue n’est pas le français,
// avec ?lang=en dans les liens. La salutation filtrée (MAIL-01) est conservée.

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: sendEmail } })) }));
vi.mock("./notification", () => ({ notifyOwner: vi.fn() }));

import { buildCandidatePortalAccessEmail, sendCandidatePortalAccessEmail, sendCvApplicationConfirmationEmail } from "./notifications";

const FRENCH_WORDS = /Bonjour|Candidature reçue|Créer mon espace|Confirmez|Réinitialisez|valable|Courriers indésirables/;

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test_candidate_language");
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ data: { id: "email-language" }, error: null });
});

describe("confirmation de candidature dans la langue du formulaire", () => {
  it("écrit en anglais, garde la salutation filtrée et ouvre l’espace candidat en anglais", async () => {
    await sendCvApplicationConfirmationEmail("candidate@example.com", "Aisha", "CVLANG0001", "https://drahmedbenlallahom.com/candidate/access?invite=abc.def", "cv-application-confirmation-CVLANG0001-attempt-1", "en");
    const message = sendEmail.mock.calls[0][0];
    expect(message.subject).toBe("Application received - CVLANG0001");
    expect(message.html).toContain("Hello Aisha,");
    expect(message.html).toContain("We confirm receipt of your international recruitment application.");
    expect(message.html).toContain('href="https://drahmedbenlallahom.com/candidate/access?invite=abc.def&amp;lang=en"');
    expect(message.html).toContain("This invitation link is valid for 7 days.");
    expect(message.html).toContain("Professional and confidential communication");
    expect(message.html).not.toMatch(FRENCH_WORDS);
    expect(message.tags).toEqual([
      { name: "email_kind", value: "application_confirmation" },
      { name: "application_ref", value: "CVLANG0001" },
    ]);

    sendEmail.mockClear();
    await sendCvApplicationConfirmationEmail("candidate@example.com", "colis-phish.example", "CVLANG0001", undefined, "key", "en");
    expect(sendEmail.mock.calls[0][0].html).toContain("<p>Hello,</p>");
    expect(sendEmail.mock.calls[0][0].html).not.toContain("colis-phish");
  });

  it("reste en français par défaut, sans paramètre de langue dans le lien", async () => {
    await sendCvApplicationConfirmationEmail("candidate@example.com", "Camille", "CVLANG0002", "https://drahmedbenlallahom.com/candidate/access?invite=abc.def");
    const message = sendEmail.mock.calls[0][0];
    expect(message.subject).toBe("Candidature reçue - CVLANG0002");
    expect(message.html).toContain("Bonjour Camille,");
    expect(message.html).toContain("Ce lien d’invitation est valable 7 jours.");
    expect(message.html).toContain('href="https://drahmedbenlallahom.com/candidate/access?invite=abc.def"');
  });
});

describe("emails d’accès à l’espace candidat en anglais", () => {
  const url = {
    verify: "https://drahmedbenlallahom.com/candidate/verify?email=a%40example.com&token=t0k3n",
    reset: "https://drahmedbenlallahom.com/candidate/reset-password?email=a%40example.com&token=t0k3n",
    invite: "https://drahmedbenlallahom.com/candidate/access?invite=abc.def",
  } as const;

  it.each([
    ["verify", "Confirm your email address — Hippocampus candidate portal", "valid for 30 minutes and can only be used once"],
    ["reset", "Reset your password — Hippocampus Consulting", "valid for 30 minutes"],
    ["invite", "Create your candidate portal — Hippocampus Consulting", "This invitation link is valid for 7 days"],
  ] as const)("%s : sujet, texte et lien ?lang=en", (kind, subject, validity) => {
    const email = buildCandidatePortalAccessEmail({ to: "a@example.com", firstName: "Aisha", kind, actionUrl: url[kind], language: "en" });
    expect(email.subject).toBe(subject);
    for (const body of [email.html, email.text]) {
      expect(body).toContain("Hello Aisha,");
      expect(body).toContain(validity);
      expect(body).toContain("check your Spam or Junk folder");
      expect(body).not.toMatch(FRENCH_WORDS);
    }
    expect(email.text).toContain(`${url[kind]}&lang=en`);
    // The token and email parameters of the link are unchanged.
    const link = new URL(/https:\/\/\S+/.exec(email.text)![0]);
    expect(link.searchParams.get("lang")).toBe("en");
    if (kind !== "invite") expect(link.searchParams.get("token")).toBe("t0k3n");
  });

  it("garde le français et le lien d’origine sans langue précisée", () => {
    const email = buildCandidatePortalAccessEmail({ to: "a@example.com", firstName: "Camille", kind: "verify", actionUrl: url.verify });
    expect(email.subject).toBe("Confirmez votre adresse email — Espace candidat Hippocampus");
    expect(email.text).toContain(`${url.verify}\n`);
    expect(email.text).not.toContain("lang=");
  });

  it("envoie la version anglaise avec la même clé d’idempotence", async () => {
    await sendCandidatePortalAccessEmail({ to: "a@example.com", firstName: "Aisha", kind: "reset", actionUrl: url.reset, language: "en", idempotencyKey: "candidate-portal-password-reset-key" });
    expect(sendEmail.mock.calls[0][0].subject).toBe("Reset your password — Hippocampus Consulting");
    expect(sendEmail.mock.calls[0][1]).toEqual({ idempotencyKey: "candidate-portal-password-reset-key" });
  });
});
