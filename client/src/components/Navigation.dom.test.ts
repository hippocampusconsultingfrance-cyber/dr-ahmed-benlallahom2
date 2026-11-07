// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Barre de navigation montée par React dans un DOM, avec les vrais contextes
// de thème et de langue.
const { default: Navigation } = await import("./Navigation");
const { ThemeProvider } = await import("@/contexts/ThemeContext");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { HIGH_READABILITY_STORAGE_KEY } = await import("@/contexts/readabilityPreference");
const { navigationAccessibilityCopy } = await import("./navigationAccessibilityCopy");
const { contentEn } = await import("@/data/content-en");
const { contentFr } = await import("@/data/content-fr");

const copy = navigationAccessibilityCopy.fr;
const mount = () => render(createElement(ThemeProvider, { defaultTheme: "dark", switchable: true }, createElement(LanguageProvider, null, createElement(Navigation))));
const openMobileMenu = () => fireEvent.click(screen.getByRole("button", { name: copy.openMenu }));
const mainNavigation = () => screen.getByRole("navigation", { name: copy.mainNavigation });
const mobileNavigation = () => screen.getByRole("navigation", { name: copy.mobileNavigation });
const highReadability = () => document.documentElement.classList.contains("high-readability");
/** The header's « Affichage » menu, opened. */
const openDisplayMenu = () => {
  fireEvent.click(screen.getByRole("button", { name: copy.display }));
  return screen.getByRole("group", { name: copy.display });
};

beforeEach(() => {
  localStorage.setItem("language", "fr");
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = "";
});

describe("menu Affichage (PUB-08)", () => {
  it("regroupe thème, lisibilité renforcée et noir OLED derrière un bouton de l’en-tête et un sous-menu du menu mobile", () => {
    mount();
    const button = screen.getByRole("button", { name: copy.display });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    // Plus de réglage d'affichage isolé dans l'en-tête.
    expect(screen.queryByRole("button", { name: /lisibilité/i })).toBeNull();

    const menu = openDisplayMenu();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(within(menu).getAllByRole("button").map((entry) => entry.textContent)).toEqual([copy.enableLight, "Lisibilité renforcée", "Noir OLED"]);

    // Échap ferme le menu et rend le focus au bouton.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: copy.display })).toBeNull();
    expect(document.activeElement).toBe(button);

    openMobileMenu();
    const toggle = within(mobileNavigation()).getByRole("button", { name: copy.display });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(mobileNavigation()).queryByRole("button", { name: "Lisibilité renforcée" })).toBeNull();
    fireEvent.click(toggle);
    const submenu = within(mobileNavigation()).getByRole("group", { name: copy.display });
    expect(within(submenu).getAllByRole("button").map((entry) => entry.textContent)).toEqual([copy.enableLight, "Lisibilité renforcée", "Noir OLED"]);
  });

  it("n’offre le noir OLED qu’en thème sombre", () => {
    mount();
    fireEvent.click(within(openDisplayMenu()).getByRole("button", { name: copy.enableLight }));
    expect(within(screen.getByRole("group", { name: copy.display })).getAllByRole("button").map((entry) => entry.textContent)).toEqual([copy.enableDark, "Lisibilité renforcée"]);
  });
});

describe("contrôle de lisibilité renforcée", () => {
  it("applique la lisibilité renforcée à la page, la garde au rechargement et l’expose dans les deux navigations", () => {
    mount();
    expect(highReadability()).toBe(false);
    fireEvent.click(within(openDisplayMenu()).getByRole("button", { name: "Lisibilité renforcée" }));

    expect(highReadability()).toBe(true);
    expect(localStorage.getItem(HIGH_READABILITY_STORAGE_KEY)).toBe("true");
    expect(within(screen.getByRole("group", { name: copy.display })).getByRole("button", { name: "Lisibilité renforcée" }).getAttribute("aria-pressed")).toBe("true");
    openMobileMenu();
    fireEvent.click(within(mobileNavigation()).getByRole("button", { name: copy.display }));
    expect(within(mobileNavigation()).getByRole("button", { name: "Lisibilité renforcée" }).getAttribute("aria-pressed")).toBe("true");

    // Reloaded: the preference is read back before the first render.
    cleanup();
    document.documentElement.className = "";
    mount();
    expect(highReadability()).toBe(true);
    const control = within(openDisplayMenu()).getByRole("button", { name: "Lisibilité renforcée" });
    fireEvent.click(control);
    expect(highReadability()).toBe(false);
    expect(control.getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem(HIGH_READABILITY_STORAGE_KEY)).toBe("false");
  });
});

