// @vitest-environment happy-dom
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Héros de l'accueil monté par React dans un DOM, avec le vrai contexte de langue.
const { default: HeroSection, HERO_ROLE_INTERVAL_MS } = await import("./HeroSection");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { contentFr } = await import("@/data/content-fr");
const { contentEn } = await import("@/data/content-en");

const roles = contentFr.hero.roles;

function mount(language: "fr" | "en" = "fr") {
  localStorage.setItem("language", language);
  return render(createElement(LanguageProvider, null, createElement(HeroSection)));
}

/** The role a sighted visitor sees: the only one of the stack that is not hidden. */
const visibleRole = (container: HTMLElement) => Array.from(container.querySelectorAll("#hero [aria-hidden='true'] > p")).filter(role => !role.classList.contains("invisible")).map(role => role.textContent);

function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query === "(prefers-reduced-motion: reduce)", media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("titre rotatif du héros (A11Y-07)", () => {
  it("montre chaque rôle une fois puis s’arrête sur le premier", () => {
    preferReducedMotion(false);
    const { container } = mount();
    const seen = [visibleRole(container)];
    for (let step = 0; step < roles.length + 3; step += 1) {
      act(() => vi.advanceTimersByTime(HERO_ROLE_INTERVAL_MS));
      seen.push(visibleRole(container));
    }

    expect(seen.slice(0, roles.length + 1)).toEqual([...roles, roles[0]].map(role => [role]));
    // Plus rien ne bouge après le cycle : aucun minuteur ne reste en attente.
    expect(seen.slice(roles.length)).toEqual(Array(4).fill([roles[0]]));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ne tourne pas quand la réduction des animations est demandée", () => {
    preferReducedMotion(true);
    const { container } = mount();
    act(() => vi.advanceTimersByTime(HERO_ROLE_INTERVAL_MS * (roles.length + 1)));

    expect(visibleRole(container)).toEqual([roles[0]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("garde tous les rôles dans un bloc sans hauteur fixe ni débordement masqué, lus d’un coup par les lecteurs d’écran", () => {
    preferReducedMotion(false);
    const { container } = mount("en");
    const stack = container.querySelector("#hero [aria-hidden='true'].grid")!;
    const block = stack.parentElement!;

    expect(Array.from(stack.children).map(role => role.textContent)).toEqual(contentEn.hero.roles);
    expect(block.className).toMatch(/\bmin-h-10\b/);
    expect(block.className).not.toMatch(/(^|\s)(h-\d+|sm:h-\d+|overflow-hidden)(\s|$)/);
    expect(block.querySelector(".sr-only")?.textContent).toBe(contentEn.hero.roles.join(" · "));
  });
});

describe("illustration du héros (A11Y-14)", () => {
  it("est décorative : texte alternatif vide et cachée aux lecteurs d’écran", () => {
    preferReducedMotion(false);
    const { container } = mount("en");
    const illustration = container.querySelector('img[src="/assets/medical-hero.svg"]')!;

    expect(illustration.getAttribute("alt")).toBe("");
    expect(illustration.getAttribute("aria-hidden")).toBe("true");
  });
});
