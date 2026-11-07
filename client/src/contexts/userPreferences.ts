export const USER_LANGUAGES = ["fr", "en", "de", "zh"] as const;
export type UserLanguage = (typeof USER_LANGUAGES)[number];
export type UserTheme = "light" | "dark";

export function readLanguagePreference(value: string | null, fallback: UserLanguage): UserLanguage {
  return USER_LANGUAGES.includes(value as UserLanguage) ? (value as UserLanguage) : fallback;
}

/**
 * Language forced by a link (?lang=en|fr|de|zh), e.g. in an email or an English
 * post. Never derived from the browser language: Google crawls with an English
 * browser and would index English text under the prerendered French addresses (EN-03).
 */
export function readLanguageParameter(search: string): UserLanguage | null {
  const value = new URLSearchParams(search).get("lang")?.trim().toLowerCase();
  return USER_LANGUAGES.includes(value as UserLanguage) ? (value as UserLanguage) : null;
}

/**
 * Address to show once ?lang= has been applied and remembered (other parameters and the hash are kept);
 * null when there is none. Rebuilt from the full href so that it keeps the page's origin: a path such as
 * "//x" would otherwise read as another host and make history.replaceState throw.
 */
export function removeLanguageParameter(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has("lang")) return null;
  url.searchParams.delete("lang");
  return url.href;
}

/**
 * Language a page opens in, and whether the visitor chose it: a ?lang= link or a remembered choice
 * is one, the site's default is not (and is not remembered, so that shouldSuggestEnglish still applies).
 */
export function readInitialLanguage(search: string, stored: string | null, fallback: UserLanguage): { language: UserLanguage; chosen: boolean } {
  const linked = readLanguageParameter(search);
  if (linked) return { language: linked, chosen: true };
  return { language: readLanguagePreference(stored, fallback), chosen: USER_LANGUAGES.includes(stored as UserLanguage) };
}

/**
 * English is offered, never applied, to a visitor who has not chosen a language and whose browser
 * declares no French (EN-08): a switch made by the page itself would show Google, which crawls with
 * an English browser, English text under the French addresses (readLanguageParameter).
 */
export function shouldSuggestEnglish(language: UserLanguage, chosen: boolean, browserLanguages: readonly string[]): boolean {
  if (chosen || language !== "fr" || browserLanguages.length === 0) return false;
  return !browserLanguages.some(tag => /^fr(?:-|$)/i.test(tag.trim()));
}

export function readThemePreference(value: string | null, fallback: UserTheme): UserTheme {
  return value === "light" || value === "dark" ? value : fallback;
}
