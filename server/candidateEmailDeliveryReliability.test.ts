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

  it("conserve le dernier lien encore valable lorsque Resend refuse le nouveau", () => {
    expect(source).toContain("verificationTokenHash: previousVerificationState.tokenHash");
    expect(source).toContain("eq(candidateAccounts.verificationTokenHash, verificationTokenHash)");
    expect(source).toContain("passwordResetTokenHash: candidate.passwordResetTokenHash");
    expect(source).toContain("eq(candidateAccounts.passwordResetTokenHash, tokenHash)");
  });
});
