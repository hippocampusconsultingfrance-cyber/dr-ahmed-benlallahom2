import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RGPD-12 — l’onglet RGPD : échéance d’un mois, statuts en français, note et
// refus motivé, « Supprimer » un message, et la recherche d’une personne par
// email avec export JSON et effacement. Les boutons sont relevés au rendu
// pour appeler leur action comme un clic.

type MutationOptions = { onSuccess?: (result: never) => unknown; onError?: (error: Error) => unknown };
type ButtonProps = { children?: ReactNode; onClick?: () => void; disabled?: boolean; type?: string };

const state = vi.hoisted(() => ({
  buttons: [] as ButtonProps[],
  gdprPage: { items: [] as Array<Record<string, unknown>>, total: 0 },
  contactPage: { items: [] as Array<Record<string, unknown>>, total: 0 },
  found: { data: undefined as unknown, isLoading: false, error: null as null | { message: string } },
  findInputs: [] as Array<{ email: string }>,
  mutate: {} as Record<string, ReturnType<typeof vi.fn>>,
  options: {} as Record<string, MutationOptions>,
  invalidated: [] as string[],
  toasts: [] as Array<[string, string]>,
  downloads: [] as unknown[],
}));

vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "error", "info", "warning"].map(kind => [kind, (message: string) => state.toasts.push([kind, message])])),
}));
vi.mock("@/components/jsonFileDownload", () => ({ downloadJsonFile: (file: unknown) => state.downloads.push(file) }));
vi.mock("@/components/ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: ButtonProps) => {
      state.buttons.push(props);
      return createElement("button", { type: props.type ?? "button", disabled: props.disabled }, props.children);
    },
  };
});
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => ({
    useMutation: (options: MutationOptions = {}) => {
      state.options[name] = options;
      state.mutate[name] ??= vi.fn();
      return { mutate: state.mutate[name], isPending: false };
    },
  });
  const invalidate = (name: string) => ({ invalidate: () => state.invalidated.push(name) });
  return {
    trpc: {
      useUtils: () => ({
        admin: { contacts: { list: invalidate("contacts") }, gdprRequests: { list: invalidate("gdprRequests") }, appointments: { list: invalidate("appointments") }, recruitment: { list: invalidate("recruitment") } },
        medicalQuestions: { admin: { list: invalidate("medicalQuestions") } },
      }),
      useQueries: (build: (t: unknown) => unknown[]) => {
        const t = { admin: { gdprRequests: { list: () => "gdpr" }, contacts: { list: () => "contacts" } } };
        return build(t).map(kind => ({ data: kind === "gdpr" ? state.gdprPage : state.contactPage, isLoading: false, error: null }));
      },
      admin: {
        contacts: { markRead: mutation("markRead"), delete: mutation("deleteContact") },
        gdprRequests: { updateStatus: mutation("updateStatus") },
        personalData: {
          find: { useQuery: (input: { email: string }) => { state.findInputs.push(input); return { ...state.found, refetch: vi.fn() }; } },
          export: mutation("export"),
          erase: mutation("erase"),
        },
        recruitment: { erase: mutation("eraseApplication") },
      },
    },
  };
});

const { ContactsTab, GdprTab } = await import("./AdminDashboard");
const { default: PersonalDataSearchPanel, PersonalDataResult } = await import("@/components/PersonalDataSearchPanel");
const { gdprRequestDeadline, isGdprRequestOverdue } = await import("@/components/gdprRequestAdmin");

const render = (element: ReactNode) => {
  state.buttons = [];
  return renderToStaticMarkup(createElement(Fragment, null, element));
};
/** The rendered button whose text contains `label`. */
const button = (label: string, index = 0) => {
  const found = state.buttons.filter(props => renderToStaticMarkup(createElement(Fragment, null, props.children)).includes(label));
  if (!found[index]) throw new Error(`no « ${label} » button`);
  return found[index]!;
};

const DAY = 24 * 60 * 60 * 1000;
const gdprRequest = (id: number, extra: Record<string, unknown> = {}) => ({
  id, trackingId: `GDPR-UI-${id}`, name: `Demandeur ${id}`, email: `demandeur${id}@test.local`, phone: null, requestType: "deletion",
  description: "Merci d’effacer mes données.", status: "pending", responseDate: null, notes: null, read: 0,
  createdAt: new Date(Date.now() - 3 * DAY), updatedAt: new Date(Date.now() - 3 * DAY), ...extra,
});

beforeEach(() => {
  state.gdprPage = { items: [], total: 0 };
  state.contactPage = { items: [], total: 0 };
  state.found = { data: undefined, isLoading: false, error: null };
  state.findInputs = [];
  state.mutate = {};
  state.options = {};
  state.invalidated = [];
  state.toasts = [];
  state.downloads = [];
  vi.stubGlobal("window", { confirm: vi.fn(() => true) });
});
afterEach(() => vi.unstubAllGlobals());

