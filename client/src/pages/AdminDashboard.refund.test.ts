import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Toasts du remboursement depuis l’onglet Réservations : montant au format
// français, comme les emails, et ce que devient l’email au patient, qui passe
// par la file des remboursements (EXPL-02).

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type MutationOptions = { onSuccess?: (result: never) => unknown };
const view = vi.hoisted(() => ({
  mutations: {} as Record<string, MutationOptions>,
  toasts: [] as Array<[string, string]>,
  invalidated: [] as string[],
}));

const mutation = (name: string) => (options: MutationOptions = {}) => {
  view.mutations[name] = options;
  return { mutate: vi.fn(), isPending: false };
};
vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "error", "warning", "info"].map(kind => [kind, (message: string) => view.toasts.push([kind, message])])),
}));
vi.mock("@/lib/trpc", () => {
  const invalidate = (name: string) => ({ invalidate: () => view.invalidated.push(name) });
  return {
    trpc: {
      useUtils: () => ({ admin: { appointments: { list: invalidate("appointments.list") }, stats: invalidate("stats"), attention: invalidate("attention") } }),
      useQueries: (build: (t: unknown) => unknown[]) => build({ admin: { appointments: { list: (input: unknown) => input } } }).map(() => ({ data: { items: [], total: 0 }, isLoading: false, error: null, refetch: vi.fn() })),
      admin: {
        appointments: {
          updateStatus: { useMutation: mutation("updateStatus") },
          refund: { useMutation: mutation("refund") },
          refundUnconfirmedSession: { useMutation: mutation("refundUnconfirmedSession") },
        },
      },
    },
  };
});

const { default: AppointmentsTab } = await import("@/components/AppointmentsTab");

/** Regular spaces, as read on screen (Intl puts a no-break space before €). */
const shown = (toasts: Array<[string, string]>) => toasts.map(([kind, message]) => [kind, message.replace(/\s/g, " ")]);

beforeEach(() => {
  view.toasts = [];
  view.invalidated = [];
  renderStateful(AppointmentsTab);
});
afterEach(() => resetStatefulHooks());

describe("toasts d’un remboursement depuis le tableau de bord", () => {
  it("écrit le montant comme les emails : « 100,00 € »", async () => {
    await view.mutations.refund.onSuccess!({ refundAmount: "100.00", patientNotified: true, patientEmail: "sent" } as never);
    await view.mutations.refund.onSuccess!({ refundAmount: "1250.5", patientNotified: true, patientEmail: "sent" } as never);
    expect(shown(view.toasts)).toEqual([
      ["success", "Remboursement confirmé : 100,00 €"],
      ["success", "Remboursement confirmé : 1 250,50 €"],
    ]);
    expect(view.invalidated).toEqual(expect.arrayContaining(["appointments.list", "stats", "attention"]));
  });

  it("dit si l’email au patient attend un nouvel essai automatique ou a été refusé", async () => {
    await view.mutations.refund.onSuccess!({ refundAmount: "100.00", patientNotified: false, patientEmail: "retrying" } as never);
    expect(shown(view.toasts)[0]).toEqual(["success", "Remboursement confirmé : 100,00 €"]);
    expect(view.toasts[1]![0]).toBe("warning");
    expect(view.toasts[1]![1]).toContain("n’est pas encore parti : un nouvel essai automatique est prévu");

    view.toasts = [];
    await view.mutations.refund.onSuccess!({ refundAmount: "100.00", patientNotified: false, patientEmail: "refused" } as never);
    expect(view.toasts[1]![0]).toBe("warning");
    expect(view.toasts[1]![1]).toContain("a été refusé par le service d’envoi");
  });

  it("garde l’avertissement d’un paiement non rattaché remboursé dont l’email n’est pas parti", async () => {
    await view.mutations.refundUnconfirmedSession.onSuccess!({ refundAmount: "100.00", patientNotified: false, trackingId: "APTADMIN0001" } as never);
    expect(shown(view.toasts)).toEqual([
      ["success", "Remboursement confirmé : 100,00 €"],
      ["warning", "L’email au patient n’a pas pu être envoyé : prévenez-le directement."],
    ]);
  });
});
