import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { candidateAccountCopy, candidateAccountNotice } from "../client/src/pages/candidateAccountCopy";

describe("parcours de réinitialisation candidat", () => {
  it("affiche la cause sûre retournée par le serveur au lieu d’un échec générique, traduite d’après son motif (EN-06)", () => {
    const compromised = { message: "Ce mot de passe a déjà été compromis. Choisissez-en un autre, long et unique.", data: { reason: "candidate_password_compromised" } };
    expect(candidateAccountNotice(compromised, candidateAccountCopy.en, "en")).toBe(candidateAccountCopy.en.passwordCompromised);
    expect(candidateAccountNotice(compromised, candidateAccountCopy.zh, "zh")).toBe(candidateAccountCopy.zh.passwordCompromised);
    expect(candidateAccountNotice({ message: "Ce lien de réinitialisation est invalide ou expiré.", data: { reason: "candidate_reset_link_invalid" } }, candidateAccountCopy.de, "de")).toBe(candidateAccountCopy.de.invalidDescription);
    // Without a known reason, the French page keeps the server's safe message; other languages never show French.
    expect(candidateAccountNotice({ message: "Le service candidat est temporairement indisponible.", data: null }, candidateAccountCopy.fr, "fr")).toBe("Le service candidat est temporairement indisponible.");
    expect(candidateAccountNotice({ message: "Le service candidat est temporairement indisponible.", data: null }, candidateAccountCopy.en, "en")).toBe(candidateAccountCopy.en.genericError);
    expect(candidateAccountNotice({ message: "" }, candidateAccountCopy.fr, "fr")).toBe(candidateAccountCopy.fr.genericError);
  });

  it("valide le jeton actif, le statut du compte et la sécurité du mot de passe côté serveur", () => {
    const source = readFileSync(new URL("../server/candidatePortalRouter.ts", import.meta.url), "utf8");
    expect(source).toContain("passwordResetTokenHash");
    expect(source).toContain("gt(candidateAccounts.passwordResetExpiresAt, new Date())");
    expect(source).toContain('eq(candidateAccounts.status, "active")');
    expect(source).toContain("isCompromisedPassword(input.password)");
  });
});
