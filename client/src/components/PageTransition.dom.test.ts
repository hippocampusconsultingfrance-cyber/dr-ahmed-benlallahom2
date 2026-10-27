// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { navigate } from "wouter/use-browser-location";
import { afterEach, describe, expect, it } from "vitest";

// L’application entière montée par React dans un DOM, sur deux pages qui
// n’appellent aucune API : la transition enveloppe la page et rejoue à chaque
// changement de chemin. Sa durée et sa neutralisation sont dans index.css
// (pageTransition.test.ts).
const { default: App } = await import("../App");

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

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
