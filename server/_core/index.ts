import "dotenv/config";
import express from "express";
import multer from "multer";
import { Webhook } from "svix";
import { z } from "zod";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { storageGetSignedUrl, storagePut } from "../storage";
import { notifyOwner } from "./notification";
import { eq, sql } from "drizzle-orm";
import { validateCvFile } from "../recruitmentFileValidation";
import { getDb } from "../db";
import { candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments, cvApplications, recruitmentCampaignRecipients, recruitmentEmailEvents } from "../../drizzle/schema";
import { CANDIDATE_DOCUMENT_MAX_BYTES, candidateDocumentMimeTypes, safeCandidateDocumentName, validateCandidateDocument } from "../candidateDocumentValidation";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

const RECRUITMENT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const RECRUITMENT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const recruitmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECRUITMENT_MAX_FILE_SIZE, files: 1, fields: 20 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().split(".").pop();
    const allowedExtension = extension === "pdf" || extension === "doc" || extension === "docx";
    if (!allowedExtension || !RECRUITMENT_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error("Format de CV non accepté. Utilisez PDF, DOC ou DOCX."));
      return;
    }
    callback(null, true);
  },
});

const candidateDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CANDIDATE_DOCUMENT_MAX_BYTES, files: 1, fields: 8 },
  fileFilter: (_req, file, callback) => {
    if (!candidateDocumentMimeTypes.has(file.mimetype)) {
      callback(new Error("Format de document non accepté."));
      return;
    }
    callback(null, true);
  },
});

        const recruitmentApplicationSchema = z.object({
          firstName: z.string().trim().min(1).max(120),
          lastName: z.string().trim().min(1).max(120),
          email: z.string().trim().email().max(320),
          phone: z.string().trim().max(50).optional().default(""),
          specialty: z.string().trim().min(1).max(160),
          targetCountries: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
          languages: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
          yearsExperience: z.number().int().min(0).max(70).optional(),
          availability: z.string().trim().max(100).optional().default(""),
          mobility: z.string().trim().max(150).optional().default(""),
          certifications: z.string().trim().max(1000).optional().default(""),
          message: z.string().trim().max(5000).optional().default(""),
          gdprConsent: z.literal("1"),
          marketingConsent: z.enum(["0", "1"]).default("0"),
          website: z.string().max(200).optional().default(""),
        });

