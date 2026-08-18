import { describe, expect, it } from "vitest";
import { analysisCompletionStatus, executeCvExternalPipeline, extractionMethodFor, retryDelayMs } from "./recruitmentProcessing";

const checksum = "a".repeat(64);
const input = {
  cvFileKey: "recruitment/quarantine/CV-001.pdf",
  cvMimeType: "application/pdf",
  cvOriginalName: "cv.pdf",
  cvSizeBytes: 320,
  fileChecksum: checksum,
  fileValidationStatus: "quarantined" as const,
  trackingId: "CV-001",
  firstName: "Amina",
  lastName: "Martin",
  specialty: "Anesthésie",
  targetCountries: JSON.stringify(["France"]),
  languages: JSON.stringify(["Français"]),
  yearsExperience: 8,
  message: null,
};

const analysis = {
  summary: "Profil professionnel vérifiable.",
  professionalTitle: "Anesthésiste",
  specialties: ["Anesthésie"],
  skills: ["ACLS"],
  languages: ["Français"],
  normalizedLanguages: [{ language: "Français", proficiency: "unknown" as const, evidence: "CV" }],
  certifications: [],
  countriesOfInterest: ["France"],
  yearsExperience: 8,
  normalizedExperiences: [],
  relevanceScore: 80,
  strengths: ["Expérience"],
  gaps: [],
  dataQualityWarnings: [],
  reasoning: "Revue humaine requise.",
};

const steps = {
  download: async () => Buffer.alloc(320, 1),
  promote: async () => ({ key: "recruitment/cv/CV-001-cv.pdf" }),
  validate: () => ({ checksum, notes: "signature_verified", mimeType: "application/pdf", pageCount: 1, securityScanVersion: "document-safety-v2", warnings: [] }),
  extract: async () => ({ text: "CV professionnel avec expérience clinique confirmée.", method: "pdf_text" as const, totalPages: 1, ocrConfidence: null, ocrModelVersion: null, warnings: [] }),
  analyze: async () => analysis,
};

describe("règles déterministes du pipeline de traitement CV", () => {
  it("identifie les parseurs attendus pour PDF, DOCX et DOC", () => {
    expect(extractionMethodFor("application/pdf")).toBe("pdf_text_or_vision");
    expect(extractionMethodFor("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
    expect(extractionMethodFor("application/msword")).toBe("doc");
    expect(extractionMethodFor("text/plain")).toBe("unknown");
  });

  it("applique des reprises exponentielles plafonnées", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(10)).toBe(3_600_000);
  });

  it("termine une analyse propre et impose une revue humaine en cas d’incertitude", () => {
    expect(analysisCompletionStatus({ gaps: [], dataQualityWarnings: [] })).toBe("completed");
    expect(analysisCompletionStatus({ gaps: ["certification non vérifiée"], dataQualityWarnings: [] })).toBe("needs_review");
    expect(analysisCompletionStatus({ gaps: [], dataQualityWarnings: ["date ambiguë"] })).toBe("needs_review");
  });

  it("enchaîne stockage, promotion, extraction et analyse via des dépendances isolées", async () => {
    const result = await executeCvExternalPipeline(input, steps);
    expect(result.promotedStorage?.key).toContain("recruitment/cv/");
    expect(result.extraction.method).toBe("pdf_text");
    expect(result.analysis.relevanceScore).toBe(80);
  });

  it("passe au fournisseur de repli lors de la deuxième tentative", async () => {
    let requestedProvider = "";
    await executeCvExternalPipeline({ ...input, analysisAttempt: 2 }, {
      ...steps,
      analyze: async request => {
        requestedProvider = request.provider ?? "";
        return analysis;
      },
    });
    expect(requestedProvider).toBe("gemini-3-flash-preview");
  });

  it("propage de manière contrôlée les échecs de stockage, OCR et IA pour la logique de reprise", async () => {
    await expect(executeCvExternalPipeline(input, { ...steps, download: async () => { throw new Error("cv_download_failed_503"); } })).rejects.toThrow("cv_download_failed_503");
    await expect(executeCvExternalPipeline(input, { ...steps, extract: async () => { throw new Error("ocr_engine_failed"); } })).rejects.toThrow("ocr_engine_failed");
    await expect(executeCvExternalPipeline(input, { ...steps, analyze: async () => { throw new Error("ai_provider_failed"); } })).rejects.toThrow("ai_provider_failed");
  });
});
