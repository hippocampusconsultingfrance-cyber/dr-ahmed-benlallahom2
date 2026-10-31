import { Resend } from "resend";
import { buildHippocampusEmailShell, unverifiedRecipientGreeting } from "./_core/notifications";
import { reportResendQuotaError, sendWithRateLimitRetry } from "./_core/resendDelivery";
import { DEFAULT_TRANSACTIONAL_FROM, resolveConsultationContact } from "./consultationContact";

/**
 * Emails of the free medical-question service.
 *
 * Replies of the person go to the practice, never to the recruitment inbox
 * (ADM-MQ-02). Same rule and same environment variables as the patient
 * booking emails:
 * - Reply-To: CONSULTATION_REPLY_TO, else the public contact email of the
 *   site (client/src/data/site-config.ts);
 * - sender: CONSULTATION_FROM_EMAIL (domain verified in Resend), else the
 *   existing transactional sender.
 * The indicative answer delay of the acknowledgement can be set with
 * MEDICAL_QUESTION_RESPONSE_DELAY_TEXT (French sentence).
 */
export const MEDICAL_QUESTION_DEFAULT_FROM = DEFAULT_TRANSACTIONAL_FROM;

type Env = Record<string, string | undefined>;

/** Single source: the consultation contact rules shared with the booking emails. */
export function resolveMedicalQuestionContact(env: Env = process.env) {
  const { from, replyTo } = resolveConsultationContact(env);
  return { from, replyTo };
}

export const MEDICAL_QUESTION_DEFAULT_DELAY = {
  fr: "Délai indicatif : une réponse vous est adressée dans les meilleurs délais, en général sous quelques jours ouvrés.",
  en: "Indicative delay: an answer is sent as soon as possible, usually within a few working days.",
} as const;

export function medicalQuestionDelayText(language: string, env: Env = process.env) {
  const configured = env.MEDICAL_QUESTION_RESPONSE_DELAY_TEXT?.trim();
  if (language === "fr" && configured) return configured.slice(0, 300);
  return language === "fr" ? MEDICAL_QUESTION_DEFAULT_DELAY.fr : MEDICAL_QUESTION_DEFAULT_DELAY.en;
}

let resendClient: Resend | undefined;

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("resend_api_key_missing");
  resendClient ??= new Resend(apiKey);
  return resendClient;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendMedicalQuestionResponseEmail(
  input: { email: string; firstName: string; trackingId: string; response: string },
  options: { idempotencyKey?: string } = {},
) {
  const contact = resolveMedicalQuestionContact();
  // The first name comes from the public form: same greeting as the acknowledgement (MAIL-01).
  const greeting = unverifiedRecipientGreeting(input.firstName);
  const html = buildHippocampusEmailShell(`
    <h2 style="color:#0891b2">Réponse à votre question</h2>
    <p>${escapeHtml(greeting)}</p>
    <p>Votre question a été examinée. Vous trouverez ci-dessous une réponse d’information générale relue et validée par le Dr. Ahmed Ben Lallahom.</p>
    <div style="margin:20px 0;padding:18px;border-radius:10px;background:#f1f5f9;white-space:pre-line;line-height:1.65;color:#0f172a;">${escapeHtml(input.response)}</div>
    <p style="font-size:13px;line-height:1.55;color:#475569;"><strong>Information importante :</strong> cette réponse générale ne remplace pas une consultation, une évaluation préopératoire ni une prise en charge urgente. En cas d’urgence ou de symptôme inquiétant, contactez les secours ou un professionnel de santé sans attendre.</p>
    <p style="font-size:12px;color:#64748b;">Référence confidentielle : ${escapeHtml(input.trackingId)}</p>
  `);
  const text = `${greeting}\n\nVotre question a été examinée.\n\n${input.response}\n\nInformation importante : cette réponse générale ne remplace pas une consultation, une évaluation préopératoire ni une prise en charge urgente. En cas d’urgence ou de symptôme inquiétant, contactez les secours ou un professionnel de santé sans attendre.\n\nRéférence confidentielle : ${input.trackingId}`;
  const { error } = await sendWithRateLimitRetry(() => getResendClient().emails.send(
    { from: contact.from, to: [input.email], replyTo: contact.replyTo, subject: `Réponse à votre question — ${input.trackingId}`, html, text },
    options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined,
  ));
  if (error) {
    await reportResendQuotaError(error, "medical_question");
    throw new Error(`medical_question_response_email_failed:${error.message}`);
  }
}

