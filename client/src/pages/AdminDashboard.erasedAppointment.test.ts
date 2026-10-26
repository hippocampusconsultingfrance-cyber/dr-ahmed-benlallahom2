import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// RGPD-12 — un rendez-vous réduit au minimum comptable (effacement ou
// conservation de 3 ans écoulée) n’a plus d’adresse : l’onglet Réservations le
// signale, ne propose plus « Remettre en confirmé » et, pour un remboursement,
// dit que le patient n’est plus joignable au lieu de « prévenez-le ».

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type MutationOptions = { onSuccess?: (result: never) => unknown; onError?: (error: Error) => unknown };

const view = vi.hoisted(() => ({
  page: { items: [] as Array<Record<string, unknown>>, total: 0 },
  mutate: {} as Record<string, ReturnType<typeof vi.fn>>,
  options: {} as Record<string, MutationOptions>,
  toasts: [] as Array<[string, string]>,
}));

vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "error", "info", "warning"].map(kind => [kind, (message: string) => view.toasts.push([kind, message])])),
}));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => ({
    useMutation: (options: MutationOptions = {}) => {
      view.options[name] = options;
      view.mutate[name] ??= vi.fn();
      return { mutate: view.mutate[name], isPending: false };
    },
  });
  const invalidate = { invalidate: vi.fn() };
  return {
    trpc: {
      useUtils: () => ({ admin: { appointments: { list: invalidate }, stats: invalidate, attention: invalidate } }),
      useQueries: (build: (t: unknown) => unknown[]) => build({ admin: { appointments: { list: () => "appointments" } } }).map(() => ({ data: view.page, isLoading: false, error: null })),
      admin: { appointments: { updateStatus: mutation("updateStatus"), refund: mutation("refund"), refundUnconfirmedSession: mutation("refundUnconfirmedSession") } },
    },
  };
});

const { AppointmentsTab } = await import("./AdminDashboard");
const { default: AppointmentDeliveries } = await import("@/components/AppointmentDeliveries");
const { PATIENT_DATA_ERASED_REASON_PROMPT, PATIENT_DATA_ERASED_REFUND_NOTICE } = await import("./appointmentAdminActions");

const DAY = 24 * 60 * 60 * 1000;
const booking = (id: number, extra: Record<string, unknown> = {}) => ({
  id, trackingId: `APTERASE${id}`, customerName: "Jeanne Martin", customerEmail: "jeanne@test.local", customerPhone: "+33600000000",
  appointmentDate: new Date(Date.now() - 400 * DAY), finalPrice: "100.00", paymentStatus: "completed", appointmentStatus: "completed",
  stripePaymentIntentId: `pi_${id}`, language: "fr", requestDetails: "", deliveries: [], invoiceNumber: `FAC-2025-00000${id}`, ...extra,
});
const ERASED = { customerName: "Anonymisé", customerEmail: "", customerPhone: "" };

const textOf = (node: ReactNode): string => Array.isArray(node) ? node.map(textOf).join("")
  : typeof node === "string" || typeof node === "number" ? String(node)
  : isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : "";

/** The elements of one booking's card, found by its key. */
function card(tree: ReactElement, id: number) {
  const found = elementsOf(tree).find(element => (element as unknown as { key: string | null }).key === String(id));
  if (!found) throw new Error(`no card ${id}`);
  return elementsOf(found.props.children);
}
const withText = (elements: ReturnType<typeof card>, text: string) => elements.filter(element => textOf(element.props.children as ReactNode) === text);
const clickable = (elements: ReturnType<typeof card>, label: string) => elements.find(element => typeof element.props.onClick === "function" && textOf(element.props.children as ReactNode).includes(label));

beforeEach(() => {
  view.page = { items: [booking(1, ERASED), booking(2)], total: 2 };
  view.mutate = {};
  view.options = {};
  view.toasts = [];
  vi.stubGlobal("window", { prompt: vi.fn(() => "Geste commercial"), confirm: vi.fn(() => true) });
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("RGPD-12 — rendez-vous dont les données sont effacées", () => {
  it("porte le badge « Données effacées » et n’offre plus « Remettre en confirmé »", () => {
    const tree = renderStateful(AppointmentsTab) as ReactElement;
    const erased = card(tree, 1);
    expect(withText(erased, "Données effacées")).toHaveLength(1);
    expect(clickable(erased, "Remettre en confirmé")).toBeUndefined();

    const kept = card(tree, 2);
    expect(withText(kept, "Données effacées")).toHaveLength(0);
    expect(clickable(kept, "Remettre en confirmé")).toBeDefined();

    // Its emails to the patient are no longer offered to « Renvoyer ».
    const deliveriesOf = (elements: ReturnType<typeof card>) => elements.find(element => element.type === AppointmentDeliveries)!.props.patientDataErased;
    expect([deliveriesOf(erased), deliveriesOf(kept)]).toEqual([true, false]);
  });

  it("garde le remboursement, en disant avant et après que le patient ne sera pas prévenu", () => {
    const tree = renderStateful(AppointmentsTab) as ReactElement;
    (clickable(card(tree, 1), "Rembourser")!.props.onClick as () => void)();
    expect(window.prompt).toHaveBeenLastCalledWith(expect.stringContaining(PATIENT_DATA_ERASED_REFUND_NOTICE));
    // The reason is stored on the anonymised row: asked without personal data.
    expect(window.prompt).toHaveBeenLastCalledWith(expect.stringMatching(/Motif \(obligatoire, sans donnée personnelle[^)]*\) :$/));
    expect(view.mutate.refund).toHaveBeenLastCalledWith({ trackingId: "APTERASE1", reason: "Geste commercial", initiator: "practitioner" });

    view.options.refund!.onSuccess!({ success: true, refundAmount: "100.00", patientNotified: false, patientDataErased: true } as never);
    expect(view.toasts).toEqual([["success", "Remboursement confirmé : 100.00 €"], ["warning", PATIENT_DATA_ERASED_REFUND_NOTICE]]);
    expect(view.toasts.map(([, message]) => message).join(" ")).not.toContain("prévenez-le");
  });

  it("ne change rien pour un rendez-vous qui a encore son adresse", () => {
    const tree = renderStateful(AppointmentsTab) as ReactElement;
    (clickable(card(tree, 2), "Rembourser")!.props.onClick as () => void)();
    expect(window.prompt).toHaveBeenLastCalledWith(expect.not.stringContaining(PATIENT_DATA_ERASED_REFUND_NOTICE));
    expect(window.prompt).toHaveBeenLastCalledWith(expect.not.stringContaining(PATIENT_DATA_ERASED_REASON_PROMPT));
    expect(window.prompt).toHaveBeenLastCalledWith(expect.stringMatching(/\nMotif \(obligatoire\) :$/));

    view.options.refund!.onSuccess!({ success: true, refundAmount: "100.00", patientNotified: false, patientDataErased: false } as never);
    expect(view.toasts.at(-1)).toEqual(["warning", "L’email au patient n’a pas pu être envoyé : prévenez-le directement."]);
  });
});
