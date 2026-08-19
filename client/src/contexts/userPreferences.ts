export const USER_LANGUAGES = ["fr", "en", "de", "zh"] as const;
export type UserLanguage = (typeof USER_LANGUAGES)[number];
export type UserTheme = "light" | "dark";

export function readLanguagePreference(value: string | null, fallback: UserLanguage): UserLanguage {
  return USER_LANGUAGES.includes(value as UserLanguage) ? (value as UserLanguage) : fallback;
}

export function getNextLanguage(language: UserLanguage): UserLanguage {
  return USER_LANGUAGES[(USER_LANGUAGES.indexOf(language) + 1) % USER_LANGUAGES.length];
}

export function readThemePreference(value: string | null, fallback: UserTheme): UserTheme {
  return value === "light" || value === "dark" ? value : fallback;
}
