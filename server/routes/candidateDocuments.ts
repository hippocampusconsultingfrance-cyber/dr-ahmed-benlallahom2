import type { Express } from "express";
import multer from "multer";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { createContext } from "../_core/context";
import { storageDelete, storageGetSignedUrl, storagePut } from "../storage";
import { getDb } from "../db";
import { candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments } from "../../drizzle/schema";
import { CANDIDATE_DOCUMENT_MAX_BYTES, CANDIDATE_DOCUMENT_TOO_LARGE_MESSAGE, candidateDocumentMimeTypes, candidateDocumentValidationMessage, safeCandidateDocumentName, validateCandidateDocument } from "../candidateDocumentValidation";
import { CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES, candidateDocumentAllowsAiAnalysis } from "../../shared/candidateDocumentCategories";
import { CANDIDATE_DOCUMENT_ACCOUNT_FOREIGN_KEY, isForeignKeyViolation } from "../databaseConstraints";
import { safeErrorName, safeFileName } from "./routeHelpers";

const candidateDocumentUpload = multer({
  storage: multer.memoryStorage(),
  // Browsers send the file name in UTF-8: read as latin1, each accented
  // letter of « Diplôme » became two characters, then two "_" once stored.
  defParamCharset: "utf8",
  limits: { fileSize: CANDIDATE_DOCUMENT_MAX_BYTES, files: 1, fields: 8 },
  fileFilter: (_req, file, callback) => {
    if (!candidateDocumentMimeTypes.has(file.mimetype)) {
      callback(new Error("Format de document non accepté."));
      return;
    }
    callback(null, true);
  },
});

/**
 * Candidate vault: upload (multipart, parsed by Multer) and download by the
 * signed-in candidate, download by an administrator with verified MFA.
 */
