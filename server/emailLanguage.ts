/**
 * Language of the emails sent to a patient or a candidate. The site is offered
 * in French, English, German and Chinese, but the emails exist in French and
 * English only: French when the page was in French, English otherwise
 * (EN-01, EN-02).
 */
export type EmailLanguage = "fr" | "en";

/** Languages a public page can send with a booking, an application or a candidate access request. */
export const SITE_LANGUAGES = ["fr", "en", "de", "zh"] as const;
export type SiteLanguage = (typeof SITE_LANGUAGES)[number];

/** French for "fr" (and rows stored before the column existed), English for en, de and zh. */
export function emailLanguageFor(language: string | null | undefined): EmailLanguage {
  return !language || language === "fr" ? "fr" : "en";
}

/** A link opened from an English email shows the English page (?lang=en, EN-03). */
export function withEmailLanguage(url: string, language: EmailLanguage): string {
  if (language === "fr" || !URL.canParse(url)) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("lang", language);
  return parsed.toString();
}
