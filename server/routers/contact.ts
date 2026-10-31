import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";
import { sql } from "drizzle-orm";
import { countPublicFormDailyVolume, releasePublicEmailIpRateLimit } from "../publicFormRateLimit";
import { enforcePublicFormRateLimit, verifyPublicFormTurnstile, enforcePublicFormIpLimit, createPublicTrackingId } from "./publicForms";

export const contactRouter = router({
  submit: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Le nom est requis").max(255),
        email: z.string().email("Email invalide").max(320),
        phone: z.string().max(50).optional(),
        message: z.string().min(1, "Le message est requis").max(5000),
        gdprConsent: z.number().int().min(0).max(1),
        turnstileToken: z.string().min(20).max(4096).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Server-side GDPR consent validation
      if (input.gdprConsent !== 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le consentement RGPD est requis' });
      }

      // Anti-robot d’abord : un jeton refusé ou que Cloudflare n’a pas pu
      // juger n’entame aucune des deux limites (ABUS-01).
      await verifyPublicFormTurnstile("contact", input.turnstileToken, ctx.req);
      await enforcePublicFormRateLimit({
        kind: "contact",
        email: input.email,
        headers: ctx.req.headers as Record<string, unknown>,
      });

      const ipHash = await enforcePublicFormIpLimit("contact", ctx.req);

      // Unpredictable tracking ID (13 chars, column is varchar(20))
      const trackingId = createPublicTrackingId("C");

      // Save the message to the database using raw SQL (TiDB DEFAULT bug workaround)
      const db = await getDb();
      if (db) {
        try {
          await db.execute(
            sql`INSERT INTO contact_messages (tracking_id, name, email, phone, message, gdpr_consent) VALUES (${trackingId}, ${input.name}, ${input.email}, ${input.phone || null}, ${input.message}, ${input.gdprConsent})`
          );
        } catch (error) {
          await releasePublicEmailIpRateLimit("contact", ipHash).catch(() => undefined);
          throw error;
        }
      }

      // ABUS-01 : au-delà du volume du jour, le message est gardé sans email au propriétaire.
      if (await countPublicFormDailyVolume("contact")) {
        await notifyOwner({
          title: `Nouveau message de contact de ${input.name} (${trackingId})`,
          content: `**Numéro de suivi:** ${trackingId}\n**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n**Consentement RGPD:** ${input.gdprConsent === 1 ? "✅ Accepté" : "❌ Refusé"}\n\n**Message:**\n${input.message}`,
        });
      }

      return { success: true, trackingId } as const;
    }),
});
