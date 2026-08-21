import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createCandidateInvitationToken, verifyCandidateInvitationToken } from "../../../server/candidateAuth";
import { candidateAccessCopy, getCandidateInvitationEntry, getCandidateInvitationToken } from "./CandidateAccessPage";

const previousPepper = process.env.CANDIDATE_AUTH_PEPPER;

beforeEach(() => {
  process.env.CANDIDATE_AUTH_PEPPER = "candidate-invitation-test-pepper-which-is-long-enough-32";
});

afterAll(() => {
  if (previousPepper === undefined) delete process.env.CANDIDATE_AUTH_PEPPER;
  else process.env.CANDIDATE_AUTH_PEPPER = previousPepper;
});

describe("parcours d’invitation de l’espace candidat", () => {
  it("accepte uniquement un jeton signé structurellement valide depuis l’URL", () => {
    expect(getCandidateInvitationToken("?invite=payload.signature")).toBe("payload.signature");
    expect(getCandidateInvitationToken("?invite=1&email=candidate%40example.com")).toBeNull();
    expect(getCandidateInvitationToken("?invite=invalid token")).toBeNull();
  });

  it("bascule les liens historiques vers la création sans les utiliser comme autorisation", () => {
    expect(getCandidateInvitationEntry("?invite=1&email=Candidate%40Example.com")).toEqual({ token: null, legacyEmail: "candidate@example.com" });
    expect(getCandidateInvitationEntry("?email=candidate%40example.com")).toEqual({ token: null, legacyEmail: null });
    expect(getCandidateInvitationEntry("?invite=payload.signature")).toEqual({ token: "payload.signature", legacyEmail: null });
  });

  it("préserve un jeton signé valide entre le lien email, le navigateur et le serveur", () => {
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const token = createCandidateInvitationToken(42, expiresAt);

    expect(getCandidateInvitationEntry(`?invite=${encodeURIComponent(token)}`)).toEqual({ token, legacyEmail: null });
    expect(verifyCandidateInvitationToken(token)).toEqual({ applicationId: 42, expiresAt });
  });

  it("explique l’activation obligatoire dans les quatre langues d’interface", () => {
    for (const copy of Object.values(candidateAccessCopy)) {
      expect(copy.invitationWelcome.length).toBeGreaterThan(20);
      expect(copy.invitationInvalid.length).toBeGreaterThan(15);
    }
  });
});
