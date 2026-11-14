import express from "express";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { listen } from "./testSupport/candidateUploadApp";

/**
 * EXPL-15: pdfkit, @vercel/blob and svix are loaded at their first use, not
 * with the modules that use them. Every module of the Vercel function is
 * imported at its cold start, so a package they import at the top is loaded
 * before the first request is answered, whatever that request does.
 *
 * Each mock counts the loads of its package (Vitest runs a module's factory
 * once, when it is first imported, and not again after vi.resetModules()) and
 * gives the real one. The tests of a package that must stay unloaded therefore
 * run before any test that loads it.
 */
const loads = vi.hoisted(() => ({ pdfkit: 0, blob: 0, svix: 0 }));
vi.mock("pdfkit", async importOriginal => {
  loads.pdfkit += 1;
  return importOriginal();
});
vi.mock("@vercel/blob", async importOriginal => {
  loads.blob += 1;
  const { BlobNotFoundError } =
    await importOriginal<typeof import("@vercel/blob")>();
  return {
    BlobNotFoundError,
    head: vi.fn(async () => {
      throw new BlobNotFoundError();
    }),
    put: vi.fn(async (pathname: string) => ({
      pathname,
      url: `https://blob.test/${pathname}`,
    })),
  };
});
vi.mock("svix", async importOriginal => {
  loads.svix += 1;
  return importOriginal();
});
vi.mock("./resendWebhookEvents", () => ({
  recordResendEmailEvent: vi.fn(async () => ({ duplicate: false })),
}));

const { generateInvoicePDF } = await import("./invoice");
const {
  storageDelete,
  storageGetSignedUrl,
  storageListObjects,
  storagePut,
  storagePutOnce,
} = await import("./storage");
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
afterAll(async () => {
  await close();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const unsignedResendEvent = () =>
  fetch(`${baseUrl}/api/webhooks/resend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

describe("paquets chargés à la première utilisation, pas au démarrage à froid (EXPL-15)", () => {
  it("n'a chargé ni pdfkit, ni @vercel/blob, ni svix avec les modules de la facture, du stockage et du webhook Resend", () => {
    expect(loads).toEqual({ pdfkit: 0, blob: 0, svix: 0 });
  });

  // Before any invoice, while the SDK has not been loaded yet.
  it("ne charge pas @vercel/blob quand aucun stockage n'est configuré", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const cv = Buffer.from("%PDF-1.4");
    await expect(
      storagePut("candidate-documents/cv.pdf", cv)
    ).rejects.toMatchObject({
      message: "storage_upload_failed",
      code: "storage_config_missing",
    });
    await expect(
      storagePutOnce("invoices/FAC-2026-000077-APTCOLDSTART1.pdf", cv)
    ).rejects.toMatchObject({
      message: "storage_upload_failed",
      code: "storage_config_missing",
    });
    const configMissing =
      "Private storage config missing: set BLOB_READ_WRITE_TOKEN";
    await expect(
      storageGetSignedUrl("candidate-documents/cv.pdf")
    ).rejects.toThrow(configMissing);
    await expect(storageDelete(["candidate-documents/cv.pdf"])).rejects.toThrow(
      configMissing
    );
    await expect(storageListObjects("candidate-documents/")).rejects.toThrow(
      configMissing
    );
    expect(loads.blob).toBe(0);
  });

  it("charge pdfkit et @vercel/blob à la première facture", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-test-token");
    const first = await generateInvoicePDF(invoice, resolveInvoiceSeller({}));
    expect(first.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(first.url).toBe(
      "https://blob.test/invoices/FAC-2026-000077-APTCOLDSTART1.pdf"
    );
    expect(loads).toMatchObject({ pdfkit: 1, blob: 1 });

    // Once loaded, the packages serve the next invoices and uploads.
    const again = await generateInvoicePDF(
      { ...invoice, invoiceNumber: "FAC-2026-000078" },
      resolveInvoiceSeller({})
    );
    expect(again.url).toBe(
      "https://blob.test/invoices/FAC-2026-000078-APTCOLDSTART1.pdf"
    );
    const cv = await storagePut(
      "candidate-documents/cv.pdf",
      Buffer.from("%PDF-1.4"),
      "application/pdf"
    );
    expect(cv.url).toMatch(
      /^https:\/\/blob\.test\/candidate-documents\/cv_[0-9a-f]{8}\.pdf$/
    );
  });

  it("charge svix au premier évènement Resend", async () => {
    vi.stubEnv(
      "RESEND_WEBHOOK_SECRET",
      `whsec_${Buffer.from("cold-start-test-secret").toString("base64")}`
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(loads.svix).toBe(0);
    expect((await unsignedResendEvent()).status).toBe(400);
    expect(loads.svix).toBe(1);
  });
});

describe("svix introuvable au premier évènement Resend (EXPL-15)", () => {
  it("répond 500, que Resend renvoie, et non le 400 d'une signature refusée, puis réessaie de le charger à l'évènement suivant", async () => {
    vi.resetModules();
    vi.doMock("svix", () => {
      throw new Error(
        "Cannot find package 'svix' imported from /var/task/dist/vercel/index.js"
      );
    });
    vi.stubEnv(
      "RESEND_WEBHOOK_SECRET",
      `whsec_${Buffer.from("cold-start-test-secret").toString("base64")}`
    );
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { registerResendWebhookRoute: register } = await import(
      "./routes/resendWebhook"
    );
    const app = express();
    register(app);
    const listening = await listen(app as never);
    try {
      const post = () =>
        fetch(`${listening.baseUrl}/api/webhooks/resend`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
      const unavailable = await post();
      expect(unavailable.status).toBe(500);
      expect(await unavailable.text()).toBe("Resend webhook unavailable");
      // One JSON line from logError (EXPL-11), the label saying where it failed.
      const labelOf = (line: unknown) => {
        try {
          return (JSON.parse(String(line)) as { label?: string }).label;
        } catch {
          return undefined;
        }
      };
      expect(error.mock.calls.map(([line]) => labelOf(line))).toContain(
        "Resend webhook unavailable"
      );

      // Installed again (next deployment, transient failure): the next event loads it.
      vi.doUnmock("svix");
      expect((await post()).status).toBe(400);
      expect(labelOf(error.mock.lastCall?.[0])).toBe(
        "Resend webhook verification failed"
      );
    } finally {
      await new Promise(resolve => listening.server.close(resolve));
    }
  });
});
