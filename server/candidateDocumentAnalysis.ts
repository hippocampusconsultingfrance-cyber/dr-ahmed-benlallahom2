import { invokeLLM, type Message } from "./_core/llm";
import { extractCvDocument, type InvisibleTextSummary } from "./recruitmentAnalysis";
import { hiddenTextFlags } from "../shared/candidateDocumentHiddenText";

export type CandidateDocumentAnalysis = {
  documentKind: string;
  summary: string;
  issuingOrganization: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  confidence: number;
  flags: string[];
  missingInformation: string[];
  /** Text of the file left out before the AI read it, as for a CV (IA-01). */
  hiddenText?: InvisibleTextSummary;
};

const documentAnalysisSchema = {
  name: "candidate_administrative_document_review",
  strict: true,
  schema: {
    type: "object",
    properties: {
      documentKind: { type: "string" },
      summary: { type: "string" },
      issuingOrganization: { anyOf: [{ type: "string" }, { type: "null" }] },
      issueDate: { anyOf: [{ type: "string" }, { type: "null" }] },
      expiryDate: { anyOf: [{ type: "string" }, { type: "null" }] },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
      flags: { type: "array", items: { type: "string" } },
      missingInformation: { type: "array", items: { type: "string" } },
    },
    required: ["documentKind", "summary", "issuingOrganization", "issueDate", "expiryDate", "confidence", "flags", "missingInformation"],
    additionalProperties: false,
  },
} as const;

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(part => typeof part === "string" ? part : "text" in (part as object) ? String((part as { text?: unknown }).text ?? "") : "").join("\n");
  return "";
}

export function parseCandidateDocumentAnalysis(content: unknown): CandidateDocumentAnalysis {
  const raw = contentText(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  if (!raw) throw new Error("candidate_document_ai_empty_response");
  const parsed = JSON.parse(raw) as Partial<CandidateDocumentAnalysis>;
  if (!parsed.summary || typeof parsed.summary !== "string" || !Number.isInteger(parsed.confidence)) throw new Error("candidate_document_ai_invalid_response");
  return {
    documentKind: typeof parsed.documentKind === "string" ? parsed.documentKind.slice(0, 160) : "Document administratif",
    summary: parsed.summary.slice(0, 1000),
    issuingOrganization: typeof parsed.issuingOrganization === "string" ? parsed.issuingOrganization.slice(0, 180) : null,
    issueDate: typeof parsed.issueDate === "string" ? parsed.issueDate.slice(0, 20) : null,
    expiryDate: typeof parsed.expiryDate === "string" ? parsed.expiryDate.slice(0, 20) : null,
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence))),
    flags: Array.isArray(parsed.flags) ? parsed.flags.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
    missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
  };
}

/**
 * A document whose text, once the text that could not be shown visible is
 * left out (IA-01), is too short to analyse, read without the vision: another
 * attempt reads the same text. `hiddenText` says what was left out, for the
 * admin.
 */
export class CandidateDocumentTextSetAsideError extends Error {
  constructor(readonly hiddenText: InvisibleTextSummary) {
    super("candidate_document_text_set_aside");
  }
}

function prompt(declaredCategory: string) {
  return `Vous analysez un document administratif déposé par un candidat pour Hippocampus Consulting. Catégorie déclarée : ${declaredCategory}. Votre rôle est uniquement une aide à la revue humaine. N’authentifiez jamais le document, ne décidez jamais de l’éligibilité du candidat et ne déduisez aucune donnée sensible. N’extrayez ni numéro complet de passeport ou d’identité, ni adresse complète, ni données de santé, ni date de naissance. Produisez un résumé minimal, l’émetteur si lisible, les dates d’émission et d’expiration si clairement visibles, les informations manquantes et les points nécessitant une revue humaine. Si le document est flou ou ambigu, baissez la confiance et expliquez-le dans flags.`;
}

export async function analyzeCandidateDocument(input: { buffer: Buffer; mimeType: string; declaredCategory: string; attempt: number }): Promise<{ analysis: CandidateDocumentAnalysis; model: string }> {
  let messages: Message[];
  let hiddenText: InvisibleTextSummary | undefined;
  if (input.mimeType === "image/jpeg" || input.mimeType === "image/png") {
    const dataUrl = `data:${input.mimeType};base64,${input.buffer.toString("base64")}`;
    messages = [{ role: "user", content: [{ type: "text", text: prompt(input.declaredCategory) }, { type: "image_url", image_url: { url: dataUrl, detail: "high" } }] }];
  } else {
    const extraction = await extractCvDocument(input.buffer, input.mimeType);
    hiddenText = extraction.invisibleText;
    const text = extraction.text.trim();
    // A text the vision transcribed (a scan whose OCR layer is set aside) may come out otherwise next time: tried again.
    const readAgainAlike = extraction.method !== "pdf_vision" && extraction.ocrModelVersion === null;
    if (text.length < 20) throw hiddenText && readAgainAlike ? new CandidateDocumentTextSetAsideError(hiddenText) : new Error("candidate_document_text_unavailable");
    messages = [{ role: "user", content: `${prompt(input.declaredCategory)}\n\nContenu à examiner :\n${text.slice(0, 30000)}` }];
  }
  const providers = input.attempt >= 3
    ? ["claude-haiku-4-5", "gemini-3-flash-preview"]
    : input.attempt === 2
      ? ["gemini-3-flash-preview", "gpt-5-mini"]
      : ["gpt-5-mini", "gemini-3-flash-preview"];
  const failures: string[] = [];

  for (const model of providers) {
    try {
      const response = await invokeLLM({
        model,
        max_tokens: model.startsWith("gemini") ? 3000 : undefined,
        max_completion_tokens: model.startsWith("gpt") ? 3000 : undefined,
        messages,
        response_format: { type: "json_schema", json_schema: documentAnalysisSchema },
      });
      const content = response.choices?.[0]?.message?.content;
      if (!contentText(content).trim()) {
        failures.push(`${model}: contenu vide`);
        continue;
      }
      const analysis = parseCandidateDocumentAnalysis(content);
      // The admin is told, in the document's flags, what was left out of what the AI read.
      return { analysis: hiddenText ? { ...analysis, flags: [...hiddenTextFlags(hiddenText), ...analysis.flags], hiddenText } : analysis, model };
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message.slice(0, 160) : "erreur inconnue"}`);
    }
  }

  throw new Error(`candidate_document_ai_unavailable_${failures.join(" | ")}`);
}
