import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MutationOptions = { onSuccess?: (result: never) => unknown; onError?: (error: Error) => unknown };

const state = vi.hoisted(() => ({
  attention: { data: undefined as unknown, isLoading: false, error: null as null | { message: string } },
  retryOptions: null as null | MutationOptions,
  invoiceOptions: null as null | MutationOptions,
  retryMutate: vi.fn(),
  invoiceMutate: vi.fn(),
  invalidated: [] as string[],
  toasts: [] as Array<[string, string]>,
  downloads: [] as unknown[],
}));

vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "error", "info", "warning"].map(kind => [kind, (message: string) => state.toasts.push([kind, message])])),
}));
vi.mock("./invoicePdfDownload", () => ({ downloadInvoicePdf: (file: unknown) => state.downloads.push(file) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      admin: {
        appointments: { list: { invalidate: () => state.invalidated.push("appointments.list") } },
        attention: { invalidate: () => state.invalidated.push("attention") },
      },
    }),
    admin: {
      attention: { useQuery: () => state.attention },
      appointments: {
        retryFulfillment: { useMutation: (options: MutationOptions) => { state.retryOptions = options; return { mutate: state.retryMutate, isPending: false }; } },
        invoicePdf: { useMutation: (options: MutationOptions) => { state.invoiceOptions = options; return { mutate: state.invoiceMutate, isPending: false }; } },
      },
    },
  },
}));

const { default: AppointmentDeliveries, canRetryDeliveries, deliveryLabel } = await import("./AppointmentDeliveries");
const { default: AdminAttentionPanel, retryingDetail } = await import("./AdminAttentionPanel");

type Delivery = Parameters<typeof deliveryLabel>[0];
const delivery = (jobType: Delivery["jobType"], deliveryState: Delivery["state"], attempts = 1, maxAttempts = 6): Delivery => ({ jobType, state: deliveryState, attempts, maxAttempts });

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

/** The button whose text contains `label`, from the tree the component returns (its hooks are the mocks above). */
function button(tree: ReactNode, label: string) {
  const found = elements(tree).find(element => typeof element.props.onClick === "function" && renderToStaticMarkup(element).includes(label));
  if (!found) throw new Error(`no « ${label} » button`);
  return found.props.onClick as () => void;
}

beforeEach(() => {
  state.retryMutate.mockClear();
  state.invoiceMutate.mockClear();
  state.invalidated = [];
  state.toasts = [];
  state.downloads = [];
  vi.stubGlobal("window", { confirm: vi.fn(() => true) });
});
afterEach(() => vi.unstubAllGlobals());