describe("RGPD-12 — échéance d’une demande", () => {
  it("tombe un mois après la réception, au dernier jour d’un mois plus court", () => {
    expect(gdprRequestDeadline(new Date(2026, 9, 26, 10)).toDateString()).toBe(new Date(2026, 10, 26).toDateString());
    expect(gdprRequestDeadline(new Date(2027, 0, 31, 10)).toDateString()).toBe(new Date(2027, 1, 28).toDateString());
    expect(gdprRequestDeadline(new Date(2026, 11, 15, 10)).toDateString()).toBe(new Date(2027, 0, 15).toDateString());
  });

  it("n’est dépassée que pour une demande encore ouverte", () => {
    const now = new Date(2026, 10, 27, 12);
    expect(isGdprRequestOverdue({ status: "pending", createdAt: new Date(2026, 9, 26, 10) }, now)).toBe(true);
    expect(isGdprRequestOverdue({ status: "in_progress", createdAt: new Date(2026, 9, 26, 10) }, now)).toBe(true);
    expect(isGdprRequestOverdue({ status: "completed", createdAt: new Date(2026, 9, 26, 10) }, now)).toBe(false);
    expect(isGdprRequestOverdue({ status: "pending", createdAt: new Date(2026, 10, 20, 10) }, now)).toBe(false);
  });
});

describe("RGPD-12 — onglet RGPD", () => {
  it("affiche l’échéance, en rouge une fois dépassée, et les statuts en français", () => {
    state.gdprPage = { items: [gdprRequest(1), gdprRequest(2, { createdAt: new Date(Date.now() - 40 * DAY) }), gdprRequest(3, { status: "completed", responseDate: new Date(Date.now() - DAY), notes: "Données effacées le 25." })], total: 3 };
    const html = render(createElement(GdprTab));
    expect(html).toContain(`Échéance : ${gdprRequestDeadline(gdprRequest(1).createdAt).toLocaleDateString("fr-FR")}`);
    expect(html).toMatch(/<span class="font-semibold text-red-400">Échéance dépassée : /);
    expect(html).toContain("À traiter");
    expect(html).toContain("Traitée");
    expect(html).not.toMatch(/>pending</);
    expect(html).toContain("Note : </span>Données effacées le 25.");
    expect(html).toContain("Rechercher une personne par email");
  });

  it("ne permet de refuser qu’avec un motif, envoyé avec la demande après confirmation", () => {
    state.gdprPage = { items: [gdprRequest(1)], total: 1 };
    render(createElement(GdprTab));
    expect(button("Refuser").disabled).toBe(true);

    state.gdprPage = { items: [gdprRequest(1, { status: "in_progress", notes: "Identité non vérifiable." })], total: 1 };
    render(createElement(GdprTab));
    expect(button("Refuser").disabled).toBe(false);
    button("Refuser").onClick!();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("GDPR-UI-1"));
    expect(state.mutate.updateStatus).toHaveBeenCalledWith({ id: 1, status: "rejected", notes: "Identité non vérifiable." });
    button("Traité").onClick!();
    expect(state.mutate.updateStatus).toHaveBeenLastCalledWith({ id: 1, status: "completed", notes: "Identité non vérifiable." });
  });

  it("dit pourquoi une mise à jour est refusée", () => {
    render(createElement(GdprTab));
    state.options.updateStatus!.onError!(new Error("Indiquez le motif du refus avant de refuser la demande."));
    expect(state.toasts.at(-1)).toEqual(["error", "Indiquez le motif du refus avant de refuser la demande."]);
  });
});

describe("RGPD-12 — « Supprimer » un message de contact", () => {
  it("supprime le message après confirmation et recharge la liste", () => {
    state.contactPage = { items: [{ id: 7, trackingId: "CUI0007", name: "Jeanne", email: "jeanne@test.local", phone: null, message: "Bonjour", read: 1, createdAt: new Date() }], total: 1 };
    render(createElement(ContactsTab));
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    button("Supprimer").onClick!();
    expect(state.mutate.deleteContact).not.toHaveBeenCalled();

    button("Supprimer").onClick!();
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining("CUI0007"));
    expect(state.mutate.deleteContact).toHaveBeenCalledWith({ id: 7 });
    state.options.deleteContact!.onSuccess!(undefined as never);
    expect(state.toasts.at(-1)).toEqual(["success", "Message supprimé"]);
    expect(state.invalidated).toContain("contacts");
  });
});

