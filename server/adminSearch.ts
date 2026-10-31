import { and, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";
import { ADMIN_SEARCH_MAX_LENGTH } from "../shared/adminSearchLimits";
import { ADMIN_SEARCH_IGNORED_CHARACTERS, ADMIN_SEARCH_LETTER_FOLDS, ADMIN_SEARCH_LIGATURE_FOLDS, adminSearchWords, foldAdminSearchText } from "../shared/adminSearchFolding";

/**
 * ADM-02: the search box of the admin lists (candidatures, réservations,
 * questions santé, messages): a name, an email or a reference, at most 100
 * characters. Each word typed must appear in one of the searched columns,
 * whatever the case and the accents (« helene dupont » finds « Hélène DUPONT »,
 * « nguyen » finds « Nguyễn »), see shared/adminSearchFolding.ts. A NUL
 * character, which PostgreSQL refuses in a text parameter, is refused here
 * (400) instead of failing the query; the other control characters are ignored.
 */
export const adminSearchInput = z
  .string()
  .trim()
  .max(ADMIN_SEARCH_MAX_LENGTH)
  .refine(search => !search.includes("\u0000"), "La recherche contient un caractère non autorisé.")
  .optional();

/** Chinese, Japanese and Korean names are written without a space between the last and the first name. */
const WRITTEN_WITHOUT_SPACES = new RegExp("[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]", "u");

/** The words typed, folded, as ILIKE patterns in which %, _ and \ match themselves. */
function adminSearchWordPatterns(search: string | undefined) {
  const patterns = new Map<string, boolean>();
  for (const word of adminSearchWords(search)) {
    patterns.set(`%${foldAdminSearchText(word).replace(/[\\%_]/g, "\\$&")}%`, WRITTEN_WITHOUT_SPACES.test(word));
  }
  return Array.from(patterns, ([pattern, withoutSpaces]) => ({ pattern, withoutSpaces }));
}

export function adminSearchPatterns(search: string | undefined): string[] {
  return adminSearchWordPatterns(search).map(({ pattern }) => pattern);
}

const LETTERS_FROM = ADMIN_SEARCH_LETTER_FOLDS.map(([letter]) => letter).join("");
const LETTERS_TO = ADMIN_SEARCH_LETTER_FOLDS.map(([, base]) => base).join("");

/**
 * A column folded like the words typed: normalize(NFD) decomposes it,
 * translate() replaces the whole letters and removes the ignored characters
 * (listed after them, without counterpart), replace() writes out each
 * ligature. Plain SQL, without the unaccent extension (no schema change).
 */
function foldedColumn(column: AnyColumn | SQL): SQL {
  let folded = sql`translate(normalize(${column}, NFD), ${LETTERS_FROM + ADMIN_SEARCH_IGNORED_CHARACTERS}, ${LETTERS_TO})`;
  for (const [ligature, letters] of ADMIN_SEARCH_LIGATURE_FOLDS) folded = sql`replace(${folded}, ${ligature}, ${letters})`;
  return folded;
}

/**
 * A filter of the recruitment lists (a country, a mobility, a certification,
 * a language: Candidatures, the pool, a campaign's filtered audience) on this
 * column: the term typed is found in it, case and accents aside, folded like
 * the search box (« emirats » finds « Émirats arabes unis »). % and _ match
 * themselves.
 */
export function adminFilterContains(column: AnyColumn | SQL, term: string): SQL {
  return sql`${foldedColumn(sql`COALESCE(${column}, '')`)} ILIKE ${`%${foldAdminSearchText(term).replace(/[\\%_]/g, "\\$&")}%`}`;
}

/** A list's name: its first and last name columns, or the one column holding the whole name. */
type AdminSearchNames = { firstName: AnyColumn; lastName: AnyColumn } | { fullName: AnyColumn };

/**
 * Condition of the admin search on these columns, undefined without search:
 * every word typed is found in at least one of them, case and accents ignored.
 * Given the list's name, a Chinese, Japanese or Korean word is also searched
 * in the first and last names written together, in both orders (« 王小明 »
 * finds 小明 王), or in the whole name without its spaces, ideographic ones
 * included (« 王小明 » finds « 王 小明 »). It joins the list's other filters,
 * so its page, its total and « Charger plus » follow the search.
 */
export function adminSearchCondition(search: string | undefined, columns: AnyColumn[], names?: AdminSearchNames): SQL | undefined {
  const patterns = adminSearchWordPatterns(search);
  if (!patterns.length) return undefined;
  const folded = columns.map(foldedColumn);
  const joined = (!names ? [] : "fullName" in names
    ? [sql`translate(${names.fullName}, ${" \u3000"}, ${""})`]
    : [sql`${names.firstName} || ${names.lastName}`, sql`${names.lastName} || ${names.firstName}`]).map(foldedColumn);
  return and(...patterns.map(({ pattern, withoutSpaces }) => or(...[...folded, ...(withoutSpaces ? joined : [])].map(column => sql`${column} ILIKE ${pattern}`))));
}
