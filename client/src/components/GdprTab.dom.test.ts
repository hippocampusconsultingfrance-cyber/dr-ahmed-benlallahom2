// @vitest-environment happy-dom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ADM-10 — demandes RGPD de l’administration montées par React dans un DOM,
// avec un faux tRPC : une liste qui n’a pas pu être chargée (session de
// sécurité expirée, comme dans l’audit) le dit, avec « Réessayer » qui relit
// la première page.

type GdprRequest = {
  id: number;
  trackingId: string;
  name: string;
  email: string;
  requestType: string;
  status: string;
  description: string | null;
  notes: string | null;
  createdAt: string;
  responseDate: string | null;
  emailConfirmedAt?: string | null;
};
const view = vi.hoisted(() => ({
  refetch: [] as Array<ReturnType<typeof vi.fn>>,
  requests: null as null | GdprRequest[],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      admin: { gdprRequests: { list: { invalidate: vi.fn() } } },
    }),
    useQueries: (build: (t: unknown) => unknown[]) => {
      const t = {
        admin: { gdprRequests: { list: (input: unknown) => input } },
      };
      // A list read (ADM-09), or one the server refused (ADM-10).
      if (view.requests)
        return build(t).map(() => ({
          data: { items: view.requests, total: view.requests!.length },
          isLoading: false,
          isFetching: false,
          error: null,
          refetch: vi.fn(),
        }));
      return build(t).map((_, page) => ({
        data: undefined,
        isLoading: false,
        isFetching: false,
        error: {
          message: "Validation de sécurité administrateur requise (10003)",
        },
        refetch: (view.refetch[page] ??= vi.fn()),
      }));
    },
    admin: {
      gdprRequests: {
        updateStatus: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
    },
  },
}));
vi.mock("@/components/PersonalDataSearchPanel", () => ({
  default: () => null,
  personalDataSearchKey: () => "search",
  requestPersonalDataSearch: (current: unknown) => current,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: GdprTab } = await import("./GdprTab");

afterEach(() => {
  cleanup();
  view.requests = null;
  vi.restoreAllMocks();
});

describe("ADM-10 — liste des demandes RGPD illisible", () => {
  it("dit que les demandes n’ont pas pu être chargées, au lieu d’une liste vide, et les recharge", () => {
    render(createElement(GdprTab));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Impossible de charger ces données");
    expect(alert.textContent).toContain(
      "Validation de sécurité administrateur requise (10003)"
    );
    expect(screen.queryByText("Aucune demande RGPD")).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(view.refetch[0]).toHaveBeenCalledTimes(1);
  });
});

describe("ADM-09 — demande ouverte depuis le lien d’une notification", () => {
  const request = (
    id: number,
    trackingId: string,
    name: string
  ): GdprRequest => ({
    id,
    trackingId,
    name,
    email: `${trackingId.toLowerCase()}@example.test`,
    requestType: "access",
    status: "pending",
    description: null,
    notes: null,
    createdAt: "2026-11-02T09:00:00.000Z",
    responseDate: null,
  });

  it("met à part la demande que l’adresse nomme, l’amène à l’écran et lui donne le focus", () => {
    view.requests = [
      request(1, "GAAAA0001", "Personne Une"),
      request(2, "GBBBB0002", "Personne Deux"),
    ];
    const scrolled: Element[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
      this: Element
    ) {
      scrolled.push(this);
    });
    render(
      createElement<{ reference?: string }>(GdprTab, { reference: "GBBBB0002" })
    );

    const linked = screen.getByText("Personne Deux").closest("[aria-current]")!;
    expect(linked.getAttribute("aria-current")).toBe("true");
    expect(linked.className).toContain("border-primary");
    expect(scrolled).toEqual([linked]);
    expect(document.activeElement).toBe(linked);
    expect(
      screen.getByText("Personne Une").closest("[aria-current]")
    ).toBeNull();
  });

  it("dit si la personne a confirmé son adresse par le lien de l’accusé de réception (RGPD-13)", () => {
    view.requests = [
      {
        ...request(1, "GAAAA0001", "Personne Une"),
        emailConfirmedAt: "2026-11-02T10:30:00.000Z",
      },
      request(2, "GBBBB0002", "Personne Deux"),
      {
        ...request(3, "GCCCC0003", "Personne Trois"),
        status: "completed",
        responseDate: "2026-11-05T09:00:00.000Z",
      },
    ];
    render(createElement(GdprTab));

    const card = (name: string) =>
      screen.getByText(name).closest(".bg-card")!.textContent;
    expect(card("Personne Une")).toContain("Adresse confirmée le 02/11/2026");
    // Not « the person did not confirm »: the link may never have been sent.
    expect(card("Personne Deux")).toContain(
      "Adresse non confirmée (ou lien de confirmation non envoyé)"
    );
    // A closed request says nothing of it.
    expect(card("Personne Trois")).not.toContain("Adresse");
  });

  it("ne déplace rien pour une référence qu’aucune demande affichée n’a", () => {
    view.requests = [request(1, "GAAAA0001", "Personne Une")];
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => undefined);
    render(
      createElement<{ reference?: string }>(GdprTab, { reference: "GZZZZ9999" })
    );

    expect(screen.getByText("Personne Une")).toBeTruthy();
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
