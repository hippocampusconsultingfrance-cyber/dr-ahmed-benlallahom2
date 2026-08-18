import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLM, extractCvDocument } = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  extractCvDocument: vi.fn(),
}));

vi.mock("./_core/llm", () => ({ invokeLLM }));
vi.mock("./recruitmentAnalysis", () => ({ extractCvDocument }));

import { analyzeCandidateDocument } from "./candidateDocumentAnalysis";

describe("analyse IA des documents candidats", () => {
  beforeEach(() => {
    extractCvDocument.mockResolvedValue({ text: "Diplôme de médecine délivré par une université reconnue. Date de délivrance : 2022." });
    invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      documentKind: "Diplôme médical",
      summary: "Diplôme médical lisible ; l’original doit être vérifié par un membre de l’équipe.",
      issuingOrganization: "Université exemple",
      issueDate: "2022",
      expiryDate: null,
      confidence: 74,
      flags: ["Authenticité non vérifiée"],
      missingInformation: [],
    }) } }] });
  });

  it("produit une synthèse structurée limitée à l’aide à la revue humaine", async () => {
    const result = await analyzeCandidateDocument({ buffer: Buffer.from("document"), mimeType: "application/pdf", declaredCategory: "diploma", attempt: 1 });
    expect(result.model).toBe("gpt-5-mini");
    expect(result.analysis).toMatchObject({ documentKind: "Diplôme médical", confidence: 74, flags: ["Authenticité non vérifiée"] });
    expect(extractCvDocument).toHaveBeenCalledOnce();
  });

  it("bascule vers le fournisseur de dernier recours contrôlé à la troisième tentative", async () => {
    const result = await analyzeCandidateDocument({ buffer: Buffer.from("document"), mimeType: "application/pdf", declaredCategory: "diploma", attempt: 3 });
    expect(result.model).toBe("claude-haiku-4-5");
    expect(invokeLLM).toHaveBeenLastCalledWith(expect.objectContaining({ model: "claude-haiku-4-5" }));
  });

  it("refuse les réponses IA vides ou non structurées", async () => {
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });
    await expect(analyzeCandidateDocument({ buffer: Buffer.from("document"), mimeType: "application/pdf", declaredCategory: "diploma", attempt: 1 })).rejects.toThrow("candidate_document_ai_empty_response");
  });
});
