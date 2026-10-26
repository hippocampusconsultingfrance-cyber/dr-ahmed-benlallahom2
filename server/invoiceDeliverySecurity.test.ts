import { beforeEach, describe, expect, it, vi } from "vitest";

// La facture part en pièce jointe de l’email (jamais un lien public). Seul le
// transport Resend est simulé ; la page de confirmation est vérifiée dans
// client/src/pages/BookingConfirmationPage.render.test.ts.

const sent = vi.hoisted(() => ({ emails: [] as Array<Record<string, unknown>> }));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(async (message: Record<string, unknown>) => {
        sent.emails.push(message);
        return { data: { id: `email_${sent.emails.length}` }, error: null };
      }),
    },
  })),
}));
vi.mock("./_core/notification", async importOriginal => ({ ...await importOriginal<typeof import("./_core/notification")>(), notifyOwner: vi.fn(async () => true) }));

const { sendInvoiceEmail } = await import("./_core/notifications");

type Attachment = { filename: string; content: string };
const pdf = Buffer.from("%PDF-1.7\n% facture de test\n%%EOF\n", "latin1");

beforeEach(() => {
  sent.emails.length = 0;
  vi.stubEnv("RESEND_API_KEY", "re_test_invoice_delivery");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("livraison sécurisée des factures", () => {
  it("envoie le PDF lui-même en pièce jointe, nommé d’après le numéro de facture", async () => {
    await sendInvoiceEmail("patient@example.test", "Patient Test", "APTINVOICE001", 150, pdf, "FAC-2026-000042");

    const [message] = sent.emails;
    const attachments = message!.attachments as Attachment[];
    expect(attachments).toHaveLength(1);
    expect(attachments[0]!.filename).toBe("Facture-FAC-2026-000042.pdf");
    expect(Buffer.from(attachments[0]!.content, "base64").equals(pdf)).toBe(true);
  });

  it("nomme la pièce jointe d’après la référence de suivi sans numéro de facture", async () => {
    await sendInvoiceEmail("patient@example.test", "Patient Test", "APTINVOICE002", 150, pdf);
    expect((sent.emails[0]!.attachments as Attachment[])[0]!.filename).toBe("Facture-APTINVOICE002.pdf");
  });

  it("n’expose aucun lien vers la facture dans l’email", async () => {
    await sendInvoiceEmail("patient@example.test", "Patient Test", "APTINVOICE003", 150, pdf, "FAC-2026-000043");

    const { html, text } = sent.emails[0] as { html: string; text: string };
    const links = [...String(html).matchAll(/href="([^"]+)"/g)].map(match => match[1]!);
    expect(links.filter(link => /invoice|facture|\.pdf|blob\.|FAC-2026/i.test(link))).toEqual([]);
    expect(String(text)).not.toMatch(/https?:\/\/\S*(invoice|facture|\.pdf)/i);
  });
});
