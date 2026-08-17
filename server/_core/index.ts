import "dotenv/config";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { storagePut } from "../storage";
import { notifyOwner } from "./notification";
import { sql } from "drizzle-orm";
import { validateCvFile } from "../recruitmentFileValidation";

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
            
            // Send notifications AFTER payment is confirmed
            try {
              const { sendConfirmationEmail, sendCustomerConfirmationSMS, sendOwnerNotificationEmail, sendOwnerNotificationSMS } = await import("./notifications");
              
              if (appointment) {
                const finalPriceNum = parseFloat(appointment.finalPrice);
                
                sendConfirmationEmail(
                  appointment.customerEmail,
                  appointment.customerName,
                  trackingId,
                  appointment.appointmentDate,
                  finalPriceNum,
                  appointment.requestDetails
                ).catch(console.error);

                sendCustomerConfirmationSMS(
                  appointment.customerPhone,
                  trackingId,
                  appointment.appointmentDate
                ).catch(console.error);

                sendOwnerNotificationEmail(
                  appointment.customerName,
                  appointment.customerEmail,
                  appointment.customerPhone,
                  trackingId,
                  appointment.appointmentDate,
                  finalPriceNum,
                  appointment.requestDetails
                ).catch(console.error);

                sendOwnerNotificationSMS(
                  appointment.customerName,
                  appointment.customerPhone,
                  trackingId,
                  appointment.appointmentDate,
                  finalPriceNum
                ).catch(console.error);

                // Generate and send invoice PDF
                try {
                  const { generateInvoicePDF } = await import("../invoice");
                  const { sendInvoiceEmail } = await import("./notifications");
                  
                  const basePriceNum = parseFloat(appointment.basePrice);
                  const invoiceResult = await generateInvoicePDF({
                    trackingId,
                    customerName: appointment.customerName,
                    customerEmail: appointment.customerEmail,
                    customerPhone: appointment.customerPhone,
                    appointmentDate: appointment.appointmentDate,
                    consultationType: appointment.consultationType || "Conseil en santé",
                    duration: appointment.duration || 30,
                    basePrice: basePriceNum,
                    finalPrice: finalPriceNum,
                    isNightRate: appointment.isNightRate === 1,
                    paymentDate: new Date(),
                  });
                  
                  console.log(`Invoice generated for ${trackingId}: ${invoiceResult.key}`);
                  
                  // Send invoice by email
                  await sendInvoiceEmail(
                    appointment.customerEmail,
                    appointment.customerName,
                    trackingId,
                    finalPriceNum,
                    invoiceResult.buffer
                  );
                  
                  console.log(`Invoice sent by email to ${appointment.customerEmail}`);
                } catch (invoiceError) {
                  console.error("Failed to generate/send invoice:", invoiceError);
                }
              }
            } catch (notificationError) {
              console.error("Failed to send notifications after payment:", notificationError);
            }
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
            const db = drizzle(process.env.DATABASE_URL!);
            await db
              .update(appointments)
              .set({ appointmentStatus: "cancelled" })
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
