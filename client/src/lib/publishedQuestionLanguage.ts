import { readLanguagePreference, type UserLanguage } from "@/contexts/userPreferences";

/**
 * Language of a published question and its answer: that of the question, French when unknown (the
 * column's default). The library's card carries it in lang, and says it when it is not the page's;
 * the admin is told it beside the anonymised version, to write that version in it (EN-15, A11Y-13).
 */
export function publishedQuestionLanguage(language: string | null | undefined): UserLanguage {
  return readLanguagePreference(language ?? null, "fr");
}
