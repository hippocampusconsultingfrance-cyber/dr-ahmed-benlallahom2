import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Onglets Disponibilités et Témoignages, et lignes des listes, rendus comme
// dans le tableau de bord : confirmation avant de supprimer un créneau ou de
// bloquer un jour qui porte des rendez-vous payés, motif présenté comme une
// note interne, témoignages gérés depuis l’administration, et sur mobile des
// adresses longues qui passent à la ligne et des actions qui s’empilent.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type MutationOptions = { onSuccess?: (result: never) => unknown; onError?: (error: unknown, variables: never) => unknown };
const view = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  mutate: {} as Record<string, ReturnType<typeof vi.fn>>,
  options: {} as Record<string, MutationOptions>,
  toasts: [] as Array<[string, string]>,
}));

vi.mock("sonner", () => ({
  toast: Object.fromEntries(["success", "error", "info", "warning"].map(kind => [kind, (message: string) => view.toasts.push([kind, message])])),
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Dr Ahmed", role: "admin" }, loading: false, refresh: vi.fn(), logout: vi.fn() }) }));
vi.mock("@clerk/react", () => ({ SignInButton: () => null, UserButton: () => null }));
vi.mock("wouter", () => ({ useLocation: () => ["/admin", vi.fn()] }));
vi.mock("@/lib/trpc", () => {
  const noop = (): unknown => new Proxy(() => undefined, { get: () => noop(), apply: () => undefined });
  const builder = (path: string[]): unknown => new Proxy(() => undefined, {
    get: (_target, key) => builder([...path, String(key)]),
    apply: (_target, _this, args) => ({ path: path.join("."), input: args[0] }),
  });
  const node = (path: string[]): unknown => new Proxy(() => undefined, {
    get: (_target, key) => {
      const name = path.join(".");
      if (key === "useQuery") return () => ({ data: view.data[name], isLoading: false, error: null, refetch: vi.fn() });
      if (key === "useMutation") return (options: MutationOptions = {}) => {
        view.options[name] = options;
        view.mutate[name] ??= vi.fn();
        return { mutate: view.mutate[name], mutateAsync: view.mutate[name], isPending: false };
      };
      if (key === "useUtils") return () => noop();
      if (key === "useQueries") return (build: (t: unknown) => Array<{ path: string }>) => build(builder([])).map(query => ({ data: view.data[query.path], isLoading: false, error: null, refetch: vi.fn() }));
      return node([...path, String(key)]);
    },
  });
  return { trpc: node([]) };
});

const { default: AdminDashboard } = await import("./AdminDashboard");
const { default: AppointmentsTab } = await import("@/components/AppointmentsTab");
const { default: ContactsTab } = await import("@/components/ContactsTab");
const { default: GdprTab } = await import("@/components/GdprTab");

type Element = { type: unknown; props: Record<string, unknown> };
const textOf = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as object)) return textOf((node as Element).props.children);
  return "";
};
const html = (component: () => unknown) => renderToStaticMarkup(createElement(component as never)).replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

/** The tab the dashboard mounts under this label, found by its component's name. */
function tabComponent(label: string, name: string) {
  const tree = () => renderStateful(AdminDashboard) as ReactElement;
  const nav = elementsOf(tree()).find(element => element.props["aria-label"] === "Navigation des sections d’administration")!;
  (elementsOf(nav.props.children).find(element => element.type === "button" && textOf(element).trim() === label)!.props.onClick as () => void)();
  const component = elementsOf(tree()).map(element => element.type).find(type => typeof type === "function" && type.name === name) as () => ReactElement;
  resetStatefulHooks();
  return component;
}

const DAY = 24 * 60 * 60 * 1000;
const LONG_EMAIL = "prenom.nom-de-famille-tres-long.service-anesthesie@hopital-universitaire-exemple.test";

