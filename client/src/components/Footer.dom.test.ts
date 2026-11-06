// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Pied de page monté par React dans un DOM, dans chacune des quatre langues.
const { default: Footer, footerGdprCopy, footerLandmarkCopy } = await import("./Footer");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { contentFr } = await import("@/data/content-fr");
const { contentEn } = await import("@/data/content-en");
const { contentDe } = await import("@/data/content-de");
const { contentZh } = await import("@/data/content-zh");

const contents = { fr: contentFr, en: contentEn, de: contentDe, zh: contentZh } as const;

function mount(language: keyof typeof contents) {
  localStorage.setItem("language", language);
  return render(createElement(LanguageProvider, null, createElement(Footer)));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("pied de page dans les quatre langues", () => {
  it.each(Object.keys(contents) as Array<keyof typeof contents>)("%s : repères nommés, titres de colonnes en h2 dont le libellé de contact, et lien vers le formulaire RGPD", language => {
    const { container } = mount(language);
    const content = contents[language];

    // Repères nommés dans la langue (PUB-A11Y-01).
    expect(screen.getByRole("contentinfo", { name: footerLandmarkCopy.footer[language] })).toBeTruthy();
    for (const landmark of [footerLandmarkCopy.sections, footerLandmarkCopy.legal]) expect(screen.getByRole("navigation", { name: landmark[language] })).toBeTruthy();
    // Titres de colonnes en h2 (ordre des titres, PUB-A11Y-02).
    const headings = screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent);
    expect(headings).toEqual(expect.arrayContaining([content.footer.navigate, content.footer.legal, content.nav.contact]));
    expect(container.querySelectorAll("h3, h4, h5, h6")).toHaveLength(0);
    // Pages orphelines reliées (PUB-NAV-01) : le formulaire RGPD, libellé dans la langue.
    expect(screen.getByRole("link", { name: footerGdprCopy[language] }).getAttribute("href")).toBe("/gdpr");
  });
});
