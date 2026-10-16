import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { candidateAccessCopy } from "./CandidateAccessPage";
import { candidateLegalFooterCopy, candidateLegalLinks } from "../components/CandidateLegalFooter";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("LEGAL-23 — informations légales de l’espace candidat", () => {
  it("relie le consentement aux conditions d’utilisation et à la politique de confidentialité dans chaque langue", () => {
    for (const [language, copy] of Object.entries(candidateAccessCopy)) {
      expect(copy.termsParts, language).toHaveLength(5);
      expect(copy.termsParts.join(""), language).toMatch(/\S/);
      expect(copy.legalNotice.length, language).toBeGreaterThan(20);
      expect(copy.legalLinks.legal.length, language).toBeGreaterThan(0);
      expect(copy.legalLinks.privacy.length, language).toBeGreaterThan(0);
    }
    const access = read("./CandidateAccessPage.tsx");
    expect(access).toContain("href={candidateLegalLinks.terms}");
    expect(access).toContain("href={candidateLegalLinks.privacy}");
    expect(access).toContain("href={candidateLegalLinks.legal}");
    expect(candidateLegalLinks).toEqual({ legal: "/legal", privacy: "/legal?tab=privacy", terms: "/legal?tab=terms", cookies: "/legal?tab=privacy#cookies" });
  });

  it("affiche un pied de page légal minimal sur toutes les pages candidat", () => {
    for (const page of ["./CandidateAccessPage.tsx", "./CandidateVerifyPage.tsx", "./CandidateResetPasswordPage.tsx", "./CandidatePortalPage.tsx"]) {
      expect(read(page), page).toContain("<CandidateLegalFooter />");
    }
    for (const [language, copy] of Object.entries(candidateLegalFooterCopy)) {
      for (const key of ["label", "legal", "privacy", "terms", "cookies", "controller"] as const) expect(copy[key].length, `${language}:${key}`).toBeGreaterThan(0);
    }
  });
});