describe("EXPL-02 — envois après paiement sur la fiche du rendez-vous", () => {
  it("affiche confirmation, facture et notification médecin : envoyée, en échec ou en attente", () => {
    const html = renderToStaticMarkup(createElement(AppointmentDeliveries, {
      trackingId: "APTUI0000001",
      paid: true,
      invoiceNumber: "FAC-2026-000007",
      deliveries: [delivery("owner", "pending", 0), delivery("confirmation", "sent"), delivery("invoice", "failed", 6)],
    }));
    const position = (text: string) => html.indexOf(text);
    expect(position("Confirmation : envoyée")).toBeGreaterThan(-1);
    expect(position("Facture : en échec (6/6)")).toBeGreaterThan(position("Confirmation : envoyée"));
    expect(position("Notification médecin : en attente")).toBeGreaterThan(position("Facture : en échec"));
    expect(html).toContain("FAC-2026-000007");
    expect(html).toContain("Renvoyer");
    expect(html).toContain("Télécharger la facture");
    expect(deliveryLabel(delivery("confirmation", "retrying", 2))).toBe("Confirmation : en échec, nouvel essai prévu (2/6)");
    expect(deliveryLabel(delivery("confirmation", "not_sent"))).toBe("Confirmation : non envoyée");
    expect(deliveryLabel(delivery("confirmation", "interrupted"))).toBe("Confirmation : envoi interrompu");
  });

  it("ne propose « Renvoyer » que s’il reste un envoi non abouti, et la facture que si elle a été émise", () => {
    expect(canRetryDeliveries([delivery("confirmation", "sent"), delivery("invoice", "sending"), delivery("owner", "not_sent")], true)).toBe(false);
    expect(canRetryDeliveries([delivery("confirmation", "retrying")], true)).toBe(true);
    expect(canRetryDeliveries([delivery("invoice", "pending", 0)], true)).toBe(true);
    expect(canRetryDeliveries([delivery("invoice", "interrupted")], true)).toBe(true);
    const html = renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000002", paid: true, invoiceNumber: null, deliveries: [delivery("confirmation", "sent"), delivery("owner", "sending")] }));
    expect(html).toContain("Notification médecin : en cours d’envoi");
    expect(html).not.toContain("Renvoyer");
    expect(html).not.toContain("Télécharger la facture");
    expect(renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000003", paid: true, invoiceNumber: null, deliveries: [] }))).toBe("");
  });

  it("ne propose pas « Renvoyer » sur un rendez-vous qui n’est plus payé, mais garde l’état des envois et la facture", () => {
    expect(canRetryDeliveries([delivery("confirmation", "failed", 3, 3)], false)).toBe(false);
    const html = renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000006", paid: false, invoiceNumber: "FAC-2026-000011", deliveries: [delivery("confirmation", "failed", 3, 3), delivery("invoice", "sent")] }));
    expect(html).toContain("Confirmation : en échec (3/3)");
    expect(html).not.toContain("Renvoyer");
    expect(html).toContain("Télécharger la facture");
  });

  it("« Renvoyer » relance le rendez-vous après confirmation et dit si l’envoi est reparti", async () => {
    const tree = AppointmentDeliveries({ trackingId: "APTUI0000004", paid: true, invoiceNumber: null, deliveries: [delivery("confirmation", "failed", 6)] });
    button(tree, "Renvoyer")();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("APTUI0000004"));
    expect(state.retryMutate).toHaveBeenCalledWith({ trackingId: "APTUI0000004" });

    await state.retryOptions!.onSuccess!({ requeued: 1, requeuedJobTypes: ["confirmation"], deliveries: [delivery("confirmation", "sent")] } as never);
    expect(state.toasts.at(-1)).toEqual(["success", "Envois relancés et effectués."]);
    expect(state.invalidated).toEqual(["appointments.list", "attention"]);
    await state.retryOptions!.onSuccess!({ requeued: 1, requeuedJobTypes: ["confirmation"], deliveries: [delivery("confirmation", "retrying")] } as never);
    expect(state.toasts.at(-1)?.[0]).toBe("warning");
    // The deliveries of APTRETRY0006 (server test): the doctor notification had gone out before the
    // retry, which only sent the invoice; a confirmation deliberately skipped is not reported as sent.
    await state.retryOptions!.onSuccess!({
      requeued: 2,
      requeuedJobTypes: ["confirmation", "invoice"],
      deliveries: [delivery("owner", "sent"), { ...delivery("confirmation", "not_sent"), notSentReason: "appointment_past" }, delivery("invoice", "sent")],
    } as never);
    expect(state.toasts.at(-1)).toEqual(["info", "Envoyées : Facture. Confirmation non envoyée : la consultation est déjà passée."]);
    // Neither a confirmation skipped by an earlier run nor a notification its own worker is sending
    // is this retry's outcome: the invoice it sent is.
    await state.retryOptions!.onSuccess!({
      requeued: 1,
      requeuedJobTypes: ["invoice"],
      deliveries: [{ ...delivery("confirmation", "not_sent"), notSentReason: "appointment_past" }, delivery("invoice", "sent"), delivery("owner", "sending")],
    } as never);
    expect(state.toasts.at(-1)).toEqual(["success", "Envois relancés et effectués."]);
    await state.retryOptions!.onSuccess!({ requeued: 0, requeuedJobTypes: [], deliveries: [delivery("confirmation", "sent")] } as never);
    expect(state.toasts.at(-1)).toEqual(["info", "Aucun envoi à relancer pour ce rendez-vous."]);

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    state.retryMutate.mockClear();
    button(tree, "Renvoyer")();
    expect(state.retryMutate).not.toHaveBeenCalled();
  });

  it("« Télécharger la facture » enregistre le PDF régénéré par le serveur", async () => {
    const tree = AppointmentDeliveries({ trackingId: "APTUI0000005", paid: true, invoiceNumber: "FAC-2026-000009", deliveries: [delivery("invoice", "sent")] });
    button(tree, "Télécharger la facture")();
    expect(state.invoiceMutate).toHaveBeenCalledWith({ trackingId: "APTUI0000005" });
    const file = { invoiceNumber: "FAC-2026-000009", filename: "Facture-FAC-2026-000009.pdf", contentBase64: "JVBERi0=" };
    await state.invoiceOptions!.onSuccess!(file as never);
    expect(state.downloads).toEqual([file]);
    await state.invoiceOptions!.onError!(new Error("Aucune facture n’a encore été émise pour ce rendez-vous."));
    expect(state.toasts.at(-1)).toEqual(["error", "Aucune facture n’a encore été émise pour ce rendez-vous."]);
  });
});

