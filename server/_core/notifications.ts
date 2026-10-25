import { Resend } from "resend";
import { notifyOwner } from "./notification";
import { CANDIDATE_INVITATION_MAX_AGE_MS, CANDIDATE_TOKEN_MAX_AGE_MS, formatCandidateLinkValidity } from "../candidateAuth";
import { PATIENT_CANCELLATION_POLICY, resolveConsultationContact, type ConsultationContact } from "../consultationContact";
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
// A dot glued to two letters is a domain name ("colis-phish.example"), not an initial.
const GREETING_DOMAIN_PATTERN = new RegExp("\\.\\p{L}{2}", "u");

/**
 * Greeting of an email sent to an address nobody has verified yet (MAIL-01).
 * Anyone can type someone else's address in these public forms, so the free
 * text of the visitor must not reach the email: the first name is kept only
 * when it looks like one (Unicode letters, spaces, ' ’ . -, at most 40
 * characters, no domain name), otherwise the greeting is neutral. A name never
 * makes a form fail. Plain text: escape it before putting it in HTML.
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

type ResendDeliveryFailureCode = "provider_rejected" | "delivery_exception";

function resendDeliveryFailureCode(error: { name?: string; statusCode?: number | null }): ResendDeliveryFailureCode {
  const statusCode = typeof error.statusCode === "number" ? error.statusCode : null;
  const providerErrorName = typeof error.name === "string" ? error.name : null;
  return statusCode === null
    || statusCode === 408
    || statusCode >= 500
    || providerErrorName === "concurrent_idempotent_requests"
    ? "delivery_exception"
    : "provider_rejected";
}

/**
 * Post-payment emails (patient confirmation, invoice, owner notification) are
 * retried a few times within the same attempt, with a short backoff, when the
 * failure is transient (network, timeout, 5xx). Each send carries a stable
 * Resend idempotency key, so a retry can never deliver the same email twice.
 * Exported as a mutable object so tests can shorten the delays.
 */
export const postPaymentDeliveryRetry = { delaysMs: [500, 1500] as number[] };

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

class PostPaymentEmailError extends Error {
  constructor(message: string, readonly failureCode: ResendDeliveryFailureCode, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PostPaymentEmailError";
  }
}

type ResendSendPayload = Parameters<Resend["emails"]["send"]>[0];

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
      const { data, error } = await getResendClient().emails.send(message, idempotencyKey ? { idempotencyKey } : undefined);
      if (!error) return data?.id ?? null;
      const failureCode = resendDeliveryFailureCode(error);
      lastError = new PostPaymentEmailError(`${errors.rejected}:${error.message}`, failureCode);
      if (failureCode === "provider_rejected") break;
    } catch (error) {
      lastError = new PostPaymentEmailError(errors.failed, "delivery_exception", { cause: error });
    }
  }
  throw lastError ?? new PostPaymentEmailError(errors.failed, "delivery_exception");
}

