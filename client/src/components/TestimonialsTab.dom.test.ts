// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-10 — Témoignages de l’administration montés par React dans un DOM, avec
// un faux tRPC : une liste qui n’a pas pu être chargée le dit, avec
// « Réessayer », au lieu de « Aucun témoignage », et une approbation ou une
// suppression refusée le dit. Le statut est écrit en mots (ADM-07) et le
// bouton de suppression, une icône, porte un nom (A11Y-12).

const view = vi.hoisted(() => ({
  list: null as unknown as {
    data: unknown[] | undefined;
    isLoading: boolean;
    error: { message: string } | null;
    refetch: ReturnType<typeof vi.fn>;
    isFetching: boolean;
  },
  refusal: null as null | string,
  calls: [] as unknown[],
  toasts: [] as Array<[string, string]>,
}));

vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const fakeMutation = (name: string) => (options: object) =>
    useMutation({
      mutationFn: async (input: unknown) => {
        view.calls.push([name, input]);
        if (view.refusal) throw new Error(view.refusal);
        return { success: true };
      },
      ...options,
    });
  return {
    trpc: {
      useUtils: () => ({
        admin: { testimonials: { list: { invalidate: vi.fn() } } },
      }),
      admin: {
        testimonials: {
          list: { useQuery: () => view.list },
          updateStatus: { useMutation: fakeMutation("updateStatus") },
          delete: { useMutation: fakeMutation("delete") },
        },
      },
    },
  };
});
vi.mock("sonner", () => ({
  toast: Object.fromEntries(
    ["success", "warning", "error", "info"].map(tone => [
      tone,
      (message: string) => view.toasts.push([tone, message]),
    ])
  ),
}));

const { default: TestimonialsTab } = await import("./TestimonialsTab");

function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(TestimonialsTab)
    )
  );
}

const testimonial = {
  id: 3,
  authorName: "Claire D.",
  rating: 5,
  status: "pending",
  featured: 0,
  title: "Consultation claire",
  content: "Merci pour les explications.",
};

beforeEach(() => {
  view.list = {
    data: [testimonial],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  };
  view.refusal = null;
  view.calls = [];
  view.toasts = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ADM-10 — témoignages de l’administration", () => {
  it("dit que la liste n’a pas pu être chargée, au lieu de « Aucun témoignage », et la recharge", () => {
    view.list = {
      data: undefined,
      isLoading: false,
      error: { message: "Délai dépassé" },
      refetch: vi.fn(),
      isFetching: false,
    };
    mount();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Délai dépassé");
    expect(screen.queryByText("Aucun témoignage")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(view.list.refetch).toHaveBeenCalledTimes(1);
  });

  it("dit l’échec d’une approbation", async () => {
    view.refusal = "Témoignage introuvable.";
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Approuver" }));

    await waitFor(() =>
      expect(view.toasts).toEqual([["error", "Témoignage introuvable."]])
    );
    expect(view.calls).toEqual([
      ["updateStatus", { id: 3, status: "approved" }],
    ]);
  });

  it("dit l’échec d’une suppression confirmée", async () => {
    view.refusal = "Validation de sécurité administrateur requise (10003)";
    mount();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Supprimer le témoignage de Claire D.",
      })
    );

    await waitFor(() =>
      expect(view.toasts).toEqual([
        ["error", "Validation de sécurité administrateur requise (10003)"],
      ])
    );
    expect(view.calls).toEqual([["delete", { id: 3 }]]);
  });
});

describe("ADM-07 — statut d’un témoignage en mots", () => {
  it("dit « À modérer », « Approuvé », « Rejeté » et « Mis en avant », jamais la valeur enregistrée", () => {
    view.list.data = [
      testimonial,
      {
        ...testimonial,
        id: 4,
        authorName: "Marc L.",
        status: "approved",
        featured: 1,
      },
      { ...testimonial, id: 5, authorName: "Ines B.", status: "rejected" },
    ];
    mount();
    const card = (author: string) =>
      screen.getByText(author).closest("div.bg-card") as HTMLElement;
    expect(within(card("Claire D.")).getByText("À modérer")).toBeTruthy();
    expect(within(card("Marc L.")).getByText("Approuvé")).toBeTruthy();
    expect(within(card("Marc L.")).getByText("Mis en avant")).toBeTruthy();
    expect(within(card("Ines B.")).getByText("Rejeté")).toBeTruthy();
    expect(
      screen.queryByText(/^(pending|approved|rejected|Featured)$/)
    ).toBeNull();
  });
});
