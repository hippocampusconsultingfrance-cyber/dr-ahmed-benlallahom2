// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PUB-01 — /legal monté par React avec son vrai pied de page, l’adresse
// suivie par wouter comme dans le navigateur : sur ?tab=privacy, un autre
// onglet choisi à la main, le lien « Politique de confidentialité » du pied de
// page rouvre la politique, bien qu’il mène à l’adresse d’où l’on est parti.

vi.mock("@/components/Navigation", () => ({ default: () => null }));

const { default: LegalPage } = await import("./LegalPage");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { contentFr } = await import("@/data/content-fr");
const { contentEn } = await import("@/data/content-en");
const { contentDe } = await import("@/data/content-de");
const { contentZh } = await import("@/data/content-zh");

const pages = {
  fr: { content: contentFr, legal: "Informations Légales", privacy: "Politique de Confidentialité", terms: "Conditions Générales" },
  en: { content: contentEn, legal: "Legal Information", privacy: "Privacy Policy", terms: "Terms of Use" },
  de: { content: contentDe, legal: "Rechtliche Informationen", privacy: "Datenschutzrichtlinie", terms: "Nutzungsbedingungen" },
  zh: { content: contentZh, legal: "法律信息", privacy: "隐私政策", terms: "使用条款" },
} as const;

const selectedTab = () => screen.getAllByRole("tab").find(tab => tab.getAttribute("aria-selected") === "true")?.textContent?.trim();
/** The heading of the section shown under the tabs. */
const shownSection = () => document.querySelector("main h2")?.textContent?.trim();
const footerLink = (name: string) => screen.getByRole("contentinfo").querySelector(`a[href="${name}"]`) as HTMLAnchorElement;

beforeEach(() => window.history.replaceState(null, "", "/legal?tab=privacy"));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("onglets de /legal et liens du pied de page (PUB-01)", () => {
  it.each(Object.keys(pages) as Array<keyof typeof pages>)("le lien « Politique de confidentialité » du pied de page rouvre la politique après le choix d’un autre onglet (%s)", async language => {
    const page = pages[language];
    localStorage.setItem("language", language);
    render(createElement(LanguageProvider, null, createElement(LegalPage)));
    expect(selectedTab()).toBe(page.privacy);

    // Another tab chosen by hand: written in the address, without a new history entry.
    const entries = window.history.length;
    fireEvent.click(screen.getByRole("tab", { name: page.legal }));
    expect(selectedTab()).toBe(page.legal);
    expect(shownSection()).toBe(page.legal);
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(entries);

    // The footer's link to the address the visitor came from.
    const privacy = footerLink("/legal?tab=privacy");
    expect(privacy.textContent?.trim()).toBe(page.content.footer.privacy);
    fireEvent.click(privacy);
    await waitFor(() => expect(selectedTab()).toBe(page.privacy));
    expect(shownSection()).toBe(page.privacy);
    expect(window.location.search).toBe("?tab=privacy");

    // The same with the conditions, then the legal notice.
    fireEvent.click(screen.getByRole("tab", { name: page.terms }));
    expect(window.location.search).toBe("?tab=terms");
    fireEvent.click(footerLink("/legal"));
    await waitFor(() => expect(selectedTab()).toBe(page.legal));
    fireEvent.click(screen.getByRole("tab", { name: page.privacy }));
    fireEvent.click(footerLink("/legal?tab=terms"));
    await waitFor(() => expect(selectedTab()).toBe(page.terms));
  });
});
