// @vitest-environment happy-dom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Page de recherche montée par React dans un DOM, avec les vrais contextes de thème et de langue.
const { default: SearchPage } = await import("./SearchPage");
const { ThemeProvider } = await import("@/contexts/ThemeContext");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { publicShortcuts } = await import("@/lib/publicSearchIndex");

function mount(language: "fr" | "en", query = "") {
  localStorage.setItem("language", language);
  window.history.replaceState(
    null,
    "",
    query ? `/search?q=${encodeURIComponent(query)}` : "/search"
  );
  return render(
    createElement(
      ThemeProvider,
      null,
      createElement(LanguageProvider, null, createElement(SearchPage))
    )
  );
}

const type = (value: string) =>
  fireEvent.change(screen.getByRole("searchbox"), { target: { value } });
/** Liens des résultats, dans la page et hors du pied de page. */
const resultLinks = () =>
  within(screen.getByRole("main"))
    .queryAllByRole("link")
    .filter(link => link.querySelector("h2"));

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("annonce des résultats (A11Y-20)", () => {
  it("n’annonce que le nombre de résultats, la liste restant hors de la zone annoncée", () => {
    mount("fr");
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");

    type("anesthésie");
    const links = resultLinks();
    expect(links.length).toBeGreaterThan(1);
    // La même zone, déjà dans la page, reçoit le nouveau texte.
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe(`${links.length} résultat(s)`);
    for (const link of links) {
      expect(status.contains(link)).toBe(false);
      expect(link.closest("[aria-live]")).toBeNull();
    }
    expect(
      screen.getByRole("main").querySelectorAll("[aria-live]")
    ).toHaveLength(0);
  });
});

describe("recherche sans résultat (PUB-28)", () => {
  it.each(["fr", "en"] as const)(
    "%s : annonce l’absence de résultat et propose de vrais liens vers les parcours principaux",
    language => {
      mount(language, "blabla");

      expect(screen.getByRole("status").textContent).toBe(
        language === "fr"
          ? "Aucune information publique ne correspond à cette recherche."
          : "No public information matches this search."
      );
      expect(resultLinks()).toEqual([]);
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
      expect(within(shortcuts).queryAllByRole("button")).toEqual([]);
    }
  );

  it("montre, pour plusieurs mots sans page qui les contienne tous, les pages qui en contiennent au moins un", () => {
    mount("fr", "recrutement Dubai");

    const links = resultLinks();
    expect(links[0]?.getAttribute("href")).toBe("/recruitment");
    expect(screen.getByRole("status").textContent).toBe(
      `Aucune page ne contient tous ces mots. Pages qui en contiennent au moins un : ${links.length} résultat(s)`
    );
    expect(
      screen.queryByRole("navigation", { name: publicShortcuts.title.fr })
    ).toBeNull();
  });
});
