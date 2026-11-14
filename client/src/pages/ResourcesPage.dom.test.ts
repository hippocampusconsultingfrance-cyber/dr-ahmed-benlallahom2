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

// Page Ressources montée par React dans un DOM, avec les vrais contextes de thème et de langue.
const { default: ResourcesPage } = await import("./ResourcesPage");
const { ThemeProvider } = await import("@/contexts/ThemeContext");
const { LanguageProvider } = await import("@/contexts/LanguageContext");

function mount(language: "fr" | "en") {
  localStorage.setItem("language", language);
  return render(
    createElement(
      ThemeProvider,
      null,
      createElement(LanguageProvider, null, createElement(ResourcesPage))
    )
  );
}

const cards = () => within(screen.getByRole("main")).queryAllByRole("article");

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("annonce des ressources filtrées (A11Y-20)", () => {
  it("n’annonce que le nombre de ressources quand la liste change, les cartes restant hors de la zone annoncée", () => {
    mount("fr");
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("3 ressources");
    expect(cards()).toHaveLength(3);
    for (const card of cards()) {
      expect(status.contains(card)).toBe(false);
      expect(card.closest("[aria-live]")).toBeNull();
    }

    fireEvent.click(screen.getByRole("button", { name: "France" }));
    expect(cards()).toHaveLength(1);
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe("1 ressource");

    fireEvent.change(
      screen.getByRole("textbox", { name: "Rechercher une ressource" }),
      { target: { value: "zzzz" } }
    );
    expect(cards()).toEqual([]);
    expect(status.textContent).toBe(
      "Aucune ressource ne correspond à cette recherche."
    );
    expect(
      screen.getByRole("main").querySelectorAll("[aria-live]")
    ).toHaveLength(0);
  });

  it("compte les ressources en anglais", () => {
    mount("en");
    expect(screen.getByRole("status").textContent).toBe("3 resources");
    fireEvent.click(screen.getByRole("button", { name: "Europe" }));
    expect(screen.getByRole("status").textContent).toBe("1 resource");
  });
});
