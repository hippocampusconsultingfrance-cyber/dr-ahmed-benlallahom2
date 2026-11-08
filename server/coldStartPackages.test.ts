import express from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { listen } from "./testSupport/candidateUploadApp";

/**
 * EXPL-15: pdfkit, @vercel/blob and svix are loaded at their first use, not
 * with the modules that use them. Every module of the Vercel function is
 * imported at its cold start, so a package they import at the top is loaded
 * before the first request is answered, whatever that request does.
 *
 * Each mock counts the loads of its package (Vitest runs a module's factory
 * once, when it is first imported) and gives the real one.
 */
const loads = vi.hoisted(() => ({ pdfkit: 0, blob: 0, svix: 0 }));
vi.mock("pdfkit", async importOriginal => {
  loads.pdfkit += 1;
  return importOriginal();
});
vi.mock("@vercel/blob", async importOriginal => {
  loads.blob += 1;
  const { BlobNotFoundError } = await importOriginal<typeof import("@vercel/blob")>();
  return {
    BlobNotFoundError,
    head: vi.fn(async () => { throw new BlobNotFoundError(); }),
    put: vi.fn(async (pathname: string) => ({ pathname, url: `https://blob.test/${pathname}` })),
  };
});
vi.mock("svix", async importOriginal => {
  loads.svix += 1;
  return importOriginal();
});
vi.mock("./resendWebhookEvents", () => ({ recordResendEmailEvent: vi.fn(async () => ({ duplicate: false })) }));

const { generateInvoicePDF } = await import("./invoice");
const { storagePut } = await import("./storage");
const { registerResendWebhookRoute } = await import("./routes/resendWebhook");
const { resolveInvoiceSeller } = await import("./invoiceSeller");

const invoice = {
  invoiceNumber: "FAC-2026-000077",
  issueDate: new Date("2026-10-11T22:46:00.000Z"),
  paymentDate: new Date("2026-10-11T22:45:00.000Z"),
  trackingId: "APTCOLDSTART1",
  customerName: "Zoë Ørsted",
  customerEmail: "patient@example.test",
  customerPhone: "+33102030405",
  appointmentDate: new Date("2026-10-15T08:30:00.000Z"),
  consultationType: "Conseil en santé",
  duration: 30,
  basePrice: 100,
  finalPrice: 100,
  isNightRate: false,
};

let baseUrl = "";
let close: () => Promise<void> = async () => undefined;
beforeAll(async () => {
  const app = express();
  registerResendWebhookRoute(app);
  const listening = await listen(app as never);
  baseUrl = listening.baseUrl;
  close = () => new Promise(resolve => listening.server.close(() => resolve()));
});
afterAll(async () => { await close(); });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const unsignedResendEvent = () => fetch(`${baseUrl}/api/webhooks/resend`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

describe("paquets chargés à la première utilisation, pas au démarrage à froid (EXPL-15)", () => {
  it("n'a chargé ni pdfkit, ni @vercel/blob, ni svix avec les modules de la facture, du stockage et du webhook Resend", () => {
    expect(loads).toEqual({ pdfkit: 0, blob: 0, svix: 0 });
  });

  it("charge pdfkit et @vercel/blob à la première facture, une seule fois pour les suivantes", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-test-token");
    const first = await generateInvoicePDF(invoice, resolveInvoiceSeller({}));
    expect(first.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(first.url).toBe("https://blob.test/invoices/FAC-2026-000077-APTCOLDSTART1.pdf");
    expect(loads).toMatchObject({ pdfkit: 1, blob: 1 });

    const again = await generateInvoicePDF({ ...invoice, invoiceNumber: "FAC-2026-000078" }, resolveInvoiceSeller({}));
    await storagePut("candidate-documents/cv.pdf", Buffer.from("%PDF-1.4"), "application/pdf");
    expect(again.url).toBe("https://blob.test/invoices/FAC-2026-000078-APTCOLDSTART1.pdf");
    expect(loads).toMatchObject({ pdfkit: 1, blob: 1 });
  });

  it("ne charge pas @vercel/blob quand aucun stockage n'est configuré", async () => {
    vi.resetModules();
    loads.blob = 0;
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const { storagePut: unconfiguredPut } = await import("./storage");
    await expect(unconfiguredPut("candidate-documents/cv.pdf", Buffer.from("%PDF-1.4"))).rejects.toMatchObject({ message: "storage_upload_failed", code: "storage_config_missing" });
    expect(loads.blob).toBe(0);
  });

  it("charge svix au premier évènement Resend, une seule fois pour les suivants", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${Buffer.from("cold-start-test-secret").toString("base64")}`);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await unsignedResendEvent()).status).toBe(400);
    expect((await unsignedResendEvent()).status).toBe(400);
    expect(loads.svix).toBe(1);
  });
});

describe("svix introuvable au premier évènement Resend (EXPL-15)", () => {
  it("répond 500, que Resend renvoie, et non le 400 d'une signature refusée, puis réessaie de le charger à l'évènement suivant", async () => {
    vi.resetModules();
    vi.doMock("svix", () => {
      throw new Error("Cannot find package 'svix' imported from /var/task/dist/vercel/index.js");
    });
    vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${Buffer.from("cold-start-test-secret").toString("base64")}`);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { registerResendWebhookRoute: register } = await import("./routes/resendWebhook");
    const app = express();
    register(app);
    const listening = await listen(app as never);
    try {
      const post = () => fetch(`${listening.baseUrl}/api/webhooks/resend`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const unavailable = await post();
      expect(unavailable.status).toBe(500);
      expect(await unavailable.text()).toBe("Resend webhook unavailable");
      expect(error).toHaveBeenCalledWith("Resend webhook unavailable", expect.any(String));

      // Installed again (next deployment, transient failure): the next event loads it.
      vi.doUnmock("svix");
      expect((await post()).status).toBe(400);
      expect(error).toHaveBeenLastCalledWith("Resend webhook verification failed:", expect.any(String));
    } finally {
      await new Promise(resolve => listening.server.close(resolve));
    }
  });
});
