import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// PUB-COOKIE-01 : le lien « En savoir plus » du bandeau cookies mène à une
// section #cookies de la politique de confidentialité, dans chaque langue, qui
// renvoie au bouton « Préférences cookies » plutôt qu’aux réglages du navigateur.

const state = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: state.language }) }));
vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return {
    useSearchParams: () => [new URLSearchParams("tab=privacy"), () => undefined],
    Link: ({ href, children, className }: { href: string; children?: ReactNode; className?: string }) => createElement("a", { href, className }, children),
  };
});
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));

const { default: LegalPage } = await import("./LegalPage");
const { COOKIE_POLICY_HREF } = await import("@/components/CookieConsent");

function privacyPolicy(language: typeof state.language) {
  state.language = language;
  return renderToStaticMarkup(createElement(LegalPage)).replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

describe("politique cookies visée par le bandeau", () => {
  it.each(["fr", "en", "de", "zh"] as const)("a une section #cookies sans renvoi aux réglages du navigateur (%s)", language => {
    expect(COOKIE_POLICY_HREF).toBe("/legal?tab=privacy#cookies");
    const html = privacyPolicy(language);
    expect(html.match(/<h3 id="cookies"/g)).toHaveLength(1);
    expect(html).not.toMatch(/configurant votre navigateur|configuring your browser|Ihren Browser konfigurieren|通过配置浏览器/);
  });

  it("renvoie, en français, au bouton « Préférences cookies » du pied de page", () => {
    expect(privacyPolicy("fr")).toContain("via le bouton « Préférences cookies » en bas de page");
  });
});