describe("EXPL-02 — encart « À traiter » du tableau de bord", () => {
  it("liste les envois en échec et les paiements à régulariser lus en base", () => {
    state.attention = {
      isLoading: false,
      error: null,
      data: {
        failedDeliveries: { total: 3, items: [{ trackingId: "APTTODOUI001", customerName: "Alice Martin", appointmentDate: "2026-10-30T09:00:00.000Z", jobTypes: ["confirmation", "invoice"] }] },
        retryingDeliveries: { total: 0, items: [] },
        unconfirmedPayments: { total: 1, items: [{ trackingId: "APTTODOUI002", customerName: "Bruno Weber", appointmentDate: "2026-11-02T14:30:00.000Z" }] },
      },
    };
    const onOpenAppointments = vi.fn();
    const html = renderToStaticMarkup(createElement(AdminAttentionPanel, { onOpenAppointments }));
    expect(html).toContain("À traiter");
    expect(html).toContain("Envois après paiement en échec (3)");
    expect(html).toContain("APTTODOUI001");
    expect(html).toContain("Confirmation, Facture");
    expect(html).toContain("et 2 autre(s)");
    expect(html).toContain("Paiements à régulariser (1)");
    expect(html).toContain("Bruno Weber");
    // Only actions the Réservations tab offers: refund, or agree on a new appointment with the patient.
    expect(html).toContain("« Rembourser ce paiement »");
    expect(html).not.toContain("reprogramm");
    expect(html).not.toContain("nouvel essai prévu");
    button(AdminAttentionPanel({ onOpenAppointments }), "Ouvrir les réservations")();
    expect(onOpenAppointments).toHaveBeenCalled();
  });

  it("signale dès le premier échec un envoi qui attend son prochain essai automatique, ou interrompu", () => {
    state.attention = {
      isLoading: false,
      error: null,
      data: {
        failedDeliveries: { total: 0, items: [] },
        retryingDeliveries: {
          total: 2,
          items: [
            { trackingId: "APTTODOUI003", customerName: "Chloé Durand", appointmentDate: "2026-10-30T09:00:00.000Z", jobTypes: ["confirmation", "invoice"], nextAttemptAt: "2026-10-27T06:20:00.000Z" },
            { trackingId: "APTTODOUI004", customerName: "David Roux", appointmentDate: "2026-10-31T09:00:00.000Z", jobTypes: ["confirmation"], nextAttemptAt: null },
          ],
        },
        unconfirmedPayments: { total: 0, items: [] },
      },
    };
    const html = renderToStaticMarkup(createElement(AdminAttentionPanel, { onOpenAppointments: vi.fn() }));
    expect(html).not.toContain("Rien à traiter");
    expect(html).toContain("Envois en échec, nouvel essai prévu (2)");
    expect(html).toContain("« Renvoyer » sur le rendez-vous relance l’envoi tout de suite");
    expect(html).toContain("APTTODOUI003");
    expect(retryingDetail({ jobTypes: ["confirmation", "invoice"], nextAttemptAt: "2026-10-27T06:20:00.000Z" })).toBe("Confirmation, Facture · nouvel essai automatique au plus tôt le 27/10/2026 07:20:00");
    expect(retryingDetail({ jobTypes: ["confirmation"], nextAttemptAt: null })).toBe("Confirmation · envoi interrompu, nouvel essai à la prochaine exécution planifiée");
  });

  it("dit qu’il n’y a rien à traiter, ou que l’encart n’a pas pu être chargé", () => {
    state.attention = { isLoading: false, error: null, data: { failedDeliveries: { total: 0, items: [] }, retryingDeliveries: { total: 0, items: [] }, unconfirmedPayments: { total: 0, items: [] } } };
    expect(renderToStaticMarkup(createElement(AdminAttentionPanel, { onOpenAppointments: vi.fn() }))).toContain("Rien à traiter");
    state.attention = { isLoading: false, error: { message: "Base de données indisponible." }, data: undefined };
    expect(renderToStaticMarkup(createElement(AdminAttentionPanel, { onOpenAppointments: vi.fn() }))).toContain("n’ont pas pu être chargés : Base de données indisponible.");
  });
});
