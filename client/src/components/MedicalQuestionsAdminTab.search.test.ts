import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// ADM-02 dans l’onglet Questions santé : la référence QMED-… citée par l’email
// de notification (ou le nom, l’email) se cherche dans la file affichée.

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

const view = vi.hoisted(() => ({
  requests: [] as Array<Record<string, unknown>>,
  page: { items: [] as Array<Record<string, unknown>>, total: 0 },
  loading: false,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({ medicalQuestions: { admin: { get: { invalidate: vi.fn() }, list: { invalidate: vi.fn() } } } }),
      useQueries: (build: (t: unknown) => unknown[]) => {
        view.requests = [];
        const t = { medicalQuestions: { admin: { list: (input: Record<string, unknown>) => { view.requests.push(input); return input; } } } };
        return build(t).map(() => view.loading ? { data: undefined, isLoading: true, error: null } : { data: view.page, isLoading: false, error: null, refetch: vi.fn() });
      },
      medicalQuestions: {
        admin: {
          get: { useQuery: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }) },
          saveDraft: { useMutation: mutation },
          improveDraft: { useMutation: mutation },
          sendValidatedResponse: { useMutation: mutation },
          updatePublication: { useMutation: mutation },
          unpublish: { useMutation: mutation },
          reject: { useMutation: mutation },
          delete: { useMutation: mutation },
        },
      },
    },
  };
});

const { default: MedicalQuestionsAdminTab } = await import("./MedicalQuestionsAdminTab");
const { default: AdminSearchField } = await import("./AdminSearchField");
const { default: AdminLoadMore } = await import("./AdminLoadMore");
const { ADMIN_SEARCH_DELAY_MS } = await import("./adminSearch");

const render = () => renderStateful(MedicalQuestionsAdminTab) as ReactElement;
const propsOf = (tree: ReactElement, type: unknown) => elementsOf(tree).find(element => element.type === type)!.props;

beforeEach(() => {
  vi.useFakeTimers();
  view.page = { items: [], total: 120 };
  view.loading = false;
});
afterEach(() => {
  resetStatefulHooks();
  vi.useRealTimers();
});

describe("ADM-02 — recherche dans les questions santé", () => {
  it("cherche la référence dans la file « À traiter », depuis la première page, le champ restant affiché pendant le chargement", () => {
    (propsOf(render(), AdminLoadMore).onLoadMore as () => void)();
    render();
    expect(view.requests.map(request => request.offset)).toEqual([0, 50]);

    (propsOf(render(), AdminSearchField).onChange as (value: string) => void)("QMED-ADMIN001");
    render();
    view.loading = true;
    vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS);
    const loading = render();
    expect(view.requests).toEqual([{ statuses: ["submitted", "drafting"], order: "oldest", search: "QMED-ADMIN001", limit: 50, offset: 0 }]);
    expect(renderToStaticMarkup(loading)).toContain('value="QMED-ADMIN001"');
    // Nothing announced to screen readers before the results are shown.
    expect(propsOf(loading, AdminSearchField).status).toBe("");

    view.loading = false;
    view.page = { items: [], total: 0 };
    const loaded = render();
    expect(propsOf(loaded, AdminSearchField).status).toBe("Aucun résultat pour « QMED-ADMIN001 »");
    const html = renderToStaticMarkup(loaded);
    expect(html).toContain("0 question(s) pour « QMED-ADMIN001 » · de la plus ancienne à la plus récente");
    expect(html).toContain("Aucune question ne correspond à « QMED-ADMIN001 » dans cette liste.");

    // Another queue keeps the search, from its first page.
    const all = elementsOf(render()).find(element => element.type === "button" && element.props.children === "Toutes")!;
    (all.props.onClick as () => void)();
    render();
    expect(view.requests).toEqual([{ order: "newest", search: "QMED-ADMIN001", limit: 50, offset: 0 }]);
  });
});
