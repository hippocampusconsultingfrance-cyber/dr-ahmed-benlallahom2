import { describe, expect, it, vi } from "vitest";
import { COOKIE_BANNER_HEIGHT_PROPERTY, COOKIE_BANNER_OPEN_ATTRIBUTE, cookieCopy, syncCookieBannerOpenAttribute, trackCookieBannerHeight } from "./CookieConsent";

// Dialogue des préférences, retrait du consentement et section #cookies de la
// politique : CookieConsent.behaviour.test.ts et pages/LegalPage.cookies.test.ts.

describe("coordination des contrôles fixes", () => {
  it("marque le document lorsque le bandeau cookies est ouvert", () => {
    const root = { setAttribute: vi.fn(), removeAttribute: vi.fn() };

    syncCookieBannerOpenAttribute(root, true);

    expect(root.setAttribute).toHaveBeenCalledWith(COOKIE_BANNER_OPEN_ATTRIBUTE, "true");
    expect(root.removeAttribute).not.toHaveBeenCalled();
  });

  it("retire le marqueur lorsque le bandeau cookies se ferme", () => {
    const root = { setAttribute: vi.fn(), removeAttribute: vi.fn() };

    syncCookieBannerOpenAttribute(root, false);

    expect(root.removeAttribute).toHaveBeenCalledWith(COOKIE_BANNER_OPEN_ATTRIBUTE);
    expect(root.setAttribute).not.toHaveBeenCalled();
  });

  it("reporte sur le document la hauteur du bandeau ouvert, la suit et la retire à la fermeture (EN-03)", () => {
    const root = { style: { setProperty: vi.fn(), removeProperty: vi.fn() } };
    const banner = { offsetHeight: 257 } as HTMLElement;
    let onResize = () => {};
    const disconnect = vi.fn();
    const observe = vi.fn();
    const Observer = vi.fn(function (this: unknown, callback: () => void) {
      onResize = callback;
      return { observe, disconnect };
    }) as unknown as typeof ResizeObserver;

    const stop = trackCookieBannerHeight(root, banner, Observer);
    expect(root.style.setProperty).toHaveBeenLastCalledWith(COOKIE_BANNER_HEIGHT_PROPERTY, "257px");
    expect(observe).toHaveBeenCalledWith(banner);

    // Texte qui se replie autrement (rotation, langue) : la nouvelle hauteur remplace l'ancienne.
    (banner as { offsetHeight: number }).offsetHeight = 329;
    onResize();
    expect(root.style.setProperty).toHaveBeenLastCalledWith(COOKIE_BANNER_HEIGHT_PROPERTY, "329px");

    stop();
    expect(disconnect).toHaveBeenCalled();
    expect(root.style.removeProperty).toHaveBeenCalledWith(COOKIE_BANNER_HEIGHT_PROPERTY);
  });

  it("mesure le bandeau une fois quand ResizeObserver n'existe pas", () => {
    const root = { style: { setProperty: vi.fn(), removeProperty: vi.fn() } };

    const stop = trackCookieBannerHeight(root, { offsetHeight: 180 } as HTMLElement, undefined);
    expect(root.style.setProperty).toHaveBeenCalledWith(COOKIE_BANNER_HEIGHT_PROPERTY, "180px");

    stop();
    expect(root.style.removeProperty).toHaveBeenCalledWith(COOKIE_BANNER_HEIGHT_PROPERTY);
  });

});

describe("bandeau et préférences cookies (PUB-COOKIE-01 / PUB-COOKIE-04)", () => {
  it("ne propose plus de catégorie « préférences » sans effet et décrit le stockage fonctionnel", () => {
    // The preferences dialog itself is rendered in CookieConsent.behaviour.test.ts.
    for (const copy of Object.values(cookieCopy)) {
      expect(copy).not.toHaveProperty("preferences");
      expect(copy.functionalDescription.length).toBeGreaterThan(40);
    }
    expect(cookieCopy.fr.functionalDescription).toContain("exempté de consentement");
  });

});
