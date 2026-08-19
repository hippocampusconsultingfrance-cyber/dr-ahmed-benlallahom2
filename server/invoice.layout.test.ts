import { describe, expect, it } from "vitest";
import { INVOICE_BRAND, INVOICE_LAYOUT } from "./invoice";

describe("mise en page de facture", () => {
  it("conserve un format A4, des marges et un pied de page lisible", () => {
    expect(INVOICE_LAYOUT.size).toBe("A4");
    expect(INVOICE_LAYOUT.margin).toBeGreaterThanOrEqual(40);
    expect(INVOICE_LAYOUT.footerValidityY).toBeGreaterThan(INVOICE_LAYOUT.footerBrandY);
    expect(INVOICE_LAYOUT.footerValidityY).toBeLessThan(792);
  });

  it("utilise les couleurs de la marque pour l’accent, l’encre et le pied de page", () => {
    expect(INVOICE_BRAND.accent).toBe("#0891b2");
    expect(INVOICE_BRAND.ink).toBe("#0f172a");
    expect(INVOICE_BRAND.muted).toBe("#666666");
  });
});
