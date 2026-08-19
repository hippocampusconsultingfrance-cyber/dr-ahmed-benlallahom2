import { beforeEach, describe, expect, it, vi } from "vitest";

const { storagePut } = vi.hoisted(() => ({ storagePut: vi.fn() }));

vi.mock("./storage.js", () => ({ storagePut }));

import { generateInvoicePDF } from "./invoice";

describe("génération de facture PDF", () => {
  beforeEach(() => {
    storagePut.mockResolvedValue({ key: "invoices/TEST-001.pdf", url: "https://storage.test/invoice.pdf" });
  });

  it("produit un PDF A4 stockable pour une consultation payée", async () => {
    const invoice = await generateInvoicePDF({
      trackingId: "TEST-001",
      customerName: "Patient de test",
      customerEmail: "patient@example.test",
      customerPhone: "+33102030405",
      appointmentDate: new Date("2026-08-20T09:00:00.000Z"),
      consultationType: "Conseil en santé",
      duration: 30,
      basePrice: 100,
      finalPrice: 150,
      isNightRate: true,
      paymentDate: new Date("2026-08-19T08:00:00.000Z"),
    });

    expect(invoice.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(invoice.buffer.length).toBeGreaterThan(1_000);
    expect(invoice.key).toBe("invoices/TEST-001.pdf");
    expect(storagePut).toHaveBeenCalledWith("invoices/TEST-001.pdf", expect.any(Buffer), "application/pdf");
  });
});
