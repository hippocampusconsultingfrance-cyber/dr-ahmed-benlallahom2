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

// Onglet Disponibilités monté par React dans un DOM, avec un faux tRPC : une
// date ne se débloque qu’après une confirmation qui la donne en toutes lettres
// (ADM-11), une liste qui n’a pas pu être chargée le dit au lieu de paraître
// vide, avec « Réessayer », et la suppression d’un créneau refusée le dit
// (ADM-10). Une période de congés se bloque en une fois, après un seul
// avertissement qui liste ses rendez-vous payés (ADM-21), les réservations se
// suspendent et reprennent en une fois, après confirmation (ADM-21), et le
// bouton de déblocage, une icône, porte un nom (A11Y-12).

type List<T> = {
  data: T[] | undefined;
  isLoading: boolean;
  error: { message: string } | null;
  refetch: ReturnType<typeof vi.fn>;
  isFetching: boolean;
};
const list = <T>(
  data: T[] | undefined,
  error: { message: string } | null = null
): List<T> => ({
  data,
  isLoading: false,
  error,
  refetch: vi.fn(),
  isFetching: false,
});

const view = vi.hoisted(() => ({
  slots: null as unknown as List<{
    id: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive: number;
  }>,
  blockedDates: null as unknown as List<{
    id: number;
    date: string;
    reason: string | null;
  }>,
  calls: {
    deleteSlot: [] as unknown[],
    removeBlockedDate: [] as unknown[],
    addBlockedDate: [] as unknown[],
    addBlockedPeriod: [] as unknown[],
    setBookingsSuspended: [] as unknown[],
  },
  refusal: null as null | string,
  /** The server's answer to the next « Bloquer » of a period: thrown when it is an error. */
  periodAnswers: [] as unknown[],
  toasts: [] as Array<[string, string]>,
}));

vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const fakeMutation =
    (name: keyof typeof view.calls | null) => (options: object) =>
      useMutation({
        mutationFn: async (input: unknown) => {
          if (name) view.calls[name].push(input);
          if (view.refusal) throw new Error(view.refusal);
          if (name === "addBlockedPeriod") {
            const answer = view.periodAnswers.shift();
            if (answer instanceof Error) throw answer;
            return answer;
          }
          if (name === "setBookingsSuspended")
            return {
              success: true,
              ...(input as { suspended: boolean }),
              slots: 1,
            };
          return { success: true, paidAppointments: [] };
        },
        ...options,
      });
  return {
    trpc: {
      useUtils: () => ({
        admin: {
          availability: {
            listSlots: { invalidate: vi.fn() },
            listBlockedDates: { invalidate: vi.fn() },
          },
        },
      }),
      admin: {
        availability: {
          listSlots: { useQuery: () => view.slots },
          listBlockedDates: { useQuery: () => view.blockedDates },
          addSlot: { useMutation: fakeMutation(null) },
          deleteSlot: { useMutation: fakeMutation("deleteSlot") },
          addBlockedDate: { useMutation: fakeMutation("addBlockedDate") },
          addBlockedPeriod: { useMutation: fakeMutation("addBlockedPeriod") },
          removeBlockedDate: { useMutation: fakeMutation("removeBlockedDate") },
          setBookingsSuspended: {
            useMutation: fakeMutation("setBookingsSuspended"),
          },
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

const { default: AvailabilityTab } = await import("./AvailabilityTab");

function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(AvailabilityTab)
    )
  );
}

beforeEach(() => {
  view.slots = list([
    { id: 1, dayOfWeek: 4, startTime: "09:00", endTime: "12:00", isActive: 1 },
  ]);
  view.blockedDates = list([{ id: 9, date: "2026-12-24", reason: "Congés" }]);
  view.calls = {
    deleteSlot: [],
    removeBlockedDate: [],
    addBlockedDate: [],
    addBlockedPeriod: [],
    setBookingsSuspended: [],
  };
  view.refusal = null;
  view.periodAnswers = [];
  view.toasts = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("déblocage d’une date (ADM-11)", () => {
  it("ne débloque qu’après une confirmation qui donne la date en toutes lettres", async () => {
    mount();
    // Named, though it shows only an icon (A11Y-12).
    const unblock = screen.getByRole("button", {
      name: "Débloquer le jeudi 24 décembre 2026",
    });

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(unblock);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toContain(
      "Débloquer le jeudi 24 décembre 2026 ?"
    );
    expect(confirm.mock.calls[0]![0]).toContain(
      "pourront de nouveau être réservés"
    );
    expect(view.calls.removeBlockedDate).toEqual([]);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(unblock);
    await waitFor(() =>
      expect(view.toasts).toEqual([["success", "Date débloquée"]])
    );
    expect(view.calls.removeBlockedDate).toEqual([{ id: 9 }]);
  });
});

describe("listes et actions en échec (ADM-10)", () => {
  it("dit que les créneaux n’ont pas pu être chargés, au lieu de « Aucun créneau configuré », et les recharge", () => {
    view.slots = list(undefined, { message: "Délai dépassé" });
    mount();

    const alert = screen.getByRole("alert");
    // Under the section's h3 « Créneaux hebdomadaires », never above it.
    expect(within(alert).getByRole("heading", { level: 4 }).textContent).toBe(
      "Impossible de charger ces données"
    );
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
    expect(within(alert).getByRole("heading", { level: 4 }).textContent).toBe(
      "Impossible de charger ces données"
    );
    expect(alert.textContent).toContain("Base indisponible");
    expect(screen.queryByText("Aucune date bloquée")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(view.blockedDates.refetch).toHaveBeenCalledTimes(1);
  });

  it("dit l’échec de la suppression d’un créneau", async () => {
    view.refusal = "Validation de sécurité administrateur requise (10003)";
    mount();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Supprimer le créneau Jeudi 09:00 - 12:00",
      })
    );

    await waitFor(() =>
      expect(view.toasts).toEqual([
        ["error", "Validation de sécurité administrateur requise (10003)"],
      ])
    );
    expect(view.calls.deleteSlot).toEqual([{ id: 1 }]);
  });
});

describe("bloquer une période (ADM-21)", () => {
  const field = (label: string) =>
    screen.getByLabelText(label) as HTMLInputElement;
  const fill = (from: string, to: string, reason = "") => {
    fireEvent.click(
      screen.getByRole("button", { name: "Bloquer une date ou une période" })
    );
    fireEvent.change(field("Du"), { target: { value: from } });
    fireEvent.change(field("Au (inclus, facultatif)"), {
      target: { value: to },
    });
    if (reason)
      fireEvent.change(
        field("Motif interne (optionnel, jamais affiché sur le site)"),
        { target: { value: reason } }
      );
  };
  /** A refusal as tRPC hands it to the screen. */
  const refusal = (code: string, message: string) =>
    Object.assign(new Error(message), { data: { code } });

  it("bloque toute la période après un seul avertissement qui liste ses rendez-vous payés", async () => {
    const warning =
      "2 rendez-vous payé(s) sur cette période (APTPERIOD002 le 20/12/2026 à 14:30, APTPERIOD001 le 21/12/2026 à 10:00). Bloquer la période ne les annule pas et ne prévient pas les patients : annulez-les et remboursez-les depuis l’onglet Réservations.";
    view.periodAnswers = [
      refusal("PRECONDITION_FAILED", warning),
      {
        success: true,
        blocked: 4,
        alreadyBlocked: 1,
        paidAppointments: ["APTPERIOD002", "APTPERIOD001"],
      },
    ];
    mount();
    fill("2026-12-20", "2026-12-24", "Congés");
    // The last day cannot come before the first.
    expect(field("Au (inclus, facultatif)").min).toBe("2026-12-20");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Bloquer" }));

    await waitFor(() => expect(view.calls.addBlockedPeriod).toHaveLength(2));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toBe(
      `${warning}\n\nBloquer quand même cette période ?`
    );
    expect(view.calls.addBlockedPeriod).toEqual([
      { from: "2026-12-20", to: "2026-12-24", reason: "Congés" },
      {
        from: "2026-12-20",
        to: "2026-12-24",
        reason: "Congés",
        acknowledgePaidAppointments: true,
      },
    ]);
    expect(view.calls.addBlockedDate).toEqual([]);
    await waitFor(() =>
      expect(view.toasts).toEqual([
        [
          "success",
          "Période bloquée : 4 date(s) ; 1 date(s) déjà bloquée(s) laissée(s) telle(s) quelle(s).",
        ],
        [
          "warning",
          "Rendez-vous payés à traiter sur cette période : APTPERIOD002, APTPERIOD001.",
        ],
      ])
    );
    // The form is closed and emptied.
    expect(screen.queryByLabelText("Du")).toBeNull();
  });

  it("ne bloque rien quand l’avertissement est refusé, et dit les autres refus du serveur", async () => {
    view.periodAnswers = [
      refusal(
        "PRECONDITION_FAILED",
        "1 rendez-vous payé(s) sur cette période (APTPERIOD001 le 21/12/2026 à 10:00)."
      ),
      refusal(
        "BAD_REQUEST",
        "Une période compte 366 jours au plus : bloquez-la en plusieurs fois."
      ),
    ];
    mount();
    fill("2026-12-20", "2026-12-24");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Bloquer" }));
    await waitFor(() => expect(view.calls.addBlockedPeriod).toHaveLength(1));
    expect(view.toasts).toEqual([]);

    fireEvent.change(field("Au (inclus, facultatif)"), {
      target: { value: "2028-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bloquer" }));
    await waitFor(() =>
      expect(view.toasts).toEqual([
        [
          "error",
          "Une période compte 366 jours au plus : bloquez-la en plusieurs fois.",
        ],
      ])
    );
    expect(view.calls.addBlockedPeriod).toHaveLength(2);
  });

  it("bloque une seule date quand « Au » est vide ou reprend le même jour", async () => {
    mount();
    fill("2026-12-31", "");
    fireEvent.click(screen.getByRole("button", { name: "Bloquer" }));
    await waitFor(() =>
      expect(view.calls.addBlockedDate).toEqual([
        { date: "2026-12-31", reason: "" },
      ])
    );

    fill("2027-01-02", "2027-01-02");
    fireEvent.click(screen.getByRole("button", { name: "Bloquer" }));
    await waitFor(() => expect(view.calls.addBlockedDate).toHaveLength(2));
    expect(view.calls.addBlockedPeriod).toEqual([]);
  });

  it("propose les jours d’un créneau du lundi au dimanche", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un créneau" }));
    const days = Array.from(
      document.querySelectorAll("select option"),
      option => [option.textContent, (option as HTMLOptionElement).value]
    );
    expect(days).toEqual([
      ["Lundi", "1"],
      ["Mardi", "2"],
      ["Mercredi", "3"],
      ["Jeudi", "4"],
      ["Vendredi", "5"],
      ["Samedi", "6"],
      ["Dimanche", "0"],
    ]);
  });
});

