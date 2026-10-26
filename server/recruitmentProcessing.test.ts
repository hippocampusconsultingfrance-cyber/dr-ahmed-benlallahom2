import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { cvApplications } from "../drizzle/schema";
import { analysisCompletionStatus, cvAnalysisEnqueueDisposition, cvExtractionPersistenceFields, didClaimProcessingJob, executeCvExternalPipeline, extractionMethodFor, recoveredCvAnalysisRetryIsCurrent, retryDelayMs } from "./recruitmentProcessing";

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
  normalizedLanguages: [{ language: "Français", proficiency: "unknown" as const, evidence: "Français", sourceLocation: "page 1", confidence: 90, evidenceVerified: true }],
  certifications: [],
  countriesOfInterest: ["France"],
  yearsExperience: 8,
  normalizedExperiences: [],
  relevanceScore: 80,
  strengths: ["Expérience"],
  gaps: [],
  dataQualityWarnings: [],
  requiredFollowUps: [],
  fieldEvidence: [{ field: "language", value: "Français", evidence: "Français", sourceLocation: "page 1", confidence: 90, evidenceVerified: true }],
  contradictions: [],
  confidence: 92,
  evidenceCoverage: 100,
  scoreBreakdown: {
    specialtyMatch: 25,
    experienceEvidence: 20,
    skillsEvidence: 15,
    languageReadiness: 12,
    credentialReadiness: 8,
  },
  reasoning: "Revue humaine requise.",
};

const analysisExecution = {
  result: analysis,
  model: "openai/gpt-5.6-sol",
  generationId: "generation-test",
  usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
};

