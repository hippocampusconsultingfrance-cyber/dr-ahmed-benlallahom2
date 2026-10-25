import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bidiFactory from "bidi-js";
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

/**
 * Polices Unicode libres Noto (SIL Open Font License 1.1, licences à côté des
 * fichiers dans server/fonts/). Les polices standard de PDFKit (Helvetica,
 * WinAnsi) rendaient illisibles les noms polonais, turcs, vietnamiens, arabes
 * ou chinois. Noto Sans couvre tout le document (latin étendu, grec,
 * cyrillique) ; les polices arabe et chinoise ne sont chargées que pour la
 * ligne du nom, quand elle en contient. vercel.json les inclut dans la
 * fonction (includeFiles). Versions et sources : server/fonts/README.md.
 */
export const INVOICE_FONT_FILES = {
  regular: "NotoSans-Regular.ttf",
  bold: "NotoSans-Bold.ttf",
  arabic: "NotoSansArabic-Regular.ttf",
  han: "NotoSansSC-Regular.otf",
} as const;

type InvoiceFont = keyof typeof INVOICE_FONT_FILES;

// Police de repli si un fichier manque ou est illisible : la facture sort
// quand même, avec les polices d’avant pour le texte latin.
const FALLBACK_INVOICE_FONTS = { regular: "Helvetica", bold: "Helvetica-Bold" } as const;

// server/fonts depuis ce fichier (tsx, vitest), ou depuis la racine du projet
// pour les bundles esbuild (api/index.js sur Vercel, où le répertoire courant
// est la racine de la fonction, et dist/index.js).
function invoiceFontDirectories(): string[] {
  return [fileURLToPath(new URL("./fonts/", import.meta.url)), path.resolve(process.cwd(), "server", "fonts")];
}

const invoiceFontData = new Map<InvoiceFont, Buffer>();

function readInvoiceFont(font: InvoiceFont): Buffer | null {
  const cached = invoiceFontData.get(font);
  if (cached) return cached;
  for (const directory of invoiceFontDirectories()) {
    try {
      const data = readFileSync(path.join(directory, INVOICE_FONT_FILES[font]));
      invoiceFontData.set(font, data);
      return data;
    } catch {
      // Essayer le répertoire suivant.
    }
  }
  return null;
}

/** Nom PDFKit de chaque police, enregistrée à la première utilisation dans le document. */
function invoiceFonts(doc: PDFKit.PDFDocument): (font: InvoiceFont) => string {
  const names = new Map<InvoiceFont, string>();
  const resolve = (font: InvoiceFont): string => {
    const known = names.get(font);
    if (known) return known;
    let name: string | null = null;
    const data = readInvoiceFont(font);
    if (data) {
      try {
        doc.registerFont(font, data);
        doc.font(font); // lit la police maintenant : un fichier abîmé se rabat ici, pas au milieu de la page
        name = font;
      } catch (error) {
        console.error("Invoice font unreadable:", INVOICE_FONT_FILES[font], error instanceof Error ? error.name : "UnknownError");
      }
    } else {
      console.error("Invoice font missing:", INVOICE_FONT_FILES[font]);
    }
    name ??= font === "regular" || font === "bold" ? FALLBACK_INVOICE_FONTS[font] : resolve("regular");
    names.set(font, name);
    return name;
  };
  return resolve;
}

/**
 * Ligne de base de la police courante, au format numérique de PDFKit (en
 * points, négative : sous le haut de la ligne). PDFKit ne type pas `_font` ;
 * undefined garde son placement par défaut.
 */
function currentFontBaseline(doc: PDFKit.PDFDocument, fontSize: number): number | undefined {
  const ascender = (doc as unknown as { _font?: { ascender?: unknown } })._font?.ascender;
  return typeof ascender === "number" ? -(ascender / 1000) * fontSize : undefined;
}

