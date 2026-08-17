import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { eq } from "drizzle-orm";
import { cvApplications, cvCandidateCertifications, cvCandidateExperiences, cvCandidateLanguages } from "../drizzle/schema";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";

export type NormalizedExperience = {
  role: string;
  organization: string;
  startDate: string | null;
  endDate: string | null;
  employmentType: "permanent" | "temporary" | "locum" | "internship" | "fellowship" | "rotation" | "volunteer" | "unknown";
  specialty: string;
  country: string | null;
  durationMonths: number | null;
  evidence: string;
};

export type NormalizedCertification = {
  name: string;
  issuingBody: string | null;
  country: string | null;
  expiresAt: string | null;
  evidence: string;
};

export type NormalizedLanguage = {
  language: string;
  proficiency: "basic" | "working" | "professional" | "fluent" | "native" | "unknown";
  evidence: string;
};

export type RecruitmentAnalysisResult = {
  summary: string;
  professionalTitle: string;
  specialties: string[];
  skills: string[];
  languages: string[];
  normalizedLanguages: NormalizedLanguage[];
  certifications: NormalizedCertification[];
  countriesOfInterest: string[];
  yearsExperience: number | null;
  normalizedExperiences: NormalizedExperience[];
  relevanceScore: number;
  strengths: string[];
  gaps: string[];
  dataQualityWarnings: string[];
  reasoning: string;
};

const experienceSchema = {
  type: "object",
  properties: {
    role: { type: "string" },
    organization: { type: "string" },
    startDate: { anyOf: [{ type: "string" }, { type: "null" }] },
    endDate: { anyOf: [{ type: "string" }, { type: "null" }] },
    employmentType: { type: "string", enum: ["permanent", "temporary", "locum", "internship", "fellowship", "rotation", "volunteer", "unknown"] },
    specialty: { type: "string" },
    country: { anyOf: [{ type: "string" }, { type: "null" }] },
    durationMonths: { anyOf: [{ type: "integer", minimum: 0, maximum: 840 }, { type: "null" }] },
    evidence: { type: "string" },
  },
  required: ["role", "organization", "startDate", "endDate", "employmentType", "specialty", "country", "durationMonths", "evidence"],
  additionalProperties: false,
} as const;

const certificationSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    issuingBody: { anyOf: [{ type: "string" }, { type: "null" }] },
    country: { anyOf: [{ type: "string" }, { type: "null" }] },
    expiresAt: { anyOf: [{ type: "string" }, { type: "null" }] },
    evidence: { type: "string" },
  },
  required: ["name", "issuingBody", "country", "expiresAt", "evidence"],
  additionalProperties: false,
} as const;

const languageSchema = {
  type: "object",
  properties: {
    language: { type: "string" },
    proficiency: { type: "string", enum: ["basic", "working", "professional", "fluent", "native", "unknown"] },
    evidence: { type: "string" },
  },
  required: ["language", "proficiency", "evidence"],
  additionalProperties: false,
} as const;

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
      normalizedLanguages: { type: "array", items: languageSchema },
      certifications: { type: "array", items: certificationSchema },
      countriesOfInterest: { type: "array", items: { type: "string" } },
      yearsExperience: { anyOf: [{ type: "integer", minimum: 0, maximum: 70 }, { type: "null" }] },
      normalizedExperiences: { type: "array", items: experienceSchema },
      relevanceScore: { type: "integer", minimum: 0, maximum: 100 },
      strengths: { type: "array", items: { type: "string" } },
      gaps: { type: "array", items: { type: "string" } },
      dataQualityWarnings: { type: "array", items: { type: "string" } },
      reasoning: { type: "string" },
    },
    required: [
      "summary", "professionalTitle", "specialties", "skills", "languages", "normalizedLanguages", "certifications", "countriesOfInterest",
      "yearsExperience", "normalizedExperiences", "relevanceScore", "strengths", "gaps",
      "dataQualityWarnings", "reasoning",
    ],
    additionalProperties: false,
  },
} as const;

const visionOcrSchema = {
  name: "cv_ocr_transcription",
  strict: true,
  schema: {
    type: "object",
    properties: {
      text: { type: "string" },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["text", "confidence", "warnings"],
    additionalProperties: false,
  },
} as const;

const cleanText = (value: string): string =>
  value
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function messageContentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("\n");
}

/** Returns the first model message only when the provider payload has the expected shape. */
export function getFirstChoiceContent(response: unknown): unknown {
  if (!response || typeof response !== "object") return undefined;
  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (!first || typeof first !== "object") return undefined;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return undefined;
  return (message as { content?: unknown }).content;
}

