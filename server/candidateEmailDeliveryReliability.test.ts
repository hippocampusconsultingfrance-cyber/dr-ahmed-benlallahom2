import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./candidatePortalRouter.ts", import.meta.url), "utf8");

describe("fiabilité des e-mails du portail candidat", () => {
  it("trace séparément les livraisons d’activation et de réinitialisation", () => {
    expect(source).toContain('category: "candidate_verification_delivery"');
    expect(source).toContain('category: "candidate_password_reset_delivery"');
    expect(source).toContain("providerMessageId: delivery.id");
    expect(source).toContain('outcome: "failed"');
  });

  it("ne journalise jamais l’objet d’erreur potentiellement sensible", () => {
    expect(source).toContain('error instanceof Error ? error.name : "UnknownError"');
    expect(source).not.toContain('console.error("candidate_verification_email_failed", error)');
    expect(source).not.toContain('console.error("candidate_reset_email_failed", error)');
  });

  it("restaure le dernier lien valable uniquement après un refus explicite", () => {
    expect(source.match(/if \(failureCode === "provider_rejected"\)/g)).toHaveLength(3);
    expect(source).toContain("verificationTokenHash: previousVerificationState?.tokenHash ?? null");
    expect(source).toContain("eq(candidateAccounts.verificationTokenHash, verificationTokenHash)");
    expect(source).toContain("passwordResetTokenHash: candidate.passwordResetTokenHash");
    expect(source).toContain("eq(candidateAccounts.passwordResetTokenHash, tokenHash)");
  });

  it("utilise une clé d’idempotence liée au jeton pour les activations et réinitialisations", () => {
    expect(source).toContain('buildCandidatePortalAccessIdempotencyKey("verify", verificationTokenHash)');
    expect(source).toContain('buildCandidatePortalAccessIdempotencyKey("verify", tokenHash)');
    expect(source).toContain('buildCandidatePortalAccessIdempotencyKey("reset", tokenHash)');
  });

  it("ne permet pas à une seconde inscription d’écraser le mot de passe d’un compte en attente", () => {
    const existingAccountBranch = source.slice(source.indexOf("if (existing[0])"), source.indexOf("} else {", source.indexOf("if (existing[0])")));
    expect(existingAccountBranch).not.toContain("passwordHash");
    expect(existingAccountBranch).not.toContain("firstName: input.firstName");
    expect(existingAccountBranch).not.toContain("lastName: input.lastName");
    expect(existingAccountBranch).not.toContain("linkedApplicationId: matchingApplicationId");
  });
});
