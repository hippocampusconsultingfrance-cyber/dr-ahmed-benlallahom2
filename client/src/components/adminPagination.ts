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
};

/**
 * The loaded pages of a list as one list: rows in order, without the
 * duplicate a new row shifting the pages can cause; the total, read from the
 * first page; the loading state of the whole list (first page) and of
 * « Charger plus » (later pages).
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
    error: pages.find(page => page.error)?.error ?? null,
  };
}

/** « 50 sur 302 réservation(s) » while rows remain to load, « 302 réservation(s) » once all are shown. */
export function adminListCount(shown: number, total: number, noun: string): string {
  return shown < total ? `${shown} sur ${total} ${noun}` : `${total} ${noun}`;
}

/** Number of pages shown, back to the first page whenever the filters change. */
export function useAdminPageCount(filterKey: string) {
  const [pages, setPages] = useState({ filterKey, count: 1 });
  const pageCount = pages.filterKey === filterKey ? pages.count : 1;
  return { pageCount, loadMore: () => setPages({ filterKey, count: pageCount + 1 }) };
}