export type CvExtractionResult = {
  text: string;
  method: "pdf_text" | "pdf_vision" | "docx" | "doc";
  totalPages: number | null;
  ocrConfidence: number | null;
  ocrModelVersion: string | null;
  warnings: string[];
};

async function extractPdfWithVision(buffer: Buffer): Promise<{ text: string; confidence: number | null; warnings: string[] }> {
  const parser = new PDFParse({ data: buffer });
  try {
    const screenshots = await parser.getScreenshot({ first: 3, desiredWidth: 1400, imageDataUrl: true, imageBuffer: false });
    const pages = screenshots.pages
      .filter(page => page.dataUrl)
      .map(page => ({ type: "image_url" as const, image_url: { url: page.dataUrl, detail: "high" as const } }));
    if (pages.length === 0) return { text: "", confidence: null, warnings: ["vision_ocr_no_rendered_pages"] };

    const response = await invokeLLM({
      model: "gemini-3-flash-preview",
      max_tokens: 8_000,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Transcris uniquement le texte professionnel visible sur ces pages de CV. Ne déduis aucune information et n’analyse aucune caractéristique protégée. Si un passage est illisible, écris [illisible]. Retourne uniquement le JSON demandé." },
          ...pages,
        ],
      }],
      response_format: { type: "json_schema", json_schema: visionOcrSchema },
    });
    const raw = messageContentToString(getFirstChoiceContent(response));
    if (!raw) return { text: "", confidence: null, warnings: ["vision_ocr_empty_response"] };
    const parsed = JSON.parse(raw) as { text?: unknown; confidence?: unknown; warnings?: unknown };
    return {
      text: typeof parsed.text === "string" ? cleanText(parsed.text) : "",
      confidence: typeof parsed.confidence === "number" && Number.isInteger(parsed.confidence) ? parsed.confidence : null,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((warning): warning is string => typeof warning === "string") : [],
    };
  } finally {
    await parser.destroy();
  }
}

export async function extractCvDocument(buffer: Buffer, mimeType: string): Promise<CvExtractionResult> {
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    let extracted = "";
    let totalPages: number | null = null;
    try {
      const result = await parser.getText();
      extracted = cleanText(result.text);
      const info = await parser.getInfo();
      totalPages = Number.isInteger(info.total) ? info.total : null;
    } finally {
      await parser.destroy();
    }
    if (extracted.length >= 80) return { text: extracted, method: "pdf_text", totalPages, ocrConfidence: null, ocrModelVersion: null, warnings: [] };
    const vision = await extractPdfWithVision(buffer);
    return {
      text: cleanText([extracted, vision.text].filter(Boolean).join("\n\n")),
      method: "pdf_vision",
      totalPages,
      ocrConfidence: vision.confidence,
      ocrModelVersion: "gemini-3-flash-preview",
      warnings: ["vision_ocr_fallback", ...vision.warnings],
    };
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return { text: cleanText(result.value), method: "docx", totalPages: null, ocrConfidence: null, ocrModelVersion: null, warnings: result.messages.map(message => `${message.type}:${message.message}`) };
  }

  if (mimeType === "application/msword") {
    const document = await new WordExtractor().extract(buffer);
    return { text: cleanText(document.getBody()), method: "doc", totalPages: null, ocrConfidence: null, ocrModelVersion: null, warnings: ["legacy_doc_format_limited_extraction"] };
  }

  throw new Error("Format de CV non pris en charge pour l’analyse automatique.");
}

export async function extractCvText(buffer: Buffer, mimeType: string): Promise<string> {
  return (await extractCvDocument(buffer, mimeType)).text;
}

