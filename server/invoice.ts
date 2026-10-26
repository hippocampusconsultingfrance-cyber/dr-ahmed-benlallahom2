import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bidiFactory from "bidi-js";
import PDFDocument from "pdfkit";
import { storageGetBuffer, storagePutOnce } from "./storage.js";
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

/**
 * La police a-t-elle le dessin de ce caractère ? Sinon PDFKit imprime un carré
 * vide. Lu dans la police fontkit sous `_font.font`, que PDFKit ne type pas ;
 * Helvetica, police de repli, n’a pas cette table : on la croit capable.
 */
function fontHasGlyph(doc: PDFKit.PDFDocument, fontName: string, char: string): boolean {
  doc.font(fontName);
  const font = (doc as unknown as { _font?: { font?: { hasGlyphForCodePoint?: (codePoint: number) => boolean } } })._font?.font;
  return typeof font?.hasGlyphForCodePoint === "function" ? font.hasGlyphForCodePoint(char.codePointAt(0) ?? 0) : true;
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
// Noto Sans décompose ǹ ḿ ṃ ṅ ṣ ẹ ị ọ ụ (ccmp) en lettre de base et
// point souscrit ou accent, pour y empiler un ton (yoruba, igbo). PDFKit
// relie alors le glyphe de base à la lettre nue et la marque à rien : le texte
// copié ou extrait perdait le point (« Thi » pour « Thị »). Sans ccmp, la
// police prend sa lettre précomposée, au même dessin.
const DECOMPOSED_BY_NOTO_SANS = /[\u01f9\u1e3f\u1e43\u1e45\u1e63\u1eb9\u1ecb\u1ecd\u1ee5]/;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const PICTOGRAPH = new RegExp("[\\p{Extended_Pictographic}\\p{S}]", "u");
// Masqués par fontkit, même sans dessin dans la police (ZWJ, sélecteurs de variante…).
const INVISIBLE = new RegExp("\\p{Default_Ignorable_Code_Point}", "u");
const COMBINING_MARK = new RegExp("\\p{M}", "u");

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
 * Le nom tel que les polices de la facture savent l’imprimer, sans carré
 * vide : aucune n’a les emoji, ni l’hébreu, le coréen ou le thaï. Un caractère
 * sans dessin devient sa forme simple si les polices l’ont (lettres
 * « stylisées » ou entourées : 𝓙𝓮𝓪𝓷, Ⓙⓔⓐⓝ → Jean) ; sinon un emoji ou un
 * pictogramme est retiré, et tout autre caractère devient « ? ». Un nom fait
 * seulement d’emoji devient « - ». `hasGlyph` dit si la police qui écrirait le
 * caractère en a le dessin.
 */
export function printableInvoiceName(name: string, hasGlyph: (font: InvoiceNameRun["font"], char: string) => boolean): string {
  const drawable = (chars: string[], start: number, end: number) =>
    chars.slice(start, end).every((char, index) => INVISIBLE.test(char) || hasGlyph(invoiceNameCharacterFont(chars, start + index), char));
  const chars = Array.from(name);
  let position = 0;
  let removed = false;
  let printable = "";
  for (const { segment } of Array.from(GRAPHEMES.segment(name))) {
    const start = position;
    position += Array.from(segment).length;
    if (drawable(chars, start, position)) {
      printable += segment;
      continue;
    }
    // La forme simple d’abord : les lettres entourées (Ⓙ, 🄹) sont des symboles.
    const simple = Array.from(segment.normalize("NFKD")).filter(char => !COMBINING_MARK.test(char));
    if (simple.length > 0 && drawable(simple, 0, simple.length)) printable += simple.join("");
    else if (PICTOGRAPH.test(segment)) removed = true;
    else printable += "?";
  }
  if (!removed) return printable;
  // Un emoji retiré entre deux mots y laissait deux espaces. Sans rien
  // d’imprimable, un tiret garde la ligne du nom : l’email et le tableau
  // restent à leur hauteur.
  return printable.replace(/\s{2,}/g, " ").trim() || "-";
}

/**
 * Retirer la décomposition (ccmp) des lettres que Noto Sans décompose. fontkit
 * retire une fonctionnalité donnée à false ; les types de PDFKit ne connaissent
 * que la liste de celles à ajouter. Un objet neuf à chaque appel : fontkit y
 * inscrit les fonctionnalités qu’il applique.
 */
function invoiceNameFeatures(run: InvoiceNameRun): PDFKit.Mixins.OpenTypeFeatures[] | undefined {
  if (run.font !== "regular" || !DECOMPOSED_BY_NOTO_SANS.test(run.text)) return undefined;
  return { ccmp: false } as unknown as PDFKit.Mixins.OpenTypeFeatures[];
}

type InvoiceNameChar = { char: string; font: InvoiceNameRun["font"]; level: number };

/** Caractères du nom, avec leur police et leur niveau bidi calculé sur tout le nom (UAX #9). */
function invoiceNameChars(name: string): InvoiceNameChar[] {
  const { levels } = bidi.getEmbeddingLevels(name);
  const chars = Array.from(name);
  let index = 0;
  return chars.map((char, position) => {
    const level = levels[index];
    index += char.length;
    return { char, font: invoiceNameCharacterFont(chars, position), level };
  });
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
  return invoiceLineRuns(invoiceNameChars(name));
}

/**
 * Lignes du nom, chacune en segments à écrire de gauche à droite. Comme le veut
 * UAX #9, la coupure se fait dans l’ordre logique, puis chaque ligne est remise
 * dans l’ordre d’affichage : couper la ligne déjà retournée, comme le faisait
 * PDFKit, mettait la fin d’un long nom arabe sur la première ligne. Une ligne
 * s’arrête au dernier mot qui tient (`fits`), ou dans un mot plus long qu’elle ;
 * les espaces de la coupure ne s’impriment pas.
 */
export function invoiceNameLines(name: string, fits: (runs: InvoiceNameRun[]) => boolean): InvoiceNameRun[][] {
  const chars = invoiceNameChars(name);
  const space = (position: number) => chars[position]?.char === " ";
  const line = (start: number, end: number) => invoiceLineRuns(chars.slice(start, end));
  const lines: InvoiceNameRun[][] = [];
  let start = 0;
  while (space(start)) start += 1;
  while (start < chars.length) {
    let end = start;
    for (let position = start + 1; position <= chars.length; position += 1) {
      if (space(position - 1) || (position < chars.length && !space(position))) continue; // pas une fin de mot
      if (!fits(line(start, position))) break;
      end = position;
    }
    if (end === start) {
      // Le plus long début du mot qui tient, d’au moins un caractère, sans
      // détacher une lettre de ses marques (harakat, accents combinants).
      let low = start + 1;
      let high = start + 1;
      while (high < chars.length && !space(high)) high += 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits(line(start, middle))) low = middle;
        else high = middle - 1;
      }
      end = low;
      while (end > start + 1 && end < chars.length && COMBINING_MARK.test(chars[end].char)) end -= 1;
    }
    lines.push(line(start, end));
    start = end;
    while (space(start)) start += 1;
  }
  return lines;
}

