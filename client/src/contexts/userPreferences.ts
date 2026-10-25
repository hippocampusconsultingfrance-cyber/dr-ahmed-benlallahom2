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

/** Address to show once ?lang= has been applied and remembered (other parameters and the hash are kept); null when there is none. */
export function removeLanguageParameter(pathname: string, search: string, hash: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.has("lang")) return null;
  params.delete("lang");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

export function getNextLanguage(language: UserLanguage): UserLanguage {
  return USER_LANGUAGES[(USER_LANGUAGES.indexOf(language) + 1) % USER_LANGUAGES.length];
}

export function readThemePreference(value: string | null, fallback: UserTheme): UserTheme {
  return value === "light" || value === "dark" ? value : fallback;
}
