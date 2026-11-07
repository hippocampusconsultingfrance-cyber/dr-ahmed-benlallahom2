import { useEffect, useState } from "react";
import { adminSearchTerm } from "@shared/adminSearchFolding";
import { adminListCount } from "./adminPagination";

/** Pause in typing after which the list is searched. */
export const ADMIN_SEARCH_DELAY_MS = 300;

/**
 * Search box of an admin list: the text typed, and the term sent to the
 * server once typing pauses (adminSearchTerm: without control or invisible
 * characters; undefined while nothing is left to search, such as a lone
 * accent). « Effacer » empties both at once. A new term is part of the list's
 * filters, so the list starts again from its first page.
 */
export function useAdminSearch() {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const term = adminSearchTerm(text);
    if (term === search) return;
    const timer = setTimeout(() => setSearch(term), ADMIN_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, search]);
  return {
    text,
    search: search || undefined,
    setText,
    clear: () => {
      setText("");
      setSearch("");
    },
  };
}

/**
 * ADM-20: the value of a typed filter of an admin list (spécialité, pays,
 * score…) once typing pauses for ADMIN_SEARCH_DELAY_MS, like the search box:
 * « anesthésie » typed letter by letter loads the list once, not ten times.
 */
export function useAdminFilterDelay<T extends string>(value: T): T {
  const [delayed, setDelayed] = useState(value);
  useEffect(() => {
    if (value === delayed) return;
    const timer = setTimeout(() => setDelayed(value), ADMIN_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value, delayed]);
  return delayed;
}

/**
 * What the search box tells screen readers once the first page of a search
 * has loaded: the list's count for the term, or that nothing matches. Empty
 * without search, and while that first page loads or fails.
 */
export function adminSearchStatus(search: string | undefined, list: { isLoading: boolean; error: unknown; shown: number; total: number }, noun: string): string {
  if (!search || list.isLoading || list.error) return "";
  return list.shown ? `${adminListCount(list.shown, list.total, noun)} pour « ${search} »` : `Aucun résultat pour « ${search} »`;
}
