// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-10 — Messages de l’administration montés par React dans un DOM, avec un
// faux tRPC : « Lu » refusé (session de sécurité expirée juste avant le clic,
// comme dans l’audit) le dit au lieu de ne rien afficher ; une liste qui n’a
// pas pu être chargée le dit, avec « Réessayer ».

type Page = { data: unknown; isLoading: boolean; isFetching: boolean; error: { message: string } | null; refetch: ReturnType<typeof vi.fn> };
const view = vi.hoisted(() => ({ refusal: null as null | string, marked: [] as unknown[], toasts: [] as Array<[string, string]>, firstPage: null as null | Page }));

vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const message = { id: 5, trackingId: "CT-2026-0005", name: "Paul Martin", email: "paul@test.local", phone: null, message: "Bonjour", read: 0, createdAt: "2026-10-20T08:00:00.000Z" };
  return {
    trpc: {
      useUtils: () => ({ admin: { contacts: { list: { invalidate: vi.fn() } }, stats: { invalidate: vi.fn() } } }),
      useQueries: (build: (t: unknown) => unknown[]) => {
        const t = { admin: { contacts: { list: (input: unknown) => input } } };
        return build(t).map(() => view.firstPage ?? { data: { items: [message], total: 1 }, isLoading: false, error: null, refetch: vi.fn() });
      },
      admin: {
        contacts: {
          markRead: { useMutation: (options: object) => useMutation({ mutationFn: async (input: unknown) => { view.marked.push(input); if (view.refusal) throw new Error(view.refusal); return { success: true }; }, ...options }) },
          delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        },
      },
    },
  };
});
vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "warning", "error", "info"].map(tone => [tone, (text: string) => view.toasts.push([tone, text])])),
}));

const { default: ContactsTab } = await import("./ContactsTab");

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(ContactsTab)));
}

beforeEach(() => {
  view.firstPage = null;
  view.refusal = null;
  view.marked = [];
  view.toasts = [];
});
afterEach(cleanup);

describe("ADM-10 — « Lu » sur un message", () => {
  it("dit que le message n’a pas pu être marqué comme lu", async () => {
    view.refusal = "Validation de sécurité administrateur requise (10003)";
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Lu" }));

    await waitFor(() => expect(view.toasts).toEqual([["error", "Validation de sécurité administrateur requise (10003)"]]));
    expect(view.marked).toEqual([{ id: 5 }]);
  });

  it("confirme un marquage réussi, sans message d’erreur", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Lu" }));

    await waitFor(() => expect(view.toasts).toEqual([["success", "Marqué comme lu"]]));
  });
});

describe("ADM-10 — liste des messages illisible", () => {
  it("dit que les messages n’ont pas pu être chargés, les recharge avec « Réessayer » et le garde inactif pendant l’essai", () => {
    view.firstPage = { data: undefined, isLoading: false, isFetching: false, error: { message: "Validation de sécurité administrateur requise (10003)" }, refetch: vi.fn() };
    const { rerender } = mount();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Impossible de charger ces données");
    expect(alert.textContent).toContain("Validation de sécurité administrateur requise (10003)");
    // The filters and the search stay on screen.
    expect(screen.getByRole("button", { name: "Non lus" })).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(view.firstPage.refetch).toHaveBeenCalledTimes(1);

    view.firstPage = { ...view.firstPage, data: { items: [], total: 0 }, isFetching: true };
    rerender(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ContactsTab)));
    expect((within(screen.getByRole("alert")).getByRole("button", { name: "Réessayer" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