describe("suspendre et reprendre les réservations (ADM-21)", () => {
  const SUSPENDED =
    "Réservations en ligne suspendues : le site ne propose aucun créneau, y compris ceux ajoutés depuis. Les rendez-vous déjà pris sont conservés.";

  it("suspend tous les créneaux après une confirmation qui dit que les rendez-vous pris restent ; refusée, rien n’est fait", async () => {
    mount();
    expect(screen.queryByText(SUSPENDED)).toBeNull();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Suspendre les réservations" })
    );
    expect(confirm.mock.calls[0]![0]).toContain(
      "Le site ne proposera plus aucun créneau jusqu’à leur reprise. Les rendez-vous déjà pris, ou en attente de paiement, sont conservés"
    );
    expect(view.calls.setBookingsSuspended).toEqual([]);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Suspendre les réservations" })
    );
    await waitFor(() =>
      expect(view.toasts).toEqual([
        [
          "success",
          "Réservations suspendues : le site ne propose plus aucun créneau.",
        ],
      ])
    );
    expect(view.calls.setBookingsSuspended).toEqual([{ suspended: true }]);
  });

  it("dit la suspension quand tous les créneaux sont fermés, et les rouvre ensemble après confirmation", async () => {
    view.slots = list([
      {
        id: 1,
        dayOfWeek: 4,
        startTime: "09:00",
        endTime: "12:00",
        isActive: 0,
      },
      {
        id: 2,
        dayOfWeek: 5,
        startTime: "09:00",
        endTime: "10:00",
        isActive: 0,
      },
    ]);
    mount();
    expect(screen.getByText(SUSPENDED)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Suspendre les réservations" })
    ).toBeNull();

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Reprendre les réservations" })
    );
    expect(confirm.mock.calls[0]![0]).toContain(
      "Les créneaux hebdomadaires pourront de nouveau être réservés par les patients, hors dates bloquées."
    );
    await waitFor(() =>
      expect(view.toasts).toEqual([
        [
          "success",
          "Réservations reprises : les créneaux hebdomadaires sont de nouveau proposés.",
        ],
      ])
    );
    expect(view.calls.setBookingsSuspended).toEqual([{ suspended: false }]);
  });

  it("ne propose rien à suspendre sans créneau, ni quand la liste n’a pas pu être lue", () => {
    view.slots = list([]);
    mount();
    expect(
      screen.queryByRole("button", {
        name: /(Suspendre|Reprendre) les réservations/,
      })
    ).toBeNull();
    cleanup();
    view.slots = list(undefined, { message: "Délai dépassé" });
    mount();
    expect(
      screen.queryByRole("button", {
        name: /(Suspendre|Reprendre) les réservations/,
      })
    ).toBeNull();
  });

  it("dit le refus du serveur", async () => {
    view.refusal = "Validation de sécurité administrateur requise (10003)";
    mount();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Suspendre les réservations" })
    );
    await waitFor(() =>
      expect(view.toasts).toEqual([
        ["error", "Validation de sécurité administrateur requise (10003)"],
      ])
    );
  });
});
