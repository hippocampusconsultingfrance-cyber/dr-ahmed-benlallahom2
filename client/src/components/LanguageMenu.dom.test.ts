// @vitest-environment happy-dom
import { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Menu de langue monté par React avec le vrai contexte de langue : la page change de langue sur
// place (EN-10), et l'anglais est proposé, jamais imposé, à un navigateur sans français (EN-08).
const { default: LanguageMenu, englishSuggestionCopy } = await import(
  "./LanguageMenu"
);
const { LanguageProvider, useLanguage } = await import(
  "@/contexts/LanguageContext"
);

/** A form of the page, with its typed text, next to the menu. */
function Form() {
  const { content } = useLanguage();
  const [name, setName] = useState("");
  return createElement(
    "label",
    null,
    content.nav.healthQuestions,
    createElement("input", {
      value: name,
      onChange: (event: { target: { value: string } }) =>
        setName(event.target.value),
    })
  );
}

const mount = (props: { hideSuggestion?: boolean } = {}) =>
  render(
    createElement(
      LanguageProvider,
      null,
      createElement(LanguageMenu, props),
      createElement(Form)
    )
  );
const browserSpeaks = (...languages: string[]) =>
  Object.defineProperty(navigator, "languages", {
    configurable: true,
    get: () => languages,
  });
const offer = () =>
  screen.queryByText(englishSuggestionCopy.message, { exact: false });

let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  reload = vi.fn();
  vi.spyOn(window.location, "reload").mockImplementation(reload);
  browserSpeaks("en-US", "en");
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  delete (navigator as { languages?: unknown }).languages;
  document.documentElement.lang = "";
});

describe("changement de langue sur place (EN-10)", () => {
  it("change la langue sans recharger la page ni effacer la saisie, et la mémorise", () => {
    localStorage.setItem("language", "fr");
    mount();
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "Ahmed" } });

    fireEvent.click(
      screen.getByRole("button", { name: "FR — Changer de langue" })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "English" }));

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBe(field);
    expect((field as HTMLInputElement).value).toBe("Ahmed");
    expect(screen.getByRole("textbox", { name: "Health questions" })).toBe(
      field
    );
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("language")).toBe("en");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "EN — Change language" })
    );
  });
});

describe("anglais proposé à un navigateur sans français (EN-08)", () => {
  it("propose l'anglais sans changer la page ni mémoriser le français par défaut", () => {
    mount();
    expect(offer()).toBeTruthy();
    expect(offer()!.closest("[lang]")?.getAttribute("lang")).toBe("en");
    expect(document.documentElement.lang).toBe("fr");
    // La langue par défaut n'est pas un choix : rien n'est enregistré, l'offre reviendra à la page suivante.
    expect(localStorage.getItem("language")).toBeNull();
  });

  it("passe la page en anglais d'un clic, puis ne propose plus rien", () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: englishSuggestionCopy.switchTo })
    );
    expect(reload).not.toHaveBeenCalled();
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("language")).toBe("en");
    expect(offer()).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "EN — Change language" })
    );
  });

  it("garde le français comme choix du visiteur qui écarte l'offre", () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: englishSuggestionCopy.dismiss })
    );
    expect(offer()).toBeNull();
    expect(document.documentElement.lang).toBe("fr");
    expect(localStorage.getItem("language")).toBe("fr");

    cleanup();
    mount();
    expect(offer()).toBeNull();
  });

  it("compte aussi le français choisi dans le menu comme un choix", () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "FR — Changer de langue" })
    );
    expect(offer()).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Français" }));
    expect(localStorage.getItem("language")).toBe("fr");
    expect(offer()).toBeNull();
  });

  it("ne propose rien à un navigateur qui déclare le français, ni quand la page le cache", () => {
    browserSpeaks("ar-AE", "fr-FR");
    mount();
    expect(offer()).toBeNull();
    cleanup();

    browserSpeaks("en-US");
    mount({ hideSuggestion: true });
    expect(offer()).toBeNull();
  });
});
