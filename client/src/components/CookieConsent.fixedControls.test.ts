import { describe, expect, it, vi } from "vitest";
import { COOKIE_BANNER_OPEN_ATTRIBUTE, COOKIE_POLICY_HREF, cookieCopy, syncCookieBannerOpenAttribute } from "./CookieConsent";

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
