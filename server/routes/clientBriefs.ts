import type { Express } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { notifyOwner } from "../_core/notification";
import { secureReference } from "../_core/secureReference";
import { SITE_LANGUAGES } from "../emailLanguage";
import { emailText, multiLineText, refusesTextInputCharacters, singleLineText, TEXT_INPUT_INVALID_CHARACTERS, TEXT_INPUT_INVALID_CHARACTERS_MESSAGE } from "../../shared/textInput";
import { safeErrorName } from "./routeHelpers";

/**
 * Employer brief form (public, JSON body). A refusal of the limits or of an
 * unavailable service carries a stable code (rate_limited,
 * service_unavailable) that the page translates (REC-12); a field refused
 * for its characters, the code invalid_characters (INTL-05).
 */
export function registerClientBriefRoute(app: Express) {
  // INTL-05: no control character nor reversal of the text's direction.
  const clientBriefSchema = z.object({
    organizationName: singleLineText(z.string().min(1).max(180)),
    contactName: singleLineText(z.string().min(1).max(120)),
    email: emailText(z.string().email().max(320)),
    phone: singleLineText(z.string().max(50)).optional().default(""),
    targetEnvironment: singleLineText(z.string().min(1).max(120)),
    specialtyNeeded: singleLineText(z.string().min(1).max(160)),
    country: singleLineText(z.string().min(1).max(100)),
    requiredCertifications: multiLineText(z.string().max(1000)).optional().default(""),
    timeline: singleLineText(z.string().max(100)).optional().default(""),
    notes: multiLineText(z.string().max(3000)).optional().default(""),
    website: z.string().max(200).optional().default(""),
    // Language of the page: that of the acknowledgement (REC-12). Not stored.
    language: z.enum(SITE_LANGUAGES).optional(),
  });

  app.post("/api/client-briefs", async (req, res) => {
    try {
      const parsed = clientBriefSchema.safeParse(req.body);
      if (!parsed.success) {
        if (refusesTextInputCharacters(parsed.error)) {
          res.status(400).json({ error: TEXT_INPUT_INVALID_CHARACTERS_MESSAGE, code: TEXT_INPUT_INVALID_CHARACTERS });
          return;
        }
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
          res.status(503).json({ error: "Service temporairement indisponible.", code: "service_unavailable" });
          return;
        }
        // RGPD-17: the employer's email is pseudonymised, as in the other security events.
        await logSecurityEvent({ actorKind: "anonymous", actorReference: hashSecurityValue(parsed.data.email), category: "public_client_brief_rate_limited", outcome: "blocked", severity: "warning", ipHash: hashSecurityValue(clientIp) })
          .catch(securityLogError => console.error("Client brief protection log error:", safeErrorName(securityLogError)));
        res.status(429).json({ error: "Trop de demandes ont été envoyées. Veuillez patienter avant de soumettre un nouveau brief.", code: "rate_limited" });
        return;
      }

      const briefId = secureReference("BRIEF", 12);
      const db = await (await import("../db")).getDb();
      if (!db) {
        res.status(503).json({ error: "Service temporairement indisponible.", code: "service_unavailable" });
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
        // « Répondre » écrit à l’employeur, et non plus au propriétaire lui-même (PUB-09).
        await notifyOwner({ ...buildClientBriefOwnerNotification({ briefId, ...parsed.data }), replyTo: parsed.data.email });
      } catch {
        // notification fail non bloquante
      }

      // REC-12 : accusé à l’employeur (référence, prochaines étapes), sous son
      // plafond quotidien ; il ne fait jamais échouer le brief enregistré.
      try {
        const { countClientBriefAcknowledgement, sendPublicFormAcknowledgement } = await import("../publicFormAcknowledgements");
        if (await countClientBriefAcknowledgement()) {
          await sendPublicFormAcknowledgement({ kind: "clientBrief", email: parsed.data.email, reference: briefId, language: parsed.data.language });
        }
      } catch (acknowledgementError) {
        console.warn("Client brief acknowledgement error:", safeErrorName(acknowledgementError));
      }

      res.json({ success: true, briefId });
    } catch (error) {
      console.error("Client brief error:", safeErrorName(error));
      res.status(500).json({ error: "Échec de l'enregistrement du brief." });
    }
  });
}
