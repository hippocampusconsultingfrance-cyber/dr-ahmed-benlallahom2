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
import { libreOfficeCvPdf, packPdfIntoObjectStream } from "./testing/pdfFixture";
import { candidateDocumentRefusalMessage } from "../client/src/lib/candidateDocumentUploadErrors";

const state = vi.hoisted(() => {
  process.env.VERCEL = "1";
  return { db: null as unknown, stored: [] as string[], blobs: new Map<string, Buffer>(), analyses: [] as string[], storageReads: [] as string[] };
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
  storagePut: vi.fn(async (key: string, data: Buffer) => { state.stored.push(key); state.blobs.set(key, Buffer.from(data)); return { key, url: `https://blob.test/${key}` }; }),
  storageGetSignedUrl: vi.fn(async (key: string) => { state.storageReads.push(key); return `https://blob.test/${key}`; }),
}));
vi.mock("./candidateDocumentAnalysis", () => ({
  analyzeCandidateDocument: vi.fn(async (input: { declaredCategory: string }) => {
    state.analyses.push(input.declaredCategory);
    return { model: "test-model", analysis: { documentKind: "Diplôme", summary: "Synthèse de test", issuingOrganization: null, issueDate: null, expiryDate: null, confidence: 80, flags: [], missingInformation: [] } };
  }),
}));

const { createApp } = await import("./_core/index");
const { candidatePortalRouter } = await import("./candidatePortalRouter");
const realFetch = globalThis.fetch;
// The private Blob store is faked: signed URLs resolve to the bytes stored by storagePut.
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://blob.test/")) {
    const blob = state.blobs.get(decodeURIComponent(url.slice("https://blob.test/".length)));
    return blob ? new Response(new Uint8Array(blob)) : new Response("missing", { status: 404 });
  }
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;
const { enqueueCandidateDocumentAnalysis, processDueCandidateDocumentAnalysisJobs } = await import("./candidateDocumentProcessing");
const { runCandidateDocumentProcessingWorker } = await import("./scheduledJobs");

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
afterAll(async () => { await close(); globalThis.fetch = realFetch; });