export function buildHippocampusEmailShell(content: string) {
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
        <div style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;line-height:1.5;color:#64748b;">Dr. Ahmed Ben Lallahom · Hippocampus Consulting<br />Communication professionnelle et confidentielle</div>
      </div>
    </div>
  `;
}

export async function sendAdminMfaCodeEmail(email: string, code: string) {
  const html = buildHippocampusEmailShell(`<h2 style="color:#0891b2">Validation de sécurité administrateur</h2><p>Un accès au tableau de bord Hippocampus Consulting vient d’être demandé.</p><p style="margin:24px 0;padding:18px;text-align:center;border-radius:10px;background:#f1f5f9;font-size:28px;letter-spacing:7px;font-weight:700;color:#0f172a">${escapeHtml(code)}</p><p>Ce code expire dans 10 minutes et ne doit être communiqué à personne. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.</p>`);
  const text = `Validation de sécurité administrateur\n\nCode : ${code}\n\nCe code expire dans 10 minutes. Ne le communiquez à personne.`;
  const { error } = await getResendClient().emails.send({ from: FROM_EMAIL, to: [email], replyTo: RECRUITMENT_REPLY_TO, subject: "Code de sécurité — Hippocampus Consulting", html, text });
  if (error) throw new Error(`admin_mfa_email_failed:${error.message}`);
}

// ---------------------------------------------------------------------------
// Patient emails (confirmation, invoice, reminder, refund / cancellation).
// Sender and Reply-To come from server/consultationContact.ts (Reply-To: the
// public contact email of the site, CONSULTATION_REPLY_TO to override). Every
// email has a plain-text part, the contact email and phone, times in "heure de
// Paris" and, when relevant, the cancellation policy. The free-text request of
// the booking is never included (health-data minimisation).
// ---------------------------------------------------------------------------

const PARIS_DATE_TIME_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const EURO_FORMAT = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** "mardi 20 octobre 2026 à 10:00 (heure de Paris)", whatever the server time zone. */
export function formatPatientDateTime(date: Date): string {
  return `${PARIS_DATE_TIME_FORMAT.format(date)} (heure de Paris)`;
}

/** French amount: "100,00 €" (regular spaces, safe in every mail client). */
export function formatPatientAmount(amount: number | string): string {
  return EURO_FORMAT.format(Number(amount)).replace(/[  ]/g, " ");
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
};

export type PatientEmail = { subject: string; html: string; text: string };

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function buildPatientEmail(content: PatientEmailContent, contact: ConsultationContact = resolveConsultationContact()): PatientEmail {
  const contactSentence = `Une question, un report ou une annulation ? Écrivez-nous à ${contact.email} ou appelez le ${contact.phone} en indiquant votre référence. Vous pouvez aussi répondre directement à cet email.`;
  const paragraph = (value: string) => `<p style="line-height:1.6;">${escapeHtml(value)}</p>`;
  const html = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">${escapeHtml(content.title)}</h2>
      <p>Bonjour ${escapeHtml(content.customerName)},</p>
      ${content.paragraphs.map(paragraph).join("\n      ")}
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${content.details.map(([label, value]) => `<li style="padding: 4px 0;"><strong>${escapeHtml(label)} :</strong> ${escapeHtml(value)}</li>`).join("\n          ")}
          ${content.link ? `<li style="padding: 4px 0;"><strong>${escapeHtml(content.link.label)} :</strong> <a href="${escapeHtml(content.link.url)}">${escapeHtml(content.link.url)}</a></li>` : ""}
        </ul>
      </div>
      ${(content.closing ?? []).map(paragraph).join("\n      ")}
      ${content.cancellationPolicy ? `<p style="font-size:13px;line-height:1.55;color:#475569;">${escapeHtml(PATIENT_CANCELLATION_POLICY)}</p>` : ""}
      <p style="font-size:13px;line-height:1.55;color:#475569;">Une question, un report ou une annulation ? Écrivez-nous à <a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a> ou appelez le <a href="${escapeHtml(telHref(contact.phone))}">${escapeHtml(contact.phone)}</a> en indiquant votre référence. Vous pouvez aussi répondre directement à cet email.</p>
    `);
  const text = [
    content.title,
    "",
    `Bonjour ${content.customerName},`,
    "",
    ...content.paragraphs.flatMap(value => [value, ""]),
    ...content.details.map(([label, value]) => `${label} : ${value}`),
    ...(content.link ? [`${content.link.label} : ${content.link.url}`] : []),
    "",
    ...(content.closing ?? []).flatMap(value => [value, ""]),
    ...(content.cancellationPolicy ? [PATIENT_CANCELLATION_POLICY, ""] : []),
    contactSentence,
    "",
    "Dr Ahmed Ben Lallahom · Hippocampus Consulting",
  ].join("\n");
  return { subject: content.subject, html, text };
}

