import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// RGPD-12 — l’onglet RGPD : échéance d’un mois, statuts en français, note et
// refus motivé, « Supprimer » un message, et la recherche d’une personne par
// email avec export JSON et effacement. Les boutons sont relevés au rendu
// pour appeler leur action comme un clic.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type MutationOptions = { onSuccess?: (result: never) => unknown; onError?: (error: Error) => unknown };
type ButtonProps = { children?: ReactNode; onClick?: () => void; disabled?: boolean; type?: string; "aria-describedby"?: string };

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
        admin: { contacts: { list: invalidate("contacts") }, gdprRequests: { list: invalidate("gdprRequests") }, appointments: { list: invalidate("appointments") }, recruitment: { list: invalidate("recruitment") }, stats: invalidate("stats") },
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
const { default: PersonalDataSearchPanel, PersonalDataResult, revealPersonalDataSearch } = await import("@/components/PersonalDataSearchPanel");
const { formatGdprRequestDate, gdprRequestDeadline, isGdprRequestOverdue } = await import("@/components/gdprRequestAdmin");

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

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
const textOf = (node: ReactNode): string => Array.isArray(node) ? node.map(textOf).join("")
  : typeof node === "string" || typeof node === "number" ? String(node)
  : isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : "";

type TabAction = (tree: ReactNode) => void;
const click = (label: string): TabAction => tree => (elements(tree).find(element => typeof element.props.onClick === "function" && textOf(element.props.children as ReactNode).includes(label))!.props.onClick as () => void)();
const typeNote = (requestId: number, value: string): TabAction => tree => (elements(tree).find(element => element.props.id === `gdpr-request-note-${requestId}`)!.props.onChange as (event: unknown) => void)({ target: { value } });

/**
 * Renders the GDPR tab inside a wrapper that runs `actions` (a click, a note
 * typed) during its own render: the tab's state lives in the wrapper, so each
 * update renders it again, as in the browser. Returns the search panel (key
 * and address) of every render.
 */
function renderGdprTabActing(...actions: TabAction[]) {
  const panels: Array<{ key: string | null; requestedEmail: unknown; reveal: unknown }> = [];
  const pending = [...actions];
  const Probe = () => {
    const tree = GdprTab();
    const panel = elements(tree).find(element => element.type === PersonalDataSearchPanel)!;
    panels.push({ key: panel.key, requestedEmail: panel.props.requestedEmail, reveal: panel.props.reveal });
    pending.shift()?.(tree);
    return tree;
  };
  render(createElement(Probe));
  return panels;
}

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
afterEach(() => {
  vi.unstubAllGlobals();
  resetStatefulHooks();
});