beforeEach(() => {
  view.data = {
    "adminSecurity.status": { verified: true },
    "admin.availability.listSlots": [{ id: 7, dayOfWeek: 2, startTime: "09:00", endTime: "10:00" }],
    "admin.availability.listBlockedDates": [],
    "admin.testimonials.list": [
      { id: 3, authorName: "Patiente anonyme", rating: 5, status: "pending", featured: 0, title: "Un titre de témoignage particulièrement long qui doit passer à la ligne", content: "Contenu" },
    ],
  };
  view.mutate = {};
  view.options = {};
  view.toasts = [];
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("onglet Disponibilités", () => {
  it("demande confirmation avant de supprimer un créneau hebdomadaire", () => {
    const AvailabilityTab = tabComponent("Disponibilités", "AvailabilityTab");
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });
    const remove = () => elementsOf(renderStateful(AvailabilityTab)).find(element => String(element.props["aria-label"] ?? "").startsWith("Supprimer le créneau"))!;

    (remove().props.onClick as () => void)();
    expect(confirm).toHaveBeenCalledWith("Supprimer le créneau Mardi 09:00 - 10:00 ?");
    expect(view.mutate["admin.availability.deleteSlot"]).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    (remove().props.onClick as () => void)();
    expect(view.mutate["admin.availability.deleteSlot"]).toHaveBeenCalledWith({ id: 7 });
  });

  it("présente le motif d’une date bloquée comme une note interne jamais affichée sur le site", () => {
    const AvailabilityTab = tabComponent("Disponibilités", "AvailabilityTab");
    const toggle = elementsOf(renderStateful(AvailabilityTab)).find(element => textOf(element).includes("Bloquer une date") && typeof element.props.onClick === "function")!;
    (toggle.props.onClick as () => void)();
    const labels = elementsOf(renderStateful(AvailabilityTab)).filter(element => element.type === "label").map(textOf);
    expect(labels).toContain("Motif interne (optionnel, jamais affiché sur le site)");
  });

  it("empile titres et boutons sur mobile, et donne aux boutons des formulaires toute la largeur", () => {
    const AvailabilityTab = tabComponent("Disponibilités", "AvailabilityTab");
    const markup = html(AvailabilityTab);
    expect(markup.match(/<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">/g)).toHaveLength(2);

    for (const label of ["Ajouter un créneau", "Bloquer une date"]) {
      (elementsOf(renderStateful(AvailabilityTab)).find(element => textOf(element).includes(label) && typeof element.props.onClick === "function")!.props.onClick as () => void)();
    }
    const submits = elementsOf(renderStateful(AvailabilityTab)).filter(element => ["Ajouter", "Bloquer"].includes(textOf(element).trim()) && typeof element.props.onClick === "function");
    expect(submits.map(element => element.props.className)).toEqual(["min-h-11 w-full md:w-auto md:min-h-0", "min-h-11 w-full md:w-auto md:min-h-0"]);
  });

  it("avertit avant de bloquer un jour qui porte des rendez-vous payés, et ne bloque qu’après confirmation", () => {
    const AvailabilityTab = tabComponent("Disponibilités", "AvailabilityTab");
    html(AvailabilityTab);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });
    const { onError, onSuccess } = view.options["admin.availability.addBlockedDate"]!;
    const blockMutate = view.mutate["admin.availability.addBlockedDate"]!;
    const paidDay = { data: { code: "PRECONDITION_FAILED" }, message: "Deux rendez-vous payés ce jour-là : APT1, APT2." };

    onError!(paidDay, { date: "2026-12-01", reason: "" } as never);
    expect(confirm).toHaveBeenCalledWith("Deux rendez-vous payés ce jour-là : APT1, APT2.\n\nBloquer quand même cette date ?");
    expect(blockMutate).not.toHaveBeenCalled();
    expect(view.toasts).toEqual([]);

    confirm.mockReturnValue(true);
    onError!(paidDay, { date: "2026-12-01", reason: "" } as never);
    expect(blockMutate).toHaveBeenCalledWith({ date: "2026-12-01", reason: "", acknowledgePaidAppointments: true });

    // Already acknowledged, or another refusal: shown, never retried.
    blockMutate.mockClear();
    onError!(paidDay, { date: "2026-12-01", reason: "", acknowledgePaidAppointments: true } as never);
    onError!({ data: { code: "BAD_REQUEST" }, message: "Date déjà bloquée." }, { date: "2026-12-01", reason: "" } as never);
    expect(blockMutate).not.toHaveBeenCalled();
    expect(view.toasts).toEqual([["error", paidDay.message], ["error", "Date déjà bloquée."]]);

    view.toasts = [];
    onSuccess!({ paidAppointments: ["APT1", "APT2"] } as never);
    expect(view.toasts).toEqual([["success", "Date bloquée"], ["warning", "Rendez-vous payés à traiter ce jour-là : APT1, APT2."]]);
  });
});

