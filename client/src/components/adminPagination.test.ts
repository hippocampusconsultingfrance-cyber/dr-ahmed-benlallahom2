import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderStateful, resetStatefulHooks } from "@/testing/statefulRender";
import AdminLoadMore from "./AdminLoadMore";
import { adminListCount, adminPageOffsets, ADMIN_PAGE_SIZE, mergeAdminPages, useAdminPageCount } from "./adminPagination";

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

afterEach(() => resetStatefulHooks());

const rows = (from: number, to: number) => Array.from({ length: to - from }, (_, index) => ({ id: from + index }));

/** Every element of a rendered tree, to reach a button's onClick without a DOM. */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

describe("ADM-01 — listes de l’admin par pages de 50", () => {
  it("demande les pages 0, 50, 100… et réunit leurs lignes sans doublon, avec le total du serveur", () => {
    expect(ADMIN_PAGE_SIZE).toBe(50);
    expect(adminPageOffsets(1)).toEqual([0]);
    expect(adminPageOffsets(3)).toEqual([0, 50, 100]);

    // A new row arrived between two pages: row 49 is on both.
    const merged = mergeAdminPages([
      { data: { items: rows(0, 50), total: 302 }, isLoading: false, error: null },
      { data: { items: rows(49, 99), total: 303 }, isLoading: false, error: null },
      { data: undefined, isLoading: true, error: null },
    ]);
    expect(merged.items.map(item => item.id)).toEqual(rows(0, 99).map(item => item.id));
    expect(merged).toMatchObject({ total: 302, isLoading: false, isLoadingMore: true, error: null });
    expect(mergeAdminPages([{ data: undefined, isLoading: true }])).toMatchObject({ items: [], total: 0, isLoading: true, isLoadingMore: false });
    expect(mergeAdminPages([{ isLoading: false, error: { message: "Erreur réseau" } }]).error).toEqual({ message: "Erreur réseau" });
  });

  it("garde les lignes affichées quand une page suivante échoue, et ne relance que celle-ci", () => {
    const refetch = [vi.fn(), vi.fn(), vi.fn()];
    const merged = mergeAdminPages([
      { data: { items: rows(0, 50), total: 120 }, isLoading: false, error: null, refetch: refetch[0] },
      { data: undefined, isLoading: false, error: { message: "Erreur réseau" }, refetch: refetch[1] },
      { data: { items: rows(100, 120), total: 120 }, isLoading: false, error: null, refetch: refetch[2] },
    ]);
    expect(merged).toMatchObject({ error: null, loadMoreError: { message: "Erreur réseau" } });
    expect(merged.items).toHaveLength(70);
    merged.retryLoadMore();
    expect(refetch.map(fn => fn.mock.calls.length)).toEqual([0, 1, 0]);

    const onRetry = vi.fn();
    const onLoadMore = vi.fn();
    const html = renderToStaticMarkup(createElement(AdminLoadMore, { shown: 70, total: 120, loading: false, onLoadMore, error: merged.loadMoreError, onRetry }));
    expect(html).toContain("70 sur 120 affichés");
    expect(html).toContain("La suite de la liste n’a pas pu être chargée : Erreur réseau");
    expect(html).not.toContain("Charger plus");
    const button = elements(AdminLoadMore({ shown: 70, total: 120, loading: false, onLoadMore, error: merged.loadMoreError, onRetry })).find(element => typeof element.props.onClick === "function");
    (button!.props.onClick as () => void)();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("annonce « 50 sur N » tant que des lignes restent à charger", () => {
    expect(adminListCount(50, 302, "réservation(s)")).toBe("50 sur 302 réservation(s)");
    expect(adminListCount(302, 302, "réservation(s)")).toBe("302 réservation(s)");
  });

  it("propose « Charger plus » avec le nombre suivant, et rien quand tout est affiché", () => {
    const onLoadMore = vi.fn();
    const html = renderToStaticMarkup(createElement(AdminLoadMore, { shown: 100, total: 302, loading: false, onLoadMore }));
    expect(html).toContain("100 sur 302 affichés");
    expect(html).toContain("Charger plus (50)");
    expect(renderToStaticMarkup(createElement(AdminLoadMore, { shown: 300, total: 302, loading: false, onLoadMore }))).toContain("Charger plus (2)");
    expect(renderToStaticMarkup(createElement(AdminLoadMore, { shown: 302, total: 302, loading: false, onLoadMore }))).toBe("");

    const button = elements(AdminLoadMore({ shown: 100, total: 302, loading: false, onLoadMore })).find(element => typeof element.props.onClick === "function");
    (button!.props.onClick as () => void)();
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    const loading = renderToStaticMarkup(createElement(AdminLoadMore, { shown: 100, total: 302, loading: true, onLoadMore }));
    expect(loading).toContain("Chargement…");
    expect(loading).toMatch(/<button[^>]*disabled=""/);
  });

  it("repart de la première page à chaque nouvelle recherche ou nouveau filtre, même en revenant à un terme déjà chargé", () => {
    const pagesFor = (filters: { status?: string; search?: string }) => renderStateful(() => useAdminPageCount(JSON.stringify(filters)));

    expect(pagesFor({ search: "dupont" }).pageCount).toBe(1);
    pagesFor({ search: "dupont" }).loadMore();
    expect(pagesFor({ search: "dupont" }).pageCount).toBe(2);
    // The cross, another term, then « dupont » again: its second page is not shown back from the cache.
    expect(pagesFor({}).pageCount).toBe(1);
    expect(pagesFor({ search: "martin" }).pageCount).toBe(1);
    expect(pagesFor({ search: "dupont" }).pageCount).toBe(1);

    // The same for the filters of ADM-01: Tous + « Charger plus », Payé, then Tous again.
    pagesFor({}).loadMore();
    expect(pagesFor({}).pageCount).toBe(2);
    expect(pagesFor({ status: "completed" }).pageCount).toBe(1);
    expect(pagesFor({}).pageCount).toBe(1);
    // A render with the same filters keeps the pages loaded.
    pagesFor({}).loadMore();
    expect(pagesFor({}).pageCount).toBe(2);
    expect(pagesFor({}).pageCount).toBe(2);
  });
});
