import { Resend } from "resend";
import { notifyOwner } from "./notification";

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

// Domaine drahmedbenlallahom.com vérifié dans Resend.
// Une boîte dédiée n'est pas nécessaire pour l'envoi transactionnel ; les
// réponses des candidats restent dirigées vers la boîte de recrutement active.
const FROM_EMAIL = "Hippocampus Consulting <recrutement@drahmedbenlallahom.com>";
const RECRUITMENT_REPLY_TO = "hippocampusconsultingfrance@gmail.com";
const HIPPOCAMPUS_LOGO_URL = "https://drahmedbenlallahom.com/assets/abl-logo.svg";

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

export async function sendMedicalQuestionResponseEmail(input: { email: string; firstName: string; trackingId: string; response: string }) {
  const html = buildHippocampusEmailShell(`
    <h2 style="color:#0891b2">Réponse à votre question</h2>
    <p>Bonjour ${escapeHtml(input.firstName)},</p>
    <p>Votre question a été examinée. Vous trouverez ci-dessous une réponse d’information générale relue et validée par le Dr. Ahmed Ben Lallahom.</p>
    <div style="margin:20px 0;padding:18px;border-radius:10px;background:#f1f5f9;white-space:pre-line;line-height:1.65;color:#0f172a;">${escapeHtml(input.response)}</div>
    <p style="font-size:13px;line-height:1.55;color:#475569;"><strong>Information importante :</strong> cette réponse générale ne remplace pas une consultation, une évaluation préopératoire ni une prise en charge urgente. En cas d’urgence ou de symptôme inquiétant, contactez les secours ou un professionnel de santé sans attendre.</p>
    <p style="font-size:12px;color:#64748b;">Référence confidentielle : ${escapeHtml(input.trackingId)}</p>
  `);
  const text = `Bonjour ${input.firstName},\n\nVotre question a été examinée.\n\n${input.response}\n\nInformation importante : cette réponse générale ne remplace pas une consultation, une évaluation préopératoire ni une prise en charge urgente. En cas d’urgence ou de symptôme inquiétant, contactez les secours ou un professionnel de santé sans attendre.\n\nRéférence confidentielle : ${input.trackingId}`;
  const { error } = await getResendClient().emails.send({ from: FROM_EMAIL, to: [input.email], replyTo: RECRUITMENT_REPLY_TO, subject: `Réponse à votre question — ${input.trackingId}`, html, text });
  if (error) throw new Error(`medical_question_response_email_failed:${error.message}`);
}

export async function sendAdminMfaCodeEmail(email: string, code: string) {
  const html = buildHippocampusEmailShell(`<h2 style="color:#0891b2">Validation de sécurité administrateur</h2><p>Un accès au tableau de bord Hippocampus Consulting vient d’être demandé.</p><p style="margin:24px 0;padding:18px;text-align:center;border-radius:10px;background:#f1f5f9;font-size:28px;letter-spacing:7px;font-weight:700;color:#0f172a">${escapeHtml(code)}</p><p>Ce code expire dans 10 minutes et ne doit être communiqué à personne. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.</p>`);
  const text = `Validation de sécurité administrateur\n\nCode : ${code}\n\nCe code expire dans 10 minutes. Ne le communiquez à personne.`;
  const { error } = await getResendClient().emails.send({ from: FROM_EMAIL, to: [email], replyTo: RECRUITMENT_REPLY_TO, subject: "Code de sécurité — Hippocampus Consulting", html, text });
  if (error) throw new Error(`admin_mfa_email_failed:${error.message}`);
}

export async function sendConfirmationEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  appointmentDate: Date,
  finalPrice: number,
  requestDetails: string,
  meetLink?: string
) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">Confirmation de Réservation</h2>
      <p>Bonjour ${escapeHtml(customerName)},</p>
      <p>Votre réservation a été confirmée avec succès.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h3 style="color: #334155; margin-top: 0;">Détails de votre consultation :</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 4px 0;"><strong>Numéro de suivi :</strong> ${escapeHtml(trackingId)}</li>
          <li style="padding: 4px 0;"><strong>Date et heure :</strong> ${formattedDate}</li>
          <li style="padding: 4px 0;"><strong>Montant :</strong> ${finalPrice}€</li>
          <li style="padding: 4px 0;"><strong>Demande :</strong> ${escapeHtml(requestDetails)}</li>
          ${meetLink ? `<li style="padding: 4px 0;"><strong>Lien Google Meet :</strong> <a href="${escapeHtml(meetLink)}">${escapeHtml(meetLink)}</a></li>` : ""}
        </ul>
      </div>
      <p>Merci de votre confiance.</p>
    `);

    const { error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Confirmation de réservation - ${trackingId}`,
      html: emailContent,
    });

    if (error) {
      throw new Error(`confirmation_email_rejected:${error.message}`);
    }

    console.log("Confirmation email sent successfully");
  } catch (error) {
    throw new Error("confirmation_email_failed", { cause: error });
  }
}

