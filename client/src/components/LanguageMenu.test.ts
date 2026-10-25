import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { Router } from "wouter";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trpc } from "@/lib/trpc";
import { LanguageProvider } from "@/contexts/LanguageContext";
import LanguageMenu, { chooseLanguage, languageOptions } from "./LanguageMenu";
import BookingPage from "@/pages/BookingPage";
import BookingConfirmationPage from "@/pages/BookingConfirmationPage";
import CandidateAccessPage from "@/pages/CandidateAccessPage";
import CandidateVerifyPage from "@/pages/CandidateVerifyPage";
import CandidateResetPasswordPage from "@/pages/CandidateResetPasswordPage";
import CandidatePortalPage from "@/pages/CandidatePortalPage";
import NotFound from "@/pages/NotFound";
import ServiceStatusPage from "@/pages/ServiceStatusPage";

/** Browser globals read while rendering: the address, the stored language and an English browser. */
function stubBrowser({ path = "/", search = "", storedLanguage = null as string | null } = {}) {
  const storage = { getItem: vi.fn(() => storedLanguage), setItem: vi.fn() };
  const location = { pathname: path, search, hash: "", reload: vi.fn() };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { location, localStorage: storage, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US", "en"] });
  return { storage, location };
}

// Aucune requête ne part pendant un rendu serveur ; ce lien ne répond jamais.
const trpcClient = trpc.createClient({ links: [() => () => observable(() => () => {})] });

function render(children: ReactNode, path = "/") {
  const queryClient = new QueryClient();
  return renderToStaticMarkup(
    createElement(trpc.Provider, { client: trpcClient, queryClient },
      createElement(QueryClientProvider, { client: queryClient },
        createElement(Router, { ssrPath: path }, createElement(LanguageProvider, null, children)))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("menu de langue réutilisable (EN-03)", () => {
  it("affiche la langue d'un lien ?lang= plutôt que la langue mémorisée", () => {
    stubBrowser({ search: "?lang=en", storedLanguage: "fr" });
    const html = render(createElement(LanguageMenu));
    expect(html).toContain('aria-label="Change language"');
    expect(html).toContain(">EN<");
    expect(html).toContain('aria-expanded="false"');
  });

  it("accepte ?lang= en majuscules et ignore une langue inconnue", () => {
    stubBrowser({ search: "?lang=ZH" });
    expect(render(createElement(LanguageMenu))).toContain('aria-label="切换语言"');
    stubBrowser({ search: "?lang=it", storedLanguage: "de" });
    expect(render(createElement(LanguageMenu))).toContain('aria-label="Sprache ändern"');
  });

  it("ne suit jamais la langue du navigateur", () => {
    stubBrowser();
    const html = render(createElement(LanguageMenu));
    expect(html).toContain('aria-label="Changer de langue"');
    expect(html).toContain(">FR<");
  });

  it("mémorise la langue choisie puis recharge la page, sauf si elle est déjà active", () => {
    const { storage, location } = stubBrowser();
    chooseLanguage("en", "fr");
    expect(storage.setItem).toHaveBeenCalledWith("language", "en");
    expect(location.reload).toHaveBeenCalledTimes(1);
    chooseLanguage("fr", "fr");
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(languageOptions.map((option) => option.code)).toEqual(["fr", "en", "de", "zh"]);
  });

  const pages: Array<[string, ComponentType, string?]> = [
    ["/booking", BookingPage],
    ["/booking/confirmation", BookingConfirmationPage, "?status=success&trackingId=APTTEST2026&session_id=cs_test_123456"],
    ["/candidate/access", CandidateAccessPage],
    ["/candidate/verify", CandidateVerifyPage, "?email=a%40example.com&token=abc"],
    ["/candidate/reset-password", CandidateResetPasswordPage, "?email=a%40example.com&token=abc"],
    ["/candidate/portal", CandidatePortalPage],
    ["/page-inconnue", NotFound],
    ["/maintenance", () => createElement(ServiceStatusPage, { kind: "maintenance" })],
    ["/error", () => createElement(ServiceStatusPage, { kind: "error" })],
  ];

  it.each(pages)("est présent sur %s, dans la langue du lien", (path, Page, search = "") => {
    stubBrowser({ path, search: `${search}${search ? "&" : "?"}lang=en`, storedLanguage: "fr" });
    const html = render(createElement(Page), path);
    expect(html).toContain('aria-label="Change language"');
    expect(html).toContain('aria-haspopup="menu"');
  });
});
