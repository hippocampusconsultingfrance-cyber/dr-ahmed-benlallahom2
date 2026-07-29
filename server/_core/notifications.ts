import nodemailer from "nodemailer";
import axios from "axios";

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// SMS configuration (using a simple API)
const SMS_API_URL = process.env.SMS_API_URL || "";
const SMS_API_KEY = process.env.SMS_API_KEY || "";

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
      <h2>Confirmation de Réservation</h2>
      <p>Bonjour ${customerName},</p>
      <p>Votre réservation a été confirmée avec succès.</p>
      
      <h3>Détails de votre consultation :</h3>
      <ul>
        <li><strong>Numéro de suivi :</strong> ${trackingId}</li>
        <li><strong>Date et heure :</strong> ${formattedDate}</li>
        <li><strong>Montant :</strong> ${finalPrice}€</li>
        <li><strong>Demande :</strong> ${requestDetails}</li>
        ${meetLink ? `<li><strong>Lien Google Meet :</strong> <a href="${meetLink}">${meetLink}</a></li>` : ""}
      </ul>
      
      <p>Merci de votre confiance.</p>
      <p>Dr. Ahmed Ben Lallahom</p>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@drbenlallahom.com",
      to: customerEmail,
      subject: `Confirmation de réservation - ${trackingId}`,
      html: emailContent,
    });

    console.log(`Confirmation email sent to ${customerEmail}`);
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

    const emailContent = `
      <h2>Nouvelle Réservation</h2>
      <p>Une nouvelle réservation a été effectuée.</p>
      
      <h3>Détails du client :</h3>
      <ul>
        <li><strong>Nom :</strong> ${customerName}</li>
        <li><strong>Email :</strong> ${customerEmail}</li>
        <li><strong>Téléphone :</strong> ${customerPhone}</li>
        <li><strong>Numéro de suivi :</strong> ${trackingId}</li>
        <li><strong>Date et heure :</strong> ${formattedDate}</li>
        <li><strong>Montant :</strong> ${finalPrice}€</li>
        <li><strong>Demande :</strong> ${requestDetails}</li>
      </ul>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@drbenlallahom.com",
      to: process.env.OWNER_EMAIL || "contact@drbenlallahom.com",
      subject: `Nouvelle réservation - ${trackingId}`,
      html: emailContent,
    });

    console.log("Owner notification email sent");
  } catch (error) {
    console.error("Error sending owner notification email:", error);
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

    const message = `Nouvelle réservation: ${customerName} (${customerPhone}) - ${trackingId} - ${formattedDate} - ${finalPrice}€`;

    // Send SMS to owner
    const ownerPhone = process.env.OWNER_PHONE || "+33773153771";

    if (SMS_API_URL && SMS_API_KEY) {
      await axios.post(SMS_API_URL, {
        to: ownerPhone,
        message: message,
        apiKey: SMS_API_KEY,
      });

      console.log("Owner notification SMS sent");
    } else {
      console.warn("SMS API not configured");
    }
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
      <h2>Votre Facture - Consultation Dr. Ben Lallahom</h2>
      <p>Bonjour ${customerName},</p>
      <p>Veuillez trouver ci-joint la facture correspondant à votre consultation.</p>
      
      <h3>Récapitulatif :</h3>
      <ul>
        <li><strong>Référence :</strong> ${trackingId}</li>
        <li><strong>Montant :</strong> ${finalPrice}€</li>
        <li><strong>Statut :</strong> Payé</li>
      </ul>
      
      <p>Merci de votre confiance.</p>
      <p>Dr. Ahmed Ben Lallahom<br>Hippocampus Consulting</p>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@drbenlallahom.com",
      to: customerEmail,
      subject: `Facture - Consultation ${trackingId}`,
      html: emailContent,
      attachments: [
        {
          filename: `Facture-${trackingId}.pdf`,
          content: invoicePdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    console.log(`Invoice email sent to ${customerEmail}`);
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

    const message = `Votre réservation ${trackingId} est confirmée pour le ${formattedDate}. Dr. Ahmed Ben Lallahom`;

    if (SMS_API_URL && SMS_API_KEY) {
      await axios.post(SMS_API_URL, {
        to: customerPhone,
        message: message,
        apiKey: SMS_API_KEY,
      });

      console.log(`Confirmation SMS sent to ${customerPhone}`);
    } else {
      console.warn("SMS API not configured");
    }
  } catch (error) {
    console.error("Error sending confirmation SMS:", error);
  }
}
