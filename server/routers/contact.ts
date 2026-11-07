import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";
import { sql } from "drizzle-orm";
import { countPublicFormDailyVolume, releasePublicEmailIpRateLimit } from "../publicFormRateLimit";
import { enforcePublicFormRateLimit, verifyPublicFormTurnstile, enforcePublicFormIpLimit, createPublicTrackingId } from "./publicForms";
import { sendPublicFormAcknowledgement } from "../publicFormAcknowledgements";
import { SITE_LANGUAGES } from "../emailLanguage";
import { CONTACT_CATEGORIES, type ContactCategory } from "../../shared/contactCategories";
import { emailText, multiLineText, singleLineText } from "../../shared/textInput";
import { adminLink } from "../adminLinks";

/** Who wrote, as the owner's notification names it (PUB-22). */
const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  patient: "Patient",
  health_professional: "Professionnel de santé",
  institution: "Établissement",
  press_partner: "Presse ou partenaire",
};

export const contactRouter = router({
  submit: publicProcedure
    .input(
      z.object({
        // INTL-05 : sans caractère de contrôle ni inversion du sens du texte.
        name: singleLineText(z.string().min(1, "Le nom est requis").max(255)),
        email: emailText(z.string().email("Email invalide").max(320)),
        phone: singleLineText(z.string().max(50)).optional(),
        message: multiLineText(z.string().min(1, "Le message est requis").max(5000)),
        gdprConsent: z.number().int().min(0).max(1),
        turnstileToken: z.string().min(20).max(4096).optional(),
        // Chosen on the form (PUB-22), sent in the notification only: no column in the database.
        category: z.enum(CONTACT_CATEGORIES).optional(),
        // Language of the page: that of the acknowledgement (PUB-09).
        language: z.enum(SITE_LANGUAGES).optional(),
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

      // ABUS-01 : au-delà du volume du jour, le message est gardé sans email au
      // propriétaire ni accusé de réception au visiteur.
      if (await countPublicFormDailyVolume("contact")) {
        await Promise.all([
          notifyOwner({
            // INTL-11 : « [C…] Contact – Nom », la référence d’abord.
            reference: trackingId,
            title: "Contact",
            name: input.name,
            content: `**Numéro de suivi:** ${trackingId}\n**De:** ${input.name}\n**Vous êtes:** ${input.category ? CONTACT_CATEGORY_LABELS[input.category] : "Non précisé"}\n**Langue de la page:** ${input.language ?? "Non précisée"}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n**Consentement RGPD:** ${input.gdprConsent === 1 ? "✅ Accepté" : "❌ Refusé"}\n\n**Message:**\n${input.message}\n\n**Ouvrir le message:** ${adminLink("contacts", trackingId)}`,
            // « Répondre » écrit au visiteur, et non plus au propriétaire lui-même (PUB-09).
            replyTo: input.email,
          }),
          // PUB-09 : la référence et la suite, sans recopier le message (MAIL-01) ; un échec ne fait pas échouer l’envoi.
          sendPublicFormAcknowledgement({ kind: "contact", email: input.email, reference: trackingId, language: input.language }),
        ]);
      }

      return { success: true, trackingId } as const;
    }),
});