/** Acknowledgement to the person: reference, indicative delay, no copy of the question nor of any other typed text (MAIL-01). */
export async function sendMedicalQuestionAcknowledgementEmail(input: { email: string; firstName: string; trackingId: string; language: string }) {
  const contact = resolveMedicalQuestionContact();
  const french = input.language === "fr";
  const delay = medicalQuestionDelayText(input.language);
  const greeting = unverifiedRecipientGreeting(input.firstName, french ? "fr" : "en");
  const subject = french ? `Votre question a bien été reçue — ${input.trackingId}` : `Your question has been received — ${input.trackingId}`;
  const html = buildHippocampusEmailShell(french ? `
    <h2 style="color:#0891b2">Votre question a bien été reçue</h2>
    <p>${escapeHtml(greeting)}</p>
    <p>Nous avons bien reçu votre question. Elle sera relue par le Dr. Ahmed Ben Lallahom avant toute réponse, qui vous sera envoyée par email.</p>
    <p>${escapeHtml(delay)}</p>
    <p style="margin:20px 0;padding:14px;border-radius:10px;background:#f1f5f9;font-family:monospace;font-size:16px;font-weight:700;color:#0f172a;">Référence : ${escapeHtml(input.trackingId)}</p>
    <p style="font-size:13px;line-height:1.55;color:#475569;"><strong>Ce service ne traite pas les urgences.</strong> En cas de danger immédiat ou de symptôme inquiétant, contactez les secours (15 ou 112) ou un professionnel de santé sans attendre cette réponse.</p>
    <p style="font-size:12px;color:#64748b;">Pour retirer votre consentement ou supprimer votre demande, répondez à cet email en indiquant votre référence.</p>
  ` : `
    <h2 style="color:#0891b2">Your question has been received</h2>
    <p>${escapeHtml(greeting)}</p>
    <p>We have received your question. It will be reviewed by Dr. Ahmed Ben Lallahom before any answer, which will be sent to you by email.</p>
    <p>${escapeHtml(delay)}</p>
    <p style="margin:20px 0;padding:14px;border-radius:10px;background:#f1f5f9;font-family:monospace;font-size:16px;font-weight:700;color:#0f172a;">Reference: ${escapeHtml(input.trackingId)}</p>
    <p style="font-size:13px;line-height:1.55;color:#475569;"><strong>This service does not handle emergencies.</strong> In case of immediate danger or a worrying symptom, contact the emergency services (112) or a health professional without waiting for this answer.</p>
    <p style="font-size:12px;color:#64748b;">To withdraw your consent or delete your request, reply to this email with your reference.</p>
  `);
  const text = french
    ? `${greeting}\n\nNous avons bien reçu votre question. Elle sera relue par le Dr. Ahmed Ben Lallahom avant toute réponse, qui vous sera envoyée par email.\n\n${delay}\n\nRéférence : ${input.trackingId}\n\nCe service ne traite pas les urgences. En cas de danger immédiat ou de symptôme inquiétant, contactez les secours (15 ou 112) ou un professionnel de santé sans attendre cette réponse.\n\nPour retirer votre consentement ou supprimer votre demande, répondez à cet email en indiquant votre référence.`
    : `${greeting}\n\nWe have received your question. It will be reviewed by Dr. Ahmed Ben Lallahom before any answer, which will be sent to you by email.\n\n${delay}\n\nReference: ${input.trackingId}\n\nThis service does not handle emergencies. In case of immediate danger or a worrying symptom, contact the emergency services (112) or a health professional without waiting for this answer.\n\nTo withdraw your consent or delete your request, reply to this email with your reference.`;
  // The public form most exposed to a relay flood: a short rate limit is sent
  // again, a used-up quota is reported, as for the other emails (ABUS-03).
  const { error } = await sendWithRateLimitRetry(() => getResendClient().emails.send(
    { from: contact.from, to: [input.email], replyTo: contact.replyTo, subject, html, text },
    { idempotencyKey: `medical-question-acknowledgement/${input.trackingId}` },
  ));
  if (error) {
    await reportResendQuotaError(error, "medical_question");
    throw new Error(`medical_question_acknowledgement_email_failed:${error.message}`);
  }
}

/** Owner alert: no name, email or health content — only the reference and a link to the admin. */
export function buildMedicalQuestionOwnerNotification(input: { trackingId: string; language: string; publicationConsent: boolean; receivedAt?: Date; adminUrl?: string }) {
  const receivedAt = (input.receivedAt ?? new Date()).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });
  return {
    title: `Nouvelle question santé à traiter (${input.trackingId})`,
    content: [
      `Une nouvelle question a été déposée sur le service gratuit de questions santé.`,
      `Référence : ${input.trackingId}`,
      `Reçue le : ${receivedAt}`,
      `Langue : ${input.language.toUpperCase()} · accord de publication anonymisée : ${input.publicationConsent ? "oui" : "non"}`,
      "",
      "Pour des raisons de confidentialité, la question et les coordonnées ne figurent pas dans cet email.",
      `Consulter et répondre : ${input.adminUrl ?? "https://drahmedbenlallahom.com/admin"} (onglet « Questions santé »).`,
    ].join("\n"),
  };
}
