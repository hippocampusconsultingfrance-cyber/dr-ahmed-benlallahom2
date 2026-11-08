// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Écran d'erreur monté par React dans un DOM, avec le vrai contexte de langue, à la place d'une page qui plante.
const { default: ErrorBoundary, errorBoundaryCopy } = await import("./ErrorBoundary");
const { LanguageProvider } = await import("@/contexts/LanguageContext");

function Crash(): never {
  throw new Error("page en panne");
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("retour à l’accueil après une erreur (A11Y-17)", () => {
  it.each(["fr", "en"] as const)("%s : un vrai lien vers l’accueil, « Réessayer » restant une action", language => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    localStorage.setItem("language", language);
    render(createElement(LanguageProvider, null, createElement(ErrorBoundary, null, createElement(Crash))));
    const copy = errorBoundaryCopy[language];

    expect(screen.getByRole("link", { name: copy.home }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: copy.home })).toBeNull();
    expect(screen.getByRole("button", { name: copy.retry })).toBeTruthy();
  });
});
