export type TranslationLengthIssue = {
  key: string;
  length: number;
  maxLength: number;
};

export function findTranslationLengthIssues(
  labels: Record<string, string>,
  maxLength: number,
): TranslationLengthIssue[] {
  return Object.entries(labels)
    .map(([key, value]) => ({ key, length: Array.from(value).length, maxLength }))
    .filter(({ length }) => length > maxLength);
}
