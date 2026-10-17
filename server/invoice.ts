import PDFDocument from "pdfkit";
import { storagePut } from "./storage.js";
import { resolveInvoiceSeller, type InvoiceSeller } from "./invoiceSeller";

export const INVOICE_LAYOUT = {
  size: "A4" as const,
  margin: 50,
  footerBrandY: 750,
  footerValidityY: 762,
};

export const INVOICE_BRAND = {
  accent: "#0891b2",
  ink: "#0f172a",
  muted: "#666666",
};

const PARIS_TIME_ZONE = "Europe/Paris";

export interface InvoiceData {
  /** Numéro séquentiel attribué une seule fois (server/invoiceNumbering.ts), ex. FAC-2026-000001. */
  invoiceNumber: string;
  /** Date d’émission enregistrée avec le numéro : identique à chaque régénération. */
  issueDate: Date;
  /** Date de réception du paiement (confirmation du webhook Stripe). */
  paymentDate: Date;
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
}

// Les polices standard de PDFKit (WinAnsi) n’ont pas l’espace fine insécable
// qu’Intl insère en français : on la remplace par une espace normale.
function pdfSafeSpaces(value: string): string {
  return value.replace(/[  ]/g, " ");
}

/** Montant au format français : « 1 150,00 € ». */
export function formatInvoiceAmount(value: number): string {
  return pdfSafeSpaces(new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value));
}

/** Date calendaire à Paris, quel que soit le fuseau du serveur (UTC sur Vercel). */
export function formatInvoiceDate(date: Date): string {
  return pdfSafeSpaces(date.toLocaleDateString("fr-FR", { timeZone: PARIS_TIME_ZONE, year: "numeric", month: "long", day: "numeric" }));
}

/** Date et heure du rendez-vous à Paris, ex. « 16 octobre 2026 à 00:30 ». */
export function formatInvoiceAppointmentDateTime(date: Date): string {
  return pdfSafeSpaces(date.toLocaleString("fr-FR", {
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }));
}

export type InvoiceContent = {
  invoiceNumber: string;
  sellerLines: string[];
  metaLines: string[];
  buyerLines: string[];
  rows: Array<{ description: string; date: string; duration: string; amount: string }>;
  totalLabel: string;
  totalAmount: string;
  vatLines: string[];
  paymentLines: string[];
  footerLines: string[];
};

/**
 * Contenu textuel complet de la facture, séparé du rendu PDF pour être testé.
 * Aucune mention légale n’est inventée : la TVA n’apparaît que si
 * INVOICE_VAT_MENTION (et, le cas échéant, INVOICE_SELLER_VAT_NUMBER) est défini.
 */
export function buildInvoiceContent(data: InvoiceData, seller: InvoiceSeller = resolveInvoiceSeller()): InvoiceContent {
  const appointment = formatInvoiceAppointmentDateTime(data.appointmentDate);
  const rows: InvoiceContent["rows"] = [{
    description: "Consultation - Conseil en santé",
    date: appointment,
    duration: `${data.duration} min`,
    amount: formatInvoiceAmount(data.basePrice),
  }];
  if (data.isNightRate) {
    rows.push({
      description: "Majoration tarif de nuit (18h-8h) +50 %",
      date: "",
      duration: "",
      amount: formatInvoiceAmount(data.finalPrice - data.basePrice),
    });
  }

  const sellerLines = [
    seller.name,
    `${seller.legalForm} au capital de ${seller.capital}`,
    `Siège social : ${seller.address}`,
    seller.rcs,
    ...(seller.vatNumber ? [`N° TVA intracommunautaire : ${seller.vatNumber}`] : []),
    `Email : ${seller.email}`,
    `Site : ${seller.website}`,
  ];

  return {
    invoiceNumber: data.invoiceNumber,
    sellerLines,
    metaLines: [
      `Date d’émission : ${formatInvoiceDate(data.issueDate)}`,
      `Date de paiement : ${formatInvoiceDate(data.paymentDate)}`,
      `Réf. rendez-vous : ${data.trackingId}`,
    ],
    buyerLines: [data.customerName, data.customerEmail, data.customerPhone].filter(line => line.trim().length > 0),
    rows,
    totalLabel: "Total",
    totalAmount: formatInvoiceAmount(data.finalPrice),
    vatLines: seller.vatMention ? [seller.vatMention] : [],
    paymentLines: [
      `Payée le ${formatInvoiceDate(data.paymentDate)}`,
      "Mode de paiement : carte bancaire (Stripe)",
    ],
    footerLines: [
      `${seller.name} - ${seller.rcs} - ${seller.address}`,
      `Horaire de la consultation exprimé en heure de Paris. Facture émise automatiquement après le paiement en ligne.`,
    ],
  };
}