async function sendPatientEmail(
  errors: { rejected: string; failed: string },
  to: string,
  email: PatientEmail,
  options: { idempotencyKey?: string; attachments?: Array<{ filename: string; content: string }> } = {},
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

export function buildBookingConfirmationEmail(input: { customerName: string; trackingId: string; appointmentDate: Date; finalPrice: number; meetLink?: string }, contact = resolveConsultationContact()): PatientEmail {
  return buildPatientEmail({
    subject: `Confirmation de réservation - ${input.trackingId}`,
    title: "Confirmation de réservation",
    customerName: input.customerName,
    paragraphs: ["Votre paiement a bien été reçu et votre consultation avec le Dr Ahmed Ben Lallahom est confirmée. Votre facture vous est envoyée dans un email séparé."],
    details: [
      ["Référence", input.trackingId],
      ["Date et heure", formatPatientDateTime(input.appointmentDate)],
      ["Durée", "30 minutes"],
      ["Montant payé", formatPatientAmount(input.finalPrice)],
      ...(contact.modalityText ? [["Déroulement", contact.modalityText] as [string, string]] : []),
    ],
    link: input.meetLink ? { label: "Lien de visioconférence", url: input.meetLink } : undefined,
    closing: ["Conservez votre référence : elle vous sera demandée pour toute question. Cette consultation programmée ne remplace pas une prise en charge d’urgence : en cas d’urgence, appelez les secours."],
    cancellationPolicy: true,
  }, contact);
}

export function buildBookingReminderEmail(input: { customerName: string; trackingId: string; appointmentDate: Date }, contact = resolveConsultationContact()): PatientEmail {
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

export function buildInvoiceEmail(input: { customerName: string; trackingId: string; finalPrice: number; invoiceNumber?: string }, contact = resolveConsultationContact()): PatientEmail {
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

export async function sendConfirmationEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  appointmentDate: Date,
  finalPrice: number,
  meetLink?: string,
  delivery: { idempotencyKey?: string } = {},
) {
  try {
    const email = buildBookingConfirmationEmail({ customerName, trackingId, appointmentDate, finalPrice, meetLink });
    await sendPatientEmail({ rejected: "confirmation_email_rejected", failed: "confirmation_email_failed" }, customerEmail, email, { idempotencyKey: delivery.idempotencyKey });
    console.log("Confirmation email sent successfully");
  } catch (error) {
    throw new Error("confirmation_email_failed", { cause: error });
  }
}

/**
 * The owner's single "new paid booking" email (the former SMS substitute that
 * duplicated it is gone). Throws when it could not be delivered after the short
 * retries, so its own fulfillment job is retried later.
 */
export async function sendOwnerNotificationEmail(
  customerName: string,
  customerEmail: string,
  customerPhone: string,
  trackingId: string,
  appointmentDate: Date,
  finalPrice: number,
  delivery: { idempotencyKey?: string } = {},
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
    "Objet de la demande : consultable uniquement dans le tableau de bord (jamais recopié par email).",
  ].join("\n");

  const delays = postPaymentDeliveryRetry.delaysMs;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (attempt > 0) await wait(delays[attempt - 1]);
    const delivered = await notifyOwner({
      title: `Nouvelle réservation payée : ${customerName} - ${finalPrice} €`,
      content: notificationContent,
    }, { idempotencyKey: delivery.idempotencyKey }).catch(() => false);
    if (delivered) {
      console.log("Owner booking notification sent");
      return;
    }
  }
  throw new Error("owner_notification_failed");
}