function parseAnalysis(content: unknown): RecruitmentAnalysisResult {
  const raw = messageContentToString(content);
  const parsed = JSON.parse(raw) as RecruitmentAnalysisResult;
  if (
    !parsed || typeof parsed.summary !== "string" || !Array.isArray(parsed.specialties) || !Array.isArray(parsed.skills) || !Array.isArray(parsed.languages) || !Array.isArray(parsed.normalizedLanguages) || !Array.isArray(parsed.certifications) ||
    !Array.isArray(parsed.strengths) || !Array.isArray(parsed.gaps) || !Array.isArray(parsed.dataQualityWarnings) ||
    !Array.isArray(parsed.normalizedExperiences) || !Number.isInteger(parsed.relevanceScore) ||
    parsed.relevanceScore < 0 || parsed.relevanceScore > 100
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
  if (cvText.length < 80) throw new Error("Le texte extrait du CV est insuffisant pour une analyse fiable.");

  const response = await invokeLLM({
    model: "gpt-5-mini",
    maxCompletionTokens: 4_000,
    reasoning: { effort: "low" },
    messages: [
      {
        role: "system",
        content: "Tu es un assistant de présélection pour Hippocampus Consulting. Tu analyses uniquement les informations professionnelles explicitement présentes dans le CV. Tu ne dois jamais déduire, classer ou recommander un candidat selon son âge, son sexe, son genre, son origine, sa nationalité, sa religion, son état de santé, son handicap, sa situation familiale, sa photo ou toute autre caractéristique protégée. Tu ne prends aucune décision automatique d’embauche ou de rejet. Tu produis une synthèse vérifiable, neutre et explicable pour une revue humaine. Si une information manque, indique-le au lieu de l’inventer. Réponds uniquement avec le JSON demandé.",
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

Normalise chaque expérience dans normalizedExperiences. Convertis les dates explicites vers YYYY-MM lorsque possible, utilise null si absente, et distingue permanent, temporary, locum (remplacement), internship (stage), fellowship, rotation et volunteer. Normalise aussi les certifications explicitement listées dans certifications : conserve le nom, l’organisme, le pays, la date d’expiration quand elle est explicitement indiquée et la preuve textuelle ; n’invente jamais une certification. Dans normalizedLanguages, donne la langue, un niveau contrôlé seulement s’il est explicitement attesté (sinon unknown) et une preuve textuelle. Ne transforme jamais une date, une durée ou un niveau incertain en fait : ajoute une dataQualityWarning et cite la preuve textuelle dans evidence. Le score doit mesurer uniquement la pertinence professionnelle apparente au regard de la spécialité, des compétences, de l’expérience explicitement décrite et des pays ciblés. Il ne constitue pas une décision de recrutement.`,
      },
    ],
    response_format: { type: "json_schema", json_schema: analysisSchema },
  });

  const content = getFirstChoiceContent(response);
  if (!content) throw new Error("L’analyse IA n’a renvoyé aucun contenu.");
  return parseAnalysis(content);
}

export async function saveCvAnalysis(applicationId: number, analysis: RecruitmentAnalysisResult): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de données indisponible.");
  await db.update(cvApplications).set({
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
      normalizedLanguages: analysis.normalizedLanguages,
      countriesOfInterest: analysis.countriesOfInterest,
      yearsExperience: analysis.yearsExperience,
      normalizedExperiences: analysis.normalizedExperiences,
      certifications: analysis.certifications,
    }),
    normalizedCertifications: JSON.stringify(analysis.certifications),
    normalizedLanguages: JSON.stringify(analysis.normalizedLanguages),
    normalizedExperiences: JSON.stringify(analysis.normalizedExperiences),
    aiMatchReasoning: analysis.reasoning,
    aiAnalyzedAt: new Date(),
  }).where(eq(cvApplications.id, applicationId));

  await db.delete(cvCandidateCertifications).where(eq(cvCandidateCertifications.applicationId, applicationId));
  await db.delete(cvCandidateLanguages).where(eq(cvCandidateLanguages.applicationId, applicationId));
  await db.delete(cvCandidateExperiences).where(eq(cvCandidateExperiences.applicationId, applicationId));

  if (analysis.certifications.length > 0) {
    await db.insert(cvCandidateCertifications).values(analysis.certifications.map(certification => ({
      applicationId,
      name: certification.name.slice(0, 180),
      issuingBody: certification.issuingBody?.slice(0, 180) ?? null,
      country: certification.country?.slice(0, 100) ?? null,
      expiresAt: certification.expiresAt?.slice(0, 10) ?? null,
      evidence: certification.evidence || null,
      source: "extracted" as const,
    })));
  }
  if (analysis.normalizedLanguages.length > 0) {
    await db.insert(cvCandidateLanguages).values(analysis.normalizedLanguages.map(language => ({
      applicationId,
      language: language.language.slice(0, 80),
      proficiency: language.proficiency,
      evidence: language.evidence || null,
      source: "extracted" as const,
    })));
  }
  if (analysis.normalizedExperiences.length > 0) {
    await db.insert(cvCandidateExperiences).values(analysis.normalizedExperiences.map(experience => ({
      applicationId,
      role: experience.role.slice(0, 180),
      organization: experience.organization.slice(0, 180),
      startDate: experience.startDate?.slice(0, 10) ?? null,
      endDate: experience.endDate?.slice(0, 10) ?? null,
      employmentType: experience.employmentType,
      specialty: experience.specialty.slice(0, 160),
      country: experience.country?.slice(0, 100) ?? null,
      durationMonths: experience.durationMonths,
      evidence: experience.evidence || null,
    })));
  }
}
