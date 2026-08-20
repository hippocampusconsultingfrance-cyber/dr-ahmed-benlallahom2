export function getLocalizedCopy<T>(catalog: Record<string, T>, language: string, fallbackLanguage: string): T {
  const fallback = catalog[fallbackLanguage];
  if (!fallback) throw new Error(`Missing localized fallback: ${fallbackLanguage}`);
  return catalog[language] ?? fallback;
}
