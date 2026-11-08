// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { navigate } from "wouter/use-browser-location";
import { afterEach, describe, expect, it, vi } from "vitest";

// L’application entière montée par React dans un DOM, sur des pages qui
// n’appellent aucune API : la transition enveloppe la page et rejoue à chaque
// changement de chemin. Sa durée et sa neutralisation sont dans index.css
// (pageTransition.test.ts).
const { default: App } = await import("../App");

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

/** Application montée en français sur `path`, sa page affichée. */
async function mountAt(path: string, heading: string) {
  localStorage.setItem("language", "fr");
  window.history.replaceState(null, "", path);
  render(createElement(App));
  return screen.findByRole("heading", { level: 1, name: heading });
}

describe("transition de page", () => {
  it("enveloppe la page affichée et repart d’un nouvel élément à chaque changement de chemin", async () => {
    localStorage.setItem("language", "fr");
    window.history.replaceState(null, "", "/page-introuvable");
    render(createElement(App));

    const notFound = await screen.findByText("Page introuvable");
    const first = notFound.closest(".page-transition");
    expect(first).not.toBeNull();
    expect(document.querySelectorAll(".page-transition")).toHaveLength(1);

    act(() => navigate("/autre-page-introuvable"));
    const again = await screen.findByText("Page introuvable");
    const second = again.closest(".page-transition");
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(first!.isConnected).toBe(false);
  });
});

describe("focus après un changement de page sans rechargement (A11Y-17)", () => {
  it("laisse le focus où il est au premier chargement", async () => {
    await mountAt("/page-introuvable", "Page introuvable");
    expect(document.activeElement).toBe(document.body);
  });

  it("le place sur le h1 de la nouvelle page, sans la faire défiler", async () => {
    await mountAt("/page-introuvable", "Page introuvable");
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    act(() => navigate("/autre-page-introuvable"));
    const heading = await screen.findByRole("heading", { level: 1, name: "Page introuvable" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("attend le titre d’une page chargée à la demande", async () => {
    await mountAt("/page-introuvable", "Page introuvable");

    act(() => navigate("/faq"));
    const heading = await screen.findByRole("heading", { level: 1, name: "Questions fréquentes" }, { timeout: 5_000 });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("laisse à la page le focus qu’elle a placé elle-même (champ de /search)", async () => {
    await mountAt("/page-introuvable", "Page introuvable");

    act(() => navigate("/search"));
    const input = await screen.findByRole("searchbox", {}, { timeout: 5_000 });
    await waitFor(() => expect(document.activeElement).toBe(input));
    // Ni plus tard, une fois l’attente du titre écoulée.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(document.activeElement).toBe(input);
  });

  it("ne bouge pas pour une adresse avec ancre ni pour un ?tab= de la même page", async () => {
    await mountAt("/page-introuvable", "Page introuvable");
    const back = screen.getByRole("button", { name: "Page précédente" });
    back.focus();

    act(() => navigate("/page-introuvable?tab=privacy"));
    expect(screen.getByRole("button", { name: "Page précédente" })).toBe(back);
    expect(document.activeElement).toBe(back);

    act(() => navigate("/autre-page-introuvable#contact"));
    await screen.findByRole("heading", { level: 1, name: "Page introuvable" });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(document.activeElement).not.toBe(screen.getByRole("heading", { level: 1 }));
  });
});
