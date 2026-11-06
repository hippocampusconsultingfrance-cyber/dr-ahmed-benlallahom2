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
const { contentFr } = await import("@/data/content-fr");

const copy = navigationAccessibilityCopy.fr;
const mount = () => render(createElement(ThemeProvider, { defaultTheme: "dark", switchable: true }, createElement(LanguageProvider, null, createElement(Navigation))));
const openMobileMenu = () => fireEvent.click(screen.getByRole("button", { name: copy.openMenu }));
const highReadability = () => document.documentElement.classList.contains("high-readability");

beforeEach(() => {
  localStorage.setItem("language", "fr");
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = "";
});

describe("contrôle de lisibilité renforcée", () => {
  it("applique la lisibilité renforcée à la page, la garde au rechargement et l’expose dans les deux navigations", () => {
    mount();
    expect(highReadability()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Activer la lisibilité renforcée" }));

    expect(highReadability()).toBe(true);
    expect(localStorage.getItem(HIGH_READABILITY_STORAGE_KEY)).toBe("true");
    expect(screen.getByRole("button", { name: "Désactiver la lisibilité renforcée" }).getAttribute("aria-pressed")).toBe("true");
    openMobileMenu();
    const mobile = screen.getByRole("navigation", { name: copy.mobileNavigation });
    expect(within(mobile).getByRole("button", { name: "Lisibilité renforcée" }).getAttribute("aria-pressed")).toBe("true");

    // Reloaded: the preference is read back before the first render.
    cleanup();
    document.documentElement.className = "";
    mount();
    expect(highReadability()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Désactiver la lisibilité renforcée" }));
    expect(highReadability()).toBe(false);
    expect(localStorage.getItem(HIGH_READABILITY_STORAGE_KEY)).toBe("false");
  });
});

describe("recrutement et ordre de navigation", () => {
  it("place Contact après Recrutement et Employeurs dans les deux navigations", () => {
    mount();
    openMobileMenu();
    for (const name of [copy.mainNavigation, copy.mobileNavigation]) {
      const entries = Array.from(screen.getByRole("navigation", { name }).querySelectorAll("a, button"));
      const position = (match: (entry: Element) => boolean) => entries.findIndex(match);
      const contact = position(entry => entry.tagName === "BUTTON" && entry.textContent === contentFr.nav.contact);
      expect(contact, name).toBeGreaterThan(0);
      expect(position(entry => entry.getAttribute("href") === "/recruitment"), name).toBeLessThan(contact);
      expect(position(entry => entry.getAttribute("href") === "/employers"), name).toBeLessThan(contact);
      expect(position(entry => entry.getAttribute("href") === "/recruitment"), name).toBeGreaterThanOrEqual(0);
      expect(position(entry => entry.getAttribute("href") === "/employers"), name).toBeGreaterThanOrEqual(0);
    }
  });
});
