/**
 * A vault document whose text was partly left out before the AI read it
 * (IA-01, IA-06): invisible text, or text whose visibility could not be
 * established. The counts go to ai_flags as `code:characters`, the excerpts
 * to ai_extracted_data.hiddenText, for the admin to compare with the file.
 */
export const HIDDEN_TEXT_FLAGS = { invisible: "invisible_text_ignored", unverifiable: "unverifiable_text_set_aside" } as const;

/**
 * `unverifiable.share` 0: the pages holding that text were read by the vision
 * instead, nothing was left out. `unverifiable.unread`: when it read some of
 * them only, what stays left out.
 */
export type HiddenTextSummary = { characters: number; excerpt: string; unverifiable?: { characters: number; excerpt: string; share?: number; unread?: { characters: number; excerpt: string } } };

/** The text that could not be verified and stays left out of the analysis. */
const unverifiableLeftOut = (summary: HiddenTextSummary | undefined) => summary?.unverifiable?.unread ?? summary?.unverifiable;

export function hiddenTextFlags(summary: HiddenTextSummary | undefined): string[] {
  const leftOut = summary?.unverifiable?.share !== 0 ? unverifiableLeftOut(summary) : undefined;
  return [
    ...(summary?.characters ? [`${HIDDEN_TEXT_FLAGS.invisible}:${summary.characters}`] : []),
    ...(leftOut?.characters ? [`${HIDDEN_TEXT_FLAGS.unverifiable}:${leftOut.characters}`] : []),
  ];
}

/**
 * The admin's wording of such a flag, in their language (`{count}` is
 * replaced by the number of characters); null for any other flag.
 */
export function hiddenTextFlagLabel(
  flag: string,
  extractedData: string | null | undefined,
  wording: { invisible: string; unverifiable: string; excerpt: string; compare: string },
): string | null {
  const match = new RegExp(`^(${HIDDEN_TEXT_FLAGS.invisible}|${HIDDEN_TEXT_FLAGS.unverifiable}):(\\d+)$`).exec(flag);
  if (!match) return null;
  const invisible = match[1] === HIDDEN_TEXT_FLAGS.invisible;
  let hiddenText: HiddenTextSummary | undefined;
  try {
    hiddenText = (JSON.parse(extractedData ?? "null") as { hiddenText?: HiddenTextSummary } | null)?.hiddenText;
  } catch {
    hiddenText = undefined;
  }
  const excerpt = invisible ? hiddenText?.excerpt : unverifiableLeftOut(hiddenText)?.excerpt;
  return `${(invisible ? wording.invisible : wording.unverifiable).replace("{count}", match[2]!)}${excerpt ? ` (${wording.excerpt} : « ${excerpt} »)` : ""}, ${wording.compare}`;
}
