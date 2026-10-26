import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { storagePutOnce } = vi.hoisted(() => ({ storagePutOnce: vi.fn() }));

vi.mock("./storage.js", () => ({ storagePutOnce }));

import { buildInvoiceContent, formatInvoiceAmount, generateInvoicePDF, type InvoiceData } from "./invoice";
import { resolveInvoiceSeller } from "./invoiceSeller";
import { HIPPOCAMPUS_LEGAL } from "../shared/legalIdentity";

async function pdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.replace(/\s+/g, " ");
  } finally {
    await parser.destroy();
  }
}

// Rendez-vous de nuit à 00:30 heure de Paris (22:30 UTC la veille), facture émise
// à 00:46 heure de Paris le 12 octobre (22:46 UTC le 11) : en UTC, les deux dates
// basculeraient sur la veille.
const nightInvoice: InvoiceData = {
  invoiceNumber: "FAC-2026-000042",
  issueDate: new Date("2026-10-11T22:46:00.000Z"),
  paymentDate: new Date("2026-10-11T22:45:00.000Z"),
  trackingId: "APTTEST000001",
  customerName: "Patient de test",
  customerEmail: "patient@example.test",
  customerPhone: "+33102030405",
  appointmentDate: new Date("2026-10-15T22:30:00.000Z"),
  consultationType: "Conseil en santé",
  duration: 30,
  basePrice: 100,
  finalPrice: 150,
  isNightRate: true,
};

const originalTz = process.env.TZ;

describe("génération de facture PDF", () => {
  beforeEach(() => {
    process.env.TZ = "UTC";
    storagePutOnce.mockClear();
    storagePutOnce.mockResolvedValue({ key: "invoices/FAC-2026-000042-APTTEST000001.pdf", url: "https://storage.test/invoice.pdf", uploaded: true });
  });
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("régénère une facture octet pour octet (même pièce jointe sous la même clé d’idempotence Resend)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-12T06:20:00.000Z"));
      const first = await generateInvoicePDF(nightInvoice, resolveInvoiceSeller({}));
      // Retry by the next daily cron, one day later.
      vi.setSystemTime(new Date("2026-10-13T06:20:07.000Z"));
      const retry = await generateInvoicePDF(nightInvoice, resolveInvoiceSeller({}));
      expect(retry.buffer.equals(first.buffer)).toBe(true);
      // Same exact key on every attempt (no random suffix): the copy stored first is kept, never a second one.
      expect(storagePutOnce.mock.calls.map(([key]) => key)).toEqual(["invoices/FAC-2026-000042-APTTEST000001.pdf", "invoices/FAC-2026-000042-APTTEST000001.pdf"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ne reconstruit pas une facture dont la copie archivée n’a pas pu être vérifiée : stockage indisponible, elle n’est rendue qu’au nouvel essai (EXPL-02)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Vercel Blob cannot say whether the invoice was stored at its issue (head() fails).
    storagePutOnce.mockRejectedValueOnce(Object.assign(new Error("storage_check_failed"), { code: "storage_service_unavailable" }));
    await expect(generateInvoicePDF({ ...nightInvoice, customerEmail: "adresse.corrigee@example.test" }, resolveInvoiceSeller({}))).rejects.toThrow("storage_check_failed");

    // None stored yet, and its upload fails: the invoice just built is the one issued.
    storagePutOnce.mockRejectedValueOnce(Object.assign(new Error("storage_upload_failed"), { code: "storage_service_unavailable" }));
    const unstored = await generateInvoicePDF(nightInvoice, resolveInvoiceSeller({}));
    expect(unstored.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(unstored.url).toBe("");
  });

  it("produit un PDF A4 stockable sous son numéro de facture", async () => {
    const invoice = await generateInvoicePDF(nightInvoice, resolveInvoiceSeller({}));

    expect(invoice.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(invoice.buffer.length).toBeGreaterThan(1_000);
    expect(storagePutOnce).toHaveBeenCalledWith("invoices/FAC-2026-000042-APTTEST000001.pdf", expect.any(Buffer), "application/pdf");
  });

  it("imprime l’heure de Paris, le numéro séquentiel et l’identité du vendeur même avec TZ=UTC", async () => {
    expect(new Date(nightInvoice.appointmentDate).getHours()).toBe(22); // processus réellement en UTC

    const invoice = await generateInvoicePDF(nightInvoice, resolveInvoiceSeller({}));
    const text = await pdfText(invoice.buffer);

    expect(text).toContain("FAC-2026-000042");
    expect(text).toContain("16 octobre 2026 à 00:30");
    expect(text).not.toContain("15 octobre 2026");
    expect(text).toContain("heure de Paris");
    expect(text).toContain("Date d’émission : 12 octobre 2026");
    expect(text).toContain("Date de paiement : 12 octobre 2026");
    expect(text).toContain("150,00 €");
    expect(text).toContain("50,00 €");
    expect(text).not.toMatch(/\d\.\d{2} €/);
    expect(text).toContain(HIPPOCAMPUS_LEGAL.name);
    expect(text).toContain(HIPPOCAMPUS_LEGAL.rcs);
    expect(text).toContain("au capital de 1 000 €");
    expect(text).toContain("6 rue d’Armaillé, 75017 Paris");
    expect(text).toContain("Patient de test");
    expect(text).not.toContain("INV-");
    expect(text).not.toContain("TTC");
  });

  it("n’invente aucune mention de TVA : la ligne vient uniquement de INVOICE_VAT_MENTION", () => {
    const withoutVat = buildInvoiceContent(nightInvoice, resolveInvoiceSeller({}));
    expect(withoutVat.vatLines).toEqual([]);
    expect(withoutVat.sellerLines.join("\n")).not.toMatch(/TVA/);

    const withVat = buildInvoiceContent(nightInvoice, resolveInvoiceSeller({
      INVOICE_VAT_MENTION: "Mention TVA validée par l’expert-comptable",
      INVOICE_SELLER_VAT_NUMBER: "FR00TEST",
    }));
    expect(withVat.vatLines).toEqual(["Mention TVA validée par l’expert-comptable"]);
    expect(withVat.sellerLines).toContain("N° TVA intracommunautaire : FR00TEST");
  });

  it("permet de remplacer l’identité du vendeur par variables d’environnement", () => {
    const seller = resolveInvoiceSeller({ INVOICE_SELLER_NAME: "Autre entité", INVOICE_SELLER_ADDRESS: "1 rue Test, 75001 Paris" });
    const content = buildInvoiceContent(nightInvoice, seller);
    expect(content.sellerLines[0]).toBe("Autre entité");
    expect(content.sellerLines).toContain("Siège social : 1 rue Test, 75001 Paris");
    expect(content.sellerLines).toContain(HIPPOCAMPUS_LEGAL.rcs);
  });

  it("formate les montants à la française", () => {
    expect(formatInvoiceAmount(100)).toBe("100,00 €");
    expect(formatInvoiceAmount(1150.5)).toBe("1 150,50 €");
  });
});
