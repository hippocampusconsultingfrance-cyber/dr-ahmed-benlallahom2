import { PublicErrorReason, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";
import { and, eq, sql } from "drizzle-orm";
import { gdprRequests, securityEvents } from "../../drizzle/schema";
import { countPublicFormDailyVolume, releasePublicEmailIpRateLimit } from "../publicFormRateLimit";
import { enforcePublicFormRateLimit, verifyPublicFormTurnstile, enforcePublicFormIpLimit, createPublicTrackingId } from "./publicForms";
import { emailText, multiLineText, singleLineText } from "../../shared/textInput";
import { adminLink } from "../adminLinks";
import { logError } from "../_core/logError";
import { requestIpHash, securityEventInsert } from "../candidateSecurity";
import { emailLanguageFor, SITE_LANGUAGES, withEmailLanguage } from "../emailLanguage";
import { sendPublicFormAcknowledgement } from "../publicFormAcknowledgements";
import { DEFAULT_PUBLIC_ORIGIN } from "./publicOrigin";

/** Rights the form lets a person exercise: those of the privacy policy, and the withdrawal of a consent (RGPD-13). */
export const GDPR_REQUEST_TYPES = ["access", "rectification", "deletion", "restriction", "portability", "objection", "consent_withdrawal"] as const;

/** Security journal entry of an address confirmed by its link: one per request, which makes the link single-use. */
export const GDPR_REQUEST_EMAIL_CONFIRMED = "gdpr_request_email_confirmed";

/** Refusal of a confirmation link (RGPD-13), translated by the page. */
export type GdprConfirmationRefusal = "gdpr_confirmation_invalid" | "gdpr_confirmation_used";

function confirmationKey(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("gdpr_confirmation_key_missing");
  return secret;
}

function confirmationSignature(payload: string) {
  return createHmac("sha256", confirmationKey()).update(`gdpr_request_confirmation:${payload}`, "utf8").digest("base64url");
}

/**
 * Signed link sent to the address of a GDPR request (RGPD-13): opening it and
 * confirming proves that the person holds that mailbox. It names the request's
 * reference only, and stays valid one month, the time the answer is due in.
 */
export function createGdprConfirmationToken(reference: string, issuedAt = new Date()): string {
  const expiresAt = new Date(issuedAt);
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  const payload = Buffer.from(JSON.stringify({ reference, expiresAt: expiresAt.getTime() }), "utf8").toString("base64url");
  return `${payload}.${confirmationSignature(payload)}`;
}

/** The request's reference of an authentic link not yet expired, null otherwise. */
export function verifyGdprConfirmationToken(token: string, now = Date.now()): string | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const supplied = Buffer.from(signature, "utf8");
  const expected = Buffer.from(confirmationSignature(payload), "utf8");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { reference?: unknown; expiresAt?: unknown };
    if (typeof parsed.reference !== "string" || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now) return null;
    return parsed.reference;
  } catch {
    return null;
  }
}

/** The page that confirms the address, in the language of the email; none without a signing key, the request being stored already. */
function gdprConfirmationUrl(reference: string, language: string | undefined) {
  try {
    return withEmailLanguage(`${DEFAULT_PUBLIC_ORIGIN}/gdpr?confirm=${createGdprConfirmationToken(reference)}`, emailLanguageFor(language));
  } catch (error) {
    logError("[GDPR] Confirmation link unavailable", error, { ref: reference });
    return undefined;
  }
}

function confirmationRefusal(reason: GdprConfirmationRefusal) {
  return reason === "gdpr_confirmation_used"
    ? new TRPCError({ code: "CONFLICT", message: "Ce lien a déjà servi : l’adresse de cette demande est confirmée.", cause: new PublicErrorReason(reason) })
    : new TRPCError({ code: "BAD_REQUEST", message: "Ce lien de confirmation est invalide ou expiré.", cause: new PublicErrorReason(reason) });
}

