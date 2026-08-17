import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { eq } from "drizzle-orm";
import { cvApplications } from "../drizzle/schema";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";

export type RecruitmentAnalysisResult = {
  summary: string;
  professionalTitle: string;
  specialties: string[];
  skills: string[];
  languages: string[];
  countriesOfInterest: string[];
  yearsExperience: number | null;
  relevanceScore: number;
  strengths: string[];
  gaps: string[];
  dataQualityWarnings: string[];
  reasoning: string;
};

const analysisSchema = {
  name: "healthcare_candidate_analysis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      professionalTitle: { type: "string" },
      specialties: { type: "array", items: { type: "string" } },
      skills: { type: "array", items: { type: "string" } },
      languages: { type: "array", items: { type: "string" } },
      countriesOfInterest: { type: "array", items: { type: "string" } },
      yearsExperience: { anyOf: [{ type: "integer", minimum: 0, maximum: 70 }, { type: "null" }] },
      relevanceScore: { type: "integer", minimum: 0, maximum: 100 },
      strengths: { type: "array", items: { type: "string" } },
      gaps: { type: "array", items: { type: "string" } },
      dataQualityWarnings: { type: "array", items: { type: "string" } },
      reasoning: { type: "string" },
    },
    required: [
      "summary",
      "professionalTitle",
      "specialties",
      "skills",
      "languages",
      "countriesOfInterest",
      "yearsExperience",
      "relevanceScore",
      "strengths",
      "gaps",
      "dataQualityWarnings",
      "reasoning",
    ],
    additionalProperties: false,
  },
} as const;

const cleanText = (value: string): string =>
  value
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function extractCvText(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return cleanText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value);
  }

  if (mimeType === "application/msword") {
    const document = await new WordExtractor().extract(buffer);
    return cleanText(document.getBody());
  }

  throw new Error("Format de CV non pris en charge pour l’analyse automatique.");
}

function parseAnalysis(content: unknown): RecruitmentAnalysisResult {
  const raw = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map(part => {
            if (typeof part === "string") return part;
            if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
              return part.text;
            }
            return "";
          })
          .join("\n")
      : "";
  const parsed = JSON.parse(raw) as RecruitmentAnalysisResult;

  if (
    !parsed ||
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.specialties) ||
    !Array.isArray(parsed.skills) ||
    !Array.isArray(parsed.strengths) ||
    !Array.isArray(parsed.gaps) ||
    !Array.isArray(parsed.dataQualityWarnings) ||
    !Number.isInteger(parsed.relevanceScore) ||
    parsed.relevanceScore < 0 ||
    parsed.relevanceScore > 100
  ) {
    throw new Error("Le résultat d’analyse IA ne respecte pas le format attendu.");
  }

  return parsed;
}

export async function analyzeCvText(input: {
  firstName: string;
  lastName: string;
  specialty: string;
  targetCountries: string[];
  languages: string[];
  yearsExperience?: number;
  message?: string;
  extractedText: string;
}): Promise<RecruitmentAnalysisResult> {
  const cvText = cleanText(input.extractedText).slice(0, 60_000);
  if (cvText.length < 80) {
    throw new Error("Le texte extrait du CV est insuffisant pour une analyse fiable.");
  }

  const response = await invokeLLM({
    model: "gpt-5-mini",
    max_tokens: 2_000,
    messages: [
      {
        role: "system",
        content:
          "Tu es un assistant de présélection pour Hippocampus Consulting. Tu analyses uniquement les informations professionnelles explicitement présentes dans le CV. Tu ne dois jamais déduire, classer ou recommander un candidat selon son âge, son sexe, son genre, son origine, sa nationalité, sa religion, son état de santé, son handicap, sa situation familiale, sa photo ou toute autre caractéristique protégée. Tu ne prends aucune décision automatique d’embauche ou de rejet. Tu produis une synthèse vérifiable, neutre et explicable pour une revue humaine. Si une information manque, indique-le au lieu de l’inventer. Réponds uniquement avec le JSON demandé.",
      },
      {
        role: "user",
        content: `Analyse ce CV pour une recherche internationale de professionnels de santé.

Données déclarées par le candidat :
- Nom : ${input.firstName} ${input.lastName}
- Spécialité déclarée : ${input.specialty}
- Pays ciblés : ${input.targetCountries.join(", ")}
- Langues déclarées : ${input.languages.join(", ") || "non renseignées"}
- Expérience déclarée : ${input.yearsExperience ?? "non renseignée"} ans
- Message : ${input.message || "aucun"}

Texte extrait du CV :
---
${cvText}
---

Le score doit mesurer uniquement la pertinence professionnelle apparente au regard de la spécialité, des compétences, de l’expérience explicitement décrite et des pays ciblés par le candidat. Il ne constitue pas une décision de recrutement.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: analysisSchema,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("L’analyse IA n’a renvoyé aucun contenu.");
  return parseAnalysis(content);
}

export async function saveCvAnalysis(
  applicationId: number,
  analysis: RecruitmentAnalysisResult,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de données indisponible.");

  await db
    .update(cvApplications)
    .set({
      aiSummary: analysis.summary,
      aiScore: analysis.relevanceScore,
      aiStrengths: JSON.stringify(analysis.strengths),
      aiWeaknesses: JSON.stringify([
        ...analysis.gaps,
        ...analysis.dataQualityWarnings.map(warning => `Qualité des données : ${warning}`),
      ]),
      aiExtractedSkills: JSON.stringify({
        professionalTitle: analysis.professionalTitle,
        specialties: analysis.specialties,
        skills: analysis.skills,
        languages: analysis.languages,
        countriesOfInterest: analysis.countriesOfInterest,
        yearsExperience: analysis.yearsExperience,
      }),
      aiMatchReasoning: analysis.reasoning,
      aiAnalyzedAt: new Date(),
    })
    .where(eq(cvApplications.id, applicationId));
}