export async function generateInvoicePDF(
  data: InvoiceData,
  seller: InvoiceSeller = resolveInvoiceSeller(),
): Promise<{ buffer: Buffer; key: string; url: string }> {
  const content = buildInvoiceContent(data, seller);
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: INVOICE_LAYOUT.size,
        margin: INVOICE_LAYOUT.margin,
        // Fixed metadata dates: a retried job regenerates a byte-identical
        // PDF, so the email resent under the same Resend idempotency key
        // carries the same attachment (a different payload would be refused
        // with 409 invalid_idempotent_request).
        info: { Title: `Facture ${content.invoiceNumber}`, Author: seller.name, CreationDate: data.issueDate, ModDate: data.issueDate },
      });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", async () => {
        const buffer = Buffer.concat(chunks);

        const invoiceKey = `invoices/${content.invoiceNumber}-${data.trackingId}.pdf`;
        try {
          const result = await storagePut(invoiceKey, buffer, "application/pdf");
          resolve({ buffer, key: result.key, url: result.url });
        } catch (storageError) {
          // If storage fails, still return the buffer
          console.error("Failed to upload invoice to private storage:", storageError instanceof Error ? storageError.name : "UnknownError");
          resolve({ buffer, key: invoiceKey, url: "" });
        }
      });

      doc.on("error", reject);

      // Header
      doc.fontSize(8).font("Helvetica-Bold").fillColor(INVOICE_BRAND.accent).text("ABL / HIPPOCAMPUS CONSULTING", { align: "center" });
      doc.moveDown(0.35);
      doc.fontSize(24).font("Helvetica-Bold").fillColor(INVOICE_BRAND.ink).text("FACTURE", { align: "center" });
      doc.moveDown(0.5);

      // Seller (left)
      const [sellerName, ...sellerDetails] = content.sellerLines;
      doc.fontSize(10).font("Helvetica-Bold").text(sellerName, 50, 100, { width: 280 });
      doc.fontSize(9).font("Helvetica");
      for (const line of sellerDetails) doc.text(line, { width: 280 });
      const sellerBottom = doc.y;

      // Invoice details (right)
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text(`Facture N° : ${content.invoiceNumber}`, 350, 100, { width: 195 });
      doc.fontSize(9).font("Helvetica");
      for (const line of content.metaLines) doc.text(line, 350, undefined, { width: 195 });
      const metaBottom = doc.y;

      // Separator
      const separatorY = Math.max(200, sellerBottom + 12, metaBottom + 12);
      doc.strokeColor(INVOICE_BRAND.accent).moveTo(50, separatorY).lineTo(545, separatorY).stroke();

      // Client info
      const clientY = separatorY + 20;
      doc.fontSize(12).font("Helvetica-Bold").text("Facturé à :", 50, clientY);
      doc.fontSize(10).font("Helvetica");
      content.buyerLines.forEach((line, index) => doc.text(line, 50, index === 0 ? clientY + 20 : undefined));

      const detailsY = Math.max(clientY + 80, doc.y + 20);
      doc.fontSize(12).font("Helvetica-Bold").text("Détails de la prestation :", 50, detailsY);

      // Table header
      const tableTop = detailsY + 30;
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Description", 50, tableTop, { width: 190 });
      doc.text("Date (heure de Paris)", 250, tableTop, { width: 115 });
      doc.text("Durée", 370, tableTop, { width: 60 });
      doc.text("Montant", 445, tableTop, { width: 100, align: "right" });

      doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

      // Table rows
      doc.fontSize(9).font("Helvetica");
      let currentY = tableTop + 25;
      for (const row of content.rows) {
        doc.text(row.description, 50, currentY, { width: 190 });
        if (row.date) doc.text(row.date, 250, currentY, { width: 115 });
        if (row.duration) doc.text(row.duration, 370, currentY, { width: 60 });
        doc.text(row.amount, 445, currentY, { width: 100, align: "right" });
        currentY += 24;
      }

      // Total
      doc.moveTo(350, currentY).lineTo(545, currentY).stroke();
      currentY += 10;
      doc.fontSize(11).font("Helvetica-Bold");
      doc.text(`${content.totalLabel} :`, 350, currentY, { width: 90 });
      doc.text(content.totalAmount, 445, currentY, { width: 100, align: "right" });
      currentY += 20;

      doc.fontSize(9).font("Helvetica");
      for (const line of content.vatLines) {
        doc.text(line, 300, currentY, { width: 245, align: "right" });
        currentY = doc.y + 4;
      }

      // Payment status
      currentY += 10;
      doc.fontSize(10).font("Helvetica");
      for (const line of content.paymentLines) {
        doc.text(line, 300, currentY, { width: 245, align: "right" });
        currentY = doc.y + 2;
      }

      // Footer
      doc.fontSize(8).font("Helvetica").fillColor(INVOICE_BRAND.muted);
      doc.text(content.footerLines[0], 50, INVOICE_LAYOUT.footerBrandY, { align: "center", width: 495 });
      doc.text(content.footerLines[1], 50, INVOICE_LAYOUT.footerValidityY, { align: "center", width: 495 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
