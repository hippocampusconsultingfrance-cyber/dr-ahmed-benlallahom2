/**
 * ADM-02: how the admin search compares what is typed with the names, emails
 * and references of the lists, whatever the accents and the way they are
 * stored (composed « ễ », or « e » + combining accents pasted from a PDF).
 * Both sides are folded the same way: the words typed here
 * (foldAdminSearchText), each searched column in SQL with these same tables
 * (server/adminSearch.ts):
 * 1. canonical decomposition (NFD), which splits an accented letter into its
 *    base letter and its accents;
 * 2. removal of ADMIN_SEARCH_IGNORED_CHARACTERS (accents, Arabic harakat,
 *    invisible characters);
 * 3. the letters NFD leaves whole replaced by their base letter
 *    (ADMIN_SEARCH_LETTER_FOLDS), then the ligatures by two letters
 *    (ADMIN_SEARCH_LIGATURE_FOLDS).
 * The case is ignored by ILIKE.
 */

const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, index) => String.fromCharCode(first + index)).join("");

/**
 * Invisible characters a name can carry when pasted: soft hyphen, zero-width
 * spaces and joiners, direction marks and isolates, byte order mark.
 */
const INVISIBLE_CHARACTERS = "­؜᠎" + range(0x200b, 0x200f) + range(0x202a, 0x202e) + range(0x2060, 0x2064) + range(0x2066, 0x2069) + "﻿";

/**
 * Removed after the decomposition: the accents of the Latin, Greek and
 * Cyrillic letters and Vietnamese's stacked accents and horns (U+0300–U+036F);
 * the Arabic harakat (U+064B–U+0652, U+0670) and the madda and hamza that NFD
 * splits off أ إ آ (U+0653–U+0655), so these alefs are searched as ا; the
 * invisible characters.
 */
export const ADMIN_SEARCH_IGNORED_CHARACTERS = range(0x300, 0x36f) + range(0x64b, 0x655) + "ٰ" + INVISIBLE_CHARACTERS;

/** Letters without decomposition, searched as their base letter (Ø, Ł, Đ, dotless ı, alef wasla ٱ). */
export const ADMIN_SEARCH_LETTER_FOLDS: ReadonlyArray<readonly [string, string]> = [
  ["ø", "o"], ["Ø", "O"], ["ł", "l"], ["Ł", "L"], ["đ", "d"], ["Đ", "D"], ["ı", "i"], ["ٱ", "ا"],
];

/** Letters written as two (ß, Æ, Œ), searched as those two letters. */
export const ADMIN_SEARCH_LIGATURE_FOLDS: ReadonlyArray<readonly [string, string]> = [
  ["ß", "ss"], ["ẞ", "SS"], ["æ", "ae"], ["Æ", "AE"], ["œ", "oe"], ["Œ", "OE"],
];

const IGNORED = new Set(ADMIN_SEARCH_IGNORED_CHARACTERS);
const FOLDS = new Map<string, string>([...ADMIN_SEARCH_LETTER_FOLDS, ...ADMIN_SEARCH_LIGATURE_FOLDS]);

/** A text as the search compares it (see above), case aside. */
export function foldAdminSearchText(text: string): string {
  return Array.from(text.normalize("NFD"), character => IGNORED.has(character) ? "" : FOLDS.get(character) ?? character).join("");
}

const INVISIBLE = new Set(INVISIBLE_CHARACTERS);
/** Control characters other than the spaces (tab, line breaks), which separate the words like a space. */
const CONTROL_CHARACTER = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/;

/**
 * The words of a search, without their control and invisible characters; a
 * word left with nothing to compare (a lone accent) is dropped.
 */
export function adminSearchWords(search: string | undefined): string[] {
  return (search ?? "")
    .split(/\s+/)
    .map(word => Array.from(word, character => INVISIBLE.has(character) || CONTROL_CHARACTER.test(character) ? "" : character).join(""))
    .filter(word => foldAdminSearchText(word) !== "");
}

/**
 * The term the admin search box sends and shows (« … pour « dupont » »): the
 * words typed, accents kept, separated by one space. Empty, which means no
 * search, when no word is left (spaces only, a lone accent…).
 */
export function adminSearchTerm(text: string): string {
  return adminSearchWords(text).join(" ");
}
