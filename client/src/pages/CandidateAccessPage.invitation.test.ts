import { describe, expect, it } from "vitest";
import { candidateAccessCopy, getCandidateInvitationToken } from "./CandidateAccessPage";

describe("parcours d’invitation de l’espace candidat", () => {
  it("accepte uniquement un jeton signé structurellement valide depuis l’URL", () => {
    expect(getCandidateInvitationToken("?invite=payload.signature")).toBe("payload.signature");
    expect(getCandidateInvitationToken("?invite=1&email=candidate%40example.com")).toBeNull();
    expect(getCandidateInvitationToken("?invite=invalid token")).toBeNull();
  });

  it("explique l’activation obligatoire dans les quatre langues d’interface", () => {
    for (const copy of Object.values(candidateAccessCopy)) {
      expect(copy.invitationWelcome.length).toBeGreaterThan(20);
      expect(copy.invitationInvalid.length).toBeGreaterThan(15);
    }
  });
});
