import { siteConfig } from "../client/src/data/site-config";
import { getResendClient } from "./_core/notification";
import { buildHippocampusEmailShell } from "./_core/notifications";
import { reportResendQuotaError, sendWithRateLimitRetry } from "./_core/resendDelivery";
import { recordPersistentRateLimitAttempt } from "./candidateSecurity";
import { DEFAULT_TRANSACTIONAL_FROM } from "./consultationContact";
import { emailLanguageFor, type EmailLanguage } from "./emailLanguage";

/**
 * Acknowledgements of the contact form (PUB-09) and of the employer brief
 * (REC-12): the reference of the request and what happens next, in French for
 * a French page, in English otherwise. Sent once the request is stored, to an
 * address nobody has verified yet: they never copy a text the visitor typed
 * (name, organisation, message, notes), only the reference (MAIL-01). Replies
 * go to the public contact address of the site. A send that fails is logged
 * and never fails the request; the idempotency key ack-<reference> keeps a
 * retried request from sending a second one.
 *
 * Texts to have the owner read before production (lot 6 decision).
 */
export type PublicFormAcknowledgementKind = "contact" | "clientBrief";

/**
 * Indicative answer delay of each acknowledgement, e.g. « sous 2 jours
 * ouvrés » / "within 2 working days". Empty until the owner sets it: the email
 * then promises no delay (« dans les meilleurs délais » for a message, nothing
 * for a brief).
 */
const RESPONSE_DELAY: Record<PublicFormAcknowledgementKind, Record<EmailLanguage, string>> = {
  contact: { fr: "", en: "" },
  clientBrief: { fr: "", en: "" },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The employer brief has no Turnstile and no daily volume of its own
 * (publicFormRateLimit.ts): its acknowledgements get this cap, counted like
 * the other public forms' daily volume. Past it, the brief is still stored and
 * the owner still told; only the email to the address typed is skipped.
 */
const CLIENT_BRIEF_ACKNOWLEDGEMENT_DAILY_LIMIT = { action: "public_client_brief_acknowledgement_daily", subject: "global", maxAttempts: 50, windowMs: DAY_MS, blockMs: DAY_MS };

type AcknowledgementText = { subject: string; title: string; lines: string[]; footer: string[] };

function acknowledgementText(kind: PublicFormAcknowledgementKind, language: EmailLanguage, reference: string): AcknowledgementText {
  const delay = RESPONSE_DELAY[kind][language];
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

function buildAcknowledgementEmail(input: { kind: PublicFormAcknowledgementKind; email: string; reference: string; language: EmailLanguage }) {
  const text = acknowledgementText(input.kind, input.language, input.reference);
  const referenceLine = input.language === "fr" ? `Référence : ${input.reference}` : `Reference: ${input.reference}`;
  const html = buildHippocampusEmailShell(`
    <h2 style="color:#0891b2">${escapeHtml(text.title)}</h2>
    ${text.lines.map(line => `<p>${escapeHtml(line)}</p>`).join("\n    ")}
    <p style="margin:20px 0;padding:14px;border-radius:10px;background:#f1f5f9;font-family:monospace;font-size:16px;font-weight:700;color:#0f172a;">${escapeHtml(referenceLine)}</p>
    ${text.footer.map(line => `<p style="font-size:12px;color:#64748b;">${escapeHtml(line)}</p>`).join("\n    ")}
  `, input.language);
  return {
    from: DEFAULT_TRANSACTIONAL_FROM,
    to: [input.email],
    replyTo: siteConfig.email,
    subject: text.subject,
    html,
    text: [...text.lines, referenceLine, ...text.footer].join("\n\n"),
  };
}

/**
 * Sends the acknowledgement of a stored request; true once Resend has taken
 * it. Never throws: without Resend, on a refusal or a network error, the
 * request stays recorded and the failure is logged (without the address).
 */
export async function sendPublicFormAcknowledgement(input: { kind: PublicFormAcknowledgementKind; email: string; reference: string; language?: string | null }): Promise<boolean> {
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
 * the email then skipped. A counter that cannot be read cuts nothing, as for
 * the daily volume of the other forms.
 */
export async function countClientBriefAcknowledgement(): Promise<boolean> {
  try {
    return !(await recordPersistentRateLimitAttempt(CLIENT_BRIEF_ACKNOWLEDGEMENT_DAILY_LIMIT)).blocked;
  } catch (error) {
    console.error("client_brief_acknowledgement_volume_unavailable", error instanceof Error ? error.name : "UnknownError");
    return true;
  }
}
