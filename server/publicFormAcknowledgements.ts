import { siteConfig } from "../client/src/data/site-config";
import { getResendClient, notifyOwner } from "./_core/notification";
import { buildHippocampusEmailShell } from "./_core/notifications";
import { reportResendQuotaError, sendWithRateLimitRetry } from "./_core/resendDelivery";
import { dailyOwnerAlertIdempotencyKey, recordPersistentRateLimitAttempt, sendOwnerAlertOncePerWindow } from "./candidateSecurity";
import { DEFAULT_TRANSACTIONAL_FROM, resolveConsultationContact } from "./consultationContact";
import { emailLanguageFor, type EmailLanguage } from "./emailLanguage";

/**
 * Acknowledgements of the contact form (PUB-09), of the employer brief
 * (REC-12) and of a GDPR request (RGPD-13): the reference of the request and
 * what happens next, in French for a French page, in English otherwise. Sent
 * once the request is stored, to an address nobody has verified yet: they
 * never copy a text the visitor typed (name, organisation, message, notes,
 * description), only the reference (MAIL-01). The GDPR request's adds the link
 * that confirms the address. The contact's sender and Reply-To are those of
 * the patient emails (CONSULTATION_FROM_EMAIL, CONSULTATION_REPLY_TO), as for
 * the health question acknowledgement; the brief's and the GDPR request's
 * replies go to the public contact address the Employers page and the privacy
 * policy give. A send that fails is logged and never fails the request; the
 * idempotency key ack-<reference> keeps a retried request from sending a
 * second one.
 *
 * Texts to have the owner read before production (lot 6 decision).
 */
export type PublicFormAcknowledgementKind = "contact" | "clientBrief" | "gdprRequest";

/**
 * Indicative answer delay of each acknowledgement, e.g. « sous 2 jours
 * ouvrés » / "within 2 working days". The brief's is the first contact the
 * Employers page promises (REC-12). The contact's stays empty until the owner
 * sets it: the email then says « dans les meilleurs délais ». The GDPR
 * request's is the one month after receipt of docs/PROCEDURE_DEMANDES_RGPD.md.
 */
