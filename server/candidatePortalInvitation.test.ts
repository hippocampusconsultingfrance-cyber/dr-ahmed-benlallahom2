import { describe, expect, it } from "vitest";
import { createCandidateInvitationToken, verifyCandidateInvitationToken } from "./candidateAuth";
import { buildCandidatePortalAccessEmail } from "./_core/notifications";

describe("invitations signées au portail candidat", () => {
  it("ne révèle pas l’email et refuse toute altération ou expiration", () => {
    const token = createCandidateInvitationToken(42, Date.now() + 60_000);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("candidate@example.com");
    expect(verifyCandidateInvitationToken(token)).toMatchObject({ applicationId: 42 });
    expect(verifyCandidateInvitationToken(`${token}x`)).toBeNull();
    expect(verifyCandidateInvitationToken(createCandidateInvitationToken(42, Date.now() - 1))).toBeNull();
  });

  it("construit un email d’invitation qui conserve l’activation obligatoire", () => {
    const message = buildCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Amina",
      kind: "invite",
      actionUrl: "https://drahmedbenlallahom.com/candidate/access?invite=signed-token",
    });
    expect(message.subject).toContain("Créez votre espace candidat");
    expect(message.html).toContain("Créer mon espace candidat");
    expect(message.html).toContain("activer votre adresse email");
    expect(message.html).toContain("signed-token");
  });

  it("explique clairement la confirmation d’email sans formulation trompeuse", () => {
    const message = buildCandidatePortalAccessEmail({
      to: "candidate@example.com",
      firstName: "Amina",
      kind: "verify",
      actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=signed-token",
    });
    expect(message.subject).toContain("Confirmez votre adresse email");
    expect(message.html).toContain("Vous recevez cet email parce qu’un espace candidat vient d’être créé");
    expect(message.html).toContain("Confirmer mon adresse email");
    expect(message.text).toContain("recrutement@drahmedbenlallahom.com");
  });
});
