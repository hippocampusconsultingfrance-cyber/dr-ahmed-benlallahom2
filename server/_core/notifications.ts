import { Resend } from "resend";
import { buildOwnerNotificationEmail } from "./notification";
import { CANDIDATE_INVITATION_MAX_AGE_MS, CANDIDATE_TOKEN_MAX_AGE_MS, formatCandidateLinkValidity } from "../candidateAuth";
import { PATIENT_CANCELLATION_POLICY, PATIENT_CANCELLATION_POLICY_EN, resolveConsultationContact, type ConsultationContact } from "../consultationContact";
import { appointmentCalendarFilename, buildAppointmentCalendarEvent } from "../appointmentCalendar";
import { withEmailLanguage, type EmailLanguage } from "../emailLanguage";
import { reportResendQuotaError, resendDeliveryFailureCode, resendRetryAfterMs, sendWithRateLimitRetry, type ResendDeliveryFailureCode } from "./resendDelivery";
import {
  buildResendApplicationTags,
  RESEND_APPLICATION_ACTIVATION_KIND,
  RESEND_APPLICATION_INVITATION_KIND,
} from "../resendWebhookCorrelation";

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

const GREETING_NAME_MAX_LENGTH = 40;
// Built with RegExp: tsc refuses the literal "u" flag with this project's default target.
const GREETING_NAME_PATTERN = new RegExp("^\\p{L}[\\p{L}\\p{M} '’.-]*$", "u");
// A dot glued to a letter and another letter or mark is a domain name
// ("colis-phish.example", "colis-phish.भारत"), not an initial.
const GREETING_DOMAIN_PATTERN = new RegExp("\\.\\p{L}[\\p{L}\\p{M}]", "u");

/**
 * Greeting of an email sent to an address nobody has verified yet (MAIL-01).
 * Anyone can type someone else's address in these public forms, so the free
 * text of the visitor must not reach the email: the first name is kept only
 * when it looks like one (Unicode letters, spaces, ' ’ . -, at most 40
 * characters, no domain name), otherwise the greeting is neutral. A name never
 * makes a form fail. The emails the admin sends later to these addresses
 * (recruitment campaigns and templates, answer to a health question) greet the
 * same way: the name still comes from the public form. Plain text: escape it
 * before putting it in HTML.
 */
export function unverifiedRecipientGreeting(firstName: string | null | undefined, language: "fr" | "en" = "fr"): string {
  const greeting = language === "en" ? "Hello" : "Bonjour";
  const name = firstName?.trim() ?? "";
  const keepName = Array.from(name).length <= GREETING_NAME_MAX_LENGTH
    && GREETING_NAME_PATTERN.test(name)
    && !GREETING_DOMAIN_PATTERN.test(name);
  return keepName ? `${greeting} ${name},` : `${greeting},`;
}

// Domaine drahmedbenlallahom.com vérifié dans Resend.
// Une boîte dédiée n'est pas nécessaire pour l'envoi transactionnel ; les
// réponses des candidats restent dirigées vers la boîte de recrutement active.
// Les emails patients ont leur propre expéditeur et Reply-To : voir
// server/consultationContact.ts.
const FROM_EMAIL = "Hippocampus Consulting <recrutement@drahmedbenlallahom.com>";
const RECRUITMENT_REPLY_TO = "hippocampusconsultingfrance@gmail.com";
const HIPPOCAMPUS_LOGO_URL = "https://drahmedbenlallahom.com/assets/abl-logo.svg";

// Shared with the owner notifications of notification.ts; still exported from
// here for the callers of these emails.
export { resendRateLimitRetry } from "./resendDelivery";
export type { ResendDeliveryFailureCode };

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

type ResendSendPayload = Parameters<Resend["emails"]["send"]>[0];
type ResendSendOptions = Parameters<Resend["emails"]["send"]>[1];

/**
 * One Resend send, made once more after the retry-after delay when Resend
 * answers with its rate limit. A refusal comes back classified (an exhausted
 * quota is reported); a network error is thrown as before. `retryLater`: the
 * rate limit asks for a longer wait than a request allows, so nothing sent
 * before that delay can pass.
 */
async function sendThroughResend(message: ResendSendPayload, options: ResendSendOptions, emailKind: string): Promise<
  | { id: string | null; error: null; failureCode: null; retryLater: false }
  | { id: null; error: { message: string; name?: string; statusCode?: number | null }; failureCode: ResendDeliveryFailureCode; retryLater: boolean }
> {
  const response = await sendWithRateLimitRetry(() => getResendClient().emails.send(message, options));
  if (!response.error) return { id: response.data?.id ?? null, error: null, failureCode: null, retryLater: false };
  const failureCode = resendDeliveryFailureCode(response.error);
  await reportResendQuotaError(response.error, emailKind);
  return { id: null, error: response.error, failureCode, retryLater: failureCode === "rate_limited" && resendRetryAfterMs(response.headers) === null };
}

/**
 * Post-payment emails (patient confirmation, invoice, owner notification) are
 * retried a few times within the same attempt, with a short backoff, when the
 * failure is transient (network, timeout, 5xx, rate limit). Each send carries
 * a stable Resend idempotency key, so a retry can never deliver the same email
 * twice. Exported as a mutable object so tests can shorten the delays.
 */
export const postPaymentDeliveryRetry = { delaysMs: [500, 1500] as number[] };

class PostPaymentEmailError extends Error {
  constructor(message: string, readonly failureCode: ResendDeliveryFailureCode, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PostPaymentEmailError";
  }
}

async function sendPostPaymentEmail(
  errors: { rejected: string; failed: string },
  message: ResendSendPayload,
  idempotencyKey?: string,
): Promise<string | null> {
  const delays = postPaymentDeliveryRetry.delaysMs;
  let lastError: PostPaymentEmailError | null = null;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (attempt > 0) await wait(delays[attempt - 1]);
    try {
      const { id, error, failureCode, retryLater } = await sendThroughResend(message, idempotencyKey ? { idempotencyKey } : undefined, "post_payment");
      if (!error) return id;
      lastError = new PostPaymentEmailError(`${errors.rejected}:${error.message}`, failureCode);
      // Neither a refused message nor a used-up quota gets through a few seconds
      // later, nor a rate limit whose retry-after exceeds what a request waits:
      // the job's own retry takes over.
      if (failureCode === "provider_rejected" || failureCode === "quota" || retryLater) break;
    } catch (error) {
      lastError = new PostPaymentEmailError(errors.failed, "delivery_exception", { cause: error });
    }
  }
  throw lastError ?? new PostPaymentEmailError(errors.failed, "delivery_exception");
}