export async function sendOwnerNotificationEmail(
  customerName: string,
  customerEmail: string,
  customerPhone: string,
  trackingId: string,
  appointmentDate: Date,
  finalPrice: number,
  requestDetails: string
) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Use Manus built-in notification for owner
    const notificationContent = `
Nouvelle Réservation - ${trackingId}

Client: ${customerName}
Email: ${customerEmail}
Téléphone: ${customerPhone}
Date: ${formattedDate}
Montant: ${finalPrice}€
Demande: ${requestDetails}
    `.trim();

    await notifyOwner({
      title: `🗓️ Nouvelle réservation: ${customerName} - ${finalPrice}€`,
      content: notificationContent,
    });

    console.log("Owner notification sent via Manus notification service");
  } catch {
    console.error("Owner notification delivery failed");
  }
}

export async function sendOwnerNotificationSMS(
  customerName: string,
  customerPhone: string,
  trackingId: string,
  appointmentDate: Date,
  finalPrice: number
) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Use Manus notification as SMS alternative
    await notifyOwner({
      title: `📱 Réservation ${trackingId}`,
      content: `${customerName} (${customerPhone}) - ${formattedDate} - ${finalPrice}€`,
    });

    console.log("Owner SMS notification sent via Manus notification service");
  } catch {
    console.error("Owner SMS fallback delivery failed");
  }
}

export async function sendInvoiceEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  finalPrice: number,
  invoicePdfBuffer: Buffer
) {
  try {
    const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">Votre Facture - Consultation Dr. Ben Lallahom</h2>
      <p>Bonjour ${escapeHtml(customerName)},</p>
      <p>Veuillez trouver ci-joint la facture correspondant à votre consultation.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h3 style="color: #334155; margin-top: 0;">Récapitulatif :</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 4px 0;"><strong>Référence :</strong> ${escapeHtml(trackingId)}</li>
          <li style="padding: 4px 0;"><strong>Montant :</strong> ${finalPrice}€</li>
          <li style="padding: 4px 0;"><strong>Statut :</strong> ✅ Payé</li>
        </ul>
      </div>
      <p>Merci de votre confiance.</p>
    `);

    const { error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Facture - Consultation ${trackingId}`,
      html: emailContent,
      attachments: [
        {
          filename: `Facture-${trackingId}.pdf`,
          content: invoicePdfBuffer.toString("base64"),
        },
      ],
    });

    if (error) {
      throw new Error(`invoice_email_rejected:${error.message}`);
    }

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

export async function sendRefundConfirmationEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  appointmentDate: Date,
  refundAmount: string
) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">Confirmation de remboursement</h2>
      <p>Bonjour ${escapeHtml(customerName)},</p>
      <p>Le remboursement de votre consultation a été enregistré.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Référence :</strong> ${escapeHtml(trackingId)}</p>
        <p><strong>Consultation initiale :</strong> ${escapeHtml(formattedDate)}</p>
        <p><strong>Montant remboursé :</strong> ${escapeHtml(refundAmount)}€</p>
      </div>
      <p>Le délai d’apparition du remboursement dépend de votre établissement bancaire.</p>
    `);

    const { error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Remboursement confirmé - ${trackingId}`,
      html: emailContent,
    });

    if (error) {
      console.error("Refund email was rejected by the delivery provider");
      return;
    }

    console.log("Refund email sent successfully");
  } catch {
    console.error("Refund email delivery failed");
  }
}

export async function sendReminderEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  appointmentDate: Date
) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">⏰ Rappel - Votre consultation est demain</h2>
      <p>Bonjour ${escapeHtml(customerName)},</p>
      <p>Nous vous rappelons que votre consultation avec le Dr. Ahmed Ben Lallahom est prévue <strong>demain</strong>.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h3 style="color: #334155; margin-top: 0;">Détails :</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 4px 0;"><strong>Référence :</strong> ${escapeHtml(trackingId)}</li>
          <li style="padding: 4px 0;"><strong>Date et heure :</strong> ${formattedDate}</li>
        </ul>
      </div>
      <p>Si vous devez annuler ou reporter votre rendez-vous, veuillez nous contacter dès que possible.</p>
      <p>À demain !</p>
    `);

    const { error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Rappel - Consultation demain (${trackingId})`,
      html: emailContent,
    });

    if (error) {
      throw new Error(`reminder_email_rejected:${error.message}`);
    }

    console.log("Reminder email sent successfully");
  } catch (error) {
    throw new Error("reminder_email_failed", { cause: error });
  }
}

