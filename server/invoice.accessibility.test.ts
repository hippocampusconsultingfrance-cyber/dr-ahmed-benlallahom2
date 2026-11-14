import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  storagePutOnce: vi.fn(),
  storageGetBuffer: vi.fn(),
}));
vi.mock("./storage.js", () => storage);

import {
  generateInvoicePDF,
  renderInvoicePDF,
  type InvoiceData,
} from "./invoice";
import { resolveInvoiceSeller } from "./invoiceSeller";

// A11Y-21 — a new invoice declares its language (always French) and has its
// title shown by the viewer; it is not claimed as tagged, no structure being
// marked in it. An invoice already stored is sent back as it was issued
// (EXPL-02).

const invoice: InvoiceData = {
  invoiceNumber: "FAC-2026-000077",
  issueDate: new Date("2026-10-11T22:46:00.000Z"),
  paymentDate: new Date("2026-10-11T22:45:00.000Z"),
  trackingId: "APTA11Y000001",
  customerName: "Patient de test",
  customerEmail: "patient@example.test",
  customerPhone: "+33102030405",
  appointmentDate: new Date("2026-10-15T22:30:00.000Z"),
  consultationType: "Conseil en santé",
  duration: 30,
  basePrice: 100,
  finalPrice: 100,
  isNightRate: false,
};

/**
 * The document catalog and the info dictionary, with their references
 * resolved: PDFKit writes them uncompressed, each value its own object.
 */
function pdfDictionaries(buffer: Buffer) {
  const pdf = buffer.toString("latin1");
  const object = (reference: string | undefined) =>
    reference
      ? new RegExp(`(?:^|\\n)${reference} 0 obj\\n([^]*?)\\nendobj`).exec(
          pdf
        )?.[1]
      : undefined;
  const entry = (dictionary: string | undefined, key: string) => {
    const value = new RegExp(`/${key} (\\d+) 0 R|/${key} ([^\\n]+)`).exec(
      dictionary ?? ""
    );
    return value?.[1] ? object(value[1]) : value?.[2];
  };
  const catalog = /\d+ 0 obj\n(<<\n\/Type \/Catalog[^]*?>>)\nendobj/.exec(
    pdf
  )?.[1];
  const info = object(/\/Info (\d+) 0 R/.exec(pdf)?.[1]);
  return { catalog, entry, info };
}

beforeEach(() => {
  storage.storagePutOnce.mockReset();
  storage.storageGetBuffer.mockReset();
});

describe("facture PDF accessible (A11Y-21)", () => {
  it("déclare le français et affiche son titre, sans se dire balisée", async () => {
    const { catalog, entry, info } = pdfDictionaries(
      await renderInvoicePDF(invoice, resolveInvoiceSeller({}))
    );
    expect(entry(catalog, "Lang")).toBe("(fr-FR)");
    expect(entry(entry(catalog, "ViewerPreferences"), "DisplayDocTitle")).toBe(
      "true"
    );
    expect(entry(info, "Title")).toBe("(Facture FAC-2026-000077)");
    expect(entry(catalog, "MarkInfo")).toBeUndefined();
    expect(entry(catalog, "StructTreeRoot")).toBeUndefined();
  });

  it("renvoie telle quelle une facture déjà archivée, émise avant ce changement", async () => {
    const issuedBefore = Buffer.from(
      "%PDF-1.3\n% copie archivée sans /Lang\n%%EOF"
    );
    storage.storagePutOnce.mockResolvedValue({
      key: "invoices/FAC-2026-000077-APTA11Y000001.pdf",
      url: "https://storage.test/invoice.pdf",
      uploaded: false,
    });
    storage.storageGetBuffer.mockResolvedValue(issuedBefore);

    const sent = await generateInvoicePDF(invoice, resolveInvoiceSeller({}));
    expect(sent.buffer.equals(issuedBefore)).toBe(true);
    expect(storage.storageGetBuffer).toHaveBeenCalledWith(
      "invoices/FAC-2026-000077-APTA11Y000001.pdf"
    );
  });
});
