// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Page 404 montée par React dans un DOM, avec le vrai contexte de langue.
const { default: NotFound } = await import("./NotFound");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { publicShortcuts } = await import("@/lib/publicSearchIndex");
const { getMainContentTarget } = await import("@/components/SkipToContent");

function mount(language: "fr" | "en") {
  localStorage.setItem("language", language);
  window.history.replaceState(null, "", "/page-qui-n-existe-pas");
  return render(createElement(LanguageProvider, null, createElement(NotFound)));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("page 404 (A11Y-15, PUB-28, A11Y-17)", () => {
  it.each([
    ["fr", "Page introuvable", "Retour à l'accueil"],
    ["en", "Page Not Found", "Go Home"],
  ] as const)(
    "%s : titre la page « %s » dans un <main> que vise le lien d’évitement",
    (language, title, home) => {
      mount(language);

      const main = screen.getByRole("main");
      expect(main.id).toBe("main-content");
      expect(getMainContentTarget(document)).toBe(main);
      expect(
        within(main)
          .getAllByRole("heading", { level: 1 })
          .map(heading => heading.textContent?.trim())
      ).toEqual([title]);
      // « 404 » n'est plus le titre : un simple décor.
      expect(screen.queryByRole("heading", { name: "404" })).toBeNull();

      expect(
        screen.getByRole("link", { name: home }).getAttribute("href")
      ).toBe("/");
      expect(screen.queryByRole("button", { name: home })).toBeNull();
    }
  );

  it.each(["fr", "en"] as const)(
    "%s : propose de vrais liens vers la réservation, les questions santé, le recrutement, les employeurs et le contact",
    language => {
      mount(language);

      const shortcuts = screen.getByRole("navigation", {
        name: publicShortcuts.title[language],
      });
      expect(
        within(shortcuts)
          .getAllByRole("link")
          .map(link => [link.textContent, link.getAttribute("href")])
      ).toEqual(
        publicShortcuts.links.map(link => [link.label[language], link.href])
      );
    }
  );
});