/**
 * Why a post-payment email (confirmation, invoice, owner notification) did not
 * leave, read from the error its sender threw; null for any other error (PDF,
 * database).
 */
export function postPaymentEmailFailureCode(error: unknown): ResendDeliveryFailureCode | null {
  const cause = error instanceof PostPaymentEmailError ? error : error instanceof Error ? error.cause : null;
  return cause instanceof PostPaymentEmailError ? cause.failureCode : null;
}

export function buildHippocampusEmailShell(content: string, language: EmailLanguage = "fr") {
  return `
    <div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dbe4ee;border-radius:14px;overflow:hidden;">
        <div style="padding:18px 28px;background:#071827;border-bottom:3px solid #0891b2;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:0 14px 0 0;vertical-align:middle;"><img src="${HIPPOCAMPUS_LOGO_URL}" width="64" alt="Hippocampus Consulting" style="display:block;width:64px;height:64px;border:0;border-radius:8px;background:#ffffff;" /></td>
              <td style="vertical-align:middle;"><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#38bdf8;">ABL / HIPPOCAMPUS</div><div style="margin-top:5px;font-size:19px;font-weight:700;color:#ffffff;">Hippocampus Consulting</div></td>
            </tr>
          </table>
        </div>
        <div style="padding:28px;">${content}</div>
        <div style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;line-height:1.5;color:#64748b;">Dr. Ahmed Ben Lallahom · Hippocampus Consulting<br />${language === "en" ? "Professional and confidential communication" : "Communication professionnelle et confidentielle"}</div>
      </div>
    </div>
  `;
}

export async function sendAdminMfaCodeEmail(email: string, code: string) {
  const html = buildHippocampusEmailShell(`<h2 style="color:#0891b2">Validation de sécurité administrateur</h2><p>Un accès au tableau de bord Hippocampus Consulting vient d’être demandé.</p><p style="margin:24px 0;padding:18px;text-align:center;border-radius:10px;background:#f1f5f9;font-size:28px;letter-spacing:7px;font-weight:700;color:#0f172a">${escapeHtml(code)}</p><p>Ce code expire dans 10 minutes et ne doit être communiqué à personne. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.</p>`);
  const text = `Validation de sécurité administrateur\n\nCode : ${code}\n\nCe code expire dans 10 minutes. Ne le communiquez à personne.`;
  const { error } = await sendThroughResend({ from: FROM_EMAIL, to: [email], replyTo: RECRUITMENT_REPLY_TO, subject: "Code de sécurité — Hippocampus Consulting", html, text }, undefined, "admin_mfa");
  if (error) throw new Error(`admin_mfa_email_failed:${error.message}`);
}

// ---------------------------------------------------------------------------
// Patient emails (confirmation, invoice, reminder, refund / cancellation).
// Sender and Reply-To come from server/consultationContact.ts (Reply-To: the
// public contact email of the site, CONSULTATION_REPLY_TO to override). Every
// email has a plain-text part, the contact email and phone, times in "heure de
// Paris" and, when relevant, the cancellation policy. The free-text request of
// the booking is never included (health-data minimisation). They are written in
// the language of the booking: French for "fr", English otherwise (EN-01).
// ---------------------------------------------------------------------------

export type { EmailLanguage };

const PARIS_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Paris",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};
const PARIS_DATE_TIME_FORMAT = {
  fr: new Intl.DateTimeFormat("fr-FR", PARIS_DATE_TIME_OPTIONS),
  en: new Intl.DateTimeFormat("en-GB", PARIS_DATE_TIME_OPTIONS),
};
const EURO_FORMAT = {
  fr: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }),
  en: new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }),
};

/**
 * "mardi 20 octobre 2026 à 10:00 (heure de Paris)" or "Tuesday, 20 October
 * 2026 at 10:00 (Paris time)", whatever the server time zone.
 */
export function formatPatientDateTime(date: Date, language: EmailLanguage = "fr"): string {
  return `${PARIS_DATE_TIME_FORMAT[language].format(date)} (${language === "en" ? "Paris time" : "heure de Paris"})`;
}

/** "100,00 €" in French, "€100.00" in English (regular spaces, safe in every mail client). */
export function formatPatientAmount(amount: number | string, language: EmailLanguage = "fr"): string {
  return EURO_FORMAT[language].format(Number(amount)).replace(/[  ]/g, " ");
}

type PatientEmailContent = {
  subject: string;
  title: string;
  customerName: string;
  paragraphs: string[];
  details: Array<[label: string, value: string]>;
  link?: { label: string; url: string };
  closing?: string[];
  cancellationPolicy?: boolean;
  language?: EmailLanguage;
};

export type PatientEmail = { subject: string; html: string; text: string };

