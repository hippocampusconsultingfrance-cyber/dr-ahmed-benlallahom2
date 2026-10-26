import "dotenv/config";
import { RECRUITMENT_CV_ACCEPTED_EXTENSIONS, RECRUITMENT_CV_ACCEPTED_MIME_TYPES, RECRUITMENT_CV_MAX_BYTES } from "../../shared/recruitmentCvLimits";
import express from "express";
import multer from "multer";
import { Webhook } from "svix";
import { z } from "zod";
import { createServer } from "http";
import { serveStatic } from "./static";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { clerkMiddleware } from "@clerk/express";
import { assertCriticalProductionEnvironment, clerkPublishableKey } from "./env";
import { registerHealthRoute } from "./health";
import { requireVercelCron } from "./cronAuth";
import { runMonitoredScheduledJob } from "./scheduledJobMonitor";
import { secureReference } from "./secureReference";
import { registerGoogleDriveOAuthRoutes } from "../googleDriveOAuthRoutes";
import { registerStorageProxy } from "./storageProxy";
import { appRouter, getStripeClient } from "../routers";
import { createContext } from "./context";
import { storageGetSignedUrl, storagePut } from "../storage";
import { notifyOwner } from "./notification";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { RECRUITMENT_CV_FORMAT_MESSAGE, recruitmentCvValidationMessage, validateCvFile } from "../recruitmentFileValidation";
import { getDb } from "../db";
import { candidateDocumentAuditLogs, candidateDocumentProcessingJobs, candidateDocuments, cvApplications, cvProcessingJobs, recruitmentCampaignRecipients, recruitmentEmailEvents } from "../../drizzle/schema";
import { CANDIDATE_DOCUMENT_MAX_BYTES, CANDIDATE_DOCUMENT_TOO_LARGE_MESSAGE, candidateDocumentMimeTypes, candidateDocumentValidationMessage, safeCandidateDocumentName, validateCandidateDocument } from "../candidateDocumentValidation";
import { createCandidateInvitationToken } from "../candidateAuth";
import { SITE_LANGUAGES } from "../emailLanguage";
import { CANDIDATE_UPLOADABLE_DOCUMENT_CATEGORIES, candidateDocumentAllowsAiAnalysis } from "../../shared/candidateDocumentCategories";
import { isSameRecruitmentSubmission } from "../recruitmentSubmissionDeduplication";
import { sendTrackedCvApplicationConfirmationEmail } from "../recruitmentEmailTrace";
import { resendApplicationReferenceFromTags, resendRecipientMatchesApplication } from "../resendWebhookCorrelation";
import { postgresErrorCode } from "../languageColumns";
import { internalErrorReference, internalErrorSummary } from "./trpc";

function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

/**
 * Failed scheduled job: the caller gets a generic error and a short reference,
 * never the error message (Drizzle puts the whole SQL and its parameters in
 * it). The server log keeps the detail under that reference, without the
 * query parameters, like tRPC internal errors, and the SQLSTATE if any.
 */
function sendScheduledJobFailure(res: express.Response, logPrefix: string, error: unknown) {
  const reference = internalErrorReference();
  console.error(`${logPrefix} ref=${reference}`, internalErrorSummary(error), postgresErrorCode(error) ?? "");
  return res.status(500).json({ error: "scheduled_job_failed", reference, timestamp: new Date().toISOString() });
}

function safeErrorMetadata(error: unknown) {
  if (!error || typeof error !== "object") return { name: "UnknownError" };
  const candidate = error as Record<string, unknown>;
  const safeText = (value: unknown) => typeof value === "string" ? value.slice(0, 120) : undefined;
  const safeNumber = (value: unknown) => typeof value === "number" ? value : undefined;
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    code: safeText(candidate.code),
    status: safeNumber(candidate.status),
    constraint: safeText(candidate.constraint),
  };
}

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

// 4 MB (Vercel function bodies are limited to 4.5 MB); PDF or DOCX only.
const RECRUITMENT_MAX_FILE_SIZE = RECRUITMENT_CV_MAX_BYTES;
const RECRUITMENT_MAX_TARGET_COUNTRIES = 18;
const RECRUITMENT_ALLOWED_MIME_TYPES = new Set<string>(RECRUITMENT_CV_ACCEPTED_MIME_TYPES);


const PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN || "https://drahmedbenlallahom.com";

const recruitmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECRUITMENT_MAX_FILE_SIZE, files: 1, fields: 20 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().split(".").pop() ?? "";
    const allowedExtension = (RECRUITMENT_CV_ACCEPTED_EXTENSIONS as readonly string[]).includes(extension);
    if (!allowedExtension || !RECRUITMENT_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error(RECRUITMENT_CV_FORMAT_MESSAGE));
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
          diplomaCountry: z.string().trim().min(1).max(100),
          targetCountries: z.array(z.string().trim().min(1).max(80)).min(1).max(RECRUITMENT_MAX_TARGET_COUNTRIES),
          languages: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
          yearsExperience: z.number().int().min(0).max(70).optional(),
          availability: z.string().trim().max(100).optional().default(""),
          mobility: z.string().trim().max(150).optional().default(""),
          certifications: z.string().trim().max(1000).optional().default(""),
          message: z.string().trim().max(5000).optional().default(""),
          gdprConsent: z.literal("1"),
          marketingConsent: z.enum(["0", "1"]).default("0"),
          website: z.string().max(200).optional().default(""),
          turnstileToken: z.string().min(20).max(4096),
          // Language shown by the form (EN-02); missing or unknown values mean French
          // and never refuse an application.
          language: z.enum(SITE_LANGUAGES).catch("fr"),
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

