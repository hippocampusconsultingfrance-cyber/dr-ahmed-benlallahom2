import { Resend } from "resend";
import { notifyOwner } from "./notification";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

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

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
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
        <p style="color: #64748b;">Dr. Ahmed Ben Lallahom<br>Hippocampus Consulting</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Confirmation de réservation - ${trackingId}`,
      html: emailContent,
    });

    if (error) {
      console.error("Resend error sending confirmation email:", error);
      return;
    }

    console.log(`Confirmation email sent to ${customerEmail} (id: ${data?.id})`);
  } catch (error) {
    console.error("Error sending confirmation email:", error);
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
  } catch (error) {
    console.error("Error sending owner notification:", error);
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
  } catch (error) {
    console.error("Error sending owner notification SMS:", error);
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
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
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
        <p style="color: #64748b;">Dr. Ahmed Ben Lallahom<br>Hippocampus Consulting</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
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
      console.error("Resend error sending invoice email:", error);
      return;
    }

    console.log(`Invoice email sent to ${customerEmail} (id: ${data?.id})`);
  } catch (error) {
    console.error("Error sending invoice email:", error);
  }
}

export async function sendCustomerConfirmationSMS(
  customerPhone: string,
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

    // SMS not available directly - use owner notification as fallback
    // The customer receives their confirmation via email
    console.log(`Customer SMS notification for ${trackingId} - customer receives email confirmation instead`);
  } catch (error) {
    console.error("Error sending confirmation SMS:", error);
  }
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

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0891b2;">Confirmation de remboursement</h2>
        <p>Bonjour ${escapeHtml(customerName)},</p>
        <p>Le remboursement de votre consultation a été enregistré.</p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p><strong>Référence :</strong> ${escapeHtml(trackingId)}</p>
          <p><strong>Consultation initiale :</strong> ${escapeHtml(formattedDate)}</p>
          <p><strong>Montant remboursé :</strong> ${escapeHtml(refundAmount)}€</p>
        </div>
        <p>Le délai d’apparition du remboursement dépend de votre établissement bancaire.</p>
        <p style="color: #64748b;">Dr. Ahmed Ben Lallahom<br>Hippocampus Consulting</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Remboursement confirmé - ${trackingId}`,
      html: emailContent,
    });

    if (error) {
      console.error("Resend error sending refund email:", error);
      return;
    }

    console.log(`Refund email sent to ${customerEmail} (id: ${data?.id})`);
  } catch (error) {
    console.error("Error sending refund email:", error);
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

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
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
        <p style="color: #64748b;">Dr. Ahmed Ben Lallahom<br>Hippocampus Consulting</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Rappel - Consultation demain (${trackingId})`,
      html: emailContent,
    });

    if (error) {
      console.error("Resend error sending reminder email:", error);
      return;
    }

    console.log(`Reminder email sent to ${customerEmail} (id: ${data?.id})`);
  } catch (error) {
    console.error("Error sending reminder email:", error);
  }
}

export async function sendCvApplicationConfirmationEmail(
  candidateEmail: string,
  candidateName: string,
  trackingId: string,
  specialty: string,
  targetCountries: string,
) {
  try {
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0891b2;">Candidature reçue — Hippocampus Consulting</h2>
        <p>Bonjour ${escapeHtml(candidateName)},</p>
        <p>Nous confirmons la réception de votre candidature de recrutement international.</p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p><strong>Numéro de suivi :</strong> ${escapeHtml(trackingId)}</p>
          <p><strong>Spécialité :</strong> ${escapeHtml(specialty)}</p>
          <p><strong>Pays ciblés :</strong> ${escapeHtml(targetCountries)}</p>
        </div>
        <p>Votre profil sera examiné selon les opportunités disponibles et les critères du pays concerné. Nous vous contacterons si votre profil correspond à une recherche.</p>
        <p>Ne transmettez pas de données de patients, de dossiers médicaux ou de documents cliniques dans votre candidature.</p>
        <p style="color: #64748b;">Dr. Ahmed Ben Lallahom<br>Hippocampus Consulting</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [candidateEmail],
      replyTo: RECRUITMENT_REPLY_TO,
      subject: `Candidature reçue - ${trackingId}`,
      html: emailContent,
    });

    if (error) {
      console.error("Resend error sending CV application confirmation:", error);
      return;
    }

    console.log(`CV application confirmation sent to ${candidateEmail} (id: ${data?.id})`);
  } catch (error) {
    console.error("Error sending CV application confirmation:", error);
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
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0891b2;">${copy.heading}</h2>
        <p>${copy.greeting} ${escapeHtml(candidateName)},</p>
        <p>${escapeHtml(body)}</p>
        ${customRequest}
        <p><strong>${copy.reference}:</strong> ${escapeHtml(trackingId)}</p>
        <p>${copy.privacy}</p>
        <p style="color: #64748b;">Dr. Ahmed Ben Lallahom<br>Hippocampus Consulting</p>
      </div>
    `,
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

  const { data, error } = await resend.emails.send({
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
}): Promise<{ id?: string }> {
  const copy = input.language === "en"
    ? { greeting: "Hello", footer: "This offer concerns your professional profile. If you no longer wish to receive recruitment opportunities, please reply to this message." }
    : { greeting: "Bonjour", footer: "Cette offre concerne votre profil professionnel. Si vous ne souhaitez plus recevoir d’opportunités de recrutement, répondez simplement à ce message." };
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [input.candidateEmail],
    replyTo: RECRUITMENT_REPLY_TO,
    subject: input.subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0891b2;">${escapeHtml(input.campaignTitle)}</h2>
        <p>${copy.greeting} ${escapeHtml(input.candidateName)},</p>
        <p>${textToSafeHtml(input.body)}</p>
        <p style="color: #64748b;">${copy.footer}</p>
        <p style="color: #64748b;">Dr. Ahmed Ben Lallahom<br>Hippocampus Consulting</p>
      </div>
    `,
  });
  if (error) throw new Error(`Resend campaign email failed: ${error.message}`);
  return { id: data?.id };
}