const bidi = bidiFactory();
const ARABIC_FONT_CHARACTER = new RegExp("\\p{Script_Extensions=Arabic}", "u");
// Idéogrammes, kana et bopomofo par Script : Script_Extensions=Han couvre aussi
// des signes latins que Noto Sans dessine (point médian de Col·lell, caron).
// Plus les blocs que Noto Sans n’a pas du tout : ponctuation CJK (espace
// idéographique, 「」), signes des blocs kana (ー, ・) et formes pleine chasse
// des claviers chinois (（ ）， ．).
const HAN_FONT_CHARACTER = new RegExp("[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Bopomofo}\\u3000-\\u30ff\\uff00-\\uffef]", "u");
const ARABIC_LETTER = new RegExp("\\p{Script=Arabic}", "u");
const MIDDLE_DOT = "\u00b7";

export type InvoiceNameRun = { text: string; font: "regular" | "arabic" | "han" };

function invoiceNameCharacterFont(chars: string[], position: number): InvoiceNameRun["font"] {
  const char = chars[position];
  if (ARABIC_FONT_CHARACTER.test(char)) return "arabic";
  if (HAN_FONT_CHARACTER.test(char)) return "han";
  // Point de séparation d’un nom étranger transcrit en chinois (迈克尔·乔丹) :
  // pleine chasse, avec les idéogrammes, s’il est entre deux d’entre eux.
  const between = (other: string | undefined) => other !== undefined && HAN_FONT_CHARACTER.test(other);
  if (char === MIDDLE_DOT && between(chars[position - 1]) && between(chars[position + 1])) return "han";
  return "regular";
}

/**
 * Découpe la ligne du nom en segments à écrire de gauche à droite, chacun dans
 * la police qui en a les glyphes. L’algorithme bidirectionnel Unicode
 * (bidi-js) donne l’ordre d’affichage des segments. Les espaces restent dans
 * la police principale, entre deux mots arabes aussi : les outils d’extraction
 * de texte y voient la séparation des mots. fontkit façonne l’arabe et
 * retourne lui-même les glyphes d’un segment qui contient des lettres arabes :
 * ce segment lui est donc passé dans l’ordre logique, et seuls les autres
 * segments de droite à gauche (espaces, ponctuation) sont retournés ici.
 */
export function invoiceNameRuns(name: string): InvoiceNameRun[] {
  const { levels } = bidi.getEmbeddingLevels(name);
  const runs: Array<InvoiceNameRun & { level: number }> = [];
  const chars = Array.from(name);
  let index = 0;
  chars.forEach((char, position) => {
    const level = levels[index];
    index += char.length;
    const font = invoiceNameCharacterFont(chars, position);
    const previous = runs[runs.length - 1];
    if (previous && previous.level === level && previous.font === font) previous.text += char;
    else runs.push({ text: char, font, level });
  });

  // Règle L2 d’UAX #9, appliquée aux segments : du niveau le plus haut au plus
  // bas niveau impair, inverser chaque suite de segments de niveau au moins égal.
  const highest = Math.max(0, ...runs.map(run => run.level));
  const lowestOdd = Math.min(...runs.map(run => run.level | 1));
  for (let level = highest; level >= lowestOdd; level -= 1) {
    for (let start = 0; start < runs.length; start += 1) {
      if (runs[start].level < level) continue;
      let end = start;
      while (end + 1 < runs.length && runs[end + 1].level >= level) end += 1;
      runs.splice(start, end - start + 1, ...runs.slice(start, end + 1).reverse());
      start = end;
    }
  }

  return runs.map(({ text, font, level }) => {
    const rightToLeft = level % 2 === 1;
    const reversedByFontkit = font === "arabic" && ARABIC_LETTER.test(text);
    if (rightToLeft === reversedByFontkit) return { text, font };
    const chars = Array.from(text).reverse();
    return { text: (rightToLeft ? chars.map(char => bidi.getMirroredCharacter(char) ?? char) : chars).join(""), font };
  });
}

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

