// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Pied de page monté par React dans un DOM, dans chacune des quatre langues.
const { default: Footer, footerGdprCopy, footerLandmarkCopy } = await import("./Footer");
const { default: CookieConsent, cookieCopy } = await import("./CookieConsent");
const { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } = await import("./cookieConsentState");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { contentFr } = await import("@/data/content-fr");
const { contentEn } = await import("@/data/content-en");
const { contentDe } = await import("@/data/content-de");
const { contentZh } = await import("@/data/content-zh");

const contents = { fr: contentFr, en: contentEn, de: contentDe, zh: contentZh } as const;

function mount(language: keyof typeof contents, withCookieConsent = false) {
  localStorage.setItem("language", language);
  return render(createElement(LanguageProvider, null, createElement(Footer), withCookieConsent ? createElement(CookieConsent) : null));
}

/** Column heading → the hrefs (or the button's text) listed under it. */
function columns() {
  return Object.fromEntries(screen.getAllByRole("heading", { level: 2 }).map((heading) => [
    heading.textContent,
    Array.from(heading.parentElement!.querySelectorAll("a, button")).map((entry) => entry.getAttribute("href") ?? entry.textContent),
  ]));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("pied de page dans les quatre langues", () => {
  it.each(Object.keys(contents) as Array<keyof typeof contents>)("%s : repères nommés, titres de colonnes en h2, et lien vers le formulaire RGPD", language => {
    const { container } = mount(language);
    const content = contents[language];

    // Repères nommés dans la langue (PUB-A11Y-01).
    expect(screen.getByRole("contentinfo", { name: footerLandmarkCopy.footer[language] })).toBeTruthy();
    for (const landmark of [footerLandmarkCopy.sections, footerLandmarkCopy.legal]) expect(screen.getByRole("navigation", { name: landmark[language] })).toBeTruthy();
    // Titres de colonnes en h2 (ordre des titres, PUB-A11Y-02) : Patients / Recrutement / Informations / Légal (PUB-08).
    const headings = screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent);
    expect(headings).toEqual([content.footer.patients, content.nav.recruitment, content.footer.information, content.footer.legalHeading]);
    expect(container.querySelectorAll("h3, h4, h5, h6")).toHaveLength(0);
    // Pages orphelines reliées (PUB-NAV-01) : le formulaire RGPD, libellé dans la langue.
    expect(screen.getByRole("link", { name: footerGdprCopy[language] }).getAttribute("href")).toBe("/gdpr");
    expect(screen.getByRole("button", { name: cookieCopy[language].manage })).toBeTruthy();
  });

  it("range chaque page dans sa colonne, coordonnées sous la marque (PUB-08)", () => {
    mount("fr");
    expect(columns()).toEqual({
      Patients: ["/booking", "/questions-anesthesie", "/faq", "/resources"],
      Recrutement: ["/recruitment", "/employers", "/candidate/access"],
      Informations: ["/#experience", "/#services", "/#education", "/#contact", "/press"],
      Légal: ["/legal", "/legal?tab=privacy", "/legal?tab=terms", "/gdpr", cookieCopy.fr.manage],
    });
    // « Leadership » garde son libellé (en attente d'une décision du propriétaire, PUB-08).
    expect(screen.getByRole("link", { name: "Leadership" }).getAttribute("href")).toBe("/#experience");
    const contact = screen.getByRole("contentinfo").querySelector("address")!;
    expect(Array.from(contact.querySelectorAll("a")).map((link) => link.getAttribute("href")?.split(":")[0])).toEqual(["tel", "mailto", "https"]);
  });
});

describe("« Gérer les cookies » à la place de la pastille flottante (PUB-12)", () => {
  it("ouvre la fenêtre des préférences, puis rend le focus au bouton du pied de page", async () => {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(createCookieConsent(true)));
    mount("fr", true);
    // Choix déjà fait : ni bandeau, ni pastille flottante.
    expect(document.querySelector(".cookie-consent-banner, .cookie-preferences-shortcut")).toBeNull();

    const manage = screen.getByRole("button", { name: cookieCopy.fr.manage });
    manage.focus();
    fireEvent.click(manage);
    const dialog = await screen.findByRole("dialog", { name: cookieCopy.fr.settings });
    expect(within(dialog).getByText(cookieCopy.fr.settingsDescription)).toBeTruthy();
    // Le choix enregistré est repris dans la fenêtre.
    expect((within(dialog).getAllByRole("checkbox")[1] as HTMLInputElement).checked).toBe(true);

    fireEvent.click(within(dialog).getAllByRole("button", { name: cookieCopy.fr.close })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: cookieCopy.fr.settings })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(manage));
  });
});
