/**
 * A vault document whose text was partly left out before the AI read it
 * (IA-01, IA-06): invisible text, or text whose visibility could not be
 * established. The counts go to ai_flags as `code:characters`, the excerpts
 * to ai_extracted_data.hiddenText, for the admin to compare with the file.
 */
export const HIDDEN_TEXT_FLAGS = { invisible: "invisible_text_ignored", unverifiable: "unverifiable_text_set_aside" } as const;

export type HiddenTextSummary = { characters: number; excerpt: string; unverifiable?: { characters: number; excerpt: string } };

export function hiddenTextFlags(summary: HiddenTextSummary | undefined): string[] {
  return [
    ...(summary?.characters ? [`${HIDDEN_TEXT_FLAGS.invisible}:${summary.characters}`] : []),
    ...(summary?.unverifiable?.characters ? [`${HIDDEN_TEXT_FLAGS.unverifiable}:${summary.unverifiable.characters}`] : []),
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
  const excerpt = invisible ? hiddenText?.excerpt : hiddenText?.unverifiable?.excerpt;
  return `${(invisible ? wording.invisible : wording.unverifiable).replace("{count}", match[2]!)}${excerpt ? ` (${wording.excerpt} : « ${excerpt} »)` : ""}, ${wording.compare}`;
}
