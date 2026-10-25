import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: sendEmail } })),
}));

vi.mock("./notification", () => ({
  notifyOwner: vi.fn(),
}));

import { buildCandidatePortalAccessEmail, sendCvApplicationConfirmationEmail, unverifiedRecipientGreeting } from "./notifications";

// MAIL-01: "first names" typed in the audit replay, and variants that would
// still put a link or a phone number in an email sent from the site's domain.
const TRAP_NAMES = [
  "Votre dossier est incomplet, appelez le +33 1 23 45 67 89 ou allez sur https://recrut-phish.example",
  "Votre colis est bloqué, payez sur https://colis-phish.example/fr",
  "Offre speciale sur https://promo-1.example",
  "Payez sur www.colis-phish.example",
  "Payez sur colis-phish.example",
  "<a href=\"https://lien-phish.example\">Jeanne</a>",
  "Jeanne\nAppelez le 01 23 45 67 89",
];
const TRAP_FRAGMENTS = ["phish", "promo-1", "+33", "01 23", "colis", "dossier est incomplet", "Offre speciale", "Payez"];

function urls(content: string) {
  return content.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
}

function expectNoTrapText(content: string) {
  for (const fragment of TRAP_FRAGMENTS) expect(content).not.toContain(fragment);
}

describe("unverifiedRecipientGreeting (MAIL-01)", () => {
  it("salue par le prénom quand il ressemble à un prénom, toutes écritures confondues", () => {
    expect(unverifiedRecipientGreeting("Jeanne")).toBe("Bonjour Jeanne,");
    expect(unverifiedRecipientGreeting("  Marie-Hélène ")).toBe("Bonjour Marie-Hélène,");
    expect(unverifiedRecipientGreeting("N'Golo")).toBe("Bonjour N'Golo,");
    expect(unverifiedRecipientGreeting("D’Arcy")).toBe("Bonjour D’Arcy,");
    expect(unverifiedRecipientGreeting("J. P.")).toBe("Bonjour J. P.,");
    expect(unverifiedRecipientGreeting("René")).toBe("Bonjour René,");
    expect(unverifiedRecipientGreeting("محمد")).toBe("Bonjour محمد,");
    expect(unverifiedRecipientGreeting("李明", "en")).toBe("Hello 李明,");
    expect(unverifiedRecipientGreeting("A".repeat(40))).toBe(`Bonjour ${"A".repeat(40)},`);
  });

  it("écrit « Bonjour, » ou « Hello, » pour tout autre texte, sans jamais lever d’erreur", () => {
    for (const name of TRAP_NAMES) {
      expect(unverifiedRecipientGreeting(name)).toBe("Bonjour,");
      expect(unverifiedRecipientGreeting(name, "en")).toBe("Hello,");
    }
    expect(unverifiedRecipientGreeting("A".repeat(41))).toBe("Bonjour,");
    expect(unverifiedRecipientGreeting("Anne 2")).toBe("Bonjour,");
    expect(unverifiedRecipientGreeting("Anne‮esrever")).toBe("Bonjour,");
    expect(unverifiedRecipientGreeting("-")).toBe("Bonjour,");
    expect(unverifiedRecipientGreeting("")).toBe("Bonjour,");
    expect(unverifiedRecipientGreeting(null)).toBe("Bonjour,");
    expect(unverifiedRecipientGreeting(undefined, "en")).toBe("Hello,");
  });
});

describe("confirmation de candidature envoyée à une adresse non vérifiée", () => {
  const inviteUrl = "https://drahmedbenlallahom.com/candidate/access?invite=invitation-token";

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_unverified_recipient");
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ data: { id: "email-confirmation" }, error: null });
  });

  it("ne recopie ni le texte d’un prénom piégé, ni la spécialité, ni les pays ciblés, et garde la référence", async () => {
    for (const [index, name] of TRAP_NAMES.entries()) {
      await sendCvApplicationConfirmationEmail("phish.victim@test.local", name, `CVTRAP${index}`, inviteUrl);
      const payload = sendEmail.mock.calls.at(-1)![0];
      expect(payload.to).toEqual(["phish.victim@test.local"]);
      expect(payload.html).toContain("<p>Bonjour,</p>");
      expect(payload.html).toContain(`CVTRAP${index}`);
      expect(payload.html).not.toMatch(/Spécialité|Pays ciblés/);
      expectNoTrapText(payload.html);
      expect(urls(payload.html).every(url => url.startsWith("https://drahmedbenlallahom.com/"))).toBe(true);
      expect(urls(payload.html)).toContain(inviteUrl);
    }
  });

  it("salue un vrai prénom, échappé dans le HTML", async () => {
    await sendCvApplicationConfirmationEmail("candidate@example.com", "N'Golo", "CVREAL1", inviteUrl);
    expect(sendEmail.mock.calls[0][0].html).toContain("<p>Bonjour N&#039;Golo,</p>");
  });
});

describe("emails de l’espace candidat envoyés à une adresse non vérifiée", () => {
  it("activation, invitation et réinitialisation : salutation neutre, seul lien = le lien d’action", () => {
    const actionUrl = "https://drahmedbenlallahom.com/candidate/verify?email=a%40test.local&token=abc";
    for (const kind of ["verify", "invite", "reset"] as const) {
      for (const name of TRAP_NAMES) {
        const email = buildCandidatePortalAccessEmail({ to: "cible@test.local", firstName: name, kind, actionUrl });
        expect(email.html).toContain("<p>Bonjour,</p>");
        expect(email.text).toContain("\n\nBonjour,\n\n");
        expectNoTrapText(email.html);
        expectNoTrapText(email.text);
        expect(urls(email.text)).toEqual([actionUrl]);
      }
    }
    expect(buildCandidatePortalAccessEmail({ to: "cible@test.local", firstName: "Camille", kind: "verify", actionUrl }).text).toContain("\n\nBonjour Camille,\n\n");
  });
});
