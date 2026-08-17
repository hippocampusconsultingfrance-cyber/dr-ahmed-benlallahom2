import { describe, expect, it } from "vitest";
import { getFirstChoiceContent } from "./recruitmentAnalysis";

describe("réponse IA recrutement", () => {
  it("retourne le contenu d’un premier choix valide", () => {
    expect(getFirstChoiceContent({ choices: [{ message: { content: '{"summary":"ok"}' } }] })).toBe('{"summary":"ok"}');
  });

  it("retourne undefined au lieu de lever une erreur quand choices est absent ou vide", () => {
    expect(getFirstChoiceContent({})).toBeUndefined();
    expect(getFirstChoiceContent({ choices: [] })).toBeUndefined();
    expect(getFirstChoiceContent(undefined)).toBeUndefined();
  });
});
