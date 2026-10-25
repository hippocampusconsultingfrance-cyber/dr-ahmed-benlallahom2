import { describe, expect, it, vi } from "vitest";
import { COOKIE_BANNER_HEIGHT_PROPERTY, COOKIE_BANNER_OPEN_ATTRIBUTE, COOKIE_POLICY_HREF, cookieCopy, syncCookieBannerOpenAttribute, trackCookieBannerHeight } from "./CookieConsent";

const readSource = (file: string) => import("node:fs/promises").then(fs => fs.readFile(new URL(file, import.meta.url), "utf8"));

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

  it("utilise une vraie fenêtre modale : focus piégé, Échap et restitution du focus (PUB-A11Y-04)", async () => {
    const source = await readSource("./CookieConsent.tsx");

    // Radix Dialog gère le focus initial, le piège de tabulation et la touche Échap.
    expect(source).toContain('from "@/components/ui/dialog"');
    expect(source).toMatch(/<Dialog open=\{showPreferences\} onOpenChange=\{open => \{ if \(!open\) closePreferences\(\); \}\}>/);
    expect(source).not.toContain('role="dialog" aria-modal="true"');
    expect(source).toContain("onCloseAutoFocus");
    expect(source).toContain("trigger.focus();");
    expect(source).toContain("const closePreferences = () => {");
    expect(source).toContain("onClick={closePreferences}");
  });
});

describe("bandeau et préférences cookies (PUB-COOKIE-01 / PUB-COOKIE-04)", () => {
  it("vise une ancre #cookies qui existe dans la politique, dans les 4 langues", async () => {
    const legal = await readSource("../pages/LegalPage.tsx");
    expect(COOKIE_POLICY_HREF).toBe("/legal?tab=privacy#cookies");
    expect(legal.match(/<h3 id="cookies"/g)).toHaveLength(4);
    expect(legal).toContain("useScrollToHashTarget();");
    expect(legal).toContain("via le bouton « Préférences cookies » en bas de page");
    expect(legal).not.toMatch(/configurant votre navigateur|configuring your browser|Ihren Browser konfigurieren|通过配置浏览器/);
  });

  it("ne propose plus de catégorie « préférences » sans effet et décrit le stockage fonctionnel", async () => {
    const source = await readSource("./CookieConsent.tsx");
    expect(source).not.toContain("draftConsent.preferences");
    expect(source).not.toMatch(/Cookies de préférence|Preference cookies|Präferenz-Cookies|偏好 Cookie"/);
    for (const copy of Object.values(cookieCopy)) {
      expect(copy).not.toHaveProperty("preferences");
      expect(copy.functionalDescription.length).toBeGreaterThan(40);
    }
    expect(cookieCopy.fr.functionalDescription).toContain("exempté de consentement");
  });

  it("recharge la page quand la mesure d'audience est retirée", async () => {
    const source = await readSource("./CookieConsent.tsx");
    expect(source).toContain("const withdrawn = cookieConsent?.performance === true && !performance;");
    expect(source).toContain("if (withdrawn) window.location.reload();");
  });
});
