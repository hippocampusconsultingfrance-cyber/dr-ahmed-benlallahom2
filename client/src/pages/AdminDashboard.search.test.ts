import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// ADM-02 dans les onglets Réservations et Messages : la recherche (nom, email
// ou référence) part au serveur après la pause de frappe, avec le filtre de
// l’onglet, depuis la première page ; le champ reste affiché pendant le chargement.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

const view = vi.hoisted(() => ({
  requests: [] as Array<Record<string, unknown>>,
  page: { items: [] as Array<Record<string, unknown>>, total: 0 },
  loading: false,
}));

const mutation = () => ({ mutate: vi.fn(), isPending: false });
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/trpc", () => {
  const record = (input: Record<string, unknown>) => { view.requests.push(input); return input; };
  return {
    trpc: {
      useUtils: () => ({ admin: { appointments: { list: { invalidate: vi.fn() } }, contacts: { list: { invalidate: vi.fn() } }, stats: { invalidate: vi.fn() } } }),
      useQueries: (build: (t: unknown) => unknown[]) => {
        view.requests = [];
        const t = { admin: { appointments: { list: record }, contacts: { list: record } } };
        return build(t).map(() => view.loading ? { data: undefined, isLoading: true, error: null } : { data: view.page, isLoading: false, error: null, refetch: vi.fn() });
      },
      admin: {
        appointments: { updateStatus: { useMutation: mutation }, refund: { useMutation: mutation }, refundUnconfirmedSession: { useMutation: mutation } },
        contacts: { markRead: { useMutation: mutation }, delete: { useMutation: mutation } },
      },
    },
  };
});

const { AppointmentsTab, ContactsTab } = await import("./AdminDashboard");
const { default: AdminSearchField } = await import("@/components/AdminSearchField");
const { default: AdminLoadMore } = await import("@/components/AdminLoadMore");
const { ADMIN_SEARCH_DELAY_MS } = await import("@/components/adminSearch");

const propsOf = (tree: ReactElement, type: unknown) => elementsOf(tree).find(element => element.type === type)!.props;
const buttonLabelled = (tree: ReactElement, label: string) => elementsOf(tree).find(element => element.type === "button" && element.props.children === label)!.props;

function search(render: () => ReactElement, term: string) {
  (propsOf(render(), AdminSearchField).onChange as (value: string) => void)(term);
  render();
  vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS);
  return render();
}

beforeEach(() => {
  vi.useFakeTimers();
  view.page = { items: [], total: 120 };
  view.loading = false;
});
afterEach(() => {
  resetStatefulHooks();
  vi.useRealTimers();
});

describe("ADM-02 — recherche dans les réservations", () => {
  const render = () => renderStateful(AppointmentsTab) as ReactElement;

  it("cherche une référence depuis la première page, avec le filtre de paiement, et garde le champ pendant le chargement", () => {
    (propsOf(render(), AdminLoadMore).onLoadMore as () => void)();
    render();
    expect(view.requests.map(request => request.offset)).toEqual([0, 50]);

    (propsOf(render(), AdminSearchField).onChange as (value: string) => void)("aptvol000010");
    render();
    expect(view.requests.map(request => request.search)).toEqual([undefined, undefined]);
    view.loading = true;
    vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS);
    let tree = render();
    expect(view.requests).toEqual([{ search: "aptvol000010", limit: 50, offset: 0 }]);
    // The new search is loading: the field (and its focus) stays, above the skeleton.
    const loadingHtml = renderToStaticMarkup(tree);
    expect(loadingHtml).toContain('value="aptvol000010"');
    expect(loadingHtml).toContain("Chargement des rendez-vous");
    expect(propsOf(tree, AdminSearchField).status).toBe("");

    view.loading = false;
    (buttonLabelled(tree, "Payé").onClick as () => void)();
    tree = render();
    expect(view.requests).toEqual([{ status: "completed", search: "aptvol000010", limit: 50, offset: 0 }]);

    view.page = { items: [], total: 0 };
    tree = render();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("0 réservation(s) pour « aptvol000010 »");
    expect(html).toContain("Aucune réservation ne correspond à « aptvol000010 » avec ce filtre.");
    expect(propsOf(tree, AdminSearchField).status).toBe("Aucun résultat pour « aptvol000010 »");

    (propsOf(tree, AdminSearchField).onClear as () => void)();
    render();
    expect(view.requests).toEqual([{ status: "completed", limit: 50, offset: 0 }]);
  });
});

describe("ADM-02 — recherche dans les messages", () => {
  const render = () => renderStateful(ContactsTab) as ReactElement;

  it("se combine au filtre « non lus » et repart de la première page", () => {
    (buttonLabelled(render(), "Non lus").onClick as () => void)();
    (propsOf(render(), AdminLoadMore).onLoadMore as () => void)();
    render();
    expect(view.requests.map(request => request.offset)).toEqual([0, 50]);

    view.page = { items: [], total: 0 };
    const tree = search(render, "Côté");
    expect(view.requests).toEqual([{ unreadOnly: true, search: "Côté", limit: 50, offset: 0 }]);
    expect(renderToStaticMarkup(tree)).toContain("Aucun message ne correspond à « Côté » parmi les non lus.");
    expect(propsOf(tree, AdminSearchField).status).toBe("Aucun résultat pour « Côté »");

    // Found: the count of unread messages for the term, as on screen.
    view.page = { items: [{ id: 7, trackingId: "CSEARCH00001", name: "François Côté", email: "fcote@test.local", phone: null, subject: null, message: "Bonjour", read: 0, createdAt: new Date(Date.UTC(2026, 6, 1)) }], total: 1 };
    expect(propsOf(render(), AdminSearchField).status).toBe("1 message(s) non lu(s) pour « Côté »");
  });
});