// Helvetica, police de repli (WinAnsi), n’a pas l’espace fine insécable
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
    // NFC : un nom saisi en lettres décomposées (« e » + accent) s’imprime avec
    // les glyphes accentués de la police au lieu de marques flottantes.
    buyerLines: [data.customerName.normalize("NFC"), data.customerEmail, data.customerPhone].filter(line => line.trim().length > 0),
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

      const font = invoiceFonts(doc);
      const regular = font("regular");
      const bold = font("bold");

      // Header
      doc.fontSize(8).font(bold).fillColor(INVOICE_BRAND.accent).text("ABL / HIPPOCAMPUS CONSULTING", { align: "center" });
      doc.moveDown(0.35);
      doc.fontSize(24).font(bold).fillColor(INVOICE_BRAND.ink).text("FACTURE", { align: "center" });
      doc.moveDown(0.5);

      // Seller (left)
      const [sellerName, ...sellerDetails] = content.sellerLines;
      doc.fontSize(10).font(bold).text(sellerName, 50, 100, { width: 280 });
      doc.fontSize(9).font(regular);
      for (const line of sellerDetails) doc.text(line, { width: 280 });
      const sellerBottom = doc.y;

      // Invoice details (right)
      doc.fontSize(10).font(bold);
      doc.text(`Facture N° : ${content.invoiceNumber}`, 350, 100, { width: 195 });
      doc.fontSize(9).font(regular);
      for (const line of content.metaLines) doc.text(line, 350, undefined, { width: 195 });
      const metaBottom = doc.y;

      // Separator
      const separatorY = Math.max(200, sellerBottom + 12, metaBottom + 12);
      doc.strokeColor(INVOICE_BRAND.accent).moveTo(50, separatorY).lineTo(545, separatorY).stroke();

      // Client info
      const clientY = separatorY + 20;
      doc.fontSize(12).font(bold).text("Facturé à :", 50, clientY);
      doc.fontSize(10).font(regular);
      const [buyerName = "", ...buyerDetails] = content.buyerLines;
      // Name: one segment per script, in display order (Arabic, Chinese).
      // PDFKit sets each segment from its own font's ascender, much taller in
      // the Arabic font: all segments take the main font's baseline instead.
      const baseline = currentFontBaseline(doc, 10);
      const nameRuns = invoiceNameRuns(buyerName);
      nameRuns.forEach((run, index) => {
        doc.font(font(run.font));
        const options = { continued: index < nameRuns.length - 1, baseline };
        if (index === 0) doc.text(run.text, 50, clientY + 20, options);
        else doc.text(run.text, options);
      });
      doc.font(regular);
      for (const line of buyerDetails) doc.text(line, 50);

      const detailsY = Math.max(clientY + 80, doc.y + 20);
      doc.fontSize(12).font(bold).text("Détails de la prestation :", 50, detailsY);

      // Table header
      const tableTop = detailsY + 30;
      doc.fontSize(9).font(bold);
      doc.text("Description", 50, tableTop, { width: 190 });
      doc.text("Date (heure de Paris)", 250, tableTop, { width: 125 });
      doc.text("Durée", 385, tableTop, { width: 55 });
      doc.text("Montant", 445, tableTop, { width: 100, align: "right" });

      doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

      // Table rows
      doc.fontSize(9).font(regular);
      let currentY = tableTop + 25;
      for (const row of content.rows) {
        doc.text(row.description, 50, currentY, { width: 190 });
        if (row.date) doc.text(row.date, 250, currentY, { width: 125 });
        if (row.duration) doc.text(row.duration, 385, currentY, { width: 55 });
        doc.text(row.amount, 445, currentY, { width: 100, align: "right" });
        currentY += 24;
      }

      // Total
      doc.moveTo(350, currentY).lineTo(545, currentY).stroke();
      currentY += 10;
      doc.fontSize(11).font(bold);
      doc.text(`${content.totalLabel} :`, 350, currentY, { width: 90 });
      doc.text(content.totalAmount, 445, currentY, { width: 100, align: "right" });
      currentY += 20;

      doc.fontSize(9).font(regular);
      for (const line of content.vatLines) {
        doc.text(line, 300, currentY, { width: 245, align: "right" });
        currentY = doc.y + 4;
      }

      // Payment status
      currentY += 10;
      doc.fontSize(10).font(regular);
      for (const line of content.paymentLines) {
        doc.text(line, 300, currentY, { width: 245, align: "right" });
        currentY = doc.y + 2;
      }

      // Footer
      doc.fontSize(8).font(regular).fillColor(INVOICE_BRAND.muted);
      doc.text(content.footerLines[0], 50, INVOICE_LAYOUT.footerBrandY, { align: "center", width: 495 });
      doc.text(content.footerLines[1], 50, INVOICE_LAYOUT.footerValidityY, { align: "center", width: 495 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
