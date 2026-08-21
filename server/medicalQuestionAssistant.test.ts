import { beforeEach, describe, expect, it, vi } from "vitest";

const llmMocks = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: llmMocks.invokeLLM }));

import { improveMedicalAnswerDraft } from "./medicalQuestionAssistant";

describe("assistance rédactionnelle des questions médicales", () => {
  beforeEach(() => llmMocks.invokeLLM.mockReset());

  it("retire email et téléphone du brouillon envoyé au modèle", async () => {
    llmMocks.invokeLLM.mockResolvedValue({ model: "gpt-5-mini", choices: [{ message: { content: "Version reformulée." } }] });
    const result = await improveMedicalAnswerDraft("Bonjour contact@exemple.fr, appelez le +33 6 12 34 56 78. Réponse générale validée.");
    expect(result.suggestion).toBe("Version reformulée.");
    const messages = llmMocks.invokeLLM.mock.calls[0][0].messages;
    expect(messages[1].content).toContain("[email retiré]");
    expect(messages[1].content).toContain("[téléphone retiré]");
    expect(messages[1].content).not.toContain("contact@exemple.fr");
    expect(messages[0].content).toContain("ne dois ajouter aucun fait médical");
  });
});
