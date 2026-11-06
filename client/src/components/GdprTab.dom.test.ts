// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ADM-10 — demandes RGPD de l’administration montées par React dans un DOM,
// avec un faux tRPC : une liste qui n’a pas pu être chargée (session de
// sécurité expirée, comme dans l’audit) le dit, avec « Réessayer » qui relit
// la première page.

const view = vi.hoisted(() => ({ refetch: [] as Array<ReturnType<typeof vi.fn>> }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { gdprRequests: { list: { invalidate: vi.fn() } } } }),
    useQueries: (build: (t: unknown) => unknown[]) => {
      const t = { admin: { gdprRequests: { list: (input: unknown) => input } } };
      return build(t).map((_, page) => ({ data: undefined, isLoading: false, isFetching: false, error: { message: "Validation de sécurité administrateur requise (10003)" }, refetch: (view.refetch[page] ??= vi.fn()) }));
    },
    admin: { gdprRequests: { updateStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: GdprTab } = await import("./GdprTab");

afterEach(cleanup);

describe("ADM-10 — liste des demandes RGPD illisible", () => {
  it("dit que les demandes n’ont pas pu être chargées, au lieu d’une liste vide, et les recharge", () => {
    render(createElement(GdprTab));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Impossible de charger ces données");
    expect(alert.textContent).toContain("Validation de sécurité administrateur requise (10003)");
    expect(screen.queryByText("Aucune demande RGPD")).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(view.refetch[0]).toHaveBeenCalledTimes(1);
  });
});
