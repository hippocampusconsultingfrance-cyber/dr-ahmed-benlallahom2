import { describe, expect, it } from "vitest";
import {
  SECURITY_EVENT_LABELS,
  SECURITY_EVENT_OUTCOME_LABELS,
  securityEventLabel,
} from "@shared/securityEventLabels";
import { securityOperationsCopy } from "./securityOperationsCopy";

const LANGUAGES = ["fr", "en", "de", "zh"] as const;

describe("observabilité de sécurité multilingue", () => {
  it("fournit les libellés critiques dans les quatre langues actives", () => {
    expect(Object.keys(securityOperationsCopy)).toEqual([...LANGUAGES]);
    for (const copy of Object.values(securityOperationsCopy)) {
      // Every language has every label of the French copy, none empty.
      expect(Object.keys(copy)).toEqual(Object.keys(securityOperationsCopy.fr));
      for (const [key, value] of Object.entries(copy)) {
        if (typeof value === "string" && key !== "countSeparator")
          expect(value.trim(), key).not.toHaveLength(0);
      }
      expect(copy.actors.anonymous.trim()).not.toHaveLength(0);
      expect(Object.keys(copy.counts)).toEqual(
        Object.keys(securityOperationsCopy.fr.counts)
      );
      expect(Object.keys(copy.outcomes)).toEqual(
        Object.keys(securityOperationsCopy.fr.outcomes)
      );
      expect(copy.severities.critical.trim()).not.toHaveLength(0);
    }
  });

  it("nomme chaque catégorie du journal par une phrase, dans chaque langue, et jamais par son code (ADM-15)", () => {
    const sentences = [
      ...Object.entries(SECURITY_EVENT_LABELS),
      ...Object.entries(SECURITY_EVENT_OUTCOME_LABELS),
    ];
    expect(sentences.length).toBeGreaterThan(50);
    for (const [key, labels] of sentences) {
      // A category's own sentence is the one of an outcome no other sentence names.
      const [category, outcome = "other"] = key.split(":");
      for (const language of LANGUAGES) {
        const label = securityEventLabel(category!, outcome, language);
        expect(label, `${key} (${language})`).toBe(labels[language]);
        expect(label.trim()).not.toHaveLength(0);
        expect(label).not.toContain("_");
      }
      // The French sentence is not left in the other languages.
      expect(
        new Set(LANGUAGES.map(language => labels[language])).size,
        key
      ).toBe(LANGUAGES.length);
    }
  });

  it("dit l’issue quand elle change le sens, et garde le code d’une catégorie inconnue", () => {
    expect(securityEventLabel("admin_mfa_verify", "allowed")).toBe(
      "Connexion admin validée par le code de sécurité"
    );
    expect(securityEventLabel("admin_mfa_verify", "failed")).toBe(
      "Code de sécurité admin erroné ou expiré"
    );
    expect(securityEventLabel("admin_mfa_verify", "blocked")).toBe(
      "Vérification du code de sécurité admin"
    );
    expect(securityEventLabel("candidate_login", "failed", "en")).toBe(
      "Candidate sign-in refused: wrong email or password"
    );
    expect(
      securityEventLabel("candidate_login_rate_limited", "blocked", "fr")
    ).toBe("Trop d’essais de connexion candidat — bloqué");
    expect(securityEventLabel("future_category", "allowed", "de")).toBe(
      "future category"
    );
    expect(securityEventLabel("constructor", "allowed")).toBe("constructor");
  });
});