const RESPONSE_DELAY: Record<PublicFormAcknowledgementKind, Record<EmailLanguage, string>> = {
  contact: { fr: "", en: "" },
  clientBrief: { fr: "sous 24 h ouvrées", en: "within 24 business hours" },
  gdprRequest: { fr: "dans un délai d’un mois après sa réception", en: "within one month of its receipt" },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The employer brief has no Turnstile and no daily volume of its own
 * (publicFormRateLimit.ts): its acknowledgements get this cap, counted like
 * the other public forms' daily volume. Past it, the brief is still stored and
 * the owner still told; only the email to the address typed is skipped.
 */
const CLIENT_BRIEF_ACKNOWLEDGEMENT_DAILY_LIMIT = { action: "public_client_brief_acknowledgement_daily", subject: "global", maxAttempts: 50, windowMs: DAY_MS, blockMs: DAY_MS };

type AcknowledgementText = { subject: string; title: string; lines: string[]; footer: string[]; confirmation?: { line: string; button: string } };

function acknowledgementText(kind: PublicFormAcknowledgementKind, language: EmailLanguage, reference: string): AcknowledgementText {
  const delay = RESPONSE_DELAY[kind][language];
  if (kind === "gdprRequest") {
    return language === "fr"
      ? {
        subject: `Votre demande RGPD a bien été reçue — ${reference}`,
        title: "Votre demande RGPD a bien été reçue",
        lines: ["Bonjour,", "Nous avons bien reçu la demande d’exercice de vos droits envoyée depuis le formulaire RGPD de drahmedbenlallahom.com.", `Nous vous répondrons ${delay}.`],
        confirmation: { line: "Pour confirmer que cette adresse email est bien la vôtre, ouvrez le lien ci-dessous, puis cliquez sur « Confirmer mon adresse ». Ce lien ne sert qu’une fois.", button: "Confirmer mon adresse" },
        footer: ["Pour compléter votre demande, répondez à cet email en indiquant votre référence.", "Si vous n’êtes pas à l’origine de cette demande, n’ouvrez pas le lien et ignorez cet email."],
      }
      : {
        subject: `Your GDPR request has been received — ${reference}`,
        title: "Your GDPR request has been received",
        lines: ["Hello,", "We have received the request to exercise your rights sent from the GDPR form of drahmedbenlallahom.com.", `We will answer ${delay}.`],
        confirmation: { line: "To confirm that this email address is yours, open the link below, then click “Confirm my address”. This link can be used once.", button: "Confirm my address" },
        footer: ["To add to your request, reply to this email quoting your reference.", "If you did not make this request, do not open the link and ignore this email."],
      };
  }
  if (kind === "contact") {
    return language === "fr"
      ? {
        subject: `Votre message a bien été reçu — ${reference}`,
        title: "Votre message a bien été reçu",
        lines: ["Bonjour,", "Nous avons bien reçu le message envoyé depuis le formulaire de contact de drahmedbenlallahom.com.", `Nous revenons vers vous ${delay || "dans les meilleurs délais"}.`],
        footer: ["Pour compléter votre demande, répondez à cet email en indiquant votre référence.", "Si vous n’êtes pas à l’origine de ce message, ignorez cet email."],
      }
      : {
        subject: `Your message has been received — ${reference}`,
        title: "Your message has been received",
        lines: ["Hello,", "We have received the message sent from the contact form of drahmedbenlallahom.com.", `We will get back to you ${delay || "as soon as possible"}.`],
        footer: ["To add to your request, reply to this email quoting your reference.", "If you did not send this message, please ignore this email."],
      };
  }
  return language === "fr"
    ? {
      subject: `Votre brief de mission a bien été reçu — ${reference}`,
      title: "Votre brief de mission a bien été reçu",
      lines: [
        "Bonjour,",
        "Nous avons bien reçu le brief de mission transmis depuis l’espace Employeurs de drahmedbenlallahom.com. Il est traité de manière confidentielle par notre cellule de recrutement.",
        `Prochaines étapes : nous relisons votre brief, puis nous revenons vers vous${delay ? ` ${delay}` : ""} pour préciser le besoin, le calendrier et les modalités de la mission.`,
      ],
      footer: ["Pour compléter votre brief, répondez à cet email en indiquant votre référence.", "Si vous n’êtes pas à l’origine de cette demande, ignorez cet email."],
    }
    : {
      subject: `Your mission brief has been received — ${reference}`,
      title: "Your mission brief has been received",
      lines: [
        "Hello,",
        "We have received the mission brief sent from the Employers area of drahmedbenlallahom.com. It is handled confidentially by our recruitment unit.",
        `Next steps: we review your brief, then get back to you${delay ? ` ${delay}` : ""} to clarify the need, the timeline and the terms of the mission.`,
      ],
      footer: ["To add to your brief, reply to this email quoting your reference.", "If you did not make this request, please ignore this email."],
    };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildAcknowledgementEmail(input: { kind: PublicFormAcknowledgementKind; email: string; reference: string; language: EmailLanguage; confirmationUrl?: string }) {
  const text = acknowledgementText(input.kind, input.language, input.reference);
  const referenceLine = input.language === "fr" ? `Référence : ${input.reference}` : `Reference: ${input.reference}`;
  // The GDPR request's link that confirms the address (RGPD-13), the only link of these emails.
  const confirmation = text.confirmation && input.confirmationUrl ? { ...text.confirmation, url: input.confirmationUrl } : null;
  const html = buildHippocampusEmailShell(`
    <h2 style="color:#0891b2">${escapeHtml(text.title)}</h2>
    ${text.lines.map(line => `<p>${escapeHtml(line)}</p>`).join("\n    ")}
    <p style="margin:20px 0;padding:14px;border-radius:10px;background:#f1f5f9;font-family:monospace;font-size:16px;font-weight:700;color:#0f172a;">${escapeHtml(referenceLine)}</p>
    ${confirmation ? `<p>${escapeHtml(confirmation.line)}</p>
    <p style="margin:20px 0;"><a href="${escapeHtml(confirmation.url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#0891b2;color:#ffffff;font-weight:700;text-decoration:none;">${escapeHtml(confirmation.button)}</a></p>` : ""}
    ${text.footer.map(line => `<p style="font-size:12px;color:#64748b;">${escapeHtml(line)}</p>`).join("\n    ")}
  `, input.language);
  const { from, replyTo } = input.kind === "contact" ? resolveConsultationContact() : { from: DEFAULT_TRANSACTIONAL_FROM, replyTo: siteConfig.email };
  return {
    from,
    to: [input.email],
    replyTo,
    subject: text.subject,
    html,
    text: [...text.lines, referenceLine, ...(confirmation ? [confirmation.line, confirmation.url] : []), ...text.footer].join("\n\n"),
  };
}

/**
 * Sends the acknowledgement of a stored request; true once Resend has taken
 * it. Never throws: without Resend, on a refusal or a network error, the
 * request stays recorded and the failure is logged (without the address).
 */
export async function sendPublicFormAcknowledgement(input: { kind: PublicFormAcknowledgementKind; email: string; reference: string; language?: string | null; confirmationUrl?: string }): Promise<boolean> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.warn(`[PublicFormAcknowledgement] Resend is not configured; no acknowledgement for the ${input.kind} request.`);
      return false;
    }
    const message = buildAcknowledgementEmail({ ...input, language: emailLanguageFor(input.language) });
    // A short rate limit is sent again, a used-up quota reported, as for the other emails (ABUS-03).
    const { error } = await sendWithRateLimitRetry(() => resend.emails.send(message, { idempotencyKey: `ack-${input.reference}` }));
    if (!error) return true;
    await reportResendQuotaError(error, "public_form_acknowledgement");
    console.warn(`[PublicFormAcknowledgement] Resend refused the ${input.kind} acknowledgement: ${error.name ?? "unknown_error"}`);
  } catch (error) {
    console.warn(`[PublicFormAcknowledgement] The ${input.kind} acknowledgement could not be sent: ${error instanceof Error ? error.name : "UnknownError"}`);
  }
  return false;
}

