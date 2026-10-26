import { useEffect, useState } from "react";

/** ADM-02: the server searches at most 100 characters (adminSearchInput). */
export const ADMIN_SEARCH_MAX_LENGTH = 100;
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
