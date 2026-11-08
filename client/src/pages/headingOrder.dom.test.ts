// @vitest-environment happy-dom
import { createElement, type ComponentType } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// A11Y-15 — pages montées par React dans un DOM, avec les vrais contextes de thème et de langue :
// les lecteurs d'écran naviguent par titres, qui partent d'un h1 et ne sautent aucun niveau.

vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => () => ({ data, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({ candidatePortal: { invalidate: vi.fn(), me: { setData: vi.fn(), invalidate: vi.fn() }, documents: { invalidate: vi.fn() }, sessions: { invalidate: vi.fn() } } }),
      candidatePortal: {
        me: { useQuery: query({ id: 7, firstName: "Vera" }) },
        documents: { useQuery: query([]) },
        sessions: { useQuery: query([]) },
        logout: { useMutation: mutation },
        revokeSession: { useMutation: mutation },
        revokeAllSessions: { useMutation: mutation },
      },
    },
  };
});

const { ThemeProvider } = await import("@/contexts/ThemeContext");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { default: EmployersPage } = await import("./EmployersPage");
const { default: VvipOffshorePage } = await import("./VvipOffshorePage");
const { default: CandidatePortalPage, candidatePortalCopy } = await import("./CandidatePortalPage");

function mount(Page: ComponentType, language: "fr" | "en") {
  localStorage.setItem("language", language);
  return render(createElement(ThemeProvider, null, createElement(LanguageProvider, null, createElement(Page))));
}

/** Niveaux des titres du contenu principal, dans l'ordre de lecture. */
const headingLevels = () => within(screen.getByRole("main")).getAllByRole("heading").map(heading => Number(heading.tagName.slice(1)));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("hiérarchie des titres (A11Y-15)", () => {
  it.each([
    ["/employers", EmployersPage],
    ["/recruitment/vvip-offshore", VvipOffshorePage],
    ["/candidate/portal", CandidatePortalPage],
  ] as const)("%s part d’un seul h1 et ne saute aucun niveau", (_path, Page) => {
    for (const language of ["fr", "en"] as const) {
      mount(Page, language);
      const levels = headingLevels();
      expect(levels[0], language).toBe(1);
      expect(levels.filter(level => level === 1), language).toHaveLength(1);
      levels.forEach((level, index) => {
        if (index > 0) expect(level, `${language} : titre n° ${index + 1} après un h${levels[index - 1]}`).toBeLessThanOrEqual(levels[index - 1] + 1);
      });
      cleanup();
    }
  });

  it.each(["fr", "en"] as const)("espace candidat (%s) : un h1 « Bonjour … » et un h2 par carte", language => {
    const copy = candidatePortalCopy[language];
    mount(CandidatePortalPage, language);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(`${copy.greeting} Vera`);
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).toEqual([copy.dataProtection, copy.activeSessions, copy.uploadTitle, copy.documents]);
  });
});
