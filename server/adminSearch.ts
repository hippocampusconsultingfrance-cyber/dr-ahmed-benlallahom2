import { and, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";
import { ADMIN_SEARCH_MAX_LENGTH } from "../shared/adminSearchLimits";

/**
 * ADM-02: the search box of the admin lists (candidatures, réservations,
 * questions santé, messages): a name, an email or a reference, at most 100
 * characters. Each word typed must appear in one of the searched columns,
 * whatever the case and the accents (« helene dupont » finds « Hélène DUPONT »).
 */
export const adminSearchInput = z.string().trim().max(ADMIN_SEARCH_MAX_LENGTH).optional();

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const withoutDiacritics = (text: string) => text.normalize("NFD").replace(COMBINING_MARKS, "");

/**
 * The accented Latin letters (Latin-1 and Latin Extended-A) and the same
 * letters without accent. translate() strips them from the columns with this
 * table, and the words typed are stripped with the same one, so both sides
 * compare alike without the unaccent extension (no schema change).
 */
const ACCENTED = Array.from({ length: 0x17f - 0xc0 + 1 }, (_, index) => String.fromCharCode(0xc0 + index))
  .filter(letter => withoutDiacritics(letter).length === 1 && withoutDiacritics(letter) !== letter)
  .join("");
const UNACCENTED = withoutDiacritics(ACCENTED);
const UNACCENT = new Map(Array.from(ACCENTED, (letter, index) => [letter, UNACCENTED[index]!]));
/**
 * translate() also removes the combining accents (U+0300–U+036F, listed after
 * the letters above, without counterpart) of a name stored decomposed, such as
 * « Hélène » pasted from a PDF as « e » + U+0301: they are removed from the
 * words typed too.
 */
const ACCENTED_AND_COMBINING = ACCENTED + Array.from({ length: 0x36f - 0x300 + 1 }, (_, index) => String.fromCharCode(0x300 + index)).join("");

/** The words typed, without accents, as ILIKE patterns in which %, _ and \ match themselves. */
export function adminSearchPatterns(search: string | undefined): string[] {
  const words = (search ?? "").normalize("NFC").split(/\s+/).filter(Boolean);
  const patterns = words
    .map(word => Array.from(word, letter => UNACCENT.get(letter) ?? letter).join("").replace(COMBINING_MARKS, ""))
    .filter(Boolean)
    .map(word => `%${word.replace(/[\\%_]/g, "\\$&")}%`);
  return Array.from(new Set(patterns));
}

/**
 * Condition of the admin search on these columns, undefined without search:
 * every word typed is found in at least one of them, case and accents ignored.
 * It joins the list's other filters, so its page, its total and « Charger
 * plus » follow the search.
 */
export function adminSearchCondition(search: string | undefined, columns: AnyColumn[]): SQL | undefined {
  const patterns = adminSearchPatterns(search);
  if (!patterns.length) return undefined;
  const unaccented = columns.map(column => sql`translate(${column}, ${ACCENTED_AND_COMBINING}, ${UNACCENTED})`);
  return and(...patterns.map(pattern => or(...unaccented.map(column => sql`${column} ILIKE ${pattern}`))));
}
