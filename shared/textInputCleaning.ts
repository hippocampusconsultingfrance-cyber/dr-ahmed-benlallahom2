/**
 * Step 1 of the text a public form takes (INTL-05, shared/textInput.ts),
 * without zod so that the pages apply it too, to an email address as it is
 * typed or pasted: normalised to NFC, without the spaces and the invisible
 * marks a paste leaves at either end (LRM and RLM, the zero-width space, the
 * byte order mark, the embeddings, overrides and isolates). Also compares a
 * value stored cleaned with the one a page kept as typed.
 */
// Written as escapes: none of these characters appears as such in the source.
const EDGE_MARKS = "\\s\\u200B\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF";
const EDGES = new RegExp(`^[${EDGE_MARKS}]+|[${EDGE_MARKS}]+$`, "g");

export function cleanTextInput(value: string): string {
  return value.normalize("NFC").replace(EDGES, "");
}

/**
 * What an email address, once cleaned, may not hold anywhere (INTL-05): the
 * controls, the zero-width characters, the direction marks, embeddings,
 * overrides and isolates, the word joiner and the byte order mark. The
 * server refuses it with the reason `invalid_characters` (emailText); the
 * booking page, which checks the address before sending, says the same.
 */
// eslint-disable-next-line no-control-regex -- control characters are among those it refuses
export const EMAIL_INVISIBLE_CHARACTER = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u2069\\uFEFF]");
