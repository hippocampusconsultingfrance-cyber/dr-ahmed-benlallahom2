import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";
import { sql } from "drizzle-orm";
import { countPublicFormDailyVolume, releasePublicEmailIpRateLimit } from "../publicFormRateLimit";
import { enforcePublicFormRateLimit, verifyPublicFormTurnstile, enforcePublicFormIpLimit, createPublicTrackingId } from "./publicForms";
import { emailText, multiLineText, singleLineText } from "../../shared/textInput";
import { adminLink } from "../adminLinks";

export const gdprRouter = router({
  submit: publicProcedure
    .input(
      z.object({
        // INTL-05 : sans caractère de contrôle ni inversion du sens du texte.
        name: singleLineText(z.string().min(1, "Le nom est requis").max(255)),
        email: emailText(z.string().email("Email invalide").max(320)),
        phone: singleLineText(z.string().max(50)).optional(),
        requestType: z.enum(["access", "rectification", "deletion", "portability", "objection"]),
        // Facultative : une description faite d’espaces seuls est gardée vide, la demande n’est pas refusée.
        description: multiLineText(z.string().max(5000)).optional(),
        turnstileToken: z.string().min(20).max(4096).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyPublicFormTurnstile("gdpr", input.turnstileToken, ctx.req);
      await enforcePublicFormRateLimit({
        kind: "gdpr",
        email: input.email,
        headers: ctx.req.headers as Record<string, unknown>,
      });
      const ipHash = await enforcePublicFormIpLimit("gdpr", ctx.req);
      // Unpredictable tracking ID (13 chars, column is varchar(20))
      const trackingId = createPublicTrackingId("G");

      // Save the GDPR request to the database using raw SQL (TiDB DEFAULT bug workaround)
      const db = await getDb();
      if (db) {
        try {
          await db.execute(
            sql`INSERT INTO gdpr_requests (tracking_id, name, email, phone, request_type, description, status) VALUES (${trackingId}, ${input.name}, ${input.email}, ${input.phone || null}, ${input.requestType}, ${input.description || null}, ${'pending'})`
          );
        } catch (error) {
          await releasePublicEmailIpRateLimit("gdpr", ipHash).catch(() => undefined);
          throw error;
        }
      }

      // Notify the owner via Manus notification system
      const requestTypeLabels: Record<string, string> = {
        access: "Accès aux données",
        rectification: "Rectification de données",
        deletion: "Suppression de données (droit à l'oubli)",
        portability: "Portabilité des données",
        objection: "Opposition au traitement",
      };

      // ABUS-01 : au-delà du volume du jour, la demande est gardée sans email au propriétaire.
      if (await countPublicFormDailyVolume("gdpr")) {
        await notifyOwner({
          // INTL-11 : « [G…] Demande RGPD – Nom », la référence d’abord.
          reference: trackingId,
          title: "Demande RGPD",
          name: input.name,
          content: `**Numéro de suivi:** ${trackingId}\n**Type de demande:** ${requestTypeLabels[input.requestType]}\n**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n\n**Description:**\n${input.description || "Aucune description fournie"}\n\n**Ouvrir la demande:** ${adminLink("gdpr", trackingId)}`,
        });
      }

      return { success: true, trackingId } as const;
    }),
});
