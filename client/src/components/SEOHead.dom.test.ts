// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STATIC_ROUTE_METADATA } from "@shared/routeMetadata";

// SEOHead monté par React dans un DOM, à l'adresse de l'accueil : le <head>
// hydraté reprend la table partagée en français et les props dans les autres
// langues, sans balise meta keywords, que Google ignore (SEOP-05).
const { SEOHead, OG_LOCALES } = await import("./SEOHead");
const { LanguageProvider, useLanguage } = await import(
  "@/contexts/LanguageContext"
);
const { homeSeo } = await import("@/pages/Home");

const meta = (name: string) =>
  document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
const property = (name: string) =>
  document.head.querySelector<HTMLMetaElement>(`meta[property="${name}"]`)
    ?.content;

function mountHome(language: "fr" | "en") {
  localStorage.setItem("language", language);
  window.history.replaceState(null, "", "/");
  return render(
    createElement(
      LanguageProvider,
      null,
      createElement(SEOHead, {
        title: "Dr. Ahmed Ben Lallahom | Anaesthesia and Health",
        description:
          "Anaesthesiologist and healthcare entrepreneur based in France.",
        ogUrl: "https://drahmedbenlallahom.com",
      })
    )
  );
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
  ] as const)(
    "n'ajoute aucune balise meta keywords (%s)",
    (language, description) => {
      mountHome(language);

      expect(meta("description")).toBe(description);
      expect(meta("robots")).toBe("index, follow, max-image-preview:large");
      expect(document.head.querySelector('meta[name="keywords"]')).toBeNull();
    }
  );
});

describe("accueil dans la langue affichée (EN-10)", () => {
  let switchTo: (language: "fr" | "en" | "de" | "zh") => void = () => undefined;
  /** The home page's SEOHead, as Home passes it, with the language menu's switch. */
  function HomeHead() {
    const { language, setLanguage } = useLanguage();
    switchTo = setLanguage;
    return createElement(SEOHead, {
      title: homeSeo[language].title,
      description: homeSeo[language].description,
      ogUrl: "https://drahmedbenlallahom.com",
    });
  }

  it("passe titre, description et og:locale dans la langue choisie sur place, et retrouve en français ceux de la page pré-rendue", () => {
    localStorage.setItem("language", "fr");
    window.history.replaceState(null, "", "/");
    render(createElement(LanguageProvider, null, createElement(HomeHead)));
    expect(document.title).toBe(STATIC_ROUTE_METADATA["/"].title);
    expect(property("og:locale")).toBe("fr_FR");

    for (const language of ["en", "de", "zh"] as const) {
      act(() => switchTo(language));
      expect(document.title, language).toBe(homeSeo[language].title);
      expect(meta("description"), language).toBe(homeSeo[language].description);
      expect(property("og:title"), language).toBe(homeSeo[language].title);
      expect(property("og:locale"), language).toBe(OG_LOCALES[language]);
      expect(property("og:locale"), language).not.toBe("fr_FR");
      expect(document.title, language).not.toMatch(/Anesthésie|Médecine/);
    }
    act(() => switchTo("fr"));
    expect(document.title).toBe(STATIC_ROUTE_METADATA["/"].title);
    expect(meta("description")).toBe(STATIC_ROUTE_METADATA["/"].description);
    expect(property("og:locale")).toBe("fr_FR");
  });
});