/** Vrai si une partie du nom s’écrit de droite à gauche. */
function hasRightToLeft(name: string): boolean {
  return invoiceNameChars(name).some(({ level }) => level % 2 === 1);
}

function invoiceLineRuns(chars: InvoiceNameChar[]): InvoiceNameRun[] {
  const runs: Array<InvoiceNameRun & { level: number }> = [];
  for (const { char, font, level } of chars) {
    const previous = runs[runs.length - 1];
    if (previous && previous.level === level && previous.font === font) previous.text += char;
    else runs.push({ text: char, font, level });
  }

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

/** Where the copy of an issued invoice is stored, one per number. */
function invoiceStorageKey(data: Pick<InvoiceData, "invoiceNumber" | "trackingId">) {
  return `invoices/${data.invoiceNumber}-${data.trackingId}.pdf`;
}

/**
 * `issuedNow`: its number was just allocated by the caller (first issue), so
 * no copy of it can be stored yet.
 */
export async function generateInvoicePDF(
  data: InvoiceData,
  seller: InvoiceSeller = resolveInvoiceSeller(),
  options: { issuedNow?: boolean } = {},
): Promise<{ buffer: Buffer; key: string; url: string }> {
  const buffer = await renderInvoicePDF(data, seller);
  const invoiceKey = invoiceStorageKey(data);
  let stored: Awaited<ReturnType<typeof storagePutOnce>>;
  try {
    // One stored copy per invoice number: a retried job keeps the copy already
    // stored (EXPL-02).
    stored = await storagePutOnce(invoiceKey, buffer, "application/pdf");
  } catch (storageError) {
    const message = storageError instanceof Error ? storageError.message : "UnknownError";
    const code = (storageError as { code?: unknown }).code;
    // The store could not say whether an invoice issued before was stored at
    // its issue (outage, rate limit, suspended store): its stored copy, issued
    // with the details of that time, may differ from the one just built from
    // the current data (EXPL-02, an address corrected since). Nothing is built
    // in its place: the caller fails and tries again (the job's next attempt,
    // a new download).
    if (message === "storage_check_failed" && !options.issuedNow) {
      console.error("Invoice archive could not be checked; the invoice is not rebuilt:", message, code);
      throw storageError;
    }
    // None was stored yet (first issue, or no store is configured): the
    // invoice just built is the one issued; it is stored at its next build.
    console.error("Failed to upload invoice to private storage:", message, code);
    return { buffer, key: invoiceKey, url: "" };
  }
  // An issued invoice no longer changes (EXPL-02): once stored, the email and
  // the dashboard download give that very PDF, with the patient details it was
  // issued with, even after the patient's address was corrected from the
  // dashboard. A stored copy that cannot be read is not replaced by another
  // one: the caller fails and tries again.
  if (!stored.uploaded) return { buffer: await storageGetBuffer(stored.key), key: stored.key, url: stored.url };
  return { buffer, key: stored.key, url: stored.url };
}

/**
 * Stores the invoice built from this data, unless a copy of it is stored
 * already, which is kept as it is (EXPL-02): an invoice issued while the store
 * could not be checked was emailed without a stored copy, and is stored this
 * way before the details it carries change. Throws, nothing stored, when the
 * store cannot say whether a copy is there or cannot take it
 * ("storage_check_failed", "storage_upload_failed", with its code).
 */
export async function archiveInvoicePDF(data: InvoiceData, seller: InvoiceSeller = resolveInvoiceSeller()): Promise<{ key: string; uploaded: boolean }> {
  const { key, uploaded } = await storagePutOnce(invoiceStorageKey(data), await renderInvoicePDF(data, seller), "application/pdf");
  return { key, uploaded };
}

/**
 * The invoice PDF, without storing it. Deterministic: the same data gives the
 * same bytes, so a retried job rebuilds the very invoice from its recorded
 * number and dates (EXPL-02).
 */
export function renderInvoicePDF(
  data: InvoiceData,
  seller: InvoiceSeller = resolveInvoiceSeller(),
): Promise<Buffer> {
  const content = buildInvoiceContent(data, seller);
  return new Promise((resolve, reject) => {
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
      doc.on("end", () => resolve(Buffer.concat(chunks)));
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
      const lineHeight = doc.currentLineHeight(true);
      const name = printableInvoiceName(buyerName, (key, char) => fontHasGlyph(doc, font(key), char));
      const nameRuns = invoiceNameRuns(name);
      if (nameRuns.length === 1 && nameRuns[0].font === "regular" && !hasRightToLeft(name)) {
        // Latin, Greek, Cyrillic: PDFKit wraps a long name itself, as before.
        doc.font(regular).text(name, 50, clientY + 20, { baseline, features: invoiceNameFeatures(nameRuns[0]) });
      } else {
        // Lines cut in reading order, each one main-font line apart: the taller
        // Arabic and Chinese fonts no longer push the email and table down.
        const nameWidth = doc.page.width - 50 - doc.page.margins.right;
        const widthOf = (runs: InvoiceNameRun[]) =>
          runs.reduce((width, run) => width + doc.font(font(run.font)).widthOfString(run.text, { features: invoiceNameFeatures(run) }), 0);
        let lineY = clientY + 20;
        for (const line of invoiceNameLines(name, runs => widthOf(runs) <= nameWidth)) {
          line.forEach((run, index) => {
            doc.font(font(run.font));
            const options = { lineBreak: false, baseline, features: invoiceNameFeatures(run) };
            if (index === 0) doc.text(run.text, 50, lineY, options);
            else doc.text(run.text, options);
          });
          lineY += lineHeight;
        }
        doc.y = lineY;
      }
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