export function registerCandidateDocumentRoutes(app: Express) {
  app.post("/api/candidate/documents", (req, res) => {
    candidateDocumentUpload.single("document")(req, res, async uploadError => {
      if (uploadError) {
        const message = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE"
          ? CANDIDATE_DOCUMENT_TOO_LARGE_MESSAGE
          : uploadError.message || "Le document n’a pas pu être reçu.";
        res.status(400).json({ error: message, ...(uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE" ? { code: "candidate_document_too_large" } : {}) });
        return;
      }
      try {
        const { getCandidateSession } = await import("../candidatePortalRouter");
        const candidate = await getCandidateSession(req);
        if (!candidate) {
          res.status(401).json({ error: "Votre session a expiré. Veuillez vous reconnecter." });
          return;
        }
        if (req.body?.category === "criminal_record" || req.body?.category === "vaccination_record") {
          // LEGAL-12: criminal-record extracts and health documents are no longer collected.
          res.status(400).json({ error: "Ce type de document (extrait de casier judiciaire, justificatif de vaccination) n’est pas collecté via l’espace candidat. Ne le transmettez pas.", code: "candidate_document_category_retired" });
          return;
        }
        const parsed = z.object({
          category: z.enum(CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES),
          categoryOtherLabel: z.string().trim().max(160).optional(),
          turnstileToken: z.string().min(20).max(4096),
        }).safeParse(req.body);
        const file = req.file;
        if (!file || !parsed.success || (parsed.data.category === "other" && !parsed.data.categoryOtherLabel)) {
          res.status(400).json({ error: "Les informations du document sont invalides." });
          return;
        }
        const { candidateRequestIp, verifyCandidateTurnstile } = await import("../candidateTurnstile");
        const { enforcePersistentRateLimit, logSecurityEvent, requestIpHash } = await import("../candidateSecurity");
        const ipHash = requestIpHash(req.headers);
        try {
          await enforcePersistentRateLimit({ action: "candidate_document_upload", subject: `${candidate.id}:${ipHash ?? "unknown"}`, maxAttempts: 12, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
          await verifyCandidateTurnstile({ token: parsed.data.turnstileToken, remoteIp: candidateRequestIp(req.headers) });
        } catch {
          await logSecurityEvent({ actorKind: "candidate", actorReference: String(candidate.id), category: "candidate_document_upload_protection", outcome: "blocked", severity: "warning", ipHash });
          res.status(400).json({ error: "La vérification de sécurité doit être renouvelée avant l’envoi." });
          return;
        }
        const originalName = safeCandidateDocumentName(file.originalname);
        let validation;
        try {
          validation = validateCandidateDocument({ buffer: file.buffer, mimeType: file.mimetype, originalName, size: file.size });
        } catch (error) {
          const code = error instanceof Error ? error.message : "candidate_document_validation_failed";
          res.status(400).json({ error: candidateDocumentValidationMessage(code), code });
          return;
        }
        const { encryptCandidateDocument } = await import("../candidateDocumentEncryption");
        const encrypted = encryptCandidateDocument(file.buffer);
        const stored = await storagePut(`candidate-documents/quarantine/${candidate.id}/${Date.now()}-${originalName}.enc`, encrypted.encrypted, "application/octet-stream");
        const db = await getDb();
        if (!db) {
          res.status(503).json({ error: "Le coffre documentaire est temporairement indisponible." });
          return;
        }
        const retentionUntil = new Date();
        retentionUntil.setFullYear(retentionUntil.getFullYear() + 2);
        // Only professional credentials are queued for AI analysis; identity and other documents get a human review only.
        const aiAnalysis = candidateDocumentAllowsAiAnalysis(parsed.data.category);
        const { candidateHumanReviewOnlyFields } = await import("../candidateDocumentProcessing");
        const result = await db.insert(candidateDocuments).values({
          candidateId: candidate.id,
          applicationId: candidate.linkedApplicationId ?? null,
          category: parsed.data.category,
          categoryOtherLabel: parsed.data.category === "other" ? parsed.data.categoryOtherLabel!.trim() : null,
          originalName,
          storageKey: stored.key,
          mimeType: validation.mimeType,
          sizeBytes: file.size,
          checksum: validation.checksum,
          validationStatus: "quarantined",
          validationNotes: validation.notes,
          securityScanVersion: validation.securityScanVersion,
          malwareScanStatus: "unavailable",
          malwareScanProvider: "structural_validation_pending_private_scanner",
          encryptionAlgorithm: encrypted.algorithm,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
          status: "uploaded",
          analysisStatus: "queued",
          retentionUntil,
          ...(aiAnalysis ? {} : candidateHumanReviewOnlyFields()),
        }).returning({ id: candidateDocuments.id }).catch(async (insertError: unknown) => {
          // DATA-01: the account was erased while the document was being sent
          // (foreign key of drizzle/pg/0004); its encrypted file is not kept.
          if (!isForeignKeyViolation(insertError, CANDIDATE_DOCUMENT_ACCOUNT_FOREIGN_KEY)) throw insertError;
          await storageDelete([stored.key]).catch(deleteError => console.error("Candidate document cleanup error:", safeErrorName(deleteError)));
          return null;
        });
        if (!result) {
          res.status(401).json({ error: "Votre session a expiré. Veuillez vous reconnecter." });
          return;
        }
        const documentId = Number(result[0].id);
        if (aiAnalysis) await db.insert(candidateDocumentProcessingJobs).values({ documentId, status: "queued" });
        await db.insert(candidateDocumentAuditLogs).values({
          candidateId: candidate.id,
          documentId,
          actorType: "candidate",
          actorReference: String(candidate.id),
          action: "upload",
          metadata: JSON.stringify({ category: parsed.data.category, mimeType: validation.mimeType, checksum: validation.checksum }),
        });
        res.status(201).json({ success: true, documentId });
      } catch (error) {
        console.error("Candidate document upload error:", safeErrorName(error));
        res.status(500).json({ error: "Le document n’a pas pu être enregistré dans le coffre." });
      }
    });
  });

  app.get("/api/candidate/documents/:id/download", async (req, res) => {
    try {
      const documentId = Number(req.params.id);
      if (!Number.isSafeInteger(documentId) || documentId <= 0) return res.status(400).json({ error: "Document invalide." });
      const { getCandidateSession } = await import("../candidatePortalRouter");
      const candidate = await getCandidateSession(req);
      if (!candidate) return res.status(401).json({ error: "Votre session a expiré. Veuillez vous reconnecter." });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Le coffre documentaire est temporairement indisponible." });
      const document = (await db.select().from(candidateDocuments).where(sql`${candidateDocuments.id} = ${documentId} AND ${candidateDocuments.candidateId} = ${candidate.id}`).limit(1))[0];
      if (!document) return res.status(404).json({ error: "Document introuvable." });
      const signedUrl = await storageGetSignedUrl(document.storageKey);
      const stored = await fetch(signedUrl);
      if (!stored.ok) throw new Error(`candidate_document_storage_read_failed_${stored.status}`);
      let content: Uint8Array = new Uint8Array(await stored.arrayBuffer());
      if (document.encryptionAlgorithm) {
        if (document.encryptionAlgorithm !== "aes-256-gcm" || !document.encryptionIv || !document.encryptionAuthTag) throw new Error("candidate_document_encryption_metadata_invalid");
        const { decryptCandidateDocument } = await import("../candidateDocumentEncryption");
        content = decryptCandidateDocument(Buffer.from(content), document.encryptionIv, document.encryptionAuthTag);
      }
      await db.insert(candidateDocumentAuditLogs).values({ candidateId: candidate.id, documentId: document.id, actorType: "candidate", actorReference: String(candidate.id), action: "download" });
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Length", String(content.byteLength));
      res.setHeader("Content-Disposition", `attachment; filename="${safeFileName(document.originalName)}"`);
      res.setHeader("Cache-Control", "no-store, private");
      res.send(content);
    } catch (error) {
      console.error("Candidate document secure download error:", safeErrorName(error));
      res.status(500).json({ error: "Le document n’a pas pu être téléchargé de manière sécurisée." });
    }
  });

  app.get("/api/admin/candidate-documents/:id/download", async (req, res) => {
    try {
      const requestContext = await createContext({ req, res, info: {} as any });
      if (!requestContext.user || requestContext.user.role !== "admin") return res.status(403).json({ error: "Accès administrateur requis." });
      if (!requestContext.mfaVerified) return res.status(403).json({ error: "Double authentification requise." });
      const documentId = Number(req.params.id);
      if (!Number.isSafeInteger(documentId) || documentId <= 0) return res.status(400).json({ error: "Document invalide." });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Le coffre documentaire est temporairement indisponible." });
      const document = (await db.select().from(candidateDocuments).where(eq(candidateDocuments.id, documentId)).limit(1))[0];
      if (!document) return res.status(404).json({ error: "Document introuvable." });
      const signedUrl = await storageGetSignedUrl(document.storageKey);
      const stored = await fetch(signedUrl);
      if (!stored.ok) throw new Error(`candidate_document_storage_read_failed_${stored.status}`);
      let content: Uint8Array = new Uint8Array(await stored.arrayBuffer());
      if (document.encryptionAlgorithm) {
        if (document.encryptionAlgorithm !== "aes-256-gcm" || !document.encryptionIv || !document.encryptionAuthTag) throw new Error("candidate_document_encryption_metadata_invalid");
        const { decryptCandidateDocument } = await import("../candidateDocumentEncryption");
        content = decryptCandidateDocument(Buffer.from(content), document.encryptionIv, document.encryptionAuthTag);
      }
      await db.insert(candidateDocumentAuditLogs).values({ candidateId: document.candidateId, documentId: document.id, actorType: "admin", actorReference: requestContext.user.openId, action: "download", metadata: JSON.stringify({ mfa: true }) });
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Length", String(content.byteLength));
      res.setHeader("Content-Disposition", `attachment; filename="${safeFileName(document.originalName)}"`);
      res.setHeader("Cache-Control", "no-store, private");
      res.send(content);
    } catch (error) {
      console.error("Admin candidate document secure download error:", safeErrorName(error));
      res.status(500).json({ error: "Le document n’a pas pu être téléchargé de manière sécurisée." });
    }
  });
}