describe("RGPD-12 — échéance d’une demande", () => {
  it("tombe un mois après la réception, jour de Paris, au dernier jour d’un mois plus court", () => {
    // Reçue le 26/09 à 08:56 à Paris : due jusqu’au 26/10 à 23:59:59, heure de Paris (heure d’hiver depuis le 25/10).
    expect(gdprRequestDeadline(new Date("2026-09-26T06:56:00Z")).toISOString()).toBe("2026-10-26T22:59:59.999Z");
    expect(formatGdprRequestDate(gdprRequestDeadline(new Date("2027-01-31T10:00:00Z")))).toBe("28/02/2027");
    expect(formatGdprRequestDate(gdprRequestDeadline(new Date("2028-01-31T10:00:00Z")))).toBe("29/02/2028");
    expect(formatGdprRequestDate(gdprRequestDeadline(new Date("2026-12-15T10:00:00Z")))).toBe("15/01/2027");
    // 31 janvier 23:30 UTC, déjà le 1er février à Paris : échéance le 1er mars, pas le 28 février.
    expect(formatGdprRequestDate(gdprRequestDeadline(new Date("2026-01-31T23:30:00Z")))).toBe("01/03/2026");
  });

  it("n’est dépassée qu’une fois le jour d’échéance fini à Paris, pour une demande encore ouverte", () => {
    const createdAt = new Date("2026-09-26T06:56:00Z");
    // Le 26/10 à l’heure exacte de la réception (08:56:37 à Paris), le délai court encore.
    expect(isGdprRequestOverdue({ status: "pending", createdAt }, new Date("2026-10-26T07:56:37Z"))).toBe(false);
    expect(isGdprRequestOverdue({ status: "pending", createdAt }, new Date("2026-10-26T22:59:59Z"))).toBe(false);
    expect(isGdprRequestOverdue({ status: "pending", createdAt }, new Date("2026-10-26T23:00:00Z"))).toBe(true);
    expect(isGdprRequestOverdue({ status: "in_progress", createdAt }, new Date("2026-10-27T12:00:00Z"))).toBe(true);
    expect(isGdprRequestOverdue({ status: "completed", createdAt }, new Date("2026-10-27T12:00:00Z"))).toBe(false);
    expect(isGdprRequestOverdue({ status: "rejected", createdAt }, new Date("2026-10-27T12:00:00Z"))).toBe(false);
  });

  it("compte les jours de Paris quel que soit le fuseau du navigateur", () => {
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
        process.env.TZ = zone;
        // 26/09 à 00:30 à Paris (25/09 en UTC, en Californie ; déjà 07:30 le 26 à Tokyo).
        expect(gdprRequestDeadline(new Date("2026-09-25T22:30:00Z")).toISOString()).toBe("2026-10-26T22:59:59.999Z");
        expect(formatGdprRequestDate(gdprRequestDeadline(new Date("2026-09-25T22:30:00Z")))).toBe("26/10/2026");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe("RGPD-12 — onglet RGPD", () => {
  it("affiche l’échéance, en rouge une fois dépassée, et les statuts en français", () => {
    state.gdprPage = { items: [gdprRequest(1), gdprRequest(2, { createdAt: new Date(Date.now() - 40 * DAY) }), gdprRequest(3, { status: "completed", responseDate: new Date(Date.now() - DAY), notes: "Données effacées le 25." })], total: 3 };
    const html = render(createElement(GdprTab));
    expect(html).toContain(`Échéance : ${formatGdprRequestDate(gdprRequestDeadline(gdprRequest(1).createdAt))}`);
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

  it("enregistre une note vidée pour l’effacer, pas une note inchangée", () => {
    state.gdprPage = { items: [gdprRequest(1, { status: "in_progress", notes: "Note saisie par erreur." })], total: 1 };
    render(createElement(GdprTab));
    expect(button("Enregistrer la note").disabled).toBe(true);

    renderGdprTabActing(typeNote(1, ""));
    expect(button("Enregistrer la note").disabled).toBe(false);
    expect(button("Refuser").disabled).toBe(true);
    button("Enregistrer la note").onClick!();
    expect(state.mutate.updateStatus).toHaveBeenCalledWith({ id: 1, status: "in_progress", notes: "" });
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
    expect(state.invalidated).toEqual(expect.arrayContaining(["contacts", "stats"]));
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
    totals: { contactMessages: 1, medicalQuestions: 1, gdprRequests: 1, appointments: 1, recruitmentApplications: 1 },
    erasableRows: 3,
  };
  /** Only what the erasure keeps is left: the GDPR request (and, when asked, an upcoming booking or a candidate dossier). */
  const keptOnly = (extra: { appointments?: number; applications?: number } = {}) => ({
    ...found,
    contactMessages: [],
    medicalQuestions: [],
    appointments: extra.appointments ? found.appointments : [],
    recruitment: { applications: extra.applications ? found.recruitment.applications : [], candidateAccountWithoutApplication: false },
    totals: { contactMessages: 0, medicalQuestions: 0, gdprRequests: 1, appointments: extra.appointments ?? 0, recruitmentApplications: extra.applications ?? 0 },
    erasableRows: 0,
  });

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

  it("« Ses données » relance la recherche sur l’adresse de la demande, même après une recherche manuelle", () => {
    state.gdprPage = { items: [gdprRequest(1), gdprRequest(2)], total: 2 };

    const panels = renderGdprTabActing(click("Ses données"), click("Ses données"));
    expect(panels.map(panel => panel.requestedEmail)).toEqual(["", "demandeur1@test.local", "demandeur1@test.local"]);
    // A new key on every click: the panel starts again on the request's
    // address, dropping any other address searched by hand meanwhile, and
    // comes on screen; not when the tab opens.
    expect(new Set(panels.map(panel => panel.key)).size).toBe(3);
    expect(panels.map(panel => panel.reveal)).toEqual([false, true, true]);
    expect(state.findInputs.at(-1)).toEqual({ email: "demandeur1@test.local" });
  });

  it("amène le panneau sous l’en-tête collant, place le focus sur son titre, puis annonce les résultats", () => {
    // The focus first, without scrolling, then the scroll that honours the panel's scroll-mt.
    const calls: string[] = [];
    revealPersonalDataSearch(
      { scrollIntoView: options => calls.push(`scroll ${JSON.stringify(options)}`) },
      { focus: options => calls.push(`focus ${JSON.stringify(options)}`) },
    );
    expect(calls).toEqual(['focus {"preventScroll":true}', 'scroll {"block":"start"}']);

    state.found = { data: found, isLoading: false, error: null };
    const panel = () => renderStateful(() => PersonalDataSearchPanel({ requestedEmail: "jeanne@test.local", reveal: true })) as ReactElement;
    const statusOf = (tree: ReactElement) => elementsOf(tree).find(element => element.props.role === "status")!.props.children;
    const section = panel();
    expect(section.props.className).toMatch(/(^| )scroll-mt-28 .*sm:scroll-mt-20/);
    expect(elementsOf(section).find(element => element.type === "h3")!.props.tabIndex).toBe(-1);
    // Present and empty when the panel appears, even with results already in
    // cache, then filled: screen readers read each result out.
    expect(statusOf(section)).toBe("");
    expect(statusOf(panel())).toBe("4 élément(s) enregistré(s) pour jeanne@test.local.");
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
    expect(state.invalidated).toEqual(expect.arrayContaining(["contacts", "appointments", "medicalQuestions", "stats"]));
  });

  it("renvoie vers l’effacement candidat existant pour un dossier de recrutement", () => {
    render(createElement(PersonalDataResult, { data: found as never, onChanged: vi.fn() }));
    button("Effacer le dossier candidat").onClick!();
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining("CVJEANNE0001"));
    expect(state.mutate.eraseApplication).toHaveBeenCalledWith({ id: 9 });
  });

  it("n’offre pas l’effacement quand rien n’est enregistré", () => {
    const empty = { ...keptOnly(), gdprRequests: [], totals: { ...keptOnly().totals, gdprRequests: 0 } };
    const html = render(createElement(PersonalDataResult, { data: empty as never, onChanged: vi.fn() }));
    expect(html).toContain("Aucune donnée patient ou contact enregistrée pour jeanne@test.local.");
    expect(button("Effacer / anonymiser").disabled).toBe(true);
    expect(html).not.toContain("Rien à effacer");
  });

  it("désactive l’effacement et dit ce qui reste quand il ne reste que des données conservées", () => {
    let html = render(createElement(PersonalDataResult, { data: keptOnly() as never, onChanged: vi.fn() }));
    expect(html).toContain("1 élément(s) enregistré(s) pour jeanne@test.local.");
    expect(button("Effacer / anonymiser").disabled).toBe(true);
    expect(html).toContain("Rien à effacer ou anonymiser pour cette adresse : il ne reste que ses demandes RGPD, conservées comme preuve du traitement.");
    expect(button("Effacer / anonymiser")["aria-describedby"]).toBe("personal-data-nothing-to-erase");
    expect(html).toContain('<p id="personal-data-nothing-to-erase"');

    html = render(createElement(PersonalDataResult, { data: keptOnly({ appointments: 1, applications: 1 }) as never, onChanged: vi.fn() }));
    expect(button("Effacer / anonymiser").disabled).toBe(true);
    expect(html).toContain("il ne reste que ses demandes RGPD, conservées comme preuve du traitement, ses rendez-vous à venir encore en cours, à annuler ou rembourser d’abord (onglet Réservations) et ses dossiers de recrutement, à effacer séparément.");

    // Something left to erase: the button is offered, without the notice.
    html = render(createElement(PersonalDataResult, { data: { ...keptOnly(), erasableRows: 1 } as never, onChanged: vi.fn() }));
    expect(button("Effacer / anonymiser").disabled).toBe(false);
    expect(html).not.toContain("Rien à effacer");
  });

  it("dit qu’un effacement n’a rien changé au lieu d’annoncer des données effacées", () => {
    render(createElement(PersonalDataResult, { data: found as never, onChanged: vi.fn() }));
    state.options.erase!.onSuccess!({ contactMessagesDeleted: 0, medicalQuestionsDeleted: 0, appointmentsAnonymised: 0, upcomingAppointments: [], gdprRequestsKept: 1, recruitmentApplications: [] } as never);
    expect(state.toasts.at(-1)).toEqual(["info", "Rien n’a été effacé ni anonymisé : il ne restait que des données conservées."]);
  });

  it("signale une liste coupée aux plus récents, l’export et l’effacement portant sur tous", () => {
    const messages = Array.from({ length: 200 }, (_, index) => ({ ...found.contactMessages[0]!, id: 100 + index, trackingId: `CJEANNE${index}` }));
    const many = { ...found, contactMessages: messages, totals: { ...found.totals, contactMessages: 340 }, erasableRows: 342 };
    const html = render(createElement(PersonalDataResult, { data: many as never, onChanged: vi.fn() }));
    expect(html).toContain("Messages de contact (340)");
    expect(html).toContain("Les 200 plus récents sont affichés ; l’export JSON contient les 340.");
    expect(html).toContain("343 élément(s) enregistré(s) pour jeanne@test.local. Seuls les plus récents de chaque liste sont affichés ; l’export JSON et l’effacement portent sur tous.");
    // Lists shown in full: no such notice.
    expect(render(createElement(PersonalDataResult, { data: found as never, onChanged: vi.fn() }))).not.toContain("plus récents");
  });
});
