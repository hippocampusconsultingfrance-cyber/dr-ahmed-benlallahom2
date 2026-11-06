import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";
import { sql } from "drizzle-orm";
import { countPublicFormDailyVolume, releasePublicEmailIpRateLimit } from "../publicFormRateLimit";
import { enforcePublicFormRateLimit, verifyPublicFormTurnstile, enforcePublicFormIpLimit, createPublicTrackingId } from "./publicForms";

export const gdprRouter = router({
  submit: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Le nom est requis").max(255),
        email: z.string().email("Email invalide").max(320),
        phone: z.string().max(50).optional(),
        requestType: z.enum(["access", "rectification", "deletion", "portability", "objection"]),
        description: z.string().min(1, "La description est requise").max(5000).optional(),
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
          title: `Nouvelle demande RGPD de ${input.name} (${trackingId})`,
          content: `**Numéro de suivi:** ${trackingId}\n**Type de demande:** ${requestTypeLabels[input.requestType]}\n**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n\n**Description:**\n${input.description || "Aucune description fournie"}`,
        });
      }

      return { success: true, trackingId } as const;
    }),
});
