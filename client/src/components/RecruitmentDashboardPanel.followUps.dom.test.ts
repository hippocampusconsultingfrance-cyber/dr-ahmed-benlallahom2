// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-13 — « Pilotage recrutement » monté par React dans un DOM, avec un faux
// tRPC : le bandeau « N relances manuelles à examiner » ouvre la liste
// « Relances à faire », par échéance, où l’on marque traitées ou ignore
// plusieurs relances d’un coup. Aucune n’envoie d’email.

type Task = { id: number; applicationId: number; firstName: string; lastName: string; specialty: string; kind: string; dueAt: Date; status: string };

const view = vi.hoisted(() => ({
  tasks: [] as Task[],
  pending: 0,
  listInputs: [] as unknown[],
  updates: [] as Array<{ ids: number[]; status: string }>,
  invalidated: [] as string[],
  toasts: [] as Array<[string, string]>,
}));

vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "warning", "error", "info"].map(tone => [tone, (message: string) => view.toasts.push([tone, message])])),
}));
vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const invalidate = (name: string) => () => { view.invalidated.push(name); };
  return {
    trpc: {
      useUtils: () => ({
        admin: {
          recruitment: {
            followUps: { list: { invalidate: invalidate("followUps.list") } },
            dashboard: { invalidate: invalidate("dashboard") },
            candidate: { detail: { invalidate: invalidate("candidate.detail") } },
          },
        },
      }),
      admin: {
        recruitment: {
          dashboard: {
            useQuery: () => ({
              data: {
                candidateStats: { total: 12, marketingEligible: 6, contacted: 4, responded: 1, analysesQueued: 0, analysesInProgress: 0, analysesNeedsReview: 0, analysesCompleted: 12, analysesFailed: 0 },
                campaignStats: { total: 1, sent: 1 },
                deliveryStats: { delivered: 4, failed: 0, delayed: 0 },
                followUpStats: { pending: view.pending, due: 2 },
                briefStats: { total: 0, active: 0 },
              },
              isLoading: false,
              error: null,
            }),
          },
          followUps: {
            list: { useQuery: (input: unknown) => { view.listInputs.push(input); return { data: view.tasks, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }; } },
            updateMany: {
              useMutation: (options: object) => useMutation({
                mutationFn: async (input: { ids: number[]; status: string }) => { view.updates.push(input); return { success: true, updated: input.ids.length }; },
                ...options,
              }),
            },
          },
        },
      },
    },
  };
});

const { default: RecruitmentDashboardPanel } = await import("./RecruitmentDashboardPanel");

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(RecruitmentDashboardPanel)));
}

const task = (id: number, lastName: string, dueAt: string, kind = "follow_up_7"): Task => ({ id, applicationId: id * 10, firstName: "Dr", lastName, specialty: "Anesthésie", kind, dueAt: new Date(dueAt), status: "suggested" });
const banner = () => screen.getByRole("button", { name: /relances manuelles à examiner/ });

beforeEach(() => {
  view.tasks = [task(1, "Échue", "2026-01-05T09:00:00.000Z"), task(2, "Proche", "2099-01-06T09:00:00.000Z", "follow_up_14"), task(3, "Lointaine", "2099-02-01T09:00:00.000Z")];
  view.pending = 3;
  view.listInputs = [];
  view.updates = [];
  view.invalidated = [];
  view.toasts = [];
});
afterEach(() => cleanup());

describe("ADM-13 — relances à faire depuis le pilotage recrutement", () => {
  it("ouvre depuis le bandeau la liste des relances à examiner, dans l’ordre des échéances", () => {
    mount();
    expect(screen.queryByRole("heading", { name: "Relances à faire" })).toBeNull();
    expect(banner().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(banner());
    expect(banner().getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("region", { name: "Relances à faire" });
    expect(view.listInputs.at(-1)).toEqual({ status: "suggested" });
    const items = within(list).getAllByRole("listitem").map(item => item.textContent);
    expect(items.map(text => text?.match(/Dr (\S+)/)?.[1])).toEqual(["Échue", "Proche", "Lointaine"]);
    expect(items[0]).toContain("Relance J+7");
    expect(items[0]).toContain("échue");
    expect(items[1]).toContain("Relance J+14");
    expect(items[1]).not.toContain("échue");

    fireEvent.click(banner());
    expect(screen.queryByRole("region", { name: "Relances à faire" })).toBeNull();
  });

  it("marque traitées les relances cochées, d’un seul envoi, puis relit la liste et les indicateurs", async () => {
    mount();
    fireEvent.click(banner());
    const markHandled = () => screen.getByRole("button", { name: /^Marquer traitée/ });
    expect((markHandled() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /Dr Échue/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Dr Lointaine/ }));
    expect(markHandled().textContent).toBe("Marquer traitées (2)");
    fireEvent.click(markHandled());

    await waitFor(() => expect(view.toasts).toEqual([["success", "2 relances marquée(s) traitée(s). Aucun email n’a été envoyé."]]));
    expect(view.updates).toEqual([{ ids: [1, 3], status: "completed" }]);
    expect(view.invalidated).toEqual(expect.arrayContaining(["followUps.list", "dashboard", "candidate.detail"]));
    // The selection is emptied.
    expect((screen.getByRole("checkbox", { name: /Dr Échue/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("ignore toutes les relances listées d’un coup, et dit quand la liste n’en montre qu’une partie", async () => {
    view.pending = 250;
    mount();
    fireEvent.click(banner());
    expect(screen.getByText("Les 3 premières des 250 relances à faire : traitez-les pour afficher les suivantes.")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Tout sélectionner (3)" }));
    fireEvent.click(screen.getByRole("button", { name: "Ignorer (3)" }));
    await waitFor(() => expect(view.updates).toEqual([{ ids: [1, 2, 3], status: "dismissed" }]));
    expect(view.toasts).toEqual([["success", "3 relances ignorée(s). Aucun email n’a été envoyé."]]);
  });

  it("dit qu’il n’y a aucune relance à faire", () => {
    view.tasks = [];
    view.pending = 0;
    mount();
    fireEvent.click(banner());
    expect(screen.getByText("Aucune relance à faire.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Ignorer/ })).toBeNull();
  });
});
