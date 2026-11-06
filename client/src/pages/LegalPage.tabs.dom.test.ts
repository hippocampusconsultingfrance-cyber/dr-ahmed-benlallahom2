// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { navigate } from "wouter/use-browser-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Onglets de /legal montés par React dans un DOM, l’adresse suivie par wouter
// comme dans le navigateur : l’onglet nommé par ?tab=, et l’onglet par défaut
// quand l’adresse n’en nomme plus (retour arrière de ?tab=privacy vers /legal)
// ou en nomme un qui n’existe pas (?tab=foo, PUB-01).

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const { default: LegalPage } = await import("./LegalPage");

const selectedTab = () => screen.getAllByRole("tab").find(tab => tab.getAttribute("aria-selected") === "true")?.textContent?.trim();
const go = (address: string) => act(() => navigate(address));

beforeEach(() => {
  view.language = "fr";
  window.history.replaceState(null, "", "/legal");
});
afterEach(() => cleanup());

describe("onglets des pages légales suivant l’adresse", () => {
  it.each([
    ["fr", "Informations Légales", "Politique de Confidentialité", "Conditions Générales"],
    ["en", "Legal Information", "Privacy Policy", "Terms of Use"],
  ] as const)("revient à l’onglet par défaut quand l’adresse ne nomme plus d’onglet (%s)", async (language, legal, privacy, terms) => {
    view.language = language;
    render(createElement(LegalPage));
    expect(selectedTab()).toBe(legal);

    // A link to the privacy policy, then Back to /legal.
    await go("/legal?tab=privacy");
    expect(selectedTab()).toBe(privacy);
    await go("/legal");
    expect(selectedTab()).toBe(legal);

    // A tab chosen by hand stays chosen, written in the address (PUB-01).
    fireEvent.click(screen.getByRole("tab", { name: terms }));
    expect(selectedTab()).toBe(terms);
    await go("/legal?tab=terms");
    await go("/legal");
    expect(selectedTab()).toBe(legal);
  });

  it("ouvre directement l’onglet nommé par un lien profond", () => {
    window.history.replaceState(null, "", "/legal?tab=terms");
    render(createElement(LegalPage));
    expect(selectedTab()).toBe("Conditions Générales");
  });

  it.each([
    ["fr", "Informations Légales"],
    ["en", "Legal Information"],
    ["de", "Rechtliche Informationen"],
    ["zh", "法律信息"],
  ] as const)("ouvre l’onglet par défaut, avec son contenu, quand l’adresse nomme un onglet qui n’existe pas (%s, PUB-01)", async (language, legal) => {
    view.language = language;
    window.history.replaceState(null, "", "/legal?tab=foo");
    render(createElement(LegalPage));
    expect(selectedTab()).toBe(legal);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(legal);

    // Reached by a link of the site as well.
    await go("/legal?tab=privacy");
    await go("/legal?tab=TERMS");
    expect(selectedTab()).toBe(legal);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(legal);
  });
});
