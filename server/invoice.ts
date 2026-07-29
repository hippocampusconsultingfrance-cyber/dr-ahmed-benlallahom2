import PDFDocument from "pdfkit";
import { storagePut } from "./storage.js";

interface InvoiceData {
  trackingId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  appointmentDate: Date;
  consultationType: string;
  duration: number;
  basePrice: number;
  finalPrice: number;
  isNightRate: boolean;
  paymentDate: Date;
}

export async function generateInvoicePDF(data: InvoiceData): Promise<{ buffer: Buffer; key: string; url: string }> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", async () => {
        const buffer = Buffer.concat(chunks);

        // Upload to S3
        const invoiceKey = `invoices/${data.trackingId}.pdf`;
        try {
          const result = await storagePut(invoiceKey, buffer, "application/pdf");
          resolve({ buffer, key: result.key, url: result.url });
        } catch (storageError) {
          // If storage fails, still return the buffer
          console.error("Failed to upload invoice to S3:", storageError);
          resolve({ buffer, key: invoiceKey, url: "" });
        }
      });

      doc.on("error", reject);

      // Invoice number
      const invoiceNumber = `INV-${data.trackingId}`;
      const invoiceDate = data.paymentDate.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Header
      doc.fontSize(24).font("Helvetica-Bold").text("FACTURE", { align: "center" });
      doc.moveDown(0.5);

      // Company info
      doc.fontSize(10).font("Helvetica");
      doc.text("Dr. Ahmed Ben Lallahom", 50, 100);
      doc.text("Hippocampus Consulting");
      doc.text("Anesthésiste-Réanimateur");
      doc.text("France");
      doc.text("Email: contact@drahmedbenlallahom.com");
      doc.text("Site: www.drahmedbenlallahom.com");

      // Invoice details (right side)
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text(`Facture N°: ${invoiceNumber}`, 350, 100);
      doc.font("Helvetica");
      doc.text(`Date: ${invoiceDate}`, 350);
      doc.text(`Réf. RDV: ${data.trackingId}`, 350);

      // Separator
      doc.moveTo(50, 200).lineTo(545, 200).stroke();

      // Client info
      doc.fontSize(12).font("Helvetica-Bold").text("Facturé à:", 50, 220);
      doc.fontSize(10).font("Helvetica");
      doc.text(data.customerName, 50, 240);
      doc.text(data.customerEmail);
      doc.text(data.customerPhone);

      // Appointment details
      const appointmentDateStr = data.appointmentDate.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      doc.fontSize(12).font("Helvetica-Bold").text("Détails de la prestation:", 50, 300);
      doc.moveDown(0.5);

      // Table header
      const tableTop = 330;
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Description", 50, tableTop);
      doc.text("Date", 250, tableTop);
      doc.text("Durée", 370, tableTop);
      doc.text("Montant", 470, tableTop, { align: "right" });

      // Table separator
      doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

      // Table row
      doc.fontSize(9).font("Helvetica");
      const rowY = tableTop + 25;
      doc.text("Consultation - Conseil en santé", 50, rowY);
      doc.text(appointmentDateStr, 250, rowY);
      doc.text(`${data.duration} min`, 370, rowY);
      doc.text(`${data.basePrice.toFixed(2)} €`, 470, rowY, { align: "right" });

      // Night rate supplement
      let currentY = rowY + 20;
      if (data.isNightRate) {
        doc.text("Majoration tarif de nuit (18h-8h) +50%", 50, currentY);
        const supplement = data.finalPrice - data.basePrice;
        doc.text(`${supplement.toFixed(2)} €`, 470, currentY, { align: "right" });
        currentY += 20;
      }

      // Separator before total
      doc.moveTo(350, currentY + 10).lineTo(545, currentY + 10).stroke();

      // Total
      currentY += 20;
      doc.fontSize(11).font("Helvetica-Bold");
      doc.text("TOTAL TTC:", 350, currentY);
      doc.text(`${data.finalPrice.toFixed(2)} €`, 470, currentY, { align: "right" });

      // Payment status
      currentY += 30;
      doc.fontSize(10).font("Helvetica");
      doc.text("Statut: PAYÉ", 350, currentY);
      doc.text(`Mode de paiement: Carte bancaire (Stripe)`, 350, currentY + 15);

      // Footer
      doc.fontSize(8).font("Helvetica").fillColor("#666666");
      doc.text(
        "Hippocampus Consulting - Dr. Ahmed Ben Lallahom - Conseil en santé",
        50,
        750,
        { align: "center" }
      );
      doc.text(
        "Cette facture est générée automatiquement et fait foi de paiement.",
        50,
        762,
        { align: "center" }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
