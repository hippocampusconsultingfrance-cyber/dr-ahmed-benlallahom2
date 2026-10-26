import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AdminLoadMore from "./AdminLoadMore";
import { adminListCount, adminPageOffsets, ADMIN_PAGE_SIZE, mergeAdminPages } from "./adminPagination";

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
    expect(mergeAdminPages([{ data: { items: rows(0, 2), total: 2 }, isLoading: false }, { isLoading: false, error: { message: "Erreur réseau" } }]).error).toEqual({ message: "Erreur réseau" });
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
});