beforeEach(() => {
  state.db = createInMemoryDrizzle();
  state.stored.length = 0;
  state.analyses.length = 0;
  state.storageReads.length = 0;
  state.blobs.clear();
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

  it("un diplôme enregistré sans sa tâche d’analyse (dépôt interrompu) la reçoit du traitement planifié, puis est analysé (DATA-02)", async () => {
    // The document is stored, then its analysis job is refused.
    const insert = db().insert.bind(db());
    const refusal = vi.spyOn(db(), "insert").mockImplementation((table => table === candidateDocumentProcessingJobs
      ? { values: () => Promise.reject(new Error("Failed query: insert into \"candidate_document_processing_jobs\"")) }
      : insert(table)) as typeof insert);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await uploadDocument(baseUrl, sessionToken, { category: "diploma", buffer: validPdfBuffer(), name: "diplome.pdf" });
    refusal.mockRestore();
    error.mockRestore();
    expect(result.status).toBe(500);
    const [document] = db().rows(candidateDocuments);
    expect(document).toMatchObject({ category: "diploma", analysisStatus: "queued" });
    expect(db().rows(candidateDocumentProcessingJobs)).toHaveLength(0);

    // Left to the upload a little longer, in case it is still running; then the run gives the job.
    const worker = () => runCandidateDocumentProcessingWorker({ batchSize: 1, maxBatches: 6, budgetMs: 20_000 });
    await expect(worker()).resolves.toMatchObject({ jobsRecreated: 0, processed: 0 });
    document.createdAt = new Date(Date.now() - 20 * 60_000);
    await expect(worker()).resolves.toMatchObject({ jobsRecreated: 1, processed: 1, completed: 1 });
    expect(state.analyses).toEqual(["diploma"]);
    expect(document).toMatchObject({ analysisStatus: "completed", status: "needs_review" });
    expect(db().rows(candidateDocumentAuditLogs).map(log => log.action)).toEqual(["analysis_requested", "analysis_completed"]);
    await expect(worker()).resolves.toMatchObject({ jobsRecreated: 0, processed: 0 });
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

  it("ne montre au candidat que le statut de revue et ne sert ses fichiers qu’à lui, déchiffrés (CAND-20 / CAND-17)", async () => {
    const source = validPdfBuffer(4096);
    const upload = await uploadDocument(baseUrl, sessionToken, { category: "diploma", buffer: source, name: "diplome.pdf" });
    const id = Number(upload.body.documentId);
    Object.assign(db().rows(candidateDocuments)[0], { aiSummary: "Synthèse IA", aiConfidence: 80, aiFlags: "[\"flag\"]", reviewNotes: "Note interne : authenticité douteuse", status: "rejected", reviewedAt: new Date() });

    const caller = candidatePortalRouter.createCaller({ user: null, req: { protocol: "https", headers: { cookie: `candidate_portal_session=${sessionToken}` } }, res: { cookie: () => undefined, clearCookie: () => undefined } } as never);
    const [document] = await caller.documents();
    expect(document).toMatchObject({ id, status: "rejected", originalName: "diplome.pdf" });
    for (const hidden of ["aiSummary", "aiConfidence", "aiFlags", "aiExtractedData", "reviewNotes", "storageKey"]) expect(document, hidden).not.toHaveProperty(hidden);
    expect(Object.keys(candidatePortalRouter._def.procedures)).not.toContain("documentDownload");

    const own = await fetch(`${baseUrl}/api/candidate/documents/${id}/download`, { headers: { cookie: `candidate_portal_session=${sessionToken}` } });
    expect(own.status).toBe(200);
    expect(Buffer.from(await own.arrayBuffer()).equals(source)).toBe(true);
    seedVerifiedCandidate(db(), { email: "other@example.test", sessionToken: "another-candidate-session-token-value" });
    const other = await fetch(`${baseUrl}/api/candidate/documents/${id}/download`, { headers: { cookie: "candidate_portal_session=another-candidate-session-token-value" } });
    expect(other.status).toBe(404);
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

describe("REC-02 — PDF réels et PDF piégés déposés dans le coffre", () => {
  it("accepte un PDF LibreOffice et un PDF à flux d’objets", async () => {
    for (const buffer of [libreOfficeCvPdf(), packPdfIntoObjectStream(libreOfficeCvPdf())]) {
      const result = await uploadDocument(baseUrl, sessionToken, { category: "diploma", buffer, name: "diplome.pdf" });
      expect(result.status, JSON.stringify(result.body)).toBe(201);
    }
    expect(db().rows(candidateDocuments)).toHaveLength(2);
  });

  it("refuse un JavaScript caché dans un flux d’objets avec le motif et la marche à suivre, sans rien stocker", async () => {
    const trapped = packPdfIntoObjectStream(libreOfficeCvPdf(), {
      edit: source => source.replace("/OpenAction[1 0 R /XYZ null null 0]", "/OpenAction <</S/JavaScript/JS(app.alert\\(1\\))>>"),
    });
    const result = await uploadDocument(baseUrl, sessionToken, { category: "diploma", buffer: trapped, name: "diplome.pdf" });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("candidate_document_pdf_active_content");
    expect(result.body.error).not.toBe("Le document est refusé par le contrôle de sécurité.");
    expect(result.body.error).toContain("imprimez-le en PDF depuis votre navigateur");
    expect(candidateDocumentRefusalMessage(result.body, "fr")).toBe(result.body.error);
    expect(candidateDocumentRefusalMessage(result.body, "en")).toContain("print it to PDF from your browser");
    expect(state.stored).toHaveLength(0);
    expect(db().rows(candidateDocuments)).toHaveLength(0);
  });
});
