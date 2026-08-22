import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("parcours de réinitialisation candidat", () => {
  it("affiche la cause sûre retournée par le serveur au lieu d’un échec générique", () => {
    const source = readFileSync(new URL("../client/src/pages/CandidateResetPasswordPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("onError: error => setNotice(error.message || copy.genericError)");
  });

  it("valide le jeton actif, le statut du compte et la sécurité du mot de passe côté serveur", () => {
    const source = readFileSync(new URL("../server/candidatePortalRouter.ts", import.meta.url), "utf8");
    expect(source).toContain("passwordResetTokenHash");
    expect(source).toContain("gt(candidateAccounts.passwordResetExpiresAt, new Date())");
    expect(source).toContain('eq(candidateAccounts.status, "active")');
    expect(source).toContain("isCompromisedPassword(input.password)");
  });
});