export async function sendInvoiceEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  finalPrice: number,
  invoicePdfBuffer: Buffer,
  invoiceNumber?: string,
  delivery: { idempotencyKey?: string } = {},
) {
  try {
    const email = buildInvoiceEmail({ customerName, trackingId, finalPrice, invoiceNumber });
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
}, contact = resolveConsultationContact()): PatientEmail {
  const context = input.context ?? "refund";
  const copy = context === "practitioner_cancellation"
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
        };
  const reason = input.reason?.trim();
  return buildPatientEmail({
    subject: copy.subject,
    title: copy.title,
    customerName: input.customerName,
    paragraphs: [copy.intro],
    details: [
      ["Référence", input.trackingId],
      [copy.dateLabel, formatPatientDateTime(input.appointmentDate)],
      ...(reason ? [["Motif", reason] as [string, string]] : []),
      ["Montant remboursé", formatPatientAmount(input.refundAmount)],
    ],
    closing: [
      "Le délai d’apparition du remboursement sur votre compte dépend de votre établissement bancaire.",
      ...(context === "practitioner_cancellation" ? ["Vous pouvez réserver un nouveau créneau à tout moment sur le site. Nous vous prions de nous excuser pour ce contretemps."] : []),
    ],
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
  details: { context?: RefundEmailContext; reason?: string; idempotencyKey?: string } = {},
): Promise<boolean> {
  try {
    const email = buildRefundEmail({ customerName, trackingId, appointmentDate, refundAmount, context: details.context, reason: details.reason });
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
export function buildUnconfirmablePaymentEmail(input: { customerName: string; trackingId: string; appointmentDate: Date; amountCents: number | null }, contact = resolveConsultationContact()): PatientEmail {
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
  input: { customerName: string; trackingId: string; appointmentDate: Date; amountCents: number | null },
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
  appointmentDate: Date
) {
  try {
    const email = buildBookingReminderEmail({ customerName, trackingId, appointmentDate });
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
): Promise<CvApplicationConfirmationDelivery> {
  const candidatePortalInvitation = candidatePortalInviteUrl
      ? `<div style="margin:24px 0;padding:18px;border:1px solid #bae6fd;border-radius:10px;background:#f0f9ff;"><h3 style="margin:0 0 8px;color:#0e7490;">Votre espace candidat sécurisé</h3><p style="margin:0 0 14px;">Vous pouvez créer un accès pour déposer ultérieurement vos documents administratifs dans votre coffre privé. L’activation de votre adresse email restera obligatoire.</p><p style="margin:0;"><a href="${escapeHtml(candidatePortalInviteUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700;">Créer mon espace candidat</a></p><p style="margin:12px 0 0;color:#475569;font-size:13px;">${escapeHtml(candidateInvitationValidityNote())}</p></div>`
      : "";
  const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">Candidature reçue — Hippocampus Consulting</h2>
      <p>${escapeHtml(unverifiedRecipientGreeting(candidateFirstName))}</p>
      <p>Nous confirmons la réception de votre candidature de recrutement international.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Numéro de suivi :</strong> ${escapeHtml(trackingId)}</p>
      </div>
      <p>Votre profil sera examiné selon les opportunités disponibles et les critères du pays concerné. Nous vous contacterons si votre profil correspond à une recherche.</p>
      ${candidatePortalInvitation}
      <p>Ne transmettez pas de données de patients, de dossiers médicaux ou de documents cliniques dans votre candidature.</p>
      <p style="color:#64748b;font-size:13px;">Si vous ne retrouvez pas cet email, vérifiez votre dossier Spam ou Courriers indésirables, puis ajoutez recrutement@drahmedbenlallahom.com à vos contacts.</p>
    `);

  const message = {
    from: FROM_EMAIL,
    to: [candidateEmail],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: `Candidature reçue - ${trackingId}`,
    html: emailContent,
    tags: buildResendApplicationTags(trackingId),
  };
  const sendOnce = async (): Promise<CvApplicationConfirmationDelivery> => {
    try {
      const { data, error } = await getResendClient().emails.send(message, { idempotencyKey });
      if (error) return { status: "failed", providerEmailId: null, failureCode: resendDeliveryFailureCode(error) };
      if (!data?.id) return { status: "failed", providerEmailId: null, failureCode: "delivery_exception" };
      return { status: "sent", providerEmailId: data.id, failureCode: null };
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
  failureCode: "provider_rejected" | "delivery_exception" | null;
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
  candidateName: string,
  trackingId: string,
  template: RecruitmentEmailTemplate,
  options: RecruitmentTemplateOptions = {},
) {
  const language = options.language || "fr";
  const isInterest = template === "profile_interest";
  const copy = language === "en"
    ? {
        greeting: "Hello",
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
        greeting: "Bonjour",
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
        <p>${copy.greeting} ${escapeHtml(candidateName)},</p>
        <p>${escapeHtml(body)}</p>
        ${customRequest}
        <p><strong>${copy.reference}:</strong> ${escapeHtml(trackingId)}</p>
        <p>${copy.privacy}</p>
    `),
  };
}

export async function sendRecruitmentTemplateEmail(
  candidateEmail: string,
  candidateName: string,
  trackingId: string,
  template: RecruitmentEmailTemplate,
  options: RecruitmentTemplateOptions = {},
): Promise<{ id?: string }> {
  const message = buildRecruitmentTemplateEmail(candidateName, trackingId, template, options);

  const { data, error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: [candidateEmail],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: message.subject,
    html: message.html,
  });
  if (error) throw new Error(`Resend recruitment email failed: ${error.message}`);
  return { id: data?.id };
}

export async function sendRecruitmentCampaignEmail(input: {
  candidateEmail: string;
  candidateName: string;
  campaignTitle: string;
  subject: string;
  body: string;
  language: RecruitmentEmailLanguage;
  unsubscribeUrl: string;
}): Promise<{ id?: string }> {
  const copy = input.language === "en"
    ? { greeting: "Hello", footer: "This offer concerns your professional profile.", unsubscribe: "Unsubscribe from future recruitment opportunities" }
    : { greeting: "Bonjour", footer: "Cette offre concerne votre profil professionnel.", unsubscribe: "Ne plus recevoir d’opportunités de recrutement" };
  const { data, error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: [input.candidateEmail],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: input.subject,
    html: buildHippocampusEmailShell(`
        <h2 style="color: #0891b2;">${escapeHtml(input.campaignTitle)}</h2>
        <p>${copy.greeting} ${escapeHtml(input.candidateName)},</p>
        <p>${textToSafeHtml(input.body)}</p>
        <p style="color: #64748b;">${copy.footer}</p>
        <p style="font-size: 12px;"><a href="${escapeHtml(input.unsubscribeUrl)}" style="color: #0e7490;">${copy.unsubscribe}</a></p>
    `),
  });
  if (error) throw new Error(`Resend campaign email failed: ${error.message}`);
  return { id: data?.id };
}

