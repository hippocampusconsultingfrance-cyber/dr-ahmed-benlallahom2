import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("livraison sécurisée des factures", () => {
  it("envoie le PDF en pièce jointe et n’expose aucun lien public sur la confirmation", async () => {
    const root = process.cwd();
    const [notifications, confirmation] = await Promise.all([
      readFile(path.join(root, "server/_core/notifications.ts"), "utf8"),
      readFile(path.join(root, "client/src/pages/BookingConfirmationPage.tsx"), "utf8"),
    ]);

    expect(notifications).toContain("attachments:");
    expect(notifications).toContain("filename: `Facture-${trackingId}.pdf`");
    expect(notifications).toContain('content: invoicePdfBuffer.toString("base64")');
    expect(notifications).not.toContain("invoiceUrl");
    expect(confirmation).toContain("Facture PDF incluse");
    expect(confirmation).not.toMatch(/href=\{?[^}]*invoice/i);
  });
});
