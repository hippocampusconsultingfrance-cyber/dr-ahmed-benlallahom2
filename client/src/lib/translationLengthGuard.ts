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
    .filter(([, value]) => value.length > maxLength)
    .map(([key, value]) => ({ key, length: value.length, maxLength }));
}
