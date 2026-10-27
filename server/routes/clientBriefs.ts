import type { Express } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { notifyOwner } from "../_core/notification";
import { secureReference } from "../_core/secureReference";
import { PUBLIC_APP_ORIGIN, safeErrorName } from "./routeHelpers";

/** Employer brief form (public, JSON body). */
export function registerClientBriefRoute(app: Express) {
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
}