const steps = {
  download: async () => Buffer.alloc(320, 1),
  promote: async () => ({ key: "recruitment/cv/CV-001-cv.pdf" }),
  validate: () => ({ checksum, notes: "signature_verified", mimeType: "application/pdf", pageCount: 1, securityScanVersion: "document-safety-v2", warnings: [] }),
  extract: async () => ({ text: "CV professionnel avec expérience clinique confirmée.", method: "pdf_text" as const, totalPages: 1, ocrConfidence: null, ocrModelVersion: null, warnings: [] }),
  analyze: async () => analysisExecution,
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

  it("empêche les analyses concurrentes lors de relances répétées", () => {
    expect(cvAnalysisEnqueueDisposition(null)).toBe("create");
    expect(cvAnalysisEnqueueDisposition("completed")).toBe("create");
    expect(cvAnalysisEnqueueDisposition("failed")).toBe("create");
    expect(cvAnalysisEnqueueDisposition("queued")).toBe("accelerate");
    expect(cvAnalysisEnqueueDisposition("retry")).toBe("accelerate");
    expect(cvAnalysisEnqueueDisposition("running")).toBe("already_running");
  });

  it("ne traite que le job effectivement revendiqué par la mise à jour conditionnelle", () => {
    expect(didClaimProcessingJob([{ affectedRows: 1 }])).toBe(true);
    expect(didClaimProcessingJob({ rowCount: 1 })).toBe(true);
    expect(didClaimProcessingJob([{ affectedRows: 0 }])).toBe(false);
    expect(didClaimProcessingJob({ rowCount: 0 })).toBe(false);
    expect(didClaimProcessingJob({ affectedRows: 0 })).toBe(false);
    expect(didClaimProcessingJob(undefined)).toBe(false);
  });

  it("n'affiche un job récupéré comme en attente que s'il n'a pas déjà été revendiqué", () => {
    const db = drizzle.mock();
    const update = db.update(cvApplications).set({ analysisStatus: "queued" }).where(and(
      eq(cvApplications.id, 42),
      recoveredCvAnalysisRetryIsCurrent(db, 7, 1),
    )).toSQL();
    expect(update.sql).toContain('exists (select "id" from "cv_processing_jobs"');
    expect(update.sql).toContain('"cv_processing_jobs"."job_status" =');
    expect(update.sql).toContain('"cv_processing_jobs"."attempts" =');
    expect(update.params).toContain("retry");
  });

  it("termine une analyse propre et impose une revue humaine en cas d’incertitude", () => {
    expect(analysisCompletionStatus({ gaps: [], dataQualityWarnings: [] })).toBe("completed");
    expect(analysisCompletionStatus({ gaps: ["certification non vérifiée"], dataQualityWarnings: [] })).toBe("needs_review");
    expect(analysisCompletionStatus({ gaps: [], dataQualityWarnings: ["date ambiguë"] })).toBe("needs_review");
    expect(analysisCompletionStatus({ gaps: [], dataQualityWarnings: [], relevanceScore: null })).toBe("needs_review");
    expect(analysisCompletionStatus({ gaps: [], dataQualityWarnings: [], requiredFollowUps: ["Vérifier le diplôme"] })).toBe("needs_review");
    expect(analysisCompletionStatus({ gaps: [], dataQualityWarnings: [], contradictions: [{ field: "language" }] })).toBe("needs_review");
  });

  it("enchaîne stockage, promotion, extraction et analyse via des dépendances isolées", async () => {
    const result = await executeCvExternalPipeline(input, steps);
    expect(result.promotedStorage?.key).toContain("recruitment/cv/");
    expect(result.extraction.method).toBe("pdf_text");
    expect(result.analysis.relevanceScore).toBe(80);
    expect(result.analysisModel).toBe("openai/gpt-5.6-sol");
    expect(result.analysisGenerationId).toBe("generation-test");
    expect(result.analysisUsage.totalTokens).toBe(200);
  });

  it("transmet le signal de couverture incomplète pour un PDF mixte", async () => {
    let extractionIncomplete: boolean | undefined;
    await executeCvExternalPipeline(input, {
      ...steps,
      extract: async () => ({
        text: "[PAGE 1]\nDocument fictif avec assez de texte.\n[PAGE 2]",
        method: "pdf_text" as const,
        totalPages: 2,
        ocrConfidence: null,
        ocrModelVersion: null,
        warnings: ["pdf_text_page_2_insufficient_text"],
      }),
      analyze: async analysisInput => {
        extractionIncomplete = analysisInput.extractionIncomplete;
        return analysisExecution;
      },
    });
    expect(extractionIncomplete).toBe(true);
  });

  it("traite comme une extraction incomplète un texte invisible non écarté à coup sûr, ou au-delà de 30 caractères (IA-01)", async () => {
    const received: Array<Pick<Parameters<typeof steps.analyze>[0], "extractionIncomplete" | "invisibleText">> = [];
    const extractWith = (extra: { warnings: string[]; invisibleText?: { characters: number; excerpt: string } }) => executeCvExternalPipeline(input, {
      ...steps,
      extract: async () => ({ text: "[PAGE 1]\nDocument fictif avec assez de texte.", method: "pdf_text" as const, totalPages: 1, ocrConfidence: null, ocrModelVersion: null, ...extra }),
      analyze: async analysisInput => {
        received.push({ extractionIncomplete: analysisInput.extractionIncomplete, invisibleText: analysisInput.invisibleText });
        return analysisExecution;
      },
    });
    await extractWith({ warnings: ["pdf_visibility_check_incomplete"] });
    await extractWith({ warnings: ["pdf_visibility_check_unavailable"] });
    await extractWith({ warnings: ["invisible_text_ignored:31"], invisibleText: { characters: 31, excerpt: "x".repeat(31) } });
    await extractWith({ warnings: ["invisible_text_ignored:30"], invisibleText: { characters: 30, excerpt: "réf. modèle de CV, 30 signes." } });
    expect(received.map(item => item.extractionIncomplete)).toEqual([true, true, true, false]);
    // The admin alert needs the count and the excerpt, whatever the threshold.
    expect(received[3]!.invisibleText).toEqual({ characters: 30, excerpt: "réf. modèle de CV, 30 signes." });
  });

  it("propage de manière contrôlée les échecs de stockage, OCR et IA pour la logique de reprise", async () => {
    await expect(executeCvExternalPipeline(input, { ...steps, download: async () => { throw new Error("cv_download_failed_503"); } })).rejects.toThrow("cv_download_failed_503");
    await expect(executeCvExternalPipeline(input, { ...steps, extract: async () => { throw new Error("ocr_engine_failed"); } })).rejects.toThrow("ocr_engine_failed");
    await expect(executeCvExternalPipeline(input, { ...steps, analyze: async () => { throw new Error("ai_provider_failed"); } })).rejects.toThrow("ai_provider_failed");
  });

  it("rend le CV exportable avant une éventuelle panne de l’analyse IA", async () => {
    let validatedKey: string | null = null;
    await expect(executeCvExternalPipeline(
      input,
      { ...steps, analyze: async () => { throw new Error("ai_provider_failed"); } },
      async ({ promotedStorage }) => { validatedKey = promotedStorage?.key ?? null; },
    )).rejects.toThrow("ai_provider_failed");
    expect(validatedKey).toBe("recruitment/cv/CV-001-cv.pdf");
  });

  it("enregistre la preuve d’extraction avant l’appel IA même si celui-ci échoue", async () => {
    const persisted: Array<ReturnType<typeof cvExtractionPersistenceFields>> = [];
    await expect(executeCvExternalPipeline(
      input,
      {
        ...steps,
        analyze: async () => {
          expect(persisted).toHaveLength(1);
          expect(persisted[0].analysisStatus).toBe("analyzing");
          throw new Error("ai_provider_failed");
        },
      },
      undefined,
      async ({ validation, extraction }) => {
        await Promise.resolve();
        persisted.push(cvExtractionPersistenceFields(validation, extraction, new Date("2026-10-03T00:00:00.000Z")));
      },
    )).rejects.toThrow("ai_provider_failed");

    expect(persisted[0]).toMatchObject({
      extractedText: "CV professionnel avec expérience clinique confirmée.",
      extractionMethod: "pdf_text",
      extractionPageCount: 1,
      extractionTotalPages: 1,
      ocrConfidence: null,
      ocrModelVersion: null,
      extractionWarnings: "[]",
      updatedAt: new Date("2026-10-03T00:00:00.000Z"),
    });
  });
});
