import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { footerLandmarkCopy } from "./Footer";

// M6 — LEGAL-23 : liens juridiques au point de collecte et de paiement. La
// présence de cet encadré et du pied de page sur /booking et
// /booking/confirmation est vérifiée au rendu de ces pages
// (BookingPage.render.test.ts, BookingConfirmationPage.render.test.ts).

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh", termsOfSale: null as string | null }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return { Link: ({ href, children }: { href: string; children: unknown }) => createElement("a", { href }, children as never) };
});
vi.mock("@shared/bookingPolicy", async importOriginal => ({
  ...await importOriginal<typeof import("@shared/bookingPolicy")>(),
  get BOOKING_TERMS_OF_SALE_HREF() { return view.termsOfSale; },
}));

const { default: BookingLegalNotice, bookingLegalNoticeCopy } = await import("./BookingLegalNotice");
const { BOOKING_TERMS_OF_SALE_HREF } = await vi.importActual<typeof import("@shared/bookingPolicy")>("@shared/bookingPolicy");

const render = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(BookingLegalNotice, props));
const links = (html: string) => [...html.matchAll(/<a href="([^"]+)">([^<]*)<\/a>/g)].map(match => [match[1], match[2]]);

describe("informations légales des pages de réservation", () => {
  it.each(["fr", "en", "de", "zh"] as const)("renvoie vers la politique de confidentialité et les mentions légales (%s)", language => {
    view.language = language;
    const copy = bookingLegalNoticeCopy[language];
    const html = render();
    expect(links(html)).toEqual([["/legal?tab=privacy", copy.privacy], ["/legal", copy.legal]]);
    expect(html).toContain(`aria-label="${copy.label}"`);
    expect(html).toContain(copy.purpose);
    expect(render({ showPurpose: false })).not.toContain(copy.purpose);
  });

  it("garde l’emplacement des CGV masqué tant qu’aucune page de CGV n’existe", () => {
    view.language = "fr";
    expect(BOOKING_TERMS_OF_SALE_HREF).toBeNull();
    expect(links(render()).map(([href]) => href)).not.toContain("/cgv");

    view.termsOfSale = "/cgv";
    expect(links(render())).toContainEqual(["/cgv", bookingLegalNoticeCopy.fr.termsOfSale]);
    view.termsOfSale = null;
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

  it("porte un nom de repère distinct de la navigation légale du pied de page, affichée sur les mêmes pages", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(bookingLegalNoticeCopy[language].label).not.toBe(footerLandmarkCopy.legal[language]);
    }
  });
});
