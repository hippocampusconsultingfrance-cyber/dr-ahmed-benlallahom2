// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Page des témoignages montée par React dans un DOM, avec la vraie barre de
// navigation et le vrai pied de page ; seule la liste vient d’un faux tRPC.
const CREATED_AT = "2026-06-15T10:00:00.000Z";
vi.mock("@/lib/trpc", () => ({
  trpc: {
    testimonials: {
      list: {
        useQuery: () => ({
          data: [{ id: 1, authorName: "Dr Claire Martin", specialty: "Anesthésie", content: "Une collaboration remarquable et rigoureuse.", rating: 5, title: "Collaboration", language: "fr", createdAt: CREATED_AT }],
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

const { default: TestimonialsPage } = await import("./TestimonialsPage");
const { ThemeProvider } = await import("@/contexts/ThemeContext");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { navigationAccessibilityCopy } = await import("@/components/navigationAccessibilityCopy");

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("repères et structure (PUB-A11Y-01 / PUB-A11Y-02)", () => {
  it("/testimonials a une navigation, un <main> atteignable par le lien d’évitement et un pied de page, et une date lisible", () => {
    localStorage.setItem("language", "fr");
    render(createElement(ThemeProvider, null, createElement(LanguageProvider, null, createElement(TestimonialsPage))));

    expect(screen.getByRole("navigation", { name: navigationAccessibilityCopy.fr.mainNavigation })).toBeTruthy();
    const main = screen.getByRole("main");
    expect(main.id).toBe("main-content");
    // Focusable by the skip link only: an explicit tabindex="-1" (a <main> without it already reads -1).
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    const date = screen.getByText(new Date(CREATED_AT).toLocaleDateString("fr"));
    expect(main.contains(date)).toBe(true);
    // text-gray-500 n’atteignait pas 4,5:1 sur le fond des cartes.
    expect(date.className).not.toContain("text-gray-500");
  });
});
