// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STATIC_ROUTE_METADATA } from "@shared/routeMetadata";

// SEOHead monté par React dans un DOM, à l'adresse de l'accueil : le <head>
// hydraté reprend la table partagée en français et les props dans les autres
// langues, sans balise meta keywords, que Google ignore (SEOP-05).
const { SEOHead } = await import("./SEOHead");
const { LanguageProvider } = await import("@/contexts/LanguageContext");

const meta = (name: string) => document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;

function mountHome(language: "fr" | "en") {
  localStorage.setItem("language", language);
  window.history.replaceState(null, "", "/");
  return render(createElement(LanguageProvider, null, createElement(SEOHead, {
    title: "Dr. Ahmed Ben Lallahom | Anaesthesia and Health",
    description: "Anaesthesiologist and healthcare entrepreneur based in France.",
    ogUrl: "https://drahmedbenlallahom.com",
  })));
}

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  localStorage.clear();
});

describe("<head> hydraté par SEOHead", () => {
  it.each([
    ["fr", STATIC_ROUTE_METADATA["/"].description],
    ["en", "Anaesthesiologist and healthcare entrepreneur based in France."],
  ] as const)("n'ajoute aucune balise meta keywords (%s)", (language, description) => {
    mountHome(language);

    expect(meta("description")).toBe(description);
    expect(meta("robots")).toBe("index, follow, max-image-preview:large");
    expect(document.head.querySelector('meta[name="keywords"]')).toBeNull();
  });
});
