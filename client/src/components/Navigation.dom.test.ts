// @vitest-environment happy-dom
import { createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Barre de navigation montée par React dans un DOM, avec les vrais contextes
// de thème et de langue.
const { default: Navigation } = await import("./Navigation");
const { ThemeProvider } = await import("@/contexts/ThemeContext");
const { LanguageProvider, useLanguage } = await import("@/contexts/LanguageContext");
const { englishSuggestionCopy } = await import("./LanguageMenu");
const { HIGH_READABILITY_STORAGE_KEY } = await import("@/contexts/readabilityPreference");
const { navigationAccessibilityCopy } = await import("./navigationAccessibilityCopy");
const { contentEn } = await import("@/data/content-en");
const { contentFr } = await import("@/data/content-fr");

const copy = navigationAccessibilityCopy.fr;
/** A form of the page, under the same language context as the bar, with the text typed in it. */
function Form() {
  const { content } = useLanguage();
  const [name, setName] = useState("");
  return createElement("label", null, content.nav.getInTouch, createElement("input", { value: name, onChange: (event: { target: { value: string } }) => setName(event.target.value) }));
}
const mount = ({ withForm = false } = {}) => render(createElement(ThemeProvider, { defaultTheme: "dark", switchable: true, children: createElement(LanguageProvider, null, createElement(Navigation), withForm ? createElement(Form) : null) }));
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
  delete (navigator as { languages?: unknown }).languages;
  delete (window as { scrollY?: unknown }).scrollY;
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

  it("se ferme quand le focus clavier sort de la fenêtre, et reste ouvert tant qu’il y circule", () => {
    mount();
    const button = screen.getByRole("button", { name: copy.display });
    const menu = openDisplayMenu();
    const [first, second, last] = within(menu).getAllByRole("button");
    // Tab from the button through the entries: the window stays open.
    fireEvent.blur(button, { relatedTarget: first });
    fireEvent.blur(first, { relatedTarget: second });
    expect(screen.getByRole("group", { name: copy.display })).toBe(menu);
    // A focus lost to nothing (a click in Safari) leaves the window to the click-outside handler.
    fireEvent.blur(second, { relatedTarget: null });
    expect(screen.getByRole("group", { name: copy.display })).toBe(menu);
    // Tab past the last entry, to « Rechercher sur le site »: the window closes.
    const search = mainNavigation().closest("header")!.querySelector<HTMLElement>('a[href="/search"]')!;
    fireEvent.blur(last, { relatedTarget: search });
    expect(screen.queryByRole("group", { name: copy.display })).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
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
    mount({ withForm: true });
    const field = screen.getByRole("textbox", { name: contentFr.nav.getInTouch });
    fireEvent.change(field, { target: { value: "Ahmed" } });

    fireEvent.click(screen.getByRole("button", { name: `FR — ${copy.changeLanguage}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "English" }));

    const english = navigationAccessibilityCopy.en;
    expect(screen.getByRole("navigation", { name: english.mainNavigation })).toBeTruthy();
    expect(screen.getByRole("link", { name: contentEn.nav.healthQuestions }).getAttribute("href")).toBe("/questions-anesthesie");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("language")).toBe("en");
    // Le même champ, que React n'a pas recréé, traduit et avec sa saisie.
    expect(screen.getByRole("textbox", { name: contentEn.nav.getInTouch })).toBe(field);
    expect((field as HTMLInputElement).value).toBe("Ahmed");
    // Le focus revient au bouton de langue, nommé dans la nouvelle langue.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: `EN — ${english.changeLanguage}` }));
  });
});

describe("offre d'anglais sous le menu de langue (EN-08)", () => {
  const offer = () => screen.queryByText(englishSuggestionCopy.message, { exact: false });
  beforeEach(() => {
    // Aucune langue choisie, navigateur sans français : l'offre est faite sous le menu de langue.
    localStorage.removeItem("language");
    Object.defineProperty(navigator, "languages", { configurable: true, get: () => ["en-US", "en"] });
  });

  it("s'efface pendant que le menu Affichage ou le menu mobile s'ouvre à sa place, puis revient", () => {
    mount();
    expect(offer()).toBeTruthy();

    openDisplayMenu();
    expect(offer()).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(offer()).toBeTruthy();

    openMobileMenu();
    expect(offer()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.closeMenu }));
    expect(offer()).toBeTruthy();
    // L'offre n'a pas été écartée : rien n'est choisi ni enregistré.
    expect(localStorage.getItem("language")).toBeNull();
  });

  it("ne reste pas au-dessus du contenu quand la page défile", () => {
    mount();
    expect(offer()).toBeTruthy();
    const scrollTo = (y: number) => act(() => {
      Object.defineProperty(window, "scrollY", { configurable: true, value: y });
      window.dispatchEvent(new Event("scroll"));
    });

    scrollTo(400);
    expect(offer()).toBeNull();
    scrollTo(0);
    expect(offer()).toBeTruthy();
  });
});
