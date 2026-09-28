import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./candidatePortalRouter.ts", import.meta.url), "utf8");

describe("reprise de l’activation du compte candidat", () => {
  it("reste anti-énumération et protégée contre les abus", () => {
    expect(source).toContain("resendVerification: publicProcedure");
    expect(source).toContain('action: "candidate_verification_resend"');
    expect(source).toContain("verifyCandidateTurnstile");
    expect(source).toContain("return { message: genericAccessMessage }");
  });

  it("ne renvoie un lien qu’à un compte actif non vérifié", () => {
    expect(source).toContain("if (candidate && !candidate.emailVerifiedAt)");
    expect(source).toContain('kind: "verify"');
    expect(source).toContain('category: "candidate_verification_resent"');
  });

  it("restaure le précédent jeton uniquement si Resend refuse explicitement le nouveau message", () => {
    expect(source).toContain('if (failureCode === "provider_rejected")');
    expect(source).toContain("verificationTokenHash: candidate.verificationTokenHash");
    expect(source).toContain("eq(candidateAccounts.verificationTokenHash, tokenHash)");
    expect(source).toContain('outcome: "failed"');
  });
});