export type CandidatePortalAccessEmailContentInput = {
  to: string;
  firstName: string;
  kind: "verify" | "reset" | "invite";
  actionUrl: string;
  applicationReference?: string;
};

export type CandidatePortalAccessEmailInput = CandidatePortalAccessEmailContentInput & {
  idempotencyKey: string;
};

export type CandidatePortalAccessEmailFailureCode = "provider_rejected" | "delivery_exception";

class CandidatePortalAccessEmailError extends Error {
  constructor(
    readonly failureCode: CandidatePortalAccessEmailFailureCode,
    readonly providerErrorName: string | null,
    readonly providerStatusCode: number | null,
  ) {
    super(failureCode === "provider_rejected"
      ? "Resend candidate access email failed: provider rejected request"
      : "Resend candidate access email delivery uncertain");
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
export function candidateInvitationValidityNote(): string {
  return `Ce lien d’invitation est valable ${formatCandidateLinkValidity(CANDIDATE_INVITATION_MAX_AGE_MS)}. Passé ce délai, vous pourrez toujours créer votre espace depuis la page « Espace candidat » du site, avec la même adresse email.`;
}

export function buildCandidatePortalAccessEmail(input: CandidatePortalAccessEmailContentInput) {
  const greeting = unverifiedRecipientGreeting(input.firstName);
  const copy = input.kind === "verify"
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
        <p style="margin:24px 0;"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700;">${copy.action}</a></p>
        <p style="color:#64748b;font-size:13px;">${copy.securityNote}</p>
        <p style="color:#64748b;font-size:13px;">Cet email est envoyé par Hippocampus Consulting depuis recrutement@drahmedbenlallahom.com. Si vous ne retrouvez pas cet email, vérifiez votre dossier Spam ou Courriers indésirables, puis ajoutez cette adresse à vos contacts.</p>
    `),
    text: `${copy.title}\n\n${greeting}\n\n${copy.instruction}\n\n${input.actionUrl}\n\n${copy.securityNote}\n\nCet email est envoyé par Hippocampus Consulting depuis recrutement@drahmedbenlallahom.com. Si vous ne retrouvez pas cet email, vérifiez votre dossier Spam ou Courriers indésirables, puis ajoutez cette adresse à vos contacts.`,
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
    const { data, error } = await getResendClient().emails.send(
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
    );
    if (error) throw resendCandidateAccessFailure(error);
    if (!data?.id) throw new CandidatePortalAccessEmailError("delivery_exception", null, null);
    return { id: data.id };
  };

  try {
    return await sendOnce();
  } catch (firstError) {
    if (candidatePortalAccessEmailFailureCode(firstError) === "provider_rejected") {
      throw firstError;
    }
    try {
      return await sendOnce();
    } catch (retryError) {
      throw retryError;
    }
  }
}