const PATIENT_EMAIL_COPY = {
  fr: {
    greeting: "Bonjour",
    labelSeparator: " :",
    cancellationPolicy: PATIENT_CANCELLATION_POLICY,
    contactBefore: "Une question, un report ou une annulation ? Écrivez-nous à ",
    contactMiddle: " ou appelez le ",
    contactAfter: " en indiquant votre référence. Vous pouvez aussi répondre directement à cet email.",
  },
  en: {
    greeting: "Hello",
    labelSeparator: ":",
    cancellationPolicy: PATIENT_CANCELLATION_POLICY_EN,
    contactBefore: "A question, a change or a cancellation? Write to us at ",
    contactMiddle: " or call ",
    contactAfter: ", quoting your reference. You can also reply directly to this email.",
  },
} as const;

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function buildPatientEmail(content: PatientEmailContent, contact: ConsultationContact = resolveConsultationContact()): PatientEmail {
  const copy = PATIENT_EMAIL_COPY[content.language ?? "fr"];
  const contactSentence = `${copy.contactBefore}${contact.email}${copy.contactMiddle}${contact.phone}${copy.contactAfter}`;
  const paragraph = (value: string) => `<p style="line-height:1.6;">${escapeHtml(value)}</p>`;
  const html = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">${escapeHtml(content.title)}</h2>
      <p>${copy.greeting} ${escapeHtml(content.customerName)},</p>
      ${content.paragraphs.map(paragraph).join("\n      ")}
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${content.details.map(([label, value]) => `<li style="padding: 4px 0;"><strong>${escapeHtml(label)}${copy.labelSeparator}</strong> ${escapeHtml(value)}</li>`).join("\n          ")}
          ${content.link ? `<li style="padding: 4px 0;"><strong>${escapeHtml(content.link.label)}${copy.labelSeparator}</strong> <a href="${escapeHtml(content.link.url)}">${escapeHtml(content.link.url)}</a></li>` : ""}
        </ul>
      </div>
      ${(content.closing ?? []).map(paragraph).join("\n      ")}
      ${content.cancellationPolicy ? `<p style="font-size:13px;line-height:1.55;color:#475569;">${escapeHtml(copy.cancellationPolicy)}</p>` : ""}
      <p style="font-size:13px;line-height:1.55;color:#475569;">${escapeHtml(copy.contactBefore)}<a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>${escapeHtml(copy.contactMiddle)}<a href="${escapeHtml(telHref(contact.phone))}">${escapeHtml(contact.phone)}</a>${escapeHtml(copy.contactAfter)}</p>
    `, content.language);
  const text = [
    content.title,
    "",
    `${copy.greeting} ${content.customerName},`,
    "",
    ...content.paragraphs.flatMap(value => [value, ""]),
    ...content.details.map(([label, value]) => `${label}${copy.labelSeparator} ${value}`),
    ...(content.link ? [`${content.link.label}${copy.labelSeparator} ${content.link.url}`] : []),
    "",
    ...(content.closing ?? []).flatMap(value => [value, ""]),
    ...(content.cancellationPolicy ? [copy.cancellationPolicy, ""] : []),
    contactSentence,
    "",
    "Dr Ahmed Ben Lallahom · Hippocampus Consulting",
  ].join("\n");
  return { subject: content.subject, html, text };
}

type PatientEmailAttachment = { filename: string; content: string; contentType?: string };

async function sendPatientEmail(
  errors: { rejected: string; failed: string },
  to: string,
  email: PatientEmail,
  options: { idempotencyKey?: string; attachments?: PatientEmailAttachment[] } = {},
) {
  const contact = resolveConsultationContact();
  return sendPostPaymentEmail(errors, {
    from: contact.from,
    to: [to],
    replyTo: contact.replyTo,
    subject: email.subject,
    html: email.html,
    text: email.text,
    ...(options.attachments ? { attachments: options.attachments } : {}),
  }, options.idempotencyKey);
}

const CONSULTATION_DURATION_MINUTES = 30;

export function buildBookingConfirmationEmail(
  input: { customerName: string; trackingId: string; appointmentDate: Date; finalPrice: number; meetLink?: string; language?: EmailLanguage; confirmedAt?: Date },
  contact = resolveConsultationContact(),
): PatientEmail & { attachments: PatientEmailAttachment[] } {
  const language = input.language ?? "fr";
  const calendarFilename = appointmentCalendarFilename(input.trackingId);
  // RES-05: the .ics is in the patient's language, at the exact UTC time; the
  // payment date as stamp keeps a retried email byte-identical.
  const calendar = buildAppointmentCalendarEvent({
    trackingId: input.trackingId,
    start: input.appointmentDate,
    durationMinutes: CONSULTATION_DURATION_MINUTES,
    stampedAt: input.confirmedAt ?? new Date(),
    language,
    modalityText: contact.modalityText,
    contact: { email: contact.email, phone: contact.phone },
  });
  const attachments = [{ filename: calendarFilename, content: Buffer.from(calendar, "utf8").toString("base64"), contentType: "text/calendar; charset=utf-8; method=PUBLISH" }];
  const email = language === "en"
    ? buildPatientEmail({
        subject: `Booking confirmation - ${input.trackingId}`,
        title: "Booking confirmation",
        customerName: input.customerName,
        paragraphs: ["Your payment has been received and your consultation with Dr Ahmed Ben Lallahom is confirmed. Your invoice is sent to you in a separate email."],
        details: [
          ["Reference", input.trackingId],
          ["Date and time", formatPatientDateTime(input.appointmentDate, language)],
          ["Duration", `${CONSULTATION_DURATION_MINUTES} minutes`],
          ["Amount paid", formatPatientAmount(input.finalPrice, language)],
          ...(contact.modalityText ? [["Consultation format", contact.modalityText] as [string, string]] : []),
        ],
        link: input.meetLink ? { label: "Video call link", url: input.meetLink } : undefined,
        closing: [
          `Add to my calendar: open the attached file “${calendarFilename}” (Google Calendar, Outlook, Apple Calendar…).`,
          "Keep your reference: you will be asked for it with any question. This scheduled consultation does not replace emergency care: in an emergency, call the emergency services.",
        ],
        cancellationPolicy: true,
        language,
      }, contact)
    : buildPatientEmail({
        subject: `Confirmation de réservation - ${input.trackingId}`,
        title: "Confirmation de réservation",
        customerName: input.customerName,
        paragraphs: ["Votre paiement a bien été reçu et votre consultation avec le Dr Ahmed Ben Lallahom est confirmée. Votre facture vous est envoyée dans un email séparé."],
        details: [
          ["Référence", input.trackingId],
          ["Date et heure", formatPatientDateTime(input.appointmentDate)],
          ["Durée", `${CONSULTATION_DURATION_MINUTES} minutes`],
          ["Montant payé", formatPatientAmount(input.finalPrice)],
          ...(contact.modalityText ? [["Déroulement", contact.modalityText] as [string, string]] : []),
        ],
        link: input.meetLink ? { label: "Lien de visioconférence", url: input.meetLink } : undefined,
        closing: [
          `Ajouter à mon agenda : ouvrez le fichier joint « ${calendarFilename} » (Google Agenda, Outlook, Calendrier Apple…).`,
          "Conservez votre référence : elle vous sera demandée pour toute question. Cette consultation programmée ne remplace pas une prise en charge d’urgence : en cas d’urgence, appelez les secours.",
        ],
        cancellationPolicy: true,
      }, contact);
  return { ...email, attachments };
}

export function buildBookingReminderEmail(input: { customerName: string; trackingId: string; appointmentDate: Date; language?: EmailLanguage }, contact = resolveConsultationContact()): PatientEmail {
  if (input.language === "en") {
    return buildPatientEmail({
      subject: `Reminder - Your consultation is coming up (${input.trackingId})`,
      title: "Reminder: your consultation is coming up",
      customerName: input.customerName,
      paragraphs: [`This is a reminder that your consultation with Dr Ahmed Ben Lallahom is scheduled for ${formatPatientDateTime(input.appointmentDate, "en")}.`],
      details: [
        ["Reference", input.trackingId],
        ["Date and time", formatPatientDateTime(input.appointmentDate, "en")],
        ...(contact.modalityText ? [["Consultation format", contact.modalityText] as [string, string]] : []),
      ],
      closing: ["If you need to cancel or reschedule your appointment, please let us know as soon as possible using the details below."],
      cancellationPolicy: true,
      language: "en",
    }, contact);
  }
  return buildPatientEmail({
    subject: `Rappel - Votre consultation approche (${input.trackingId})`,
    title: "Rappel : votre consultation approche",
    customerName: input.customerName,
    paragraphs: [`Nous vous rappelons que votre consultation avec le Dr Ahmed Ben Lallahom est prévue le ${formatPatientDateTime(input.appointmentDate)}.`],
    details: [
      ["Référence", input.trackingId],
      ["Date et heure", formatPatientDateTime(input.appointmentDate)],
      ...(contact.modalityText ? [["Déroulement", contact.modalityText] as [string, string]] : []),
    ],
    closing: ["Si vous devez annuler ou reporter votre rendez-vous, prévenez-nous dès que possible aux coordonnées ci-dessous."],
    cancellationPolicy: true,
  }, contact);
}

/** The PDF invoice stays in French; the English email says so in one sentence (EN-01). */
export function buildInvoiceEmail(input: { customerName: string; trackingId: string; finalPrice: number; invoiceNumber?: string; language?: EmailLanguage }, contact = resolveConsultationContact()): PatientEmail {
  if (input.language === "en") {
    return buildPatientEmail({
      subject: `Invoice - Consultation ${input.trackingId}`,
      title: "Your invoice",
      customerName: input.customerName,
      paragraphs: ["Your invoice for your consultation with Dr Ahmed Ben Lallahom, issued in French as required by French law, is attached."],
      details: [
        ...(input.invoiceNumber ? [["Invoice no.", input.invoiceNumber] as [string, string]] : []),
        ["Reference", input.trackingId],
        ["Amount", formatPatientAmount(input.finalPrice, "en")],
        ["Status", "Paid"],
      ],
      closing: ["Thank you for your trust."],
      language: "en",
    }, contact);
  }
  return buildPatientEmail({
    subject: `Facture - Consultation ${input.trackingId}`,
    title: "Votre facture",
    customerName: input.customerName,
    paragraphs: ["Veuillez trouver ci-joint la facture de votre consultation avec le Dr Ahmed Ben Lallahom."],
    details: [
      ...(input.invoiceNumber ? [["Facture n°", input.invoiceNumber] as [string, string]] : []),
      ["Référence", input.trackingId],
      ["Montant", formatPatientAmount(input.finalPrice)],
      ["Statut", "Payée"],
    ],
    closing: ["Merci de votre confiance."],
  }, contact);
}

/**
 * `confirmedAt` (the payment date) stamps the attached .ics: pass the same
 * value on every retry so that the email sent under the idempotency key never
 * changes.
 */
export async function sendConfirmationEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  appointmentDate: Date,
  finalPrice: number,
  meetLink?: string,
  delivery: { idempotencyKey?: string; language?: EmailLanguage; confirmedAt?: Date } = {},
) {
  try {
    const { attachments, ...email } = buildBookingConfirmationEmail({ customerName, trackingId, appointmentDate, finalPrice, meetLink, language: delivery.language, confirmedAt: delivery.confirmedAt });
    await sendPatientEmail({ rejected: "confirmation_email_rejected", failed: "confirmation_email_failed" }, customerEmail, email, { idempotencyKey: delivery.idempotencyKey, attachments });
    console.log("Confirmation email sent successfully");
  } catch (error) {
    throw new Error("confirmation_email_failed", { cause: error });
  }
}

/**
 * The owner's single "new paid booking" email (the former SMS substitute that
 * duplicated it is gone). Same short retries as the patient's emails (ABUS-03):
 * Resend's retry-after is respected, a refusal or a used-up quota is not sent
 * again within the attempt. Throws when it could not be delivered, so its own
 * fulfillment job is retried later.
 */
export async function sendOwnerNotificationEmail(
  customerName: string,
  customerEmail: string,
  customerPhone: string,
  trackingId: string,
  appointmentDate: Date,
  finalPrice: number,
  delivery: { idempotencyKey?: string; language?: string } = {},
) {
  const formattedDate = appointmentDate.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const notificationContent = [
    `Nouvelle réservation payée - ${trackingId}`,
    "",
    `Client : ${customerName}`,
    `Email : ${customerEmail}`,
    `Téléphone : ${customerPhone}`,
    `Date : ${formattedDate} (heure de Paris)`,
    `Montant : ${finalPrice} €`,
    // Language of the booking page; the patient's emails are in French only for FR (EN-01).
    `Langue : ${(delivery.language || "fr").toUpperCase()}`,
    "Objet de la demande : consultable uniquement dans le tableau de bord (jamais recopié par email).",
  ].join("\n");

  try {
    const email = buildOwnerNotificationEmail({ title: `Nouvelle réservation payée : ${customerName} - ${finalPrice} €`, content: notificationContent });
    await sendPostPaymentEmail({ rejected: "owner_notification_rejected", failed: "owner_notification_failed" }, email, delivery.idempotencyKey);
    console.log("Owner booking notification sent");
  } catch (error) {
    throw new Error("owner_notification_failed", { cause: error });
  }
}

export async function sendInvoiceEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  finalPrice: number,
  invoicePdfBuffer: Buffer,
  invoiceNumber?: string,
  delivery: { idempotencyKey?: string; language?: EmailLanguage } = {},
) {
  try {
    const email = buildInvoiceEmail({ customerName, trackingId, finalPrice, invoiceNumber, language: delivery.language });
    await sendPatientEmail({ rejected: "invoice_email_rejected", failed: "invoice_email_failed" }, customerEmail, email, {
      idempotencyKey: delivery.idempotencyKey,
      attachments: [
        {
          filename: `Facture-${invoiceNumber ?? trackingId}.pdf`,
          content: invoicePdfBuffer.toString("base64"),
        },
      ],
    });

    console.log("Invoice email sent successfully");
  } catch (error) {
    throw new Error("invoice_email_failed", { cause: error });
  }
}

export async function sendCustomerConfirmationSMS(
  customerPhone: string,
  trackingId: string,
  appointmentDate: Date
): Promise<boolean> {
  // No customer SMS provider is configured. Keep the status truthful rather
  // than recording a delivery that never happened.
  void customerPhone;
  void trackingId;
  void appointmentDate;
  return false;
}

export type RefundEmailContext = "refund" | "practitioner_cancellation" | "unconfirmed_payment";

export function buildRefundEmail(input: {
  customerName: string;
  trackingId: string;
  appointmentDate: Date;
  refundAmount: string;
  context?: RefundEmailContext;
  reason?: string;
  language?: EmailLanguage;
}, contact = resolveConsultationContact()): PatientEmail {
  const context = input.context ?? "refund";
  const language = input.language ?? "fr";
  const contextCopy = language === "en"
    ? (context === "practitioner_cancellation"
        ? {
            subject: `Cancellation of your consultation - ${input.trackingId}`,
            title: "Cancellation of your consultation",
            intro: "We regret to inform you that your consultation had to be cancelled by the practitioner. The amount paid is refunded to you in full.",
            dateLabel: "Cancelled consultation",
          }
        : context === "unconfirmed_payment"
          ? {
              subject: `Refund of your payment - ${input.trackingId}`,
              title: "Refund of your payment",
              intro: "Your payment was received when the slot was no longer reserved in your name (temporary booking expired or cancelled). It is refunded to you in full.",
              dateLabel: "Requested slot",
            }
          : {
              subject: `Refund confirmed - ${input.trackingId}`,
              title: "Refund confirmation",
              intro: "The refund of your consultation has been recorded.",
              dateLabel: "Original consultation",
            })
    : (context === "practitioner_cancellation"
        ? {
            subject: `Annulation de votre consultation - ${input.trackingId}`,
            title: "Annulation de votre consultation",
            intro: "Nous sommes au regret de vous informer que votre consultation a dû être annulée par le praticien. Le montant payé vous est intégralement remboursé.",
            dateLabel: "Consultation annulée",
          }
        : context === "unconfirmed_payment"
          ? {
              subject: `Remboursement de votre paiement - ${input.trackingId}`,
              title: "Remboursement de votre paiement",
              intro: "Votre paiement a été reçu alors que le créneau n’était plus réservé à votre nom (réservation temporaire expirée ou annulée). Il vous est intégralement remboursé.",
              dateLabel: "Créneau demandé",
            }
          : {
              subject: `Remboursement confirmé - ${input.trackingId}`,
              title: "Confirmation de remboursement",
              intro: "Le remboursement de votre consultation a été enregistré.",
              dateLabel: "Consultation initiale",
            });
  const copy = language === "en"
    ? {
        reference: "Reference",
        reason: "Reason",
        refunded: "Amount refunded",
        delay: "The time it takes for the refund to appear on your account depends on your bank.",
        rebook: "You can book a new slot at any time on the website. We apologise for the inconvenience.",
      }
    : {
        reference: "Référence",
        reason: "Motif",
        refunded: "Montant remboursé",
        delay: "Le délai d’apparition du remboursement sur votre compte dépend de votre établissement bancaire.",
        rebook: "Vous pouvez réserver un nouveau créneau à tout moment sur le site. Nous vous prions de nous excuser pour ce contretemps.",
      };
  // The reason is the practitioner's own text, sent as typed whatever the language.
  const reason = input.reason?.trim();
  return buildPatientEmail({
    subject: contextCopy.subject,
    title: contextCopy.title,
    customerName: input.customerName,
    paragraphs: [contextCopy.intro],
    details: [
      [copy.reference, input.trackingId],
      [contextCopy.dateLabel, formatPatientDateTime(input.appointmentDate, language)],
      ...(reason ? [[copy.reason, reason] as [string, string]] : []),
      [copy.refunded, formatPatientAmount(input.refundAmount, language)],
    ],
    closing: [
      copy.delay,
      ...(context === "practitioner_cancellation" ? [copy.rebook] : []),
    ],
    language,
  }, contact);
}

/**
 * Refund notice to the patient. "practitioner_cancellation" announces that the
 * practitioner cancelled the consultation (with the reason given to the
 * patient); "unconfirmed_payment" explains that a payment could not be attached
 * to a reserved slot. Returns whether the email was accepted, so the admin can
 * be told to contact the patient otherwise.
 */
export async function sendRefundConfirmationEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  appointmentDate: Date,
  refundAmount: string,
  details: { context?: RefundEmailContext; reason?: string; idempotencyKey?: string; language?: EmailLanguage } = {},
): Promise<boolean> {
  try {
    const email = buildRefundEmail({ customerName, trackingId, appointmentDate, refundAmount, context: details.context, reason: details.reason, language: details.language });
    await sendPatientEmail({ rejected: "refund_email_rejected", failed: "refund_email_failed" }, customerEmail, email, { idempotencyKey: details.idempotencyKey });
    console.log("Refund email sent successfully");
    return true;
  } catch {
    console.error("Refund email delivery failed");
    return false;
  }
}

/**
 * Patient notice when a Stripe payment could not be attached to the booked
 * slot (hold expired or released, other session): the owner has been alerted
 * and will refund or reschedule. Best effort, idempotent per Checkout session.
 */
export function buildUnconfirmablePaymentEmail(input: { customerName: string; trackingId: string; appointmentDate: Date; amountCents: number | null; language?: EmailLanguage }, contact = resolveConsultationContact()): PatientEmail {
  if (input.language === "en") {
    return buildPatientEmail({
      subject: `Your payment has been received: we will sort out your booking - ${input.trackingId}`,
      title: "Your payment has been received, we will sort out your booking",
      customerName: input.customerName,
      paragraphs: [
        "Your payment has been received, but the chosen slot could not be confirmed to you automatically: the temporary booking had expired or the slot was no longer available at the time of payment.",
        "Our team has been notified and will contact you to refund you in full or offer you another slot. You have nothing more to pay.",
      ],
      details: [
        ["Reference", input.trackingId],
        ["Requested slot", formatPatientDateTime(input.appointmentDate, "en")],
        ...(input.amountCents === null ? [] : [["Amount received", formatPatientAmount(input.amountCents / 100, "en")] as [string, string]]),
      ],
      language: "en",
    }, contact);
  }
  return buildPatientEmail({
    subject: `Votre paiement a été reçu : réservation à régulariser - ${input.trackingId}`,
    title: "Votre paiement a été reçu, réservation à régulariser",
    customerName: input.customerName,
    paragraphs: [
      "Votre paiement a bien été reçu, mais le créneau choisi n’a pas pu vous être confirmé automatiquement : la réservation temporaire avait expiré ou le créneau n’était plus disponible au moment du paiement.",
      "Notre équipe a été prévenue et vous contactera pour vous rembourser intégralement ou vous proposer un autre créneau. Vous n’avez rien à payer de plus.",
    ],
    details: [
      ["Référence", input.trackingId],
      ["Créneau demandé", formatPatientDateTime(input.appointmentDate)],
      ...(input.amountCents === null ? [] : [["Montant reçu", formatPatientAmount(input.amountCents / 100)] as [string, string]]),
    ],
  }, contact);
}

export async function sendUnconfirmablePaymentEmail(
  customerEmail: string,
  input: { customerName: string; trackingId: string; appointmentDate: Date; amountCents: number | null; language?: EmailLanguage },
  idempotencyKey: string,
): Promise<boolean> {
  try {
    await sendPatientEmail({ rejected: "unconfirmable_payment_email_rejected", failed: "unconfirmable_payment_email_failed" }, customerEmail, buildUnconfirmablePaymentEmail(input), { idempotencyKey });
    return true;
  } catch {
    console.error("Unconfirmable payment email delivery failed");
    return false;
  }
}

export async function sendReminderEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  appointmentDate: Date,
  options: { language?: EmailLanguage } = {},
) {
  try {
    const email = buildBookingReminderEmail({ customerName, trackingId, appointmentDate, language: options.language });
    // One reminder per appointment: the key makes a retried claim harmless.
    await sendPatientEmail({ rejected: "reminder_email_rejected", failed: "reminder_email_failed" }, customerEmail, email, {
      idempotencyKey: `appointment-reminder-${trackingId}`,
    });
    console.log("Reminder email sent successfully");
  } catch (error) {
    throw new Error("reminder_email_failed", { cause: error });
  }
}

export async function sendCvApplicationConfirmationEmail(
  candidateEmail: string,
  candidateFirstName: string,
  trackingId: string,
  candidatePortalInviteUrl?: string,
  idempotencyKey = `cv-application-confirmation-${trackingId}-attempt-1`,
  language: EmailLanguage = "fr",
): Promise<CvApplicationConfirmationDelivery> {
  // In the language of the application form (EN-02); the link opens the English page (?lang=en).
  const copy = language === "en"
    ? {
        subject: `Application received - ${trackingId}`,
        title: "Application received — Hippocampus Consulting",
        received: "We confirm receipt of your international recruitment application.",
        trackingNumber: "Tracking number:",
        review: "Your profile will be reviewed against the available opportunities and the criteria of the country concerned. We will contact you if your profile matches a search.",
        portalTitle: "Your secure candidate portal",
        portalText: "You can create your portal access to upload your administrative documents to your private vault later. Activating your email address will still be required.",
        portalAction: "Create my candidate portal",
        noPatientData: "Do not send patient data, medical records or clinical documents with your application.",
        spam: "If you cannot find this email, check your Spam or Junk folder, then add recrutement@drahmedbenlallahom.com to your contacts.",
      }
    : {
        subject: `Candidature reçue - ${trackingId}`,
        title: "Candidature reçue — Hippocampus Consulting",
        received: "Nous confirmons la réception de votre candidature de recrutement international.",
        trackingNumber: "Numéro de suivi :",
        review: "Votre profil sera examiné selon les opportunités disponibles et les critères du pays concerné. Nous vous contacterons si votre profil correspond à une recherche.",
        portalTitle: "Votre espace candidat sécurisé",
        portalText: "Vous pouvez créer un accès pour déposer ultérieurement vos documents administratifs dans votre coffre privé. L’activation de votre adresse email restera obligatoire.",
        portalAction: "Créer mon espace candidat",
        noPatientData: "Ne transmettez pas de données de patients, de dossiers médicaux ou de documents cliniques dans votre candidature.",
        spam: "Si vous ne retrouvez pas cet email, vérifiez votre dossier Spam ou Courriers indésirables, puis ajoutez recrutement@drahmedbenlallahom.com à vos contacts.",
      };
  const inviteUrl = candidatePortalInviteUrl ? withEmailLanguage(candidatePortalInviteUrl, language) : undefined;
  const candidatePortalInvitation = inviteUrl
      ? `<div style="margin:24px 0;padding:18px;border:1px solid #bae6fd;border-radius:10px;background:#f0f9ff;"><h3 style="margin:0 0 8px;color:#0e7490;">${copy.portalTitle}</h3><p style="margin:0 0 14px;">${copy.portalText}</p><p style="margin:0;"><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700;">${copy.portalAction}</a></p><p style="margin:12px 0 0;color:#475569;font-size:13px;">${escapeHtml(candidateInvitationValidityNote(language))}</p></div>`
      : "";
  const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">${copy.title}</h2>
      <p>${escapeHtml(unverifiedRecipientGreeting(candidateFirstName, language))}</p>
      <p>${copy.received}</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>${copy.trackingNumber}</strong> ${escapeHtml(trackingId)}</p>
      </div>
      <p>${copy.review}</p>
      ${candidatePortalInvitation}
      <p>${copy.noPatientData}</p>
      <p style="color:#64748b;font-size:13px;">${copy.spam}</p>
    `, language);

  const message = {
    from: FROM_EMAIL,
    to: [candidateEmail],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: copy.subject,
    html: emailContent,
    tags: buildResendApplicationTags(trackingId),
  };
  const sendOnce = async (): Promise<CvApplicationConfirmationDelivery> => {
    try {
      const { id, error, failureCode } = await sendThroughResend(message, { idempotencyKey }, "cv_confirmation");
      if (error) return { status: "failed", providerEmailId: null, failureCode };
      if (!id) return { status: "failed", providerEmailId: null, failureCode: "delivery_exception" };
      return { status: "sent", providerEmailId: id, failureCode: null };
    } catch {
      return { status: "failed", providerEmailId: null, failureCode: "delivery_exception" };
    }
  };

  const firstAttempt = await sendOnce();
  if (firstAttempt.failureCode !== "delivery_exception") return firstAttempt;
  return sendOnce();
}

export type CvApplicationConfirmationDelivery = {
  status: "sent" | "failed";
  providerEmailId: string | null;
  failureCode: ResendDeliveryFailureCode | null;
};

export type RecruitmentEmailTemplate = "profile_interest" | "additional_information";
export type RecruitmentEmailLanguage = "fr" | "en";

type RecruitmentTemplateOptions = {
  language?: RecruitmentEmailLanguage;
  customRequest?: string;
};

function textToSafeHtml(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

export function buildRecruitmentTemplateEmail(
  candidateFirstName: string,
  trackingId: string,
  template: RecruitmentEmailTemplate,
  options: RecruitmentTemplateOptions = {},
) {
  const language = options.language || "fr";
  const isInterest = template === "profile_interest";
  const copy = language === "en"
    ? {
        heading: "Hippocampus Consulting",
        reference: "Reference",
        privacy: "This message concerns your professional application only. You may request access, rectification or deletion of your data through our GDPR form.",
        interestSubject: `Your profile has caught our attention — ${trackingId}`,
        complementSubject: `Additional information requested for your application — ${trackingId}`,
        interestBody: "Following an initial human review of your application, we would like to speak with you about international opportunities that may fit your profile. Please reply with your availability and an updated telephone number if applicable.",
        complementBody: "To continue the human review of your application, please provide the additional professional information or documents requested by our team. Never send patient information or clinical records.",
        requested: "Requested documents or information",
      }
    : {
        heading: "Hippocampus Consulting",
        reference: "Référence",
        privacy: "Cette communication concerne uniquement votre candidature professionnelle. Vous pouvez demander l’accès, la rectification ou la suppression de vos données via notre formulaire RGPD.",
        interestSubject: `Votre profil nous intéresse — ${trackingId}`,
        complementSubject: `Complément d’information concernant votre candidature — ${trackingId}`,
        interestBody: "Après une première revue humaine de votre candidature, nous souhaiterions échanger avec vous au sujet des opportunités internationales susceptibles de correspondre à votre profil. Merci de nous répondre avec vos disponibilités et votre numéro de téléphone si celui-ci a changé.",
        complementBody: "Afin de poursuivre l’examen humain de votre candidature, merci de nous transmettre les informations ou documents professionnels complémentaires demandés par notre équipe. Ne transmettez jamais de données de patients ni de dossier clinique.",
        requested: "Documents ou informations demandés",
      };
  const subject = isInterest ? copy.interestSubject : copy.complementSubject;
  const body = isInterest ? copy.interestBody : copy.complementBody;
  const customRequest = !isInterest && options.customRequest?.trim()
    ? `<div style="background: #f8fafc; border-radius: 8px; padding: 14px; margin: 16px 0;"><strong>${copy.requested}</strong><br />${textToSafeHtml(options.customRequest.trim())}</div>`
    : "";
  return {
    subject,
    html: buildHippocampusEmailShell(`
        <h2 style="color: #0891b2;">${copy.heading}</h2>
        <p>${escapeHtml(unverifiedRecipientGreeting(candidateFirstName, language))}</p>
        <p>${escapeHtml(body)}</p>
        ${customRequest}
        <p><strong>${copy.reference}:</strong> ${escapeHtml(trackingId)}</p>
        <p>${copy.privacy}</p>
    `, language),
  };
}

export async function sendRecruitmentTemplateEmail(
  candidateEmail: string,
  candidateFirstName: string,
  trackingId: string,
  template: RecruitmentEmailTemplate,
  options: RecruitmentTemplateOptions = {},
): Promise<{ id?: string }> {
  const message = buildRecruitmentTemplateEmail(candidateFirstName, trackingId, template, options);

  const { id, error } = await sendThroughResend({
    from: FROM_EMAIL,
    to: [candidateEmail],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: message.subject,
    html: message.html,
  }, undefined, "recruitment_template");
  if (error) throw new Error(`Resend recruitment email failed: ${error.message}`);
  return { id: id ?? undefined };
}

export async function sendRecruitmentCampaignEmail(input: {
  candidateEmail: string;
  candidateFirstName: string;
  campaignTitle: string;
  subject: string;
  body: string;
  language: RecruitmentEmailLanguage;
  unsubscribeUrl: string;
}): Promise<{ id?: string }> {
  const copy = input.language === "en"
    ? { footer: "This offer concerns your professional profile.", unsubscribe: "Unsubscribe from future recruitment opportunities" }
    : { footer: "Cette offre concerne votre profil professionnel.", unsubscribe: "Ne plus recevoir d’opportunités de recrutement" };
  const { id, error } = await sendThroughResend({
    from: FROM_EMAIL,
    to: [input.candidateEmail],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: input.subject,
    html: buildHippocampusEmailShell(`
        <h2 style="color: #0891b2;">${escapeHtml(input.campaignTitle)}</h2>
        <p>${escapeHtml(unverifiedRecipientGreeting(input.candidateFirstName, input.language))}</p>
        <p>${textToSafeHtml(input.body)}</p>
        <p style="color: #64748b;">${copy.footer}</p>
        <p style="font-size: 12px;"><a href="${escapeHtml(input.unsubscribeUrl)}" style="color: #0e7490;">${copy.unsubscribe}</a></p>
    `, input.language),
  }, undefined, "recruitment_campaign");
  if (error) throw new Error(`Resend campaign email failed: ${error.message}`);
  return { id: id ?? undefined };
}

export type CandidatePortalAccessEmailContentInput = {
  to: string;
  firstName: string;
  kind: "verify" | "reset" | "invite";
  actionUrl: string;
  applicationReference?: string;
  /** French by default; English for a candidate who uses the site in another language (EN-02). */
  language?: EmailLanguage;
};

export type CandidatePortalAccessEmailInput = CandidatePortalAccessEmailContentInput & {
  idempotencyKey: string;
};

export type CandidatePortalAccessEmailFailureCode = ResendDeliveryFailureCode;

class CandidatePortalAccessEmailError extends Error {
  constructor(
    readonly failureCode: CandidatePortalAccessEmailFailureCode,
    readonly providerErrorName: string | null,
    readonly providerStatusCode: number | null,
  ) {
    super(failureCode === "delivery_exception"
      ? "Resend candidate access email delivery uncertain"
      : `Resend candidate access email failed: ${failureCode === "provider_rejected" ? "provider rejected request" : failureCode}`);
    this.name = "CandidatePortalAccessEmailError";
  }
}

export function candidatePortalAccessEmailFailureCode(error: unknown): CandidatePortalAccessEmailFailureCode {
  if (error instanceof CandidatePortalAccessEmailError) return error.failureCode;
  return "delivery_exception";
}

function resendCandidateAccessFailure(error: { name?: string; statusCode?: number | null }): CandidatePortalAccessEmailError {
  const statusCode = typeof error.statusCode === "number" ? error.statusCode : null;
  const providerErrorName = typeof error.name === "string" ? error.name : null;
  return new CandidatePortalAccessEmailError(
    resendDeliveryFailureCode(error),
    providerErrorName,
    statusCode,
  );
}

export function buildCandidatePortalAccessIdempotencyKey(
  kind: "verify" | "reset",
  tokenHash: string,
): string {
  const deliveryKind = kind === "verify" ? "activation" : "password-reset";
  return `candidate-portal-${deliveryKind}-${tokenHash.slice(0, 40)}`;
}

function invitationReferenceFromIdempotencyKey(idempotencyKey?: string) {
  if (!idempotencyKey) return null;
  const match = /^candidate-portal-invitation-([A-Za-z0-9_-]{3,64})-attempt-[1-9]\d*$/.exec(idempotencyKey);
  return match?.[1] || null;
}

/** Validity sentence of the "create my candidate space" invitation link (CAND-11). */
export function candidateInvitationValidityNote(language: EmailLanguage = "fr"): string {
  if (language === "en") {
    return `This invitation link is valid for ${formatCandidateLinkValidity(CANDIDATE_INVITATION_MAX_AGE_MS, "en")}. After that, you can still create your portal from the “Candidate portal” page of the website, with the same email address.`;
  }
  return `Ce lien d’invitation est valable ${formatCandidateLinkValidity(CANDIDATE_INVITATION_MAX_AGE_MS)}. Passé ce délai, vous pourrez toujours créer votre espace depuis la page « Espace candidat » du site, avec la même adresse email.`;
}

const CANDIDATE_ACCESS_EMAIL_COPY_EN = {
  verify: {
    subject: "Confirm your email address — Hippocampus candidate portal",
    title: "Confirm your email address",
    instruction: "You are receiving this email because a candidate portal has just been created with this address. To activate it, click the button below: you will confirm your email address and choose your password on the page that opens.",
    action: "Confirm my email address and choose my password",
    securityNote: `This personal link is valid for ${formatCandidateLinkValidity(CANDIDATE_TOKEN_MAX_AGE_MS, "en")} and can only be used once. If you did not request this candidate portal, ignore this email: no access will be activated and no password will be created.`,
  },
  reset: {
    subject: "Reset your password — Hippocampus Consulting",
    title: "Reset your password",
    instruction: "A password reset request has been received. Choose a new password by clicking the button below.",
    action: "Reset my password",
    securityNote: `This personal link is valid for ${formatCandidateLinkValidity(CANDIDATE_TOKEN_MAX_AGE_MS, "en")}. If you did not make this request, you can ignore this email.`,
  },
  invite: {
    subject: "Create your candidate portal — Hippocampus Consulting",
    title: "Create your candidate portal",
    instruction: "Our team invites you to create your secure candidate portal to upload and track your administrative documents. After confirming your details, you will receive a link to activate your email address and choose your password.",
    action: "Create my candidate portal",
    securityNote: `This secure, personal link gives no access until your email address is activated and your password chosen. ${candidateInvitationValidityNote("en")}`,
  },
  footer: "This email is sent by Hippocampus Consulting from recrutement@drahmedbenlallahom.com. If you cannot find this email, check your Spam or Junk folder, then add this address to your contacts.",
} as const;

export function buildCandidatePortalAccessEmail(input: CandidatePortalAccessEmailContentInput) {
  const language = input.language ?? "fr";
  const greeting = unverifiedRecipientGreeting(input.firstName, language);
  // The page opened by the link is shown in the language of the email (?lang=en).
  const actionUrl = withEmailLanguage(input.actionUrl, language);
  const footer = language === "en"
    ? CANDIDATE_ACCESS_EMAIL_COPY_EN.footer
    : "Cet email est envoyé par Hippocampus Consulting depuis recrutement@drahmedbenlallahom.com. Si vous ne retrouvez pas cet email, vérifiez votre dossier Spam ou Courriers indésirables, puis ajoutez cette adresse à vos contacts.";
  const copy = language === "en" ? CANDIDATE_ACCESS_EMAIL_COPY_EN[input.kind] : input.kind === "verify"
    ? {
        subject: "Confirmez votre adresse email — Espace candidat Hippocampus",
        title: "Confirmez votre adresse email",
        instruction: "Vous recevez cet email parce qu’un espace candidat vient d’être créé avec cette adresse. Pour l’activer, cliquez sur le bouton ci-dessous : vous confirmerez votre adresse email et choisirez votre mot de passe sur la page qui s’ouvre.",
        action: "Confirmer mon adresse email et choisir mon mot de passe",
        securityNote: `Ce lien personnel est valable ${formatCandidateLinkValidity(CANDIDATE_TOKEN_MAX_AGE_MS)} et ne peut servir qu’une fois. Si vous n’avez pas demandé cet espace candidat, ignorez cet email : aucun accès ne sera activé et aucun mot de passe ne sera créé.`,
      }
    : input.kind === "reset"
      ? {
          subject: "Réinitialisez votre mot de passe — Hippocampus Consulting",
          title: "Réinitialisez votre mot de passe",
          instruction: "Une demande de réinitialisation a été reçue. Choisissez un nouveau mot de passe en cliquant sur le bouton ci-dessous.",
          action: "Réinitialiser mon mot de passe",
          securityNote: `Ce lien personnel est valable ${formatCandidateLinkValidity(CANDIDATE_TOKEN_MAX_AGE_MS)}. Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet email.`,
        }
      : {
          subject: "Créez votre espace candidat — Hippocampus Consulting",
          title: "Créez votre espace candidat",
          instruction: "Notre équipe vous invite à créer votre espace candidat sécurisé pour déposer et suivre vos documents administratifs. Après avoir confirmé vos informations, vous recevrez un lien pour activer votre adresse email et choisir votre mot de passe.",
          action: "Créer mon espace candidat",
          securityNote: `Ce lien sécurisé et personnel ne donne aucun accès tant que votre adresse email n’est pas activée et votre mot de passe choisi. ${candidateInvitationValidityNote()}`,
        };
  return {
    subject: copy.subject,
    html: buildHippocampusEmailShell(`
        <h2 style="color:#0891b2;">${copy.title}</h2>
        <p>${escapeHtml(greeting)}</p>
        <p>${copy.instruction}</p>
        <p style="margin:24px 0;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700;">${copy.action}</a></p>
        <p style="color:#64748b;font-size:13px;">${copy.securityNote}</p>
        <p style="color:#64748b;font-size:13px;">${footer}</p>
    `, language),
    text: `${copy.title}\n\n${greeting}\n\n${copy.instruction}\n\n${actionUrl}\n\n${copy.securityNote}\n\n${footer}`,
  };
}

export async function sendCandidatePortalAccessEmail(input: CandidatePortalAccessEmailInput): Promise<{ id: string }> {
  const message = buildCandidatePortalAccessEmail(input);
  const applicationReference = input.applicationReference
    || (input.kind === "invite" ? invitationReferenceFromIdempotencyKey(input.idempotencyKey) : null);
  const correlationTags = applicationReference && input.kind !== "reset"
    ? buildResendApplicationTags(
        applicationReference,
        input.kind === "verify" ? RESEND_APPLICATION_ACTIVATION_KIND : RESEND_APPLICATION_INVITATION_KIND,
      )
    : undefined;

  const sendOnce = async (): Promise<{ id: string }> => {
    const { id, error } = await sendThroughResend(
      {
        from: FROM_EMAIL,
        to: [input.to],
        replyTo: RECRUITMENT_REPLY_TO,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(correlationTags ? { tags: correlationTags } : {}),
      },
      { idempotencyKey: input.idempotencyKey },
      "candidate_access",
    );
    if (error) throw resendCandidateAccessFailure(error);
    if (!id) throw new CandidatePortalAccessEmailError("delivery_exception", null, null);
    return { id };
  };

  try {
    return await sendOnce();
  } catch (firstError) {
    // A rate limit was already retried after its delay; a refusal or a used-up quota would fail again.
    if (candidatePortalAccessEmailFailureCode(firstError) !== "delivery_exception") {
      throw firstError;
    }
    try {
      return await sendOnce();
    } catch (retryError) {
      throw retryError;
    }
  }
}