export const gdprRouter = router({
  submit: publicProcedure
    .input(
      z.object({
        // INTL-05 : sans caractère de contrôle ni inversion du sens du texte.
        name: singleLineText(z.string().min(1, "Le nom est requis").max(255)),
        email: emailText(z.string().email("Email invalide").max(320)),
        phone: singleLineText(z.string().max(50)).optional(),
        requestType: z.enum(GDPR_REQUEST_TYPES),
        // Facultative : une description faite d’espaces seuls est gardée vide, la demande n’est pas refusée.
        description: multiLineText(z.string().max(5000)).optional(),
        turnstileToken: z.string().min(20).max(4096).optional(),
        // Language of the page: that of the acknowledgement (RGPD-13).
        language: z.enum(SITE_LANGUAGES).optional(),
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
      const requestTypeLabels: Record<(typeof GDPR_REQUEST_TYPES)[number], string> = {
        access: "Accès aux données",
        rectification: "Rectification de données",
        deletion: "Suppression de données (droit à l'oubli)",
        restriction: "Limitation du traitement",
        portability: "Portabilité des données",
        objection: "Opposition au traitement",
        consent_withdrawal: "Retrait du consentement",
      };

      // ABUS-01 : au-delà du volume du jour, la demande est gardée sans email
      // au propriétaire ni accusé de réception au demandeur.
      if (await countPublicFormDailyVolume("gdpr")) {
        // RGPD-13 : la référence, le délai et le lien de confirmation, sans recopier la description.
        const confirmationUrl = gdprConfirmationUrl(trackingId, input.language);
        const acknowledged = await sendPublicFormAcknowledgement({ kind: "gdprRequest", email: input.email, reference: trackingId, language: input.language, confirmationUrl });
        await notifyOwner({
          // INTL-11 : « [G…] Demande RGPD – Nom », la référence d’abord.
          reference: trackingId,
          title: "Demande RGPD",
          name: input.name,
          // RGPD-13 : la description, qui peut parler de santé, reste dans l’administration.
          content: `**Numéro de suivi:** ${trackingId}\n**Type de demande:** ${requestTypeLabels[input.requestType]}\n**De:** ${input.name}\n**Email:** ${input.email}\n**Téléphone:** ${input.phone || "Non renseigné"}\n**Description:** ${input.description ? "à lire dans l’administration" : "aucune"}\n\n**Accusé de réception:** ${acknowledged ? "envoyé, avec un lien qui confirme l’adresse ; l’onglet RGPD indique si la personne a confirmé" : "non envoyé (voir les journaux du serveur)"}\n\n**Ouvrir la demande:** ${adminLink("gdpr", trackingId)}`,
        });
      }

      return { success: true, trackingId } as const;
    }),

  /**
   * The person confirms the address of their request from the emailed link
   * (RGPD-13), by a button of the page: a mail scanner opening the link
   * confirms nothing. Once only: the confirmation is kept in the security
   * journal (90 days, longer than the link) under the request's reference,
   * which the administration's list of requests reads.
   */
  confirmEmail: publicProcedure
    .input(z.object({ token: z.string().min(20).max(512) }))
    .mutation(async ({ input, ctx }) => {
      const reference = verifyGdprConfirmationToken(input.token);
      if (!reference) throw confirmationRefusal("gdpr_confirmation_invalid");
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const [request] = await db.select({ trackingId: gdprRequests.trackingId }).from(gdprRequests).where(eq(gdprRequests.trackingId, reference)).limit(1);
      if (!request) throw confirmationRefusal("gdpr_confirmation_invalid");
      const [confirmed] = await db.select({ id: securityEvents.id }).from(securityEvents)
        .where(and(eq(securityEvents.category, GDPR_REQUEST_EMAIL_CONFIRMED), eq(securityEvents.actorReference, reference))).limit(1);
      if (confirmed) throw confirmationRefusal("gdpr_confirmation_used");
      await securityEventInsert(db, { actorKind: "anonymous", actorReference: reference, category: GDPR_REQUEST_EMAIL_CONFIRMED, outcome: "allowed", ipHash: requestIpHash(ctx.req.headers as Record<string, unknown>) });
      return { success: true, reference } as const;
    }),
});
