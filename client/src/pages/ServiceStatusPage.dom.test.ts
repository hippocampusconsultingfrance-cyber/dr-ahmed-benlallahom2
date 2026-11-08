// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Pages de maintenance et d'erreur montées par React dans un DOM, avec le vrai contexte de langue.
const { default: ServiceStatusPage } = await import("./ServiceStatusPage");
const { getServiceStatusContent } = await import("./serviceStatusContent");
const { LanguageProvider } = await import("@/contexts/LanguageContext");

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("retour à l’accueil des pages de service (A11Y-17)", () => {
  it.each(["maintenance", "error"] as const)("%s : un vrai lien vers l’accueil, « Réessayer » restant une action", kind => {
    localStorage.setItem("language", "fr");
    render(createElement(LanguageProvider, null, createElement(ServiceStatusPage, { kind })));
    const copy = getServiceStatusContent(kind, "fr");

    expect(screen.getByRole("link", { name: copy.home }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: copy.home })).toBeNull();
    expect(screen.getByRole("button", { name: copy.retry })).toBeTruthy();
  });
});
