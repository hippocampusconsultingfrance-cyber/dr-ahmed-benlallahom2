import { Resend } from "resend";
import { notifyOwner } from "./notification";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Resend free tier uses onboarding@resend.dev as sender
// Once a custom domain is verified in Resend, change this
const FROM_EMAIL = "Dr. Ben Lallahom <onboarding@resend.dev>";

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
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0891b2;">Confirmation de Réservation</h2>
        <p>Bonjour ${customerName},</p>
        <p>Votre réservation a été confirmée avec succès.</p>
        
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <h3 style="color: #334155; margin-top: 0;">Détails de votre consultation :</h3>
          <ul style="list-style: none; padding: 0;">
            <li style="padding: 4px 0;"><strong>Numéro de suivi :</strong> ${trackingId}</li>
            <li style="padding: 4px 0;"><strong>Date et heure :</strong> ${formattedDate}</li>
            <li style="padding: 4px 0;"><strong>Montant :</strong> ${finalPrice}€</li>
            <li style="padding: 4px 0;"><strong>Demande :</strong> ${requestDetails}</li>
            ${meetLink ? `<li style="padding: 4px 0;"><strong>Lien Google Meet :</strong> <a href="${meetLink}">${meetLink}</a></li>` : ""}
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
        <p>Bonjour ${customerName},</p>
        <p>Veuillez trouver ci-joint la facture correspondant à votre consultation.</p>
        
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <h3 style="color: #334155; margin-top: 0;">Récapitulatif :</h3>
          <ul style="list-style: none; padding: 0;">
            <li style="padding: 4px 0;"><strong>Référence :</strong> ${trackingId}</li>
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

export async function sendReminderEmail(
  customerEmail: string,
  customerName: string,
  trackingId: string,
  appointmentDate: Date
) {
  try {
    const formattedDate = appointmentDate.toLocaleString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0891b2;">⏰ Rappel - Votre consultation est demain</h2>
        <p>Bonjour ${customerName},</p>
        <p>Nous vous rappelons que votre consultation avec le Dr. Ahmed Ben Lallahom est prévue <strong>demain</strong>.</p>
        
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <h3 style="color: #334155; margin-top: 0;">Détails :</h3>
          <ul style="list-style: none; padding: 0;">
            <li style="padding: 4px 0;"><strong>Référence :</strong> ${trackingId}</li>
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
