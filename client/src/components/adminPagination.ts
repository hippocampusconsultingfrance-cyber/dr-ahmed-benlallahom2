import { useState } from "react";

/** ADM-01: the admin lists load 50 rows at a time, then « Charger plus ». */
export const ADMIN_PAGE_SIZE = 50;

/** Offsets of the pages loaded so far: 0, 50, 100… */
export function adminPageOffsets(pageCount: number): number[] {
  return Array.from({ length: Math.max(1, pageCount) }, (_, page) => page * ADMIN_PAGE_SIZE);
}

type AdminPageQuery<T> = {
  data?: { items: T[]; total: number };
  isLoading: boolean;
  error?: { message: string } | null;
  refetch?: () => unknown;
};

/**
 * The loaded pages of a list as one list: rows in order, without the
 * duplicate a new row shifting the pages can cause; the total, read from the
 * first page; the loading state and error of the whole list (first page) and
 * of « Charger plus » (later pages: the rows already shown stay on screen).
 */
export function mergeAdminPages<T extends { id: number }>(pages: AdminPageQuery<T>[]) {
  const seen = new Set<number>();
  const items: T[] = [];
  for (const page of pages) {
    for (const item of page.data?.items ?? []) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return {
    items,
    total: Number(pages[0]?.data?.total ?? 0),
    isLoading: pages[0]?.isLoading ?? true,
    isLoadingMore: pages.slice(1).some(page => page.isLoading),
    error: pages[0]?.error ?? null,
    loadMoreError: pages.slice(1).find(page => page.error)?.error ?? null,
    retryLoadMore: () => {
      for (const page of pages.slice(1)) if (page.error) void page.refetch?.();
    },
  };
}

/**
 * A loaded page with one row changed in place: after an edit that moves no
 * row (neither the order nor the filters depend on what changed), the pages
 * already loaded are updated instead of being all fetched again.
 */
export function updateAdminPageItem<T extends { id: number }>(page: { items: T[]; total: number } | undefined, id: number, changes: Partial<T>) {
  return page && { ...page, items: page.items.map(item => item.id === id ? { ...item, ...changes } : item) };
}

/** « 50 sur 302 réservation(s) » while rows remain to load, « 302 réservation(s) » once all are shown. */
export function adminListCount(shown: number, total: number, noun: string): string {
  return shown < total ? `${shown} sur ${total} ${noun}` : `${total} ${noun}`;
}

/**
 * Number of pages shown, back to the first page whenever the filters or the
 * search change, also when they come back to filters or a term shown before:
 * the pages loaded for them then are not shown again from the cache, the list
 * starts from its first page like any new search (ADM-01, ADM-02).
 */
export function useAdminPageCount(filterKey: string) {
  const [pages, setPages] = useState({ filterKey, count: 1 });
  // New filters, seen during the render (React's way to reset a state on a new prop):
  // the count of the previous ones is forgotten at once.
  if (pages.filterKey !== filterKey) setPages({ filterKey, count: 1 });
  const pageCount = pages.filterKey === filterKey ? pages.count : 1;
  return { pageCount, loadMore: () => setPages({ filterKey, count: pageCount + 1 }) };
}
