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
});
