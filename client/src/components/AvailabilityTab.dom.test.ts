// @vitest-environment happy-dom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Onglet Disponibilités monté par React dans un DOM, avec un faux tRPC : une
// date ne se débloque qu’après une confirmation qui la donne en toutes lettres
// (ADM-11), une liste qui n’a pas pu être chargée le dit au lieu de paraître
// vide, avec « Réessayer », et la suppression d’un créneau refusée le dit
// (ADM-10).

type List<T> = { data: T[] | undefined; isLoading: boolean; error: { message: string } | null; refetch: ReturnType<typeof vi.fn>; isFetching: boolean };
const list = <T,>(data: T[] | undefined, error: { message: string } | null = null): List<T> => ({ data, isLoading: false, error, refetch: vi.fn(), isFetching: false });

const view = vi.hoisted(() => ({
  slots: null as unknown as List<{ id: number; dayOfWeek: number; startTime: string; endTime: string }>,
  blockedDates: null as unknown as List<{ id: number; date: string; reason: string | null }>,
  calls: { deleteSlot: [] as unknown[], removeBlockedDate: [] as unknown[] },
  refusal: null as null | string,
  toasts: [] as Array<[string, string]>,
}));

vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const fakeMutation = (name: "deleteSlot" | "removeBlockedDate" | null) => (options: object) => useMutation({
    mutationFn: async (input: unknown) => {
      if (name) view.calls[name].push(input);
      if (view.refusal) throw new Error(view.refusal);
      return { success: true, paidAppointments: [] };
    },
    ...options,
  });
  return {
    trpc: {
      useUtils: () => ({ admin: { availability: { listSlots: { invalidate: vi.fn() }, listBlockedDates: { invalidate: vi.fn() } } } }),
      admin: {
        availability: {
          listSlots: { useQuery: () => view.slots },
          listBlockedDates: { useQuery: () => view.blockedDates },
          addSlot: { useMutation: fakeMutation(null) },
          deleteSlot: { useMutation: fakeMutation("deleteSlot") },
          addBlockedDate: { useMutation: fakeMutation(null) },
          removeBlockedDate: { useMutation: fakeMutation("removeBlockedDate") },
        },
      },
    },
  };
});
vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "warning", "error", "info"].map(tone => [tone, (message: string) => view.toasts.push([tone, message])])),
}));

const { default: AvailabilityTab } = await import("./AvailabilityTab");

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(AvailabilityTab)));
}

beforeEach(() => {
  view.slots = list([{ id: 1, dayOfWeek: 4, startTime: "09:00", endTime: "12:00" }]);
  view.blockedDates = list([{ id: 9, date: "2026-12-24", reason: "Congés" }]);
  view.calls = { deleteSlot: [], removeBlockedDate: [] };
  view.refusal = null;
  view.toasts = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("déblocage d’une date (ADM-11)", () => {
  it("ne débloque qu’après une confirmation qui donne la date en toutes lettres", async () => {
    mount();
    const row = screen.getByText("jeudi 24 décembre 2026").parentElement!.parentElement!;
    const unblock = within(row).getByRole("button");

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(unblock);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toContain("Débloquer le jeudi 24 décembre 2026 ?");
    expect(confirm.mock.calls[0]![0]).toContain("pourront de nouveau être réservés");
    expect(view.calls.removeBlockedDate).toEqual([]);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(unblock);
    await waitFor(() => expect(view.toasts).toEqual([["success", "Date débloquée"]]));
    expect(view.calls.removeBlockedDate).toEqual([{ id: 9 }]);
  });
});

describe("listes et actions en échec (ADM-10)", () => {
  it("dit que les créneaux n’ont pas pu être chargés, au lieu de « Aucun créneau configuré », et les recharge", () => {
    view.slots = list(undefined, { message: "Délai dépassé" });
    mount();

    const alert = screen.getByRole("alert");
    // Under the section's h3 « Créneaux hebdomadaires », never above it.
    expect(within(alert).getByRole("heading", { level: 4 }).textContent).toBe("Impossible de charger ces données");
    expect(alert.textContent).toContain("Délai dépassé");
    expect(screen.queryByText("Aucun créneau configuré")).toBeNull();
    // The other list, loaded, is still shown.
    expect(screen.getByText("jeudi 24 décembre 2026")).toBeTruthy();

    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(view.slots.refetch).toHaveBeenCalledTimes(1);
  });

  it("dit que les dates bloquées n’ont pas pu être chargées, au lieu de « Aucune date bloquée », et les recharge", () => {
    view.blockedDates = list(undefined, { message: "Base indisponible" });
    mount();

    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { level: 4 }).textContent).toBe("Impossible de charger ces données");
    expect(alert.textContent).toContain("Base indisponible");
    expect(screen.queryByText("Aucune date bloquée")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(view.blockedDates.refetch).toHaveBeenCalledTimes(1);
  });

  it("dit l’échec de la suppression d’un créneau", async () => {
    view.refusal = "Validation de sécurité administrateur requise (10003)";
    mount();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le créneau Jeudi 09:00 - 12:00" }));

    await waitFor(() => expect(view.toasts).toEqual([["error", "Validation de sécurité administrateur requise (10003)"]]));
    expect(view.calls.deleteSlot).toEqual([{ id: 1 }]);
  });
});