describe("rubriques de navigation (PUB-08)", () => {
  it("donne à l’en-tête les libellés courts, en vrais liens, Contact après Recrutement et Employeurs", () => {
    mount();
    const entries = Array.from(mainNavigation().querySelectorAll("a, button"));
    expect(entries.map((entry) => [entry.tagName, entry.textContent, entry.getAttribute("href")])).toEqual([
      ["A", "Consultation", "/booking"],
      ["A", "Questions santé", "/questions-anesthesie"],
      ["A", "Recrutement", "/recruitment"],
      ["A", "Employeurs", "/employers"],
      ["A", contentFr.nav.contact, "/#contact"],
    ]);
    // « Leadership » et les autres sections de l'accueil quittent l'en-tête, pas le menu mobile.
    expect(within(mainNavigation()).queryByText(contentFr.nav.experience)).toBeNull();

    openMobileMenu();
    const mobile = Array.from(mobileNavigation().querySelectorAll(":scope > a, :scope > button"));
    expect(mobile.map((entry) => entry.getAttribute("href") ?? entry.textContent)).toEqual([
      "/booking", "/questions-anesthesie", "/recruitment", "/employers", "/#contact", "/#experience", "/#services", "/#education", "/search", copy.display,
    ]);
    expect(mobile[5].textContent).toBe("Leadership");
  });

  it("marque la page ouverte dans les deux navigations", () => {
    window.history.replaceState(null, "", "/questions-anesthesie");
    mount();
    openMobileMenu();
    for (const navigation of [mainNavigation(), mobileNavigation()]) {
      const current = within(navigation).getByRole("link", { name: "Questions santé" });
      expect(current.getAttribute("aria-current")).toBe("page");
      expect(current.className).toContain("text-primary");
      expect(within(navigation).getByRole("link", { name: "Recrutement" }).getAttribute("aria-current")).toBeNull();
    }
  });

  it("fait défiler l’accueil jusqu’à la section sans quitter la page, et suit le lien ailleurs", () => {
    mount();
    openMobileMenu();
    // fireEvent renvoie false quand le clic a été intercepté (preventDefault).
    const home = document.createElement("section");
    home.id = "services";
    document.body.append(home);
    expect(fireEvent.click(within(mobileNavigation()).getByRole("link", { name: contentFr.nav.services }))).toBe(false);
    expect(screen.queryByRole("navigation", { name: copy.mobileNavigation })).toBeNull();
    // Un clic avec Ctrl (nouvel onglet) reste un lien ordinaire.
    openMobileMenu();
    expect(fireEvent.click(within(mobileNavigation()).getByRole("link", { name: contentFr.nav.services }), { ctrlKey: true })).toBe(true);
    home.remove();

    cleanup();
    window.history.replaceState(null, "", "/faq");
    mount();
    expect(fireEvent.click(within(mainNavigation()).getByRole("link", { name: contentFr.nav.contact }))).toBe(true);
  });
});

describe("noms accessibles qui contiennent le texte visible (A11Y-18)", () => {
  it("nomme le logo et le menu de langue à partir de ce qu’ils affichent", () => {
    mount();
    const logo = screen.getByRole("link", { name: copy.home });
    expect(logo.getAttribute("href")).toBe("/");
    expect(logo.textContent).toContain("Dr. Ben Lallahom");

    const language = screen.getByRole("button", { name: `FR — ${copy.changeLanguage}` });
    expect(language.textContent).toContain("FR");
  });
});

describe("changement de langue sans rechargement (EN-10)", () => {
  it("passe la barre en anglais sur place et garde ce que le visiteur a saisi", () => {
    const { container } = mount();
    const field = document.createElement("input");
    container.append(field);
    field.value = "Ahmed";

    fireEvent.click(screen.getByRole("button", { name: `FR — ${copy.changeLanguage}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "English" }));

    const english = navigationAccessibilityCopy.en;
    expect(screen.getByRole("navigation", { name: english.mainNavigation })).toBeTruthy();
    expect(screen.getByRole("link", { name: contentEn.nav.healthQuestions }).getAttribute("href")).toBe("/questions-anesthesie");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("language")).toBe("en");
    expect(field.isConnected && field.value).toBe("Ahmed");
    // Le focus revient au bouton de langue, nommé dans la nouvelle langue.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: `EN — ${english.changeLanguage}` }));
  });
});
