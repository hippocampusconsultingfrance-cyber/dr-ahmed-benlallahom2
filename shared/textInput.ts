import { z } from "zod";
import { INVALID_CHARACTERS_REASON } from "./publicFormRefusalReasons";
import { cleanTextInput, EMAIL_INVISIBLE_CHARACTER } from "./textInputCleaning";

/**
 * INTL-05: the text a public form takes, on one line (names, phones,
 * countries, organisations) or on several (messages), in two steps.
 * 1. Cleaned without refusing: normalised to NFC, and the spaces and the
 *    invisible marks a paste leaves at either end removed: LRM and RLM
 *    (U+200E, U+200F), the zero-width space (U+200B), the byte order mark
 *    (U+FEFF), the embeddings, overrides and isolates (U+202A–U+202E,
 *    U+2066–U+2069).
 * 2. Refused, with the stable reason `invalid_characters`: the control
 *    characters C0, DEL and C1 (except, on several lines, the tab and the
 *    line breaks), the line and paragraph separators on one line, and the
 *    direction overrides LRO and RLO (U+202D, U+202E) left inside the text,
 *    which display a text other than the one stored (« Ali », RLO,
 *    « gnp.exe » shown « Ali exe.png »).
 * ZWJ and ZWNJ (U+200D, U+200C), which join emoji and Persian or Indic
 * letters, and the direction marks and isolates inside the text, which
 * mixed Arabic, Hebrew and Latin text uses, are kept. An email address
 * (emailText) is cleaned the same way, and keeps none of them inside.
 */
export const TEXT_INPUT_INVALID_CHARACTERS = INVALID_CHARACTERS_REASON;

/**
 * French message of that refusal, the one the pages show in French
 * (client/src/lib/publicFormCopy.ts), for a client that does not translate
 * its reason.
 */
export const TEXT_INPUT_INVALID_CHARACTERS_MESSAGE =
  "Un champ contient un saut de ligne ou un caractère invisible qui n’y est pas accepté, souvent laissé par un copier-coller : retapez ce texte au clavier, puis renvoyez le formulaire.";

// Step 1, NFC without the spaces and invisible marks at either end, which the pages apply too.
export { cleanTextInput };

// Written as escapes: none of these characters appears as such in the source.
const SINGLE_LINE_REFUSED = new RegExp(
  // eslint-disable-next-line no-control-regex -- control characters are among those it refuses
  "[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u202D\\u202E]"
);
const MULTI_LINE_REFUSED = new RegExp(
  // eslint-disable-next-line no-control-regex -- control characters are among those it refuses
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u202D\\u202E]"
);

function textInput(refused: RegExp, schema: z.ZodString) {
  return z
    .string()
    .transform(cleanTextInput)
    .refine(text => !refused.test(text), {
      message: TEXT_INPUT_INVALID_CHARACTERS,
    })
    .pipe(schema);
}

/**
 * A field on one line (name, phone, country, organisation), cleaned then
 * checked as above, then by `schema` (its lengths and messages).
 */
export function singleLineText(schema: z.ZodString = z.string()) {
  return textInput(SINGLE_LINE_REFUSED, schema);
}

/** A field on several lines (message, notes): tabs and line breaks allowed. */
export function multiLineText(schema: z.ZodString = z.string()) {
  return textInput(MULTI_LINE_REFUSED, schema);
}

/**
 * An email address, cleaned as the other fields (a pasted address keeps no
 * space nor direction mark at either end), then refused with the reason
 * `invalid_characters` if an invisible character remains inside it, then
 * checked by `schema` (its format and length): the page names the character
 * to type again rather than an address said invalid that looks complete.
 */
export function emailText(schema: z.ZodString) {
  // An address holds no invisible character at all (EMAIL_INVISIBLE_CHARACTER, which the booking page checks too).
  return textInput(EMAIL_INVISIBLE_CHARACTER, schema);
}

/** Whether a validation error (a ZodError) refuses a field for its characters. */
export function refusesTextInputCharacters(error: unknown): boolean {
  const issues =
    error && typeof error === "object"
      ? (error as { issues?: unknown }).issues
      : undefined;
  return (
    Array.isArray(issues) &&
    issues.some(
      issue =>
        (issue as { message?: unknown } | null)?.message ===
        TEXT_INPUT_INVALID_CHARACTERS
    )
  );
}