describe("onglet Témoignages", () => {
  it("reste gérable dans l’administration : liste, approbation, refus et mise en avant", () => {
    const TestimonialsTab = tabComponent("Témoignages", "TestimonialsTab");
    const tree = renderStateful(TestimonialsTab) as ReactElement;
    expect(textOf(tree)).toContain("Un titre de témoignage particulièrement long");
    const action = (label: string) => elementsOf(tree).find(element => typeof element.props.onClick === "function" && textOf(element).trim() === label)!;

    (action("Approuver").props.onClick as () => void)();
    (action("Rejeter").props.onClick as () => void)();
    (action("Mettre en avant").props.onClick as () => void)();
    expect(view.mutate["admin.testimonials.updateStatus"]!.mock.calls).toEqual([[{ id: 3, status: "approved" }], [{ id: 3, status: "rejected" }], [{ id: 3, status: "pending", featured: 1 }]]);
  });

  it("laisse les actions passer à la ligne sur mobile avec des cibles tactiles", () => {
    const markup = html(tabComponent("Témoignages", "TestimonialsTab"));
    expect(markup).toContain('<p class="break-words text-sm font-medium text-foreground">Un titre de témoignage particulièrement long qui doit passer à la ligne</p>');
    const actions = /<div class="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">([\s\S]*?)<\/div><\/div><\/div>/.exec(markup)?.[1] ?? "";
    expect(actions.match(/<button/g)).toHaveLength(4);
    expect(actions.match(/class="[^"]*min-h-10 flex-1 sm:min-h-0 sm:flex-none[^"]*"/g)).toHaveLength(4);
  });
});

describe("listes de l’administration sur mobile", () => {
  it("fait passer à la ligne une adresse email longue dans les réservations, les messages et les demandes RGPD", () => {
    view.data["admin.appointments.list"] = { items: [{
      id: 1, trackingId: "APTMOBILE0001", customerName: "Jeanne Martin", customerEmail: LONG_EMAIL, customerPhone: "+33600000000",
      appointmentDate: new Date(Date.now() + 3 * DAY), finalPrice: "100.00", paymentStatus: "completed", appointmentStatus: "confirmed",
      stripePaymentIntentId: "pi_1", language: "fr", requestDetails: "", deliveries: [], invoiceNumber: "FAC-2026-000001",
    }], total: 1 };
    view.data["admin.contacts.list"] = { items: [{ id: 2, trackingId: "CMOBILE00001", name: "Jeanne Martin", email: LONG_EMAIL, phone: "", message: "Bonjour", read: 0, createdAt: new Date() }], total: 1 };
    view.data["admin.gdprRequests.list"] = { items: [{ id: 3, trackingId: "GMOBILE00001", name: "Jeanne Martin", email: LONG_EMAIL, requestType: "access", status: "pending", notes: "", createdAt: new Date(), responseDate: null, details: "" }], total: 1 };

    for (const tab of [AppointmentsTab, ContactsTab, GdprTab]) {
      expect(html(tab), tab.name).toContain(`<span class="break-all">${LONG_EMAIL}</span>`);
    }
  });
});