function parseListField(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(item => typeof item === "string");
  } catch {
    // FormData callers must use JSON arrays; invalid values fail schema validation.
  }
  return [];
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "cv";
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Browser-side defense in depth. Origins are restricted to the application and
  // the third parties genuinely required for checkout and bot protection.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' ws: wss: https://api.stripe.com https://challenges.cloudflare.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; "));
    next();
  });
  
  // Stripe Webhook (MUST be before express.json() to receive raw body)
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
      
      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      
      if (event.id.startsWith("evt_test_")) {
        return res.json({ verified: true });
      }
      
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as any;
        console.log("Payment successful:", session.id);
        
        // Update appointment payment status
        try {
          const { drizzle } = await import("drizzle-orm/mysql2");
          const { appointments } = await import("../../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          
          const db = drizzle(process.env.DATABASE_URL!);
          const trackingId = session.metadata?.trackingId;

          if (!trackingId) {
            return res.status(400).send("Webhook Error: missing trackingId");
          }

          if (trackingId) {
            const appointmentResult = await db
              .select()
              .from(appointments)
              .where(eq(appointments.trackingId, trackingId))
              .limit(1);
            const appointment = appointmentResult[0];

            if (!appointment) {
              return res.status(400).send("Webhook Error: appointment not found");
            }

            if (appointment.paymentStatus === "completed") {
              return res.json({ received: true, duplicate: true });
            }

            const paidAmount = Number(session.amount_total);
            const expectedAmount = Math.round(Number(appointment.finalPrice) * 100);
            if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) {
              console.error(`Stripe amount mismatch for ${trackingId}: paid=${paidAmount}, expected=${expectedAmount}`);
              return res.status(400).send("Webhook Error: amount mismatch");
            }

            await db
              .update(appointments)
              .set({
                paymentStatus: "completed",
                stripePaymentIntentId: session.payment_intent as string,
              })
              .where(eq(appointments.trackingId, trackingId));

            console.log(`Payment confirmed for appointment: ${trackingId}`);
            
            // Keep webhook acknowledgement fast: work is persisted then retried
            // independently if notification or invoice delivery has a transient failure.
            const { enqueueAppointmentFulfillment } = await import("../appointmentFulfillment");
            await enqueueAppointmentFulfillment(appointment.id);
          }
        } catch (error) {
          console.error("Failed to update appointment after payment:", error);
        }
      } else if (event.type === "checkout.session.expired") {
        const session = event.data.object as any;
        const trackingId = session.metadata?.trackingId;
        if (trackingId) {
          try {
            const { drizzle } = await import("drizzle-orm/mysql2");
            const { appointments } = await import("../../drizzle/schema");
            const { and, eq } = await import("drizzle-orm");
            const { getExpiredAppointmentUpdate } = await import("../stripeLifecycle");
            const db = drizzle(process.env.DATABASE_URL!);
            await db
              .update(appointments)
              .set(getExpiredAppointmentUpdate())
              .where(
                and(
                  eq(appointments.trackingId, trackingId),
                  eq(appointments.stripeSessionId, session.id),
                  eq(appointments.paymentStatus, "pending"),
                  eq(appointments.appointmentStatus, "confirmed")
                )
              );
          } catch (error) {
            console.error("Failed to release expired appointment:", error);
          }
        }
      }
      
      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(400).send(`Webhook Error: ${error}`);
    }
  });

  app.post("/api/webhooks/resend", express.raw({ type: "application/json" }), async (req, res) => {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(503).send("Resend webhook is not configured");
      return;
    }
    try {
      const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
      const event = new Webhook(webhookSecret).verify(payload, {
        "svix-id": String(req.headers["svix-id"] || ""),
        "svix-timestamp": String(req.headers["svix-timestamp"] || ""),
        "svix-signature": String(req.headers["svix-signature"] || ""),
      }) as { type?: string; created_at?: string; data?: Record<string, any> };
      const providerEventId = String(req.headers["svix-id"] || "");
      if (!providerEventId || !event.type) {
        res.status(400).send("Invalid Resend webhook payload");
        return;
      }
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const [alreadyRecorded] = await db.select({ id: recruitmentEmailEvents.id }).from(recruitmentEmailEvents).where(eq(recruitmentEmailEvents.providerEventId, providerEventId)).limit(1);
      if (alreadyRecorded) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      const data = event.data || {};
      const providerEmailId = typeof data.email_id === "string" ? data.email_id : null;
      const recipientEmail = Array.isArray(data.to) && typeof data.to[0] === "string" ? data.to[0].toLowerCase() : null;
      const statusByEvent: Record<string, "sent" | "delivered" | "delayed" | "bounced" | "complained" | "failed" | "suppressed" | undefined> = {
        "email.sent": "sent",
        "email.delivered": "delivered",
        "email.delivery_delayed": "delayed",
        "email.bounced": "bounced",
        "email.complained": "complained",
        "email.failed": "failed",
        "email.suppressed": "suppressed",
      };
      const deliveryStatus = statusByEvent[event.type];
      const recipients = providerEmailId
        ? await db.select().from(recruitmentCampaignRecipients).where(eq(recruitmentCampaignRecipients.providerEmailId, providerEmailId)).limit(5)
        : [];
      const recipient = recipients[0];
      const occurredAt = event.created_at && Number.isFinite(new Date(event.created_at).getTime()) ? new Date(event.created_at) : new Date();
      await db.insert(recruitmentEmailEvents).values({
        providerEventId,
        providerEmailId,
        campaignRecipientId: recipient?.id || null,
        applicationId: recipient?.applicationId || null,
        eventType: event.type,
        recipientEmail,
        payload: payload.slice(0, 20_000),
        occurredAt,
      });

      if (recipient && deliveryStatus) {
        await db.update(recruitmentCampaignRecipients).set({
          deliveryStatus,
          error: deliveryStatus === "bounced" || deliveryStatus === "failed" ? String(data.bounce?.message || data.error?.message || data.error || "Email delivery failed").slice(0, 2_000) : null,
          deliveredAt: deliveryStatus === "delivered" ? occurredAt : recipient.deliveredAt,
          lastEventAt: occurredAt,
        }).where(eq(recruitmentCampaignRecipients.id, recipient.id));
        if (["bounced", "complained", "suppressed"].includes(deliveryStatus)) {
          await db.update(cvApplications).set({ marketingConsent: 0, marketingSuppressedAt: occurredAt, updatedAt: new Date() }).where(eq(cvApplications.id, recipient.applicationId));
        }
      }
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Resend webhook verification failed:", error);
      res.status(400).send("Invalid Resend webhook");
    }
  });
  
  // Configure body parser with larger size limit for file uploads (after Stripe webhook)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  const clientBriefSchema = z.object({
    organizationName: z.string().trim().min(1).max(180),
    contactName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().max(50).optional().default(""),
    targetEnvironment: z.string().trim().min(1).max(120),
    specialtyNeeded: z.string().trim().min(1).max(160),
    country: z.string().trim().min(1).max(100),
    requiredCertifications: z.string().trim().max(1000).optional().default(""),
    timeline: z.string().trim().max(100).optional().default(""),
    notes: z.string().trim().max(3000).optional().default(""),
    website: z.string().max(200).optional().default(""),
  });

  app.post("/api/client-briefs", async (req, res) => {
    try {
      const parsed = clientBriefSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Les informations du brief sont invalides." });
        return;
      }
      if (parsed.data.website.trim()) {
        res.status(400).json({ error: "Requête non autorisée." });
        return;
      }

      const briefId = `BRIEF${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-6).toUpperCase()}`;
      const db = await (await import("../db")).getDb();
      if (!db) {
        res.status(503).json({ error: "Service temporairement indisponible." });
        return;
      }

      await db.execute(sql`INSERT INTO client_briefs (
        brief_id, organization_name, contact_name, email, phone,
        target_environment, specialty_needed, country, required_certifications,
        timeline, notes, brief_status
      ) VALUES (
        ${briefId}, ${parsed.data.organizationName}, ${parsed.data.contactName}, ${parsed.data.email}, ${parsed.data.phone},
        ${parsed.data.targetEnvironment}, ${parsed.data.specialtyNeeded}, ${parsed.data.country}, ${parsed.data.requiredCertifications},
        ${parsed.data.timeline}, ${parsed.data.notes}, 'new'
      )`);

      try {
        await notifyOwner({
          title: `Nouveau brief employeur (${briefId})`,
          content: `Organisation: ${parsed.data.organizationName}\nContact: ${parsed.data.contactName} (${parsed.data.email})\nEnvironnement: ${parsed.data.targetEnvironment}\nSpécialité: ${parsed.data.specialtyNeeded} (${parsed.data.country})`,
        });
      } catch {
        // notification fail non bloquante
      }

      res.json({ success: true, briefId });
    } catch (error) {
      console.error("Client brief error:", error);
      res.status(500).json({ error: "Échec de l'enregistrement du brief." });
    }
  });

  app.post("/api/recruitment/apply", (req, res, next) => {
    recruitmentUpload.single("cv")(req, res, async uploadError => {
      if (uploadError) {
        const message = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE"
          ? "Le CV ne doit pas dépasser 5 Mo."
          : uploadError.message || "Le fichier CV n’a pas pu être reçu.";
        res.status(400).json({ error: message });
        return;
      }

      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "Le CV est requis." });
          return;
        }

        const parsed = recruitmentApplicationSchema.safeParse({
          ...req.body,
          targetCountries: parseListField(req.body.targetCountries),
          languages: parseListField(req.body.languages),
          yearsExperience: req.body.yearsExperience === "" || req.body.yearsExperience === undefined
            ? undefined
            : Number(req.body.yearsExperience),
        });

        if (!parsed.success) {
          res.status(400).json({ error: "Les informations de candidature sont invalides." });
          return;
        }

        if (parsed.data.website.trim()) {
          res.status(400).json({ error: "La candidature n’a pas pu être traitée." });
          return;
        }

        const trackingId = `CV${Math.random().toString(36).slice(2, 10).toUpperCase()}${Date.now().toString(36).slice(-8).toUpperCase()}`;
        const originalName = safeFileName(file.originalname);
        let fileValidation;
        try {
          fileValidation = validateCvFile({
            buffer: file.buffer,
            mimeType: file.mimetype,
            originalName,
            size: file.size,
          });
        } catch (validationError) {
          const code = validationError instanceof Error ? validationError.message : "cv_validation_failed";
          res.status(400).json({ error: "Le contenu du CV ne correspond pas à un document PDF, DOC ou DOCX valide.", code });
          return;
        }
        const storageResult = await storagePut(
          `recruitment/quarantine/${trackingId}-${originalName}`,
          file.buffer,
          file.mimetype,
        );
        const retentionUntil = new Date();
        retentionUntil.setFullYear(retentionUntil.getFullYear() + 2);

        const db = await (await import("../db")).getDb();
        if (!db) {
          res.status(503).json({ error: "Le service de candidature est temporairement indisponible." });
          return;
        }

        const insertResult = await db.execute(sql`INSERT INTO cv_applications (
          tracking_id, first_name, last_name, email, phone, specialty,
          target_countries, languages, years_experience, availability, mobility, certifications, message,
          cv_file_key, cv_original_name, cv_mime_type, cv_size_bytes,
          file_validation_status, file_checksum, file_validation_notes,
          gdpr_consent, marketing_consent, status, consent_at, retention_until
        ) VALUES (
          ${trackingId}, ${parsed.data.firstName}, ${parsed.data.lastName}, ${parsed.data.email},
          ${parsed.data.phone || null}, ${parsed.data.specialty}, ${JSON.stringify(parsed.data.targetCountries)},
          ${JSON.stringify(parsed.data.languages)}, ${parsed.data.yearsExperience ?? null},
          ${parsed.data.availability || null}, ${parsed.data.mobility || null}, ${parsed.data.certifications || null},
          ${parsed.data.message || null}, ${storageResult.key}, ${originalName}, ${file.mimetype}, ${file.size},
          'quarantined', ${fileValidation.checksum}, ${fileValidation.notes}, 1,
          ${parsed.data.marketingConsent === "1" ? 1 : 0}, "new", NOW(), ${retentionUntil}
        )`);

        const insertedId = (insertResult[0] as any)?.insertId;

        const candidateName = `${parsed.data.firstName} ${parsed.data.lastName}`;
        await Promise.allSettled([
          (async () => {
            const { sendCvApplicationConfirmationEmail } = await import("./notifications");
            await sendCvApplicationConfirmationEmail(
              parsed.data.email,
              candidateName,
              trackingId,
              parsed.data.specialty,
              parsed.data.targetCountries.join(", "),
            );
          })(),
          notifyOwner({
            title: `Nouvelle candidature recrutement — ${candidateName}`,
            content: `**Référence:** ${trackingId}\n**Email:** ${parsed.data.email}\n**Spécialité:** ${parsed.data.specialty}\n**Pays ciblés:** ${parsed.data.targetCountries.join(", ")}\n**CV:** reçu et stocké de manière privée`,
          }),
        ]);

        if (insertedId) {
          const { enqueueCvAnalysis } = await import("../recruitmentProcessing");
          await enqueueCvAnalysis(Number(insertedId));
        }

        res.status(201).json({ success: true, trackingId });
      } catch (error) {
        console.error("Recruitment application error:", error);
        res.status(500).json({ error: "La candidature n’a pas pu être enregistrée." });
      }
    });
  });

  app.post("/api/candidate/documents", (req, res) => {
    candidateDocumentUpload.single("document")(req, res, async uploadError => {
      if (uploadError) {
        const message = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE"
          ? "Le document ne doit pas dépasser 10 Mo."
          : uploadError.message || "Le document n’a pas pu être reçu.";
        res.status(400).json({ error: message });
        return;
      }
      try {
        const { getCandidateSession } = await import("../candidatePortalRouter");
        const candidate = await getCandidateSession(req);
        if (!candidate) {
          res.status(401).json({ error: "Votre session a expiré. Veuillez vous reconnecter." });
          return;
        }
        const parsed = z.object({
          category: z.enum(["identity_document", "medical_license", "diploma", "certificate", "professional_insurance", "vaccination_record", "criminal_record", "employment_evidence", "proof_of_address", "other"]),
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
          res.status(400).json({ error: "Le document est refusé par le contrôle de sécurité.", code: error instanceof Error ? error.message : "candidate_document_validation_failed" });
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
        });
        const documentId = Number(result[0].insertId);
        await db.insert(candidateDocumentProcessingJobs).values({ documentId, status: "queued" });
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
        console.error("Candidate document upload error:", error);
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
      console.error("Candidate document secure download error:", error);
      res.status(500).json({ error: "Le document n’a pas pu être téléchargé de manière sécurisée." });
    }
  });

  app.get("/api/admin/candidate-documents/:id/download", async (req, res) => {
    try {
      const requestContext = await createContext({ req, res, info: {} as any });
      if (!requestContext.user || requestContext.user.role !== "admin") return res.status(403).json({ error: "Accès administrateur requis." });
      const { isAdminMfaVerified } = await import("../adminMfa");
      if (!await isAdminMfaVerified(req, requestContext.user.openId)) return res.status(403).json({ error: "Double authentification requise." });
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
      console.error("Admin candidate document secure download error:", error);
      res.status(500).json({ error: "Le document n’a pas pu être téléchargé de manière sécurisée." });
    }
  });

  app.get("/sitemap.xml", async (_req, res) => {
    const origin = "https://drahmedbenlallahom.com";
    const publicPaths = [
      "/",
      "/venture/novarena",
      "/venture/sawa4you",
      "/legal",
      "/gdpr",
      "/testimonials",
      "/booking",
      "/recruitment",
      "/recruitment/standard",
      "/recruitment/vvip-offshore",
      "/employers",
      "/why-hippocampus",
    ];

    const staticEntries = publicPaths.map(path => `<url><loc>${origin}${path}</loc></url>`);

    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticEntries.join("")}</urlset>`);
  });

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Scheduled task: 24h appointment reminder
  app.post("/api/scheduled/reminder", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await import("./sdk");
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }

      const { drizzle } = await import("drizzle-orm/mysql2");
      const { appointments } = await import("../../drizzle/schema");
      const { and, eq, gte, lte, sql } = await import("drizzle-orm");

      const db = drizzle(process.env.DATABASE_URL!);

      // Find appointments in the next 22-26 hours that haven't been reminded
      const now = new Date();
      const from = new Date(now.getTime() + 22 * 60 * 60 * 1000);
      const to = new Date(now.getTime() + 26 * 60 * 60 * 1000);

      const upcoming = await db.select().from(appointments).where(
        and(
          eq(appointments.paymentStatus, "completed"),
          eq(appointments.appointmentStatus, "confirmed"),
          eq(appointments.reminderSent, 0),
          gte(appointments.appointmentDate, from),
          lte(appointments.appointmentDate, to)
        )
      );

      console.log(`[Reminder] Found ${upcoming.length} appointments to remind`);

      const { sendReminderEmail } = await import("./notifications");

      for (const apt of upcoming) {
        try {
          await sendReminderEmail(
            apt.customerEmail,
            apt.customerName,
            apt.trackingId,
            apt.appointmentDate
          );
          await db.update(appointments)
            .set({ reminderSent: 1 })
            .where(eq(appointments.id, apt.id));
          console.log(`[Reminder] Sent to ${apt.customerEmail} for ${apt.trackingId}`);
        } catch (e) {
          console.error(`[Reminder] Failed for ${apt.trackingId}:`, e);
        }
      }

      res.json({ ok: true, reminded: upcoming.length });
    } catch (error: any) {
      console.error("[Reminder] Handler error:", error);
      res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
    }
  });

  // Retention cleanup: archives expired recruitment dossiers and notifies the owner.
  // The platform Heartbeat caller is authenticated and supplies the task UID.
  app.post("/api/scheduled/recruitment-retention", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await import("./sdk");
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { runRecruitmentRetentionCleanup } = await import("../recruitmentRetention");
      const result = await runRecruitmentRetentionCleanup(`heartbeat:${user.taskUid}`);
      return res.json({ ok: true, ...result });
    } catch (error: any) {
      console.error("[RecruitmentRetention] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
    }
  });

  // CV processing worker: Heartbeat invokes a small idempotent batch so uploads
  // remain fast and failures can be retried without losing the candidate dossier.
  app.post("/api/scheduled/recruitment-processing", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await import("./sdk");
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { processDueCvAnalysisJobs } = await import("../recruitmentProcessing");
      const result = await processDueCvAnalysisJobs(2);
      return res.json({ ok: true, taskUid: user.taskUid, ...result });
    } catch (error: any) {
      console.error("[RecruitmentProcessing] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
    }
  });

  app.post("/api/scheduled/appointment-fulfillment", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await import("./sdk");
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { processDueAppointmentFulfillmentJobs } = await import("../appointmentFulfillment");
      const result = await processDueAppointmentFulfillmentJobs(3);
      return res.json({ ok: true, taskUid: user.taskUid, ...result });
    } catch (error: any) {
      console.error("[AppointmentFulfillment] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
    }
  });

  app.post("/api/scheduled/candidate-document-processing", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await import("./sdk");
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { processDueCandidateDocumentAnalysisJobs } = await import("../candidateDocumentProcessing");
      const result = await processDueCandidateDocumentAnalysisJobs(2);
      return res.json({ ok: true, taskUid: user.taskUid, ...result });
    } catch (error: any) {
      console.error("[CandidateDocumentProcessing] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
    }
  });

  app.post("/api/scheduled/security-posture", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await import("./sdk");
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "security_database_unavailable" });
      const { candidateSecurityRateLimits, securityEvents } = await import("../../drizzle/schema");
      const { and, gte, lt } = await import("drizzle-orm");
      const now = new Date();
      const cleanupBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      await db.delete(candidateSecurityRateLimits).where(and(lt(candidateSecurityRateLimits.lastAttemptAt, cleanupBefore), lt(candidateSecurityRateLimits.blockedUntil, now)));
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentAlerts = await db.select({ id: securityEvents.id }).from(securityEvents).where(and(gte(securityEvents.createdAt, since), sql`${securityEvents.severity} IN ('high', 'critical')`));
      if (recentAlerts.length > 0) await notifyOwner({ title: "Bilan quotidien de sécurité", content: `${recentAlerts.length} événement(s) de sécurité à gravité élevée ont été détectés sur les dernières 24 heures. Consultez le journal administrateur.` });
      return res.json({ ok: true, taskUid: user.taskUid, highSeverityEvents24h: recentAlerts.length });
    } catch (error: any) {
      console.error("[SecurityPosture] Handler error:", error);
      return res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
