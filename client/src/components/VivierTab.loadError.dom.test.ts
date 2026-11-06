// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-10 — vivier de talents monté par React dans un DOM, avec un faux tRPC :
// un vivier qui n’a pas pu être lu le dit dans la langue de l’administration,
// avec « Actualiser » pour le relire, inactif pendant le nouvel essai.

const view = vi.hoisted(() => ({
  language: "fr" as "fr" | "en" | "de" | "zh",
  pool: null as unknown as { data: unknown; isLoading: boolean; isFetching: boolean; error: { message: string } | null; refetch: ReturnType<typeof vi.fn> },
}));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    admin: {
      recruitment: {
        pool: { list: { useQuery: () => view.pool } },
        exportCsv: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
    },
  },
}));

const { default: VivierTab } = await import("./VivierTab");

beforeEach(() => {
  view.language = "fr";
  view.pool = { data: undefined, isLoading: false, isFetching: false, error: { message: "Database unavailable" }, refetch: vi.fn() };
});
afterEach(cleanup);

describe("ADM-10 — vivier illisible", () => {
  it.each([
    ["fr", "Erreur de chargement du vivier", "Actualiser"],
    ["en", "Talent pool loading error", "Refresh"],
    ["de", "Fehler beim Laden des Talentpools", "Aktualisieren"],
    ["zh", "人才库加载错误", "刷新"],
  ] as const)("le dit et le relit (%s)", (language, title, retry) => {
    view.language = language;
    render(createElement(VivierTab, { onCompose: () => undefined }));

    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading").textContent).toBe(title);
    expect(alert.textContent).toContain("Database unavailable");
    fireEvent.click(within(alert).getByRole("button", { name: retry }));
    expect(view.pool.refetch).toHaveBeenCalledTimes(1);
  });

  it("garde « Actualiser » inactif pendant le nouvel essai d’un vivier déjà lu", () => {
    view.pool = { ...view.pool, data: [], isFetching: true };
    render(createElement(VivierTab, { onCompose: () => undefined }));
    expect((within(screen.getByRole("alert")).getByRole("button", { name: "Actualiser" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
