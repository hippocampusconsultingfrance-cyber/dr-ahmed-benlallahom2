import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { candidatePortalCopy, shouldRedirectToCandidateAccess } from "./CandidatePortalPage";
import { isPrivateAreaPath } from "../lib/privateAreaRoutes";

describe("candidate portal translations", () => {
  it("provides document, session and upload language in every supported locale", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = candidatePortalCopy[language];
      expect(copy.portal.length, language).toBeGreaterThan(0);
      expect(copy.uploadError.length, language).toBeGreaterThan(0);
      for (const status of ["pending", "reviewed", "rejected", "archived"] as const) expect(copy.status[status].length, `${language}:${status}`).toBeGreaterThan(0);
      expect(copy.categories.identity_document.length, language).toBeGreaterThan(0);
      expect(copy.categories.criminal_record.length, `${language}: legacy rows stay readable`).toBeGreaterThan(0);
      expect(JSON.stringify(copy), language).not.toMatch(/aiConfidence|reviewNote/);
    }
  });
});

describe("CAND-20 — ce que le candidat voit de la revue", () => {
  it("n’affiche ni la note interne ni la synthèse ou la confiance IA", () => {
    const source = readFileSync(new URL("./CandidatePortalPage.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/document\.(aiSummary|aiConfidence|aiFlags|reviewNotes)/);
    expect(source).toContain("statusLabel(document.status, copy)");
  });
});

describe("CAND-10 — retour vers la connexion", () => {
  it("n’éjecte pas le candidat tant que la session est en cours de vérification", () => {
    expect(shouldRedirectToCandidateAccess({ isLoading: false, isFetching: true, data: null })).toBe(false);
    expect(shouldRedirectToCandidateAccess({ isLoading: true, isFetching: true, data: undefined })).toBe(false);
    expect(shouldRedirectToCandidateAccess({ isLoading: false, isFetching: false, data: { id: 1 } })).toBe(false);
    expect(shouldRedirectToCandidateAccess({ isLoading: false, isFetching: false, data: null })).toBe(true);
  });

  it("rafraîchit la session en cache avant d’ouvrir le portail après connexion ou réinitialisation", () => {
    for (const page of ["CandidateAccessPage.tsx", "CandidateResetPasswordPage.tsx", "CandidateVerifyPage.tsx"]) {
      const source = readFileSync(new URL(`./${page}`, import.meta.url), "utf8");
      expect(source, page).toContain("await utils.candidatePortal.me.invalidate()");
    }
  });
});

describe("CAND-21 — boutons flottants dans les espaces privés", () => {
  it("masque WhatsApp et la pastille cookies sur l’espace candidat et l’administration", () => {
    for (const path of ["/candidate/access", "/candidate/portal", "/candidate/verify?email=a&token=b", "/admin", "/admin/"]) expect(isPrivateAreaPath(path), path).toBe(true);
    for (const path of ["/", "/booking", "/recruitment/standard", "/candidates", "/administration"]) expect(isPrivateAreaPath(path), path).toBe(false);
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(app).toContain("{!privateArea && <WhatsAppButton />}");
    expect(app).toContain("<CookieConsent showPreferencesShortcut={!privateArea} />");
  });
});