export async function sendCvApplicationConfirmationEmail(
  candidateEmail: string,
  candidateName: string,
  trackingId: string,
  specialty: string,
  targetCountries: string,
  candidatePortalInviteUrl?: string,
) {
  try {
    const candidatePortalInvitation = candidatePortalInviteUrl
      ? `<div style="margin:24px 0;padding:18px;border:1px solid #bae6fd;border-radius:10px;background:#f0f9ff;"><h3 style="margin:0 0 8px;color:#0e7490;">Votre espace candidat sécurisé</h3><p style="margin:0 0 14px;">Vous pouvez créer un accès pour déposer ultérieurement vos documents administratifs dans votre coffre privé. L’activation de votre adresse email restera obligatoire.</p><p style="margin:0;"><a href="${escapeHtml(candidatePortalInviteUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700;">Créer mon espace candidat</a></p></div>`
      : "";
    const emailContent = buildHippocampusEmailShell(`
      <h2 style="color: #0891b2;">Candidature reçue — Hippocampus Consulting</h2>
      <p>Bonjour ${escapeHtml(candidateName)},</p>
      <p>Nous confirmons la réception de votre candidature de recrutement international.</p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Numéro de suivi :</strong> ${escapeHtml(trackingId)}</p>
        <p><strong>Spécialité :</strong> ${escapeHtml(specialty)}</p>
        <p><strong>Pays ciblés :</strong> ${escapeHtml(targetCountries)}</p>
      </div>
      <p>Votre profil sera examiné selon les opportunités disponibles et les critères du pays concerné. Nous vous contacterons si votre profil correspond à une recherche.</p>
      ${candidatePortalInvitation}
      <p>Ne transmettez pas de données de patients, de dossiers médicaux ou de documents cliniques dans votre candidature.</p>
      <p style="color:#64748b;font-size:13px;">Si vous ne retrouvez pas cet email, vérifiez votre dossier Spam ou Courriers indésirables, puis ajoutez recrutement@drahmedbenlallahom.com à vos contacts.</p>
    `);

    const { error } = await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: [candidateEmail],
      replyTo: RECRUITMENT_REPLY_TO,
      subject: `Candidature reçue - ${trackingId}`,
      html: emailContent,
    });

    if (error) {
      console.error("CV application confirmation was rejected by the delivery provider");
      return;
    }

    console.log("CV application confirmation sent successfully");
  } catch {
    console.error("CV application confirmation delivery failed");
  }
}

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

export type CandidatePortalAccessEmailInput = {
  to: string;
  firstName: string;
  kind: "verify" | "reset" | "invite";
  actionUrl: string;
};

export function buildCandidatePortalAccessEmail(input: CandidatePortalAccessEmailInput) {
  const copy = input.kind === "verify"
    ? {
        subject: "Confirmez votre adresse email — Espace candidat Hippocampus",
        title: "Confirmez votre adresse email",
        instruction: "Vous recevez cet email parce qu’un espace candidat vient d’être créé avec cette adresse. Pour finaliser son activation, confirmez simplement votre adresse email en cliquant sur le bouton ci-dessous.",
        action: "Confirmer mon adresse email",
        securityNote: "Ce lien personnel et temporaire finalise uniquement l’activation de votre adresse. Si vous n’avez pas créé cet espace candidat, ignorez cet email : aucun accès ne sera activé.",
      }
    : input.kind === "reset"
      ? {
          subject: "Réinitialisez votre mot de passe — Hippocampus Consulting",
          title: "Réinitialisez votre mot de passe",
          instruction: "Une demande de réinitialisation a été reçue. Choisissez un nouveau mot de passe en cliquant sur le bouton ci-dessous.",
          action: "Réinitialiser mon mot de passe",
          securityNote: "Ce lien est personnel et temporaire. Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet email.",
        }
      : {
          subject: "Créez votre espace candidat — Hippocampus Consulting",
          title: "Créez votre espace candidat",
          instruction: "Notre équipe vous invite à créer votre espace candidat sécurisé pour déposer et suivre vos documents administratifs. Vous choisirez votre mot de passe et devrez ensuite activer votre adresse email.",
          action: "Créer mon espace candidat",
          securityNote: "Ce lien sécurisé est personnel et temporaire. Il ne donne aucun accès sans création de mot de passe ni activation de votre adresse email.",
        };
  return {
    subject: copy.subject,
    html: buildHippocampusEmailShell(`
        <h2 style="color:#0891b2;">${copy.title}</h2>
        <p>Bonjour ${escapeHtml(input.firstName || "")},</p>
        <p>${copy.instruction}</p>
        <p style="margin:24px 0;"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700;">${copy.action}</a></p>
        <p style="color:#64748b;font-size:13px;">${copy.securityNote}</p>
        <p style="color:#64748b;font-size:13px;">Cet email est envoyé par Hippocampus Consulting depuis recrutement@drahmedbenlallahom.com. Si vous ne retrouvez pas cet email, vérifiez votre dossier Spam ou Courriers indésirables, puis ajoutez cette adresse à vos contacts.</p>
    `),
    text: `${copy.title}\n\nBonjour ${input.firstName || ""},\n\n${copy.instruction}\n\n${input.actionUrl}\n\n${copy.securityNote}\n\nCet email est envoyé par Hippocampus Consulting depuis recrutement@drahmedbenlallahom.com. Si vous ne retrouvez pas cet email, vérifiez votre dossier Spam ou Courriers indésirables, puis ajoutez cette adresse à vos contacts.`,
  };
}

export async function sendCandidatePortalAccessEmail(input: CandidatePortalAccessEmailInput): Promise<{ id?: string }> {
  const message = buildCandidatePortalAccessEmail(input);

  const { data, error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: [input.to],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  if (error) throw new Error(`Resend candidate access email failed: ${error.message}`);
  return { id: data?.id };
}