describe("RGPD-12 — rechercher une personne par email", () => {
  const found = {
    email: "jeanne@test.local",
    contactMessages: [{ id: 1, trackingId: "CJEANNE", name: "Jeanne", email: "Jeanne@test.local", phone: null, message: "Bonjour, je voudrais un rendez-vous.", gdprConsent: 1, createdAt: new Date(2026, 8, 1) }],
    medicalQuestions: [{ id: 2, trackingId: "QMED-JEANNE", firstName: "Jeanne", lastName: "M", email: "jeanne@test.local", phone: "+336", question: "Puis-je boire avant l’opération ?", language: "fr", privacyConsent: 1, publicationConsent: 0, status: "answered", adminResponse: "Oui.", publicQuestion: null, publicResponse: null, responseSentAt: null, publishedAt: null, createdAt: new Date(2026, 8, 2) }],
    gdprRequests: [{ id: 3, trackingId: "GJEANNE", name: "Jeanne", email: "jeanne@test.local", phone: null, requestType: "access", description: null, status: "pending", responseDate: null, createdAt: new Date(2026, 9, 1) }],
    appointments: [{ id: 4, trackingId: "APTJEANNE", customerName: "Jeanne", customerEmail: "jeanne@test.local", customerPhone: "+336", consultationType: "health_advice", requestDetails: "", appointmentDate: new Date(2026, 8, 10), duration: 30, finalPrice: "100.00", paymentStatus: "completed", appointmentStatus: "completed", refundAmount: null, refundedAt: null, cancelledAt: null, createdAt: new Date(2026, 8, 3), invoiceNumber: "FAC-2026-000004" }],
    recruitment: { applications: [{ id: 9, trackingId: "CVJEANNE0001", createdAt: new Date(2026, 7, 1) }], candidateAccountWithoutApplication: false },
  };

  it("cherche l’adresse demandée et liste ses données dans chaque table, avec la facture", () => {
    state.found = { data: found, isLoading: false, error: null };
    state.gdprPage = { items: [gdprRequest(1)], total: 1 };
    render(createElement(GdprTab));
    expect(state.findInputs.at(-1)).toEqual({ email: "" });
    expect(button("Ses données")).toBeDefined();
    // « Ses données » opens the search on the request's address.
    const panel = render(createElement(PersonalDataSearchPanel, { requestedEmail: "demandeur1@test.local" }));
    expect(state.findInputs.at(-1)).toEqual({ email: "demandeur1@test.local" });
    expect(panel).toContain('value="demandeur1@test.local"');

    const html = render(createElement(PersonalDataResult, { data: found as never, onChanged: vi.fn() }));
    expect(html).toContain("4 élément(s) enregistré(s) pour jeanne@test.local.");
    for (const text of ["Messages de contact (1)", "CJEANNE", "Questions santé (1)", "QMED-JEANNE", "Répondue", "Demandes RGPD (1)", "GJEANNE", "Accès", "À traiter", "Rendez-vous (1)", "APTJEANNE", "Payé", "facture FAC-2026-000004", "CVJEANNE0001"]) expect(html).toContain(text);
  });

  it("exporte le JSON préparé par le serveur", () => {
    render(createElement(PersonalDataResult, { data: found as never, onChanged: vi.fn() }));
    button("Exporter (JSON)").onClick!();
    expect(state.mutate.export).toHaveBeenCalledWith({ email: "jeanne@test.local" });
    const file = { filename: "donnees-personnelles-2026-10-26.json", content: "{}" };
    state.options.export!.onSuccess!(file as never);
    expect(state.downloads).toEqual([file]);
  });

  it("efface ou anonymise après confirmation, puis rend compte de ce qui reste", () => {
    const onChanged = vi.fn();
    render(createElement(PersonalDataResult, { data: found as never, onChanged }));
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    button("Effacer / anonymiser").onClick!();
    expect(state.mutate.erase).not.toHaveBeenCalled();

    button("Effacer / anonymiser").onClick!();
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining("facture conservés"));
    expect(state.mutate.erase).toHaveBeenCalledWith({ email: "jeanne@test.local" });
    state.options.erase!.onSuccess!({ contactMessagesDeleted: 1, medicalQuestionsDeleted: 1, appointmentsAnonymised: 1, upcomingAppointments: ["APTNEXT"], gdprRequestsKept: 1, recruitmentApplications: ["CVJEANNE0001"] } as never);
    expect(state.toasts.at(-1)?.[0]).toBe("success");
    expect(onChanged).toHaveBeenCalled();
    expect(state.invalidated).toEqual(expect.arrayContaining(["contacts", "appointments", "medicalQuestions"]));
  });

  it("renvoie vers l’effacement candidat existant pour un dossier de recrutement", () => {
    render(createElement(PersonalDataResult, { data: found as never, onChanged: vi.fn() }));
    button("Effacer le dossier candidat").onClick!();
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining("CVJEANNE0001"));
    expect(state.mutate.eraseApplication).toHaveBeenCalledWith({ id: 9 });
  });

  it("n’offre pas l’effacement quand rien n’est enregistré", () => {
    const empty = { ...found, contactMessages: [], medicalQuestions: [], gdprRequests: [], appointments: [], recruitment: { applications: [], candidateAccountWithoutApplication: false } };
    const html = render(createElement(PersonalDataResult, { data: empty as never, onChanged: vi.fn() }));
    expect(html).toContain("Aucune donnée patient ou contact enregistrée pour jeanne@test.local.");
    expect(button("Effacer / anonymiser").disabled).toBe(true);
  });
});
