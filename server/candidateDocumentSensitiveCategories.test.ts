import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments } from "../drizzle/schema";
import {
  CANDIDATE_AI_ANALYSIS_CATEGORIES,
  CANDIDATE_DOCUMENT_CATEGORIES,
  CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES,
  candidateDocumentAllowsAiAnalysis,
} from "../shared/candidateDocumentCategories";
import { canRequestCandidateDocumentReanalysis } from "../shared/candidateDocumentReanalysis";
import { CANDIDATE_DOCUMENT_MAX_BYTES, CANDIDATE_DOCUMENT_TOO_LARGE_MESSAGE } from "../shared/candidateDocumentLimits";
import { candidatePortalCopy } from "../client/src/pages/CandidatePortalPage";
import { createInMemoryDrizzle, type InMemoryDrizzle } from "./testSupport/inMemoryDrizzle";
import { TEST_PEPPER } from "./testSupport/candidatePortal";
import { listen, seedVerifiedCandidate, uploadDocument, validPdfBuffer } from "./testSupport/candidateUploadApp";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { db: null as unknown, stored: [] as string[], analyses: [] as string[], storageReads: [] as string[] };
});
process.env.CANDIDATE_AUTH_PEPPER ||= TEST_PEPPER;
process.env.CANDIDATE_DOCUMENT_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");

vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./candidateTurnstile", () => ({ verifyCandidateTurnstile: vi.fn(async () => undefined), candidateRequestIp: () => "203.0.113.9" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => { state.stored.push(key); return { key, url: `https://blob.test/${key}` }; }),
  storageGetSignedUrl: vi.fn(async (key: string) => { state.storageReads.push(key); return `https://blob.test/${key}`; }),
}));
vi.mock("./candidateDocumentAnalysis", () => ({
  analyzeCandidateDocument: vi.fn(async (input: { declaredCategory: string }) => {
    state.analyses.push(input.declaredCategory);
    return { model: "test-model", analysis: { documentKind: "Diplôme", summary: "Synthèse de test", issuingOrganization: null, issueDate: null, expiryDate: null, confidence: 80, flags: [], missingInformation: [] } };
  }),
}));

const { createApp } = await import("./_core/index");
const { enqueueCandidateDocumentAnalysis, processDueCandidateDocumentAnalysisJobs } = await import("./candidateDocumentProcessing");

const sessionToken = "candidate-session-token-for-upload-tests";
let baseUrl = "";
let close: () => Promise<void> = async () => undefined;

function db() { return state.db as InMemoryDrizzle; }