export async function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);

  // Browser-side defense in depth. Origins are restricted to the application and
  // the third parties genuinely required for checkout and bot protection.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com https://clerk.drahmedbenlallahom.com https://*.clerk.accounts.dev https://*.clerk.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' ws: wss: https://api.stripe.com https://challenges.cloudflare.com https://clerk.drahmedbenlallahom.com https://*.clerk.accounts.dev https://*.clerk.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com https://clerk.drahmedbenlallahom.com https://*.clerk.accounts.dev https://*.clerk.com",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; "));
    next();
  });

  // Public uptime probe (SELECT 1 + configuration status; names only with the
  // cron secret). Mounted before clerkMiddleware so that it still answers when
  // a Clerk misconfiguration makes every other /api route fail.
  registerHealthRoute(app);

  app.use(clerkMiddleware({
    publishableKey: clerkPublishableKey(),
    authorizedParties: [PUBLIC_APP_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"],
  }));

  // Stripe Webhook (MUST be before express.json() to receive raw body)
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    
    let event;
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (error) {
      console.error("Stripe webhook signature validation failed", safeErrorName(error));
      return res.status(400).json({ error: "Invalid webhook" });
    }

    try {
      if (event.type === "checkout.session.completed") {
        console.log("Stripe checkout completion received");
        // Requires a paid session matching the stored one, confirms only a slot
        // still held for this patient (conditional UPDATE), alerts the owner when
        // money arrives for a slot that can no longer be confirmed, and sends the
        // confirmation + invoice right away (bounded) instead of waiting for a cron.
        const { handleCheckoutSessionCompleted } = await import("../appointmentPaymentWebhook");
        const completion = await handleCheckoutSessionCompleted(event.data.object);
        return res.status(completion.httpStatus).json(completion.body);
      } else if (event.type === "charge.refunded") {
        // A full refund made in Stripe (or not recorded by the dashboard) is
        // applied to the appointment: refunded, cancelled and slot freed if it
        // was still confirmed, patient emailed and owner alerted, once.
        const { handleChargeRefunded } = await import("../appointmentPaymentWebhook");
        const refund = await handleChargeRefunded(event.data.object);
        return res.status(refund.httpStatus).json(refund.body);
      } else if (event.type === "charge.dispute.created") {
        // A chargeback: the owner is alerted once, with the deadline to answer.
        const { handleChargeDisputeCreated } = await import("../appointmentPaymentWebhook");
        const dispute = await handleChargeDisputeCreated(event.data.object);
        return res.status(dispute.httpStatus).json(dispute.body);
      } else if (event.type === "checkout.session.expired") {
        const session = event.data.object as any;
        const trackingId = session.metadata?.trackingId;
        if (trackingId) {
          const { getDb } = await import("../db");
          const { appointments } = await import("../../drizzle/schema");
          const { and, eq } = await import("drizzle-orm");
          const { getExpiredAppointmentHoldUpdate } = await import("../appointmentHolds");
          const db = await getDb();
          if (!db) throw new Error("Database connection failed");
          await db
            .update(appointments)
            .set(getExpiredAppointmentHoldUpdate())
            .where(
              and(
                eq(appointments.trackingId, trackingId),
                eq(appointments.stripeSessionId, session.id),
                eq(appointments.paymentStatus, "pending"),
                eq(appointments.appointmentStatus, "held")
              )
            );
        }
      }
      
      res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook processing failed", safeErrorName(error));
      res.status(500).json({ received: false });
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
      const [trackedEmail] = !recipient && providerEmailId
          ? await db.select({ applicationId: recruitmentEmailEvents.applicationId })
          .from(recruitmentEmailEvents)
          .where(and(
            eq(recruitmentEmailEvents.providerEmailId, providerEmailId),
            isNotNull(recruitmentEmailEvents.applicationId),
          ))
          .orderBy(desc(recruitmentEmailEvents.occurredAt))
          .limit(1)
        : [];
      const taggedApplicationReference = resendApplicationReferenceFromTags(data.tags);
      const [taggedApplication] = !recipient && !trackedEmail?.applicationId && taggedApplicationReference
        ? await db.select({ id: cvApplications.id, email: cvApplications.email })
          .from(cvApplications)
          .where(eq(cvApplications.trackingId, taggedApplicationReference))
          .limit(1)
        : [];
      const taggedApplicationId = taggedApplication && resendRecipientMatchesApplication(recipientEmail, taggedApplication.email)
        ? taggedApplication.id
        : null;
      const applicationId = recipient?.applicationId || trackedEmail?.applicationId || taggedApplicationId || null;
      const occurredAt = event.created_at && Number.isFinite(new Date(event.created_at).getTime()) ? new Date(event.created_at) : new Date();
      if (applicationId && providerEmailId) {
        await db.update(recruitmentEmailEvents)
          .set({ applicationId })
          .where(and(eq(recruitmentEmailEvents.providerEmailId, providerEmailId), isNull(recruitmentEmailEvents.applicationId)));
      }
      await db.insert(recruitmentEmailEvents).values({
        providerEventId,
        providerEmailId,
        campaignRecipientId: recipient?.id || null,
        applicationId,
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
      }
      if (applicationId && deliveryStatus && ["bounced", "complained", "suppressed"].includes(deliveryStatus)) {
        await db.update(cvApplications).set({ marketingConsent: 0, marketingSuppressedAt: occurredAt, updatedAt: new Date() }).where(eq(cvApplications.id, applicationId));
      }
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Resend webhook verification failed:", safeErrorName(error));
      res.status(400).send("Invalid Resend webhook");
    }
  });
  
  // Configure body parser with larger size limit for file uploads (after Stripe webhook)
  // Binary uploads have dedicated Multer routes and limits. Keep generic bodies
  // small to prevent an arbitrary JSON/form payload from exhausting memory.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

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

      // No Turnstile here on purpose (the widget is unreliable on this form);
      // persistent limits per client IP and per email contain scripted spam.
      const { enforcePersistentRateLimit, hashSecurityValue, logSecurityEvent } = await import("../candidateSecurity");
      const clientIp = req.ip || "unknown";
      try {
        await enforcePersistentRateLimit({ action: "public_client_brief_ip", subject: clientIp, maxAttempts: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
        await enforcePersistentRateLimit({ action: "public_client_brief_email", subject: parsed.data.email, maxAttempts: 10, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000 });
      } catch (protectionError) {
        const rateLimited = protectionError instanceof Error && protectionError.message === "candidate_security_rate_limited";
        if (!rateLimited) {
          console.error("Client brief protection unavailable:", safeErrorName(protectionError));
          res.status(503).json({ error: "Service temporairement indisponible." });
          return;
        }
        await logSecurityEvent({ actorKind: "anonymous", actorReference: parsed.data.email, category: "public_client_brief_rate_limited", outcome: "blocked", severity: "warning", ipHash: hashSecurityValue(clientIp) })
          .catch(securityLogError => console.error("Client brief protection log error:", safeErrorName(securityLogError)));
        res.status(429).json({ error: "Trop de demandes ont été envoyées. Veuillez patienter avant de soumettre un nouveau brief." });
        return;
      }

      const briefId = secureReference("BRIEF", 12);
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
        const { buildClientBriefOwnerNotification } = await import("../clientBriefNotification");
        await notifyOwner(buildClientBriefOwnerNotification({ briefId, ...parsed.data, adminUrl: `${PUBLIC_APP_ORIGIN}/admin` }));
      } catch {
        // notification fail non bloquante
      }

      res.json({ success: true, briefId });
    } catch (error) {
      console.error("Client brief error:", safeErrorName(error));
      res.status(500).json({ error: "Échec de l'enregistrement du brief." });
    }
  });

  app.post("/api/recruitment/apply", (req, res, next) => {
    recruitmentUpload.single("cv")(req, res, async uploadError => {
      if (uploadError) {
        const tooLarge = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE";
        const message = tooLarge
          ? "Le CV ne doit pas dépasser 4 Mo. Compressez-le ou enregistrez-le en PDF, puis réessayez."
          : uploadError.message || "Le fichier CV n’a pas pu être reçu.";
        // The forms translate these two refusals by their code; any other upload error stays generic there.
        const code = tooLarge ? "recruitment_cv_too_large" : uploadError.message === RECRUITMENT_CV_FORMAT_MESSAGE ? "recruitment_cv_format_refused" : undefined;
        res.status(400).json({ error: message, ...(code ? { code } : {}) });
        return;
      }

      let recruitmentStage = "request-validation";
      // Set once this application counts towards the per-IP cap, so that a failure on our side gives it
      // back, and cleared as soon as the request has a lasting effect (stored CV, confirmation sent).
      let releaseIpAttempt: (() => Promise<void>) | null = null;
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "Le CV est requis.", code: "recruitment_cv_required" });
          return;
        }

        const parsed = recruitmentApplicationSchema.safeParse({
          ...req.body,
          diplomaCountry: req.body.diplomaCountry,
          targetCountries: parseListField(req.body.targetCountries),
          languages: parseListField(req.body.languages),
          yearsExperience: req.body.yearsExperience === "" || req.body.yearsExperience === undefined
            ? undefined
            : Number(req.body.yearsExperience),
        });

        if (!parsed.success) {
          // Names of the refused fields and the kind of issue only, never the submitted values.
          const rejectedFields = Array.from(new Set(parsed.error.issues.map(issue => `${issue.path.map(String).join(".")}:${issue.code}`)));
          console.warn("Recruitment application rejected:", rejectedFields.join(", "));
          const targetCountriesTooMany = parsed.error.issues.some(issue => issue.path[0] === "targetCountries" && issue.code === "too_big");
          res.status(400).json({
            error: targetCountriesTooMany
              ? `Vous pouvez sélectionner jusqu’à ${RECRUITMENT_MAX_TARGET_COUNTRIES} pays ciblés.`
              : "Les informations de candidature sont invalides.",
            code: targetCountriesTooMany ? "recruitment_target_countries_too_many" : "recruitment_application_invalid",
          });
          return;
        }

        if (parsed.data.website.trim()) {
          res.status(400).json({ error: "La candidature n’a pas pu être traitée." });
          return;
        }

        recruitmentStage = "security-protection";
        const { verifyCandidateTurnstile } = await import("../candidateTurnstile");
        const { enforcePersistentRateLimit, hashSecurityValue, logSecurityEvent } = await import("../candidateSecurity");
        const { countPublicFormDailyVolume, enforcePublicEmailIpRateLimit, releasePublicEmailIpRateLimit } = await import("../publicFormRateLimit");
        const clientIp = req.ip || "unknown";
        const ipHash = hashSecurityValue(clientIp);
        const refuseProtection = async (protectionError: unknown) => {
          await logSecurityEvent({ actorKind: "anonymous", actorReference: parsed.data.email, category: "public_recruitment_apply_protection", outcome: "blocked", severity: "warning", ipHash })
            .catch(securityLogError => console.error("Recruitment protection log error:", safeErrorName(securityLogError)));
          console.warn("Recruitment protection rejected:", safeErrorName(protectionError));
          const rateLimited = protectionError instanceof Error && protectionError.message === "candidate_security_rate_limited";
          res.status(400).json({
            error: rateLimited
              ? "Trop de tentatives ont été effectuées. Patientez une heure avant de réessayer."
              : "La vérification de sécurité doit être renouvelée avant l’envoi.",
            code: rateLimited ? "recruitment_rate_limited" : "recruitment_security_check_required",
          });
        };
        try {
          await verifyCandidateTurnstile({ token: parsed.data.turnstileToken, remoteIp: clientIp });
          await enforcePersistentRateLimit({ action: "public_recruitment_apply", subject: `${clientIp}:${parsed.data.email}`, maxAttempts: 10, windowMs: 24 * 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
        } catch (protectionError) {
          await refuseProtection(protectionError);
          return;
        }

        recruitmentStage = "file-validation";
        const trackingId = secureReference("CV", 16);
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
          res.status(400).json({ error: recruitmentCvValidationMessage(code), code });
          return;
        }
        recruitmentStage = "database-connect";
        const db = await (await import("../db")).getDb();
        if (!db) {
          res.status(503).json({ error: "Le service de candidature est temporairement indisponible.", code: "recruitment_service_unavailable" });
          return;
        }

        // MAIL-01: only an application that passed every check counts towards the
        // per-IP cap; a refused CV or anti-bot check leaves the budget untouched.
        recruitmentStage = "ip-rate-limit";
        const emailIpHash = req.ip ? ipHash : null;
        try {
          await enforcePublicEmailIpRateLimit("recruitmentApply", emailIpHash);
        } catch (protectionError) {
          if (!(protectionError instanceof Error && protectionError.message === "candidate_security_rate_limited")) throw protectionError;
          await refuseProtection(protectionError);
          return;
        }
        releaseIpAttempt = () => releasePublicEmailIpRateLimit("recruitmentApply", emailIpHash);

        recruitmentStage = "duplicate-check";
        const duplicateCandidates = await db.select({
          id: cvApplications.id,
          trackingId: cvApplications.trackingId,
          email: cvApplications.email,
          specialty: cvApplications.specialty,
          targetCountries: cvApplications.targetCountries,
        }).from(cvApplications).where(eq(cvApplications.fileChecksum, fileValidation.checksum)).limit(20);
        const duplicate = duplicateCandidates.find(candidate => isSameRecruitmentSubmission(candidate, parsed.data));
        if (duplicate) {
          const candidatePortalInviteUrl = `${PUBLIC_APP_ORIGIN}/candidate/access?invite=${encodeURIComponent(createCandidateInvitationToken(Number(duplicate.id)))}`;
          // ABUS-01: beyond the day's volume, no confirmation goes to the typed address.
          if (await countPublicFormDailyVolume("recruitmentApply")) {
            await sendTrackedCvApplicationConfirmationEmail({
              applicationId: Number(duplicate.id),
              candidateEmail: parsed.data.email,
              candidateFirstName: parsed.data.firstName,
              trackingId: duplicate.trackingId,
              candidatePortalInviteUrl,
              language: parsed.data.language,
            });
          }
          // This application keeps its place in the per-IP cap (its confirmation may be skipped beyond the day's volume).
          releaseIpAttempt = null;
          await logSecurityEvent({ actorKind: "anonymous", actorReference: parsed.data.email, category: "public_recruitment_apply_duplicate_file", outcome: "allowed", severity: "info", ipHash });
          res.status(200).json({ success: true, duplicate: true, trackingId: duplicate.trackingId });
          return;
        }
        // A long analysis queue never refuses a candidate: the dossier is
        // stored and queued, and the owner is alerted (at most once a day).
        recruitmentStage = "queue-backlog-check";
        try {
          const { countWaitingCvAnalyses, notifyOwnerOfAnalysisBacklog, RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD } = await import("../recruitmentProcessingWorker");
          const waitingAnalyses = await countWaitingCvAnalyses(RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD);
          // Counted up to the threshold only: the figure is a lower bound.
          if (waitingAnalyses >= RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD) await notifyOwnerOfAnalysisBacklog(waitingAnalyses, { atLeast: true });
        } catch (backlogError) {
          console.error("Recruitment backlog check error:", safeErrorName(backlogError));
        }

        recruitmentStage = "storage-upload";
        const storageResult = await storagePut(
          `recruitment/quarantine/${trackingId}-${originalName}`,
          file.buffer,
          file.mimetype,
        );
        // The CV is now stored: a later failure (e.g. a refused INSERT) no longer gives the attempt back,
        // otherwise each such request would leave a file in quarantine without using up the cap.
        releaseIpAttempt = null;
        const retentionUntil = new Date();
        retentionUntil.setFullYear(retentionUntil.getFullYear() + 2);

        recruitmentStage = "application-insert";
        const insertResult = await db.execute(sql`INSERT INTO cv_applications (
          tracking_id, first_name, last_name, email, phone, specialty, diploma_country,
          target_countries, languages, years_experience, availability, mobility, certifications, message,
          cv_file_key, cv_original_name, cv_mime_type, cv_size_bytes,
          file_validation_status, file_checksum, file_validation_notes,
          gdpr_consent, marketing_consent, status, consent_at, retention_until, language
        ) VALUES (
          ${trackingId}, ${parsed.data.firstName}, ${parsed.data.lastName}, ${parsed.data.email},
          ${parsed.data.phone || null}, ${parsed.data.specialty}, ${parsed.data.diplomaCountry}, ${JSON.stringify(parsed.data.targetCountries)},
          ${JSON.stringify(parsed.data.languages)}, ${parsed.data.yearsExperience ?? null},
          ${parsed.data.availability || null}, ${parsed.data.mobility || null}, ${parsed.data.certifications || null},
          ${parsed.data.message || null}, ${storageResult.key}, ${originalName}, ${file.mimetype}, ${file.size},
          'quarantined', ${fileValidation.checksum}, ${fileValidation.notes}, 1,
          ${parsed.data.marketingConsent === "1" ? 1 : 0}, 'new', NOW(), ${retentionUntil}, ${parsed.data.language}
        ) RETURNING id`);

        const insertedId = Number((insertResult.rows[0] as { id?: number } | undefined)?.id || 0);

        recruitmentStage = "notifications";
        const candidateName = `${parsed.data.firstName} ${parsed.data.lastName}`;
        const candidatePortalInviteUrl = insertedId
          ? `${PUBLIC_APP_ORIGIN}/candidate/access?invite=${encodeURIComponent(createCandidateInvitationToken(Number(insertedId)))}`
          : undefined;
        // ABUS-01: beyond the day's volume the application is kept without the
        // candidate's confirmation, the owner's email or the AI analysis.
        const withinDailyVolume = await countPublicFormDailyVolume("recruitmentApply");
        if (withinDailyVolume) await Promise.allSettled([
          (async () => {
            await sendTrackedCvApplicationConfirmationEmail({
              applicationId: insertedId,
              candidateEmail: parsed.data.email,
              candidateFirstName: parsed.data.firstName,
              trackingId,
              candidatePortalInviteUrl,
              language: parsed.data.language,
            });
          })(),
          notifyOwner({
            title: `Nouvelle candidature recrutement — ${candidateName}`,
            content: `**Référence:** ${trackingId}\n**Email:** ${parsed.data.email}\n**Spécialité:** ${parsed.data.specialty}\n**Pays du diplôme:** ${parsed.data.diplomaCountry}\n**Pays ciblés:** ${parsed.data.targetCountries.join(", ")}\n**CV:** reçu et stocké de manière privée`,
          }),
        ]);

        recruitmentStage = "follow-up-queues";
        if (insertedId) {
          const { deferCvAnalysisForDailyVolume, enqueueCvAnalysis } = await import("../recruitmentProcessing");
          const { enqueueCvGoogleDriveExport } = await import("../googleDriveExport");
          const queueResults = await Promise.allSettled([
            withinDailyVolume ? enqueueCvAnalysis(Number(insertedId)) : deferCvAnalysisForDailyVolume(Number(insertedId)),
            enqueueCvGoogleDriveExport(Number(insertedId)),
          ]);
          for (const queueResult of queueResults) {
            if (queueResult.status === "rejected") {
              console.error("Recruitment follow-up queue error:", safeErrorName(queueResult.reason));
            }
          }
        }

        recruitmentStage = "response";
        res.status(201).json({ success: true, trackingId });
      } catch (error) {
        console.error("Recruitment application error:", {
          stage: recruitmentStage,
          ...safeErrorMetadata(error),
        });
        if (releaseIpAttempt) {
          await releaseIpAttempt().catch(releaseError => console.error("Recruitment rate limit release error:", safeErrorName(releaseError)));
        }
        res.status(500).json({ error: "La candidature n’a pas pu être enregistrée." });
      }
    });
  });

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
        }).returning({ id: candidateDocuments.id });
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

  // /sitemap.xml is generated at build time into dist/public by
  // scripts/prerender-route-seo.ts from the prerendered routes (served by the
  // Vercel CDN, or by express.static outside Vercel): a single source of truth.
  registerStorageProxy(app);
  registerGoogleDriveOAuthRoutes(app);
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Scheduled jobs. Each job is reachable two ways:
  // - GET, called once a day by Vercel Cron (see vercel.json "crons") with
  //   `Authorization: Bearer ${CRON_SECRET}`, checked in constant time by requireVercelCron;
  // - POST, the legacy Manus Heartbeat callback authenticated by the platform SDK,
  //   kept for compatibility (it never fires on Vercel).
  // Each run, once authenticated, pings its external monitor (EXPL-03, see
  // scheduledJobMonitor.ts): the URL on success, the URL + /fail on failure.
  type ScheduledTrigger = { scheduler: "vercel-cron" } | { scheduler: "heartbeat"; taskUid: string };
  type ScheduledJobResult = { httpStatus?: number } & Record<string, unknown>;

  function registerScheduledJob(path: string, label: string, run: (trigger: ScheduledTrigger) => Promise<ScheduledJobResult>) {
    app.get(path, requireVercelCron, async (_req, res) => {
      try {
        const { httpStatus, ...result } = await runMonitoredScheduledJob(path, () => run({ scheduler: "vercel-cron" }));
        if (httpStatus) return res.status(httpStatus).json(result);
        return res.json({ ok: true, scheduler: "vercel-cron", ...result });
      } catch (error) {
        return sendScheduledJobFailure(res, `[${label}] Vercel cron error`, error);
      }
    });

    app.post(path, async (req, res) => {
      try {
        const { sdk: sdkInstance } = await import("./sdk");
        const user = await sdkInstance.authenticateRequest(req);
        if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
        const taskUid = user.taskUid;
        const { httpStatus, ...result } = await runMonitoredScheduledJob(path, () => run({ scheduler: "heartbeat", taskUid }));
        if (httpStatus) return res.status(httpStatus).json(result);
        return res.json({ ok: true, taskUid: user.taskUid, ...result });
      } catch (error) {
        return sendScheduledJobFailure(res, `[${label}] Handler error`, error);
      }
    });
  }

  // Appointment reminder. The hourly Heartbeat keeps its 22–26 h window; the
  // daily Vercel cron uses a 1–30 h window so no appointment falls between runs.
  registerScheduledJob("/api/scheduled/reminder", "Reminder", async trigger => {
    const { DAILY_REMINDER_WINDOW, HOURLY_REMINDER_WINDOW, sendDueAppointmentReminders } = await import("../scheduledJobs");
    return sendDueAppointmentReminders(trigger.scheduler === "vercel-cron" ? DAILY_REMINDER_WINDOW : HOURLY_REMINDER_WINDOW);
  });

  // Retention: erases expired recruitment dossiers and vault documents (a
  // bounded batch per run, same routine as a GDPR erasure) and reports to the owner.
  registerScheduledJob("/api/scheduled/recruitment-retention", "RecruitmentRetention", async trigger => {
    const { runRecruitmentRetentionCleanup } = await import("../recruitmentRetention");
    return runRecruitmentRetentionCleanup(trigger.scheduler === "vercel-cron" ? "vercel-cron" : `heartbeat:${trigger.taskUid}`);
  });

  // CV processing worker: Heartbeat invokes a small idempotent batch so uploads
  // remain fast and failures can be retried without losing the candidate dossier.
  // Its analyses may run until 55 s (RECRUITMENT_PROCESSING_BUDGET): a shorter
  // monitor ping leaves more of the 60 s function limit to the work (EXPL-03).
  const recruitmentProcessingMonitor = { timeoutMs: 1_500 };
  app.get("/api/scheduled/recruitment-processing", requireVercelCron, async (_req, res) => {
    try {
      // Drains every queue within a time budget: confirmation-email retries and
      // Drive copies first, then CV analyses (none started after ~25 s).
      const { runRecruitmentProcessingWorker } = await import("../recruitmentProcessingWorker");
      const summary = await runMonitoredScheduledJob("/api/scheduled/recruitment-processing", () => runRecruitmentProcessingWorker(), recruitmentProcessingMonitor);
      console.info("[RecruitmentProcessing] Vercel cron summary", {
        elapsedMs: summary.elapsedMs,
        analysisRecovery: summary.analysisRecovery,
        driveRecovery: summary.driveRecovery,
        driveErasures: summary.driveErasures,
        confirmationEmailsProcessed: summary.confirmationEmails.processed,
        driveExportsProcessed: summary.driveExports.processed,
        analysisProcessed: summary.analysis.processed,
        analysesWaiting: summary.analysesWaiting,
      });
      return res.json({ ok: true, scheduler: "vercel-cron", ...summary });
    } catch (error) {
      return sendScheduledJobFailure(res, "[RecruitmentProcessing] Vercel cron error", error);
    }
  });

  app.post("/api/scheduled/recruitment-processing", async (req, res) => {
    try {
      const { sdk: sdkInstance } = await import("./sdk");
      const user = await sdkInstance.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { backfillLegacyCvAnalysisJobs, processDueCvAnalysisJobs, recoverStaleCvAnalysisJobs } = await import("../recruitmentProcessing");
      const { backfillCvGoogleDriveExportJobs, processDueCvGoogleDriveExports, recoverStaleCvGoogleDriveExportJobs } = await import("../googleDriveExport");
      const { retryDueFailedCvConfirmationEmails } = await import("../recruitmentEmailTrace");
      const result = await runMonitoredScheduledJob("/api/scheduled/recruitment-processing", async () => {
        const analysisRecovery = await recoverStaleCvAnalysisJobs();
        const driveRecovery = await recoverStaleCvGoogleDriveExportJobs();
        const analysisBackfill = await backfillLegacyCvAnalysisJobs(2);
        const driveBackfill = await backfillCvGoogleDriveExportJobs(2);
        const analysis = await processDueCvAnalysisJobs(2);
        const driveExports = await processDueCvGoogleDriveExports(2);
        const confirmationEmails = await retryDueFailedCvConfirmationEmails(2);
        return { analysisRecovery, driveRecovery, analysisBackfill, driveBackfill, analysis, driveExports, confirmationEmails };
      }, recruitmentProcessingMonitor);
      return res.json({ ok: true, taskUid: user.taskUid, ...result });
    } catch (error) {
      return sendScheduledJobFailure(res, "[RecruitmentProcessing] Handler error", error);
    }
  });

  // Post-payment confirmation + invoice. The Stripe webhook already sends them
  // immediately; this job recovers interrupted workers and retries failures.
  registerScheduledJob("/api/scheduled/appointment-fulfillment", "AppointmentFulfillment", async trigger => {
    const { runAppointmentFulfillmentWorker } = await import("../scheduledJobs");
    return runAppointmentFulfillmentWorker(trigger.scheduler === "vercel-cron"
      ? { batchSize: 5, maxBatches: 4, budgetMs: 35_000 }
      : { batchSize: 3, maxBatches: 1, budgetMs: 0 });
  });

  // An expired hold that has a Checkout session is released only after Stripe
  // confirms it was not paid; a paid one is confirmed (webhook missing).
  registerScheduledJob("/api/scheduled/appointment-hold-cleanup", "AppointmentHoldCleanup", async () => {
    const { releaseExpiredAppointmentHolds } = await import("../appointmentHolds");
    return releaseExpiredAppointmentHolds(getStripeClient);
  });

  registerScheduledJob("/api/scheduled/candidate-document-processing", "CandidateDocumentProcessing", async trigger => {
    if (trigger.scheduler === "heartbeat") {
      const { processDueCandidateDocumentAnalysisJobs } = await import("../candidateDocumentProcessing");
      return processDueCandidateDocumentAnalysisJobs(2);
    }
    // One document at a time, and no new analysis after ~20 s, to stay well
    // inside the 60 s function limit while still draining a daily backlog.
    const { runCandidateDocumentProcessingWorker } = await import("../scheduledJobs");
    return runCandidateDocumentProcessingWorker({ batchSize: 1, maxBatches: 6, budgetMs: 20_000 });
  });

  registerScheduledJob("/api/scheduled/security-posture", "SecurityPosture", async () => {
    const { runSecurityPostureReview } = await import("../scheduledJobs");
    const review = await runSecurityPostureReview();
    if (!review.available) return { httpStatus: 503, error: "security_database_unavailable" };
    return { highSeverityEvents24h: review.highSeverityEvents24h };
  });

  // Development uses Vite. On Vercel, public files are served by the CDN and
  // only /api requests reach this Express application.
  if (process.env.NODE_ENV === "development") {
    // Keep the development toolchain out of the Vercel server bundle.
    const viteModulePath = "./vite";
    const { setupVite } = await import(viteModulePath);
    await setupVite(app, server);
  } else if (process.env.VERCEL !== "1") {
    serveStatic(app);
  }

  return app;
}

async function startServer() {
  assertCriticalProductionEnvironment();
  const app = await createApp();
  const server = createServer(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (process.env.VERCEL !== "1") {
  startServer().catch(console.error);
}
