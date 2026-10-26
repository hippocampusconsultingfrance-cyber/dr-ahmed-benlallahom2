import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MutationOptions = { onSuccess?: (result: never) => unknown; onError?: (error: Error) => unknown };

const state = vi.hoisted(() => ({
  attention: { data: undefined as unknown, isLoading: false, error: null as null | { message: string } },
  retryOptions: null as null | MutationOptions,
  invoiceOptions: null as null | MutationOptions,
  emailOptions: null as null | MutationOptions,
  retryMutate: vi.fn(),
  invoiceMutate: vi.fn(),
  emailMutate: vi.fn(),
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
        updateCustomerEmail: { useMutation: (options: MutationOptions) => { state.emailOptions = options; return { mutate: state.emailMutate, isPending: false }; } },
      },
    },
  },
}));

const { default: AppointmentDeliveries, canCorrectPatientEmail, canRetryDeliveries, deliveryLabel, refundEmailWarning, retryOutcome } = await import("./AppointmentDeliveries");
const { default: AdminAttentionPanel, refusedDetail, retryingDetail, waitingDetail } = await import("./AdminAttentionPanel");

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
  state.emailMutate.mockClear();
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
      paymentStatus: "completed",
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
    expect(canRetryDeliveries([delivery("confirmation", "sent"), delivery("invoice", "sending"), delivery("owner", "not_sent")], "completed")).toBe(false);
    expect(canRetryDeliveries([delivery("confirmation", "retrying")], "completed")).toBe(true);
    expect(canRetryDeliveries([delivery("invoice", "pending", 0)], "completed")).toBe(true);
    expect(canRetryDeliveries([delivery("invoice", "interrupted")], "completed")).toBe(true);
    const html = renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000002", paymentStatus: "completed", invoiceNumber: null, deliveries: [delivery("confirmation", "sent"), delivery("owner", "sending")] }));
    expect(html).toContain("Notification médecin : en cours d’envoi");
    expect(html).not.toContain("Renvoyer");
    expect(html).not.toContain("Télécharger la facture");
    expect(renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000003", paymentStatus: "completed", invoiceNumber: null, deliveries: [] }))).toBe("");
  });

  it("ne propose pas « Renvoyer » sur un rendez-vous qui n’est plus payé, mais garde l’état des envois et la facture", () => {
    expect(canRetryDeliveries([delivery("confirmation", "failed", 3, 3)], "refunded")).toBe(false);
    const html = renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000006", paymentStatus: "refunded", invoiceNumber: "FAC-2026-000011", deliveries: [delivery("confirmation", "failed", 3, 3), delivery("invoice", "sent")] }));
    expect(html).toContain("Confirmation : en échec (3/3)");
    expect(html).not.toContain("Renvoyer");
    expect(html).toContain("Télécharger la facture");
  });

  it("montre et laisse renvoyer l’email et l’alerte d’un remboursement fait dans Stripe (RES-06)", () => {
    const refundNotices = [delivery("confirmation", "sent"), delivery("invoice", "failed", 7, 7), delivery("refund", "retrying", 1, 7), delivery("refund_owner", "sent")];
    const html = renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000007", paymentStatus: "refunded", invoiceNumber: null, deliveries: refundNotices }));
    expect(html).toContain("Email de remboursement : en échec, nouvel essai prévu (1/7)");
    expect(html.indexOf("Alerte remboursement : envoyée")).toBeGreaterThan(html.indexOf("Email de remboursement"));
    expect(html).toContain("Renvoyer");
    // Refunded: only the refund notices are sent again, never the post-payment emails.
    expect(canRetryDeliveries([delivery("invoice", "failed", 7, 7), delivery("refund", "sent")], "refunded")).toBe(false);
    expect(canRetryDeliveries([delivery("refund", "failed", 7, 7)], "completed")).toBe(false);
    expect(canRetryDeliveries([delivery("refund_owner", "interrupted")], "refunded")).toBe(true);
    expect(canRetryDeliveries([delivery("confirmation", "failed")], "pending")).toBe(false);
  });

  it("ne propose plus de renvoyer un email au patient dont les données sont effacées, seulement les alertes du médecin (RGPD-12)", () => {
    expect(canRetryDeliveries([delivery("invoice", "failed", 7, 7), delivery("confirmation", "retrying")], "completed", true)).toBe(false);
    expect(canRetryDeliveries([delivery("owner", "failed", 7, 7)], "completed", true)).toBe(true);
    expect(canRetryDeliveries([delivery("refund", "failed", 7, 7)], "refunded", true)).toBe(false);
    expect(canRetryDeliveries([delivery("refund", "not_sent"), delivery("refund_owner", "retrying")], "refunded", true)).toBe(true);
    const html = renderToStaticMarkup(createElement(AppointmentDeliveries, {
      trackingId: "APTUI0000008",
      paymentStatus: "completed",
      invoiceNumber: "FAC-2026-000012",
      patientDataErased: true,
      deliveries: [delivery("confirmation", "failed", 7, 7), { ...delivery("invoice", "not_sent"), notSentReason: "patient_data_erased" }],
    }));
    expect(html).toContain("Confirmation : en échec (7/7)");
    expect(html).toContain("Facture : non envoyée");
    expect(html).not.toContain("Renvoyer");
    expect(html).toContain("Télécharger la facture");
  });

  it("« Renvoyer » relance le rendez-vous après confirmation et dit si l’envoi est reparti", async () => {
    const tree = AppointmentDeliveries({ trackingId: "APTUI0000004", paymentStatus: "completed", invoiceNumber: null, deliveries: [delivery("confirmation", "failed", 6)] });
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

  it("dit « refusée » sans promettre de nouvel essai pour un envoi refusé par le service d’envoi, et laisse « Renvoyer » après correction", async () => {
    const html = renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000008", paymentStatus: "completed", invoiceNumber: null, deliveries: [delivery("owner", "sent"), delivery("confirmation", "refused", 1, 7)] }));
    expect(html).toContain("Confirmation : refusée par le service d’envoi, sans nouvel essai automatique");
    expect(html).not.toContain("nouvel essai prévu");
    expect(html).not.toContain("(1/7)");
    expect(html).toContain("Renvoyer");
    expect(canRetryDeliveries([delivery("refund", "refused", 1, 7)], "refunded")).toBe(true);

    const tree = AppointmentDeliveries({ trackingId: "APTUI0000008", paymentStatus: "completed", invoiceNumber: null, deliveries: [delivery("confirmation", "refused", 1, 7)] });
    button(tree, "Renvoyer")();
    expect(state.retryMutate).toHaveBeenCalledWith({ trackingId: "APTUI0000008" });
    // Refused again (address not corrected): no new automatic attempt is announced.
    await state.retryOptions!.onSuccess!({ requeued: 1, requeuedJobTypes: ["confirmation"], deliveries: [delivery("confirmation", "refused", 1, 7)] } as never);
    const [tone, message] = state.toasts.at(-1)!;
    expect(tone).toBe("warning");
    expect(message).toContain("Le service d’envoi refuse de nouveau l’email");
    expect(message).toContain("aucun nouvel essai automatique n’aura lieu");
  });

  it("accorde l’état au libellé : « Email de remboursement » au masculin, les autres au féminin", () => {
    expect(deliveryLabel(delivery("refund", "sent"))).toBe("Email de remboursement : envoyé");
    expect(deliveryLabel(delivery("refund", "refused", 1, 7))).toBe("Email de remboursement : refusé par le service d’envoi, sans nouvel essai automatique");
    expect(deliveryLabel(delivery("refund", "not_sent"))).toBe("Email de remboursement : non envoyé");
    expect(deliveryLabel(delivery("refund", "retrying", 1, 7))).toBe("Email de remboursement : en échec, nouvel essai prévu (1/7)");
    for (const [jobType, label] of [["confirmation", "Confirmation"], ["invoice", "Facture"], ["owner", "Notification médecin"], ["refund_owner", "Alerte remboursement"]] as const) {
      expect(deliveryLabel(delivery(jobType, "sent"))).toBe(`${label} : envoyée`);
      expect(deliveryLabel(delivery(jobType, "refused"))).toBe(`${label} : refusée par le service d’envoi, sans nouvel essai automatique`);
    }
    const html = renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000010", paymentStatus: "refunded", invoiceNumber: null, deliveries: [delivery("refund", "sent"), delivery("refund_owner", "sent")] }));
    expect(html).toContain("Email de remboursement : envoyé<");
    expect(html).toContain("Alerte remboursement : envoyée<");

    // The toast after « Renvoyer » agrees too.
    expect(retryOutcome({ requeuedJobTypes: ["refund", "refund_owner"], deliveries: [delivery("refund", "sent"), { ...delivery("refund_owner", "not_sent"), notSentReason: "not_paid" }] }).message)
      .toBe("Envoyés : Email de remboursement. Alerte remboursement non envoyée : le rendez-vous n’est plus payé.");
    expect(retryOutcome({ requeuedJobTypes: ["refund", "refund_owner"], deliveries: [{ ...delivery("refund", "not_sent"), notSentReason: "not_paid" }, delivery("refund_owner", "sent")] }).message)
      .toBe("Envoyées : Alerte remboursement. Email de remboursement non envoyé : le rendez-vous n’est plus payé.");
  });

  it("propose de corriger l’adresse du patient après un refus, puis « Renvoyer » l’utilise (EXPL-02)", async () => {
    const refused = [delivery("owner", "sent"), delivery("confirmation", "refused", 1, 7), delivery("invoice", "refused", 1, 7)];
    // Only once an email to the patient that « Renvoyer » sends again was refused, and never for a booking whose data was erased.
    expect(canCorrectPatientEmail(refused, "completed", "patient@exemple.fr")).toBe(true);
    expect(canCorrectPatientEmail([delivery("refund", "refused", 1, 7)], "refunded", "patient@exemple.fr")).toBe(true);
    expect(canCorrectPatientEmail([delivery("confirmation", "failed", 7, 7), delivery("owner", "refused")], "completed", "patient@exemple.fr")).toBe(false);
    expect(canCorrectPatientEmail(refused, "refunded", "patient@exemple.fr")).toBe(false);
    expect(canCorrectPatientEmail(refused, "completed", "")).toBe(false);
    expect(renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000011", paymentStatus: "completed", invoiceNumber: null, deliveries: [delivery("confirmation", "sent")], customerEmail: "patient@exemple.fr" })))
      .not.toContain("Corriger l’email du patient");
    expect(renderToStaticMarkup(createElement(AppointmentDeliveries, { trackingId: "APTUI0000011", paymentStatus: "completed", invoiceNumber: null, deliveries: refused, customerEmail: "patient@exemple.fr" })))
      .toContain("Corriger l’email du patient");

    const prompt = vi.fn(() => "  patient.corrige@exemple.fr ");
    vi.stubGlobal("window", { confirm: vi.fn(() => true), prompt });
    const tree = AppointmentDeliveries({ trackingId: "APTUI0000011", paymentStatus: "completed", invoiceNumber: null, deliveries: refused, customerEmail: "patient@exemple.fr" });
    button(tree, "Corriger l’email du patient")();
    expect(prompt).toHaveBeenCalledWith(expect.stringContaining("APTUI0000011"), "patient@exemple.fr");
    expect(state.emailMutate).toHaveBeenCalledWith({ trackingId: "APTUI0000011", customerEmail: "patient.corrige@exemple.fr" });

    await state.emailOptions!.onSuccess!({ success: true, unchanged: false } as never);
    expect(state.toasts.at(-1)).toEqual(["success", "Adresse du patient corrigée. « Renvoyer » envoie maintenant à cette adresse : Confirmation, Facture."]);
    expect(state.invalidated).toEqual(["appointments.list"]);
    await state.emailOptions!.onError!(new Error("Adresse email invalide : saisissez une adresse complète, par exemple prenom.nom@exemple.fr."));
    expect(state.toasts.at(-1)).toEqual(["error", "Adresse email invalide : saisissez une adresse complète, par exemple prenom.nom@exemple.fr."]);

    // Cancelled, or the same address: nothing is sent to the server.
    state.emailMutate.mockClear();
    prompt.mockReturnValueOnce(null as never).mockReturnValueOnce("patient@exemple.fr");
    button(tree, "Corriger l’email du patient")();
    button(tree, "Corriger l’email du patient")();
    expect(state.emailMutate).not.toHaveBeenCalled();
  });

  it("dit, avant et après la correction, que la facture déjà émise garde ses mentions (EXPL-02)", async () => {
    const prompt = vi.fn(() => "patient.corrige@exemple.fr");
    vi.stubGlobal("window", { confirm: vi.fn(() => true), prompt });
    const tree = AppointmentDeliveries({ trackingId: "APTUI0000012", paymentStatus: "completed", invoiceNumber: "FAC-2026-000012", deliveries: [delivery("confirmation", "sent"), delivery("invoice", "refused", 1, 7)], customerEmail: "patient@exemple.fr" });

    button(tree, "Corriger l’email du patient")();
    expect(prompt).toHaveBeenCalledWith(expect.stringContaining("la facture FAC-2026-000012 déjà émise garde ses mentions, dont l’adresse d’origine"), "patient@exemple.fr");
    await state.emailOptions!.onSuccess!({ success: true, unchanged: false } as never);

    expect(state.toasts.at(-1)).toEqual(["success", "Adresse du patient corrigée. « Renvoyer » envoie maintenant à cette adresse : Facture. La facture FAC-2026-000012 déjà émise garde ses mentions, dont l’adresse d’origine : elle est renvoyée et téléchargée telle qu’émise."]);
  });

  it("ne dit pas renvoyée une facture déjà reçue quand seul un autre email au patient a été refusé (EXPL-02)", async () => {
    vi.stubGlobal("window", { confirm: vi.fn(() => true), prompt: vi.fn(() => "patient.corrige@exemple.fr") });
    // Refunded: the invoice went out at the payment, only the refund email was refused.
    const refunded = AppointmentDeliveries({ trackingId: "APTUI0000020", paymentStatus: "refunded", invoiceNumber: "FAC-2026-000020", deliveries: [delivery("confirmation", "sent"), delivery("invoice", "sent"), delivery("owner", "sent"), delivery("refund", "refused", 1, 7)], customerEmail: "patient@exemple.fr" });
    button(refunded, "Corriger l’email du patient")();
    await state.emailOptions!.onSuccess!({ success: true, unchanged: false } as never);
    expect(state.toasts.at(-1)).toEqual(["success", "Adresse du patient corrigée. « Renvoyer » envoie maintenant à cette adresse : Email de remboursement. La facture FAC-2026-000020 déjà émise garde ses mentions, dont l’adresse d’origine : elle n’est pas renvoyée, et se télécharge telle qu’émise."]);

    // Paid: the confirmation was refused, the invoice had already gone out.
    const paid = AppointmentDeliveries({ trackingId: "APTUI0000021", paymentStatus: "completed", invoiceNumber: "FAC-2026-000021", deliveries: [delivery("owner", "sent"), delivery("confirmation", "refused", 1, 7), delivery("invoice", "sent")], customerEmail: "patient@exemple.fr" });
    button(paid, "Corriger l’email du patient")();
    await state.emailOptions!.onSuccess!({ success: true, unchanged: false } as never);
    expect(state.toasts.at(-1)).toEqual(["success", "Adresse du patient corrigée. « Renvoyer » envoie maintenant à cette adresse : Confirmation. La facture FAC-2026-000021 déjà émise garde ses mentions, dont l’adresse d’origine : elle n’est pas renvoyée, et se télécharge telle qu’émise."]);
  });

  it("explique au médecin pourquoi l’email de remboursement n’est pas parti", () => {
    expect(refundEmailWarning("refused")).toContain("a été refusé par le service d’envoi");
    expect(refundEmailWarning("refused")).toContain("Sur le rendez-vous, « Corriger l’email du patient », puis « Renvoyer » l’envoie à la nouvelle adresse.");
    for (const pending of ["retrying", "pending", "sending", "interrupted"] as const) {
      expect(refundEmailWarning(pending)).toContain("n’est pas encore parti : un nouvel essai automatique est prévu");
    }
    // Refund of a Checkout session never attached (sent once, outside the queue), or not queued.
    expect(refundEmailWarning(undefined)).toBe("L’email au patient n’a pas pu être envoyé : prévenez-le directement.");
    expect(refundEmailWarning(null)).toBe("L’email au patient n’a pas pu être envoyé : prévenez-le directement.");
  });

  it("« Télécharger la facture » enregistre le PDF régénéré par le serveur", async () => {
    const tree = AppointmentDeliveries({ trackingId: "APTUI0000005", paymentStatus: "completed", invoiceNumber: "FAC-2026-000009", deliveries: [delivery("invoice", "sent")] });
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
    expect(html).toContain("Envois au patient ou au médecin en échec (3)");
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
    expect(retryingDetail({ jobTypes: ["refund", "refund_owner"], nextAttemptAt: null })).toBe("Email de remboursement, Alerte remboursement · envoi interrompu, nouvel essai à la prochaine exécution planifiée");
  });

  it("liste à part les envois refusés par le service d’envoi, comme l’alerte au médecin", () => {
    state.attention = {
      isLoading: false,
      error: null,
      data: {
        failedDeliveries: { total: 0, items: [] },
        refusedDeliveries: { total: 1, items: [{ trackingId: "APTTODOUI005", customerName: "Emma Petit", appointmentDate: "2026-10-30T09:00:00.000Z", jobTypes: ["confirmation", "invoice"] }] },
        retryingDeliveries: { total: 0, items: [] },
        unconfirmedPayments: { total: 0, items: [] },
      },
    };
    const html = renderToStaticMarkup(createElement(AdminAttentionPanel, { onOpenAppointments: vi.fn() }));
    expect(html).not.toContain("Rien à traiter");
    expect(html).toContain("Envois refusés par le service d’envoi (1)");
    expect(html).toContain("Ce refus n’est pas passager : aucun nouvel essai automatique n’a lieu.");
    expect(html).toContain("sur le rendez-vous, « Corriger l’email du patient », puis « Renvoyer » l’envoie à la nouvelle adresse.");
    expect(html).toContain("APTTODOUI005");
    expect(html).toContain("Confirmation, Facture");
    expect(html).not.toContain("nouvel essai automatique au plus tôt");
  });

  it("ne demande de corriger l’email du patient que pour un envoi au patient : la notification médecin va à l’adresse du site (EXPL-02)", () => {
    state.attention = {
      isLoading: false,
      error: null,
      data: {
        failedDeliveries: { total: 0, items: [] },
        refusedDeliveries: { total: 1, items: [{ trackingId: "APTTODOUI007", customerName: "Gaston Leroy", appointmentDate: "2026-10-30T09:00:00.000Z", jobTypes: ["owner"] }] },
        retryingDeliveries: { total: 0, items: [] },
        unconfirmedPayments: { total: 0, items: [] },
      },
    };
    const html = renderToStaticMarkup(createElement(AdminAttentionPanel, { onOpenAppointments: vi.fn() }));
    expect(html).toContain("Notification médecin : c’est votre adresse de notification qui est refusée ; corrigez la variable OWNER_NOTIFICATION_EMAIL dans Vercel et redéployez le site, puis « Renvoyer » sur le rendez-vous.");
    expect(html).not.toContain("Corriger l’email du patient");

    expect(refusedDetail({ jobTypes: ["owner", "confirmation", "invoice"] })).toBe("Confirmation, Facture : vérifiez l’adresse du patient et prévenez-le directement ; sur le rendez-vous, « Corriger l’email du patient », puis « Renvoyer » l’envoie à la nouvelle adresse. Notification médecin : c’est votre adresse de notification qui est refusée ; corrigez la variable OWNER_NOTIFICATION_EMAIL dans Vercel et redéployez le site, puis « Renvoyer » sur le rendez-vous.");
    expect(refusedDetail({ jobTypes: ["refund"] })).toBe("Email de remboursement : vérifiez l’adresse du patient et prévenez-le directement ; sur le rendez-vous, « Corriger l’email du patient », puis « Renvoyer » l’envoie à la nouvelle adresse.");
  });

  it("liste les envois pas encore partis quelques minutes après le paiement, sans les dire en échec (ABUS-03)", () => {
    state.attention = {
      isLoading: false,
      error: null,
      data: {
        failedDeliveries: { total: 0, items: [] },
        refusedDeliveries: { total: 0, items: [] },
        retryingDeliveries: { total: 0, items: [] },
        waitingDeliveries: { total: 1, items: [{ trackingId: "APTTODOUI006", customerName: "Farid Benali", appointmentDate: "2026-10-30T09:00:00.000Z", jobTypes: ["confirmation", "invoice"], dueSince: "2026-10-26T10:02:00.000Z" }] },
        unconfirmedPayments: { total: 0, items: [] },
      },
    };
    const html = renderToStaticMarkup(createElement(AdminAttentionPanel, { onOpenAppointments: vi.fn() }));
    expect(html).not.toContain("Rien à traiter");
    expect(html).toContain("Envois pas encore partis (1)");
    expect(html).toContain("aucune tentative n’a encore échoué");
    // Not always the email service: the budget of the processing may have run out first.
    expect(html).toContain("n’a pas pu les envoyer dans le temps qui lui est donné (temps écoulé, service d’envoi lent ou saturé, traitement interrompu)");
    expect(html).toContain("« Renvoyer » sur le rendez-vous les envoie tout de suite.");
    expect(html).toContain("APTTODOUI006");
    expect(waitingDetail({ jobTypes: ["confirmation", "invoice"], dueSince: "2026-10-26T10:02:00.000Z" })).toBe("Confirmation, Facture · en attente depuis le 26/10/2026 11:02:00, essai à la prochaine exécution planifiée");
    expect(html).toContain("Confirmation, Facture · en attente depuis le 26/10/2026 11:02:00");
  });

  it("dit qu’il n’y a rien à traiter, ou que l’encart n’a pas pu être chargé", () => {
    state.attention = { isLoading: false, error: null, data: { failedDeliveries: { total: 0, items: [] }, refusedDeliveries: { total: 0, items: [] }, retryingDeliveries: { total: 0, items: [] }, waitingDeliveries: { total: 0, items: [] }, unconfirmedPayments: { total: 0, items: [] } } };
    expect(renderToStaticMarkup(createElement(AdminAttentionPanel, { onOpenAppointments: vi.fn() }))).toContain("Rien à traiter : aucun envoi après paiement en échec ou en attente, aucun paiement à régulariser.");
    state.attention = { isLoading: false, error: { message: "Base de données indisponible." }, data: undefined };
    expect(renderToStaticMarkup(createElement(AdminAttentionPanel, { onOpenAppointments: vi.fn() }))).toContain("n’ont pas pu être chargés : Base de données indisponible.");
  });
});
