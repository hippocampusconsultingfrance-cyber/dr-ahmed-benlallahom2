import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import superjson from "superjson";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { contentEn } from "@/data/content-en";
import { contentFr } from "@/data/content-fr";
import { trpc } from "@/lib/trpc";
import FAQPage from "@/pages/FAQPage";
import { getFaqContent } from "@/pages/faqContent";
import MedicalQuestionsPage from "@/pages/MedicalQuestionsPage";
import VenturePage from "@/pages/VenturePage";
import Footer, { footerLandmarkCopy } from "./Footer";
import HeroSection from "./HeroSection";
import Navigation from "./Navigation";
import ServicesSection from "./ServicesSection";

/** Premier rendu d'une page publique dans la langue mémorisée du visiteur. */
function render(element: ReactElement, { language = "fr", path = "/" } = {}) {
  vi.stubGlobal("localStorage", { getItem: (key: string) => (key === "language" ? language : null), setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("window", { location: { pathname: path }, innerWidth: 1280 });
  const queryClient = new QueryClient();
  const trpcClient = trpc.createClient({ links: [httpBatchLink({ url: "http://localhost/api/trpc", transformer: superjson })] });
  return renderToStaticMarkup(
    createElement(trpc.Provider, { client: trpcClient, queryClient },
      createElement(QueryClientProvider, { client: queryClient },
        createElement(Router, { ssrPath: path },
          createElement(ThemeProvider, { defaultTheme: "dark", switchable: true },
            createElement(LanguageProvider, null, element))))),
  );
}

/** Textes des vrais liens <a href="/booking"> d'un fragment HTML. */
function bookingLinks(html: string) {
  return Array.from(html.matchAll(/<a\b[^>]*\bhref="\/booking"[^>]*>([\s\S]*?)<\/a>/g), (match) => match[1].replace(/<[^>]+>/g, "").trim());
}

const section = (html: string, pattern: RegExp) => html.match(pattern)?.[0] ?? "";
const main = (html: string) => section(html, /<main\b[\s\S]*<\/main>/);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("liens de réservation (PUB-02)", () => {
  it("place la réservation dans l'en-tête à la place du bouton « Me contacter »", () => {
    const fr = render(createElement(Navigation));
    expect(bookingLinks(fr)).toEqual([contentFr.hero.bookConsultation]);
    expect(fr).not.toContain(contentFr.nav.getInTouch);

    expect(bookingLinks(render(createElement(Navigation), { language: "en" }))).toEqual([contentEn.hero.bookConsultation]);
  });

  it("ajoute la réservation à la colonne Navigation du pied de page", () => {
    for (const [language, content] of [["fr", contentFr], ["en", contentEn]] as const) {
      const html = render(createElement(Footer), { language });
      const navigationColumn = section(html, new RegExp(`<nav[^>]*aria-label="${footerLandmarkCopy.sections[language]}"[\\s\\S]*?</nav>`));
      expect(bookingLinks(navigationColumn), language).toEqual([content.hero.bookConsultation]);
    }
  });

  it("fait du bouton du héros un vrai lien", () => {
    const html = render(createElement(HeroSection));
    expect(bookingLinks(html)).toEqual([contentFr.hero.bookConsultation]);
    expect(html).not.toMatch(new RegExp(`<button[^>]*>${contentFr.hero.bookConsultation}`));
  });

  it("termine la section Services par un lien de réservation", () => {
    expect(bookingLinks(render(createElement(ServicesSection), { language: "en" }))).toEqual([contentEn.hero.bookConsultation]);
  });

  it("fait du bouton de la FAQ un vrai lien", () => {
    const html = main(render(createElement(FAQPage), { path: "/faq" }));
    expect(bookingLinks(html)).toEqual([getFaqContent("fr").booking]);
    expect(html).not.toMatch(new RegExp(`<button[^>]*>${getFaqContent("fr").booking}`));
  });

  it("propose la réservation sur la page Pratique clinique uniquement", () => {
    const venture = (slug: string) => main(render(createElement(Route, { path: "/venture/:slug", component: VenturePage }), { path: `/venture/${slug}` }));
    expect(bookingLinks(venture("pratique-clinique"))).toEqual([contentFr.hero.bookConsultation]);
    expect(bookingLinks(venture("laska-corporate"))).toEqual([]);
  });

  it("propose la réservation sur /questions-anesthesie", () => {
    const html = main(render(createElement(MedicalQuestionsPage), { language: "en", path: "/questions-anesthesie" }));
    expect(bookingLinks(html)).toEqual([contentEn.hero.bookConsultation]);
  });
});
