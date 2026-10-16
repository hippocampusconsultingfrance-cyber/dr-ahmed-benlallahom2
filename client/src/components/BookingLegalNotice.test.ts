import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bookingLegalNoticeCopy } from "./BookingLegalNotice";
import { BOOKING_TERMS_OF_SALE_HREF } from "@shared/bookingPolicy";

// M6 — LEGAL-23 : liens juridiques au point de collecte et de paiement.

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("informations légales des pages de réservation", () => {
  it("affiche le pied de page et les liens confidentialité / mentions légales sur /booking et /booking/confirmation", () => {
    for (const page of ["../pages/BookingPage.tsx", "../pages/BookingConfirmationPage.tsx"]) {
      const source = read(page);
      expect(source).toContain('import Footer from "@/components/Footer";');
      expect(source).toContain("<Footer />");
      expect(source).toContain("<BookingLegalNotice");
    }
    const notice = read("./BookingLegalNotice.tsx");
    expect(notice).toContain('href="/legal?tab=privacy"');
    expect(notice).toContain('href="/legal"');
  });

  it("garde l’emplacement des CGV masqué tant qu’aucune page de CGV n’existe", () => {
    expect(BOOKING_TERMS_OF_SALE_HREF).toBeNull();
    expect(read("./BookingLegalNotice.tsx")).toContain("{BOOKING_TERMS_OF_SALE_HREF && <Link href={BOOKING_TERMS_OF_SALE_HREF}");
  });

  it("est traduit dans les quatre langues", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = bookingLegalNoticeCopy[language];
      expect(copy.purpose.length).toBeGreaterThan(10);
      expect(copy.privacy).toBeTruthy();
      expect(copy.legal).toBeTruthy();
      expect(copy.termsOfSale).toBeTruthy();
    }
  });
});
