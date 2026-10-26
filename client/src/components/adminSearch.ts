import { useEffect, useState } from "react";
import { adminListCount } from "./adminPagination";

/** Pause in typing after which the list is searched. */
export const ADMIN_SEARCH_DELAY_MS = 300;

/**
 * Search box of an admin list: the text typed, and the term sent to the
 * server once typing pauses (undefined while empty). « Effacer » empties both
 * at once. A new term is part of the list's filters, so the list starts again
 * from its first page.
 */
export function useAdminSearch() {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const term = text.trim();
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
 * What the search box tells screen readers once the first page of a search
 * has loaded: the list's count for the term, or that nothing matches. Empty
 * without search, and while that first page loads or fails.
 */
export function adminSearchStatus(search: string | undefined, list: { isLoading: boolean; error: unknown; shown: number; total: number }, noun: string): string {
  if (!search || list.isLoading || list.error) return "";
  return list.shown ? `${adminListCount(list.shown, list.total, noun)} pour « ${search} »` : `Aucun résultat pour « ${search} »`;
}