beforeAll(async () => {
  const app = await createApp();
  const listening = await listen(app as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });

beforeEach(() => {
  state.db = createInMemoryDrizzle();
  state.stored.length = 0;
  state.analyses.length = 0;
  state.storageReads.length = 0;
  seedVerifiedCandidate(db(), { email: "vera@example.test", sessionToken });
});

describe("LEGAL-12 — catégories sensibles et analyse IA des documents candidats", () => {
  it("ne propose plus le casier judiciaire ni la vaccination et réserve l’IA aux documents professionnels", () => {
    expect(CANDIDATE_DOCUMENT_CATEGORIES).toContain("criminal_record");
    expect(CANDIDATE_DOCUMENT_CATEGORIES).toContain("vaccination_record");
    expect(CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES).not.toContain("criminal_record" as never);
    expect(CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES).not.toContain("vaccination_record" as never);
    expect([...CANDIDATE_AI_ANALYSIS_CATEGORIES].sort()).toEqual(["certificate", "diploma", "employment_evidence", "medical_license", "professional_insurance"]);
    for (const category of ["identity_document", "proof_of_address", "other", "criminal_record", "vaccination_record", "unknown", null]) {
      expect(candidateDocumentAllowsAiAnalysis(category), String(category)).toBe(false);
    }
    expect(canRequestCandidateDocumentReanalysis({ status: "needs_review", analysisStatus: "needs_review", category: "identity_document" })).toBe(false);
    expect(canRequestCandidateDocumentReanalysis({ status: "needs_review", analysisStatus: "needs_review", category: "diploma" })).toBe(true);
  });

  it.each(["criminal_record", "vaccination_record"])("refuse le dépôt d’un document %s sans rien stocker", async category => {
    const result = await uploadDocument(baseUrl, sessionToken, { category, buffer: validPdfBuffer() });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("candidate_document_category_retired");
    expect(String(result.body.error)).toContain("n’est pas collecté");
    expect(state.stored).toHaveLength(0);
    expect(db().rows(candidateDocuments)).toHaveLength(0);
  });

  it("accepte une pièce d’identité en revue humaine seule, sans tâche d’analyse IA", async () => {
    const result = await uploadDocument(baseUrl, sessionToken, { category: "identity_document", buffer: validPdfBuffer(), name: "passeport.pdf" });
    expect(result.status).toBe(201);
    const [document] = db().rows(candidateDocuments);
    expect(document).toMatchObject({ category: "identity_document", analysisStatus: "needs_review", status: "needs_review", aiFlags: JSON.stringify(["human_review_only"]), aiConfidence: null });
    expect(db().rows(candidateDocumentProcessingJobs)).toHaveLength(0);
    await expect(enqueueCandidateDocumentAnalysis(Number(document.id))).rejects.toThrow("candidate_document_human_review_only");
    expect(db().rows(candidateDocumentProcessingJobs)).toHaveLength(0);
  });

  it("met en file l’analyse IA d’un diplôme", async () => {
    const result = await uploadDocument(baseUrl, sessionToken, { category: "diploma", buffer: validPdfBuffer(), name: "diplome.pdf" });
    expect(result.status).toBe(201);
    expect(db().rows(candidateDocuments)[0]).toMatchObject({ category: "diploma", analysisStatus: "queued" });
    expect(db().rows(candidateDocumentProcessingJobs)).toHaveLength(1);
  });

  it("refuse au-delà de 4 Mo avec un message clair et accepte un fichier à la limite (OPS-09 / CAND-06)", async () => {
    expect(CANDIDATE_DOCUMENT_MAX_BYTES).toBe(4 * 1024 * 1024);
    const tooLarge = await uploadDocument(baseUrl, sessionToken, { category: "diploma", buffer: validPdfBuffer(CANDIDATE_DOCUMENT_MAX_BYTES + 1) });
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body).toMatchObject({ code: "candidate_document_too_large", error: CANDIDATE_DOCUMENT_TOO_LARGE_MESSAGE });
    expect(String(tooLarge.body.error)).toContain("4 Mo");
    expect(state.stored).toHaveLength(0);
    const atLimit = await uploadDocument(baseUrl, sessionToken, { category: "diploma", buffer: validPdfBuffer(CANDIDATE_DOCUMENT_MAX_BYTES) });
    expect(atLimit.status).toBe(201);
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(candidatePortalCopy[language].uploadDescription, language).toContain("4 M");
      expect(candidatePortalCopy[language].fileTooLarge, language).toContain("4 M");
    }
  });

  it("le traitement planifié n’envoie jamais une pièce d’identité (ou une catégorie retirée déjà stockée) à l’IA", async () => {
    const legacy = ["identity_document", "criminal_record", "vaccination_record", "proof_of_address"].map(category => db().seed(candidateDocuments, {
      candidateId: 1,
      category,
      originalName: `${category}.pdf`,
      storageKey: `candidate-documents/quarantine/1/${category}.pdf.enc`,
      mimeType: "application/pdf",
      sizeBytes: 2048,
      checksum: "0".repeat(64),
      encryptionAlgorithm: "aes-256-gcm",
      encryptionIv: "iv",
      encryptionAuthTag: "tag",
    }));
    for (const document of legacy) db().seed(candidateDocumentProcessingJobs, { documentId: document.id, status: "queued", scheduledFor: new Date(Date.now() - 1000) });

    const result = await processDueCandidateDocumentAnalysisJobs(10);
    expect(result).toMatchObject({ processed: 4, completed: 0, needsReview: 4 });
    expect(state.analyses).toEqual([]);
    expect(state.storageReads).toEqual([]);
    for (const row of db().rows(candidateDocuments)) {
      expect(row).toMatchObject({ analysisStatus: "needs_review", aiFlags: JSON.stringify(["human_review_only"]) });
    }
    expect(db().rows(candidateDocumentProcessingJobs).every(job => job.status === "completed" && job.lastError === "human_review_only")).toBe(true);
    expect(db().rows(candidateDocumentAuditLogs).filter(log => String(log.metadata).includes("human_review_only"))).toHaveLength(4);
  });
});
