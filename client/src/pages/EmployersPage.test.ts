import { describe, expect, it } from "vitest";
import { findTranslationLengthIssues } from "@/lib/translationLengthGuard";
import { employerCopy } from "./EmployersPage";

const CRITICAL_EMPLOYER_LABELS = [
  "title",
  "formTitle",
  "targetEnvironment",
  "env1",
  "env2",
  "env3",
  "env4",
  "specialtyNeeded",
  "country",
  "submit",
] as const;

describe("libellés critiques de la page Employeurs", () => {
  it("restent dans une enveloppe compatible avec les contrôles responsives", () => {
    for (const language of Object.keys(employerCopy) as Array<keyof typeof employerCopy>) {
      const labels = Object.fromEntries(
        CRITICAL_EMPLOYER_LABELS.map(key => [key, employerCopy[language][key]]),
      );

      expect(findTranslationLengthIssues(labels, 60), language).toEqual([]);
    }
  });

  it("confirme le dépôt du brief avec une référence et les prochaines étapes dans chaque langue", () => {
    for (const language of Object.keys(employerCopy) as Array<keyof typeof employerCopy>) {
      const copy = employerCopy[language];
      expect(copy.successTitle.length, language).toBeGreaterThan(0);
      expect(copy.successText.length, language).toBeGreaterThan(0);
      expect(copy.successNext.length, language).toBeGreaterThan(0);
      expect(copy.successPrivacy.length, language).toBeGreaterThan(0);
    }
  });

  it("n’expose pas de détail technique lors d’un échec de dépôt public", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./EmployersPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain("setErrorMessage(t.genericError);");
    expect(source).not.toContain("setErrorMessage(err instanceof Error ? err.message");
  });
});