/**
 * Counts one employer brief acknowledgement in the day's cap; false past it,
 * the email then skipped. The owner gets one alert a day once it is reached,
 * as for the daily volume of the other forms (publicFormRateLimit.ts). A
 * counter that cannot be read cuts nothing.
 */
export async function countClientBriefAcknowledgement(): Promise<boolean> {
  let state: Awaited<ReturnType<typeof recordPersistentRateLimitAttempt>>;
  try {
    state = await recordPersistentRateLimitAttempt(CLIENT_BRIEF_ACKNOWLEDGEMENT_DAILY_LIMIT);
  } catch (error) {
    console.error("client_brief_acknowledgement_volume_unavailable", error instanceof Error ? error.name : "UnknownError");
    return true;
  }
  if (!state.blocked) return true;
  const { action, maxAttempts } = CLIENT_BRIEF_ACKNOWLEDGEMENT_DAILY_LIMIT;
  const alertAction = `${action}_alert`;
  await sendOwnerAlertOncePerWindow({ action: alertAction, subject: "global", windowMs: DAY_MS, blockMs: DAY_MS }, () => notifyOwner({
    title: `Volume inhabituel : plus de ${maxAttempts} accusés de brief employeur en 24 heures`,
    content: [
      `Le plafond quotidien de ${maxAttempts} accusés de réception envoyés aux employeurs est atteint (moins de 24 heures, toutes adresses confondues).`,
      "Le formulaire reste ouvert : pendant les 24 prochaines heures, les briefs suivants sont enregistrés et vous sont notifiés, sans accusé de réception à l’adresse saisie. Aucun autre email ne vous sera envoyé pour ce volume.",
      "Consultez-les dans l’administration (onglet « Missions »). S’il s’agit d’envois automatisés, activez l’Attack Challenge Mode du pare-feu Vercel.",
    ].join("\n\n"),
  }, { idempotencyKey: dailyOwnerAlertIdempotencyKey(alertAction) })).catch(() => false);
  return false;
}
