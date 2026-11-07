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
