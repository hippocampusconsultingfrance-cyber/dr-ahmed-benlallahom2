import type { UserLanguage } from "@/contexts/userPreferences";
import { PARIS_TIME_ZONE } from "@shared/parisTime";

/** The clock of every date of the administration: the practice's, whatever the browser's (ADM-07). */
export const ADMIN_TIME_ZONE = PARIS_TIME_ZONE;

const ADMIN_DATE_LOCALES: Record<UserLanguage, string> = {
  fr: "fr-FR",
  en: "en-GB",
  de: "de-DE",
  zh: "zh-CN",
};

/** How the zone follows the date, in each language of the admin. */
const PARIS_TIME_WORDING: Record<UserLanguage, (date: string) => string> = {
  fr: date => `${date} (heure de Paris)`,
  en: date => `${date} (Paris time)`,
  de: date => `${date} (Pariser Zeit)`,
  zh: date => `${date}（巴黎时间）`,
};

/**
 * « 31/10/2026 10:00 (heure de Paris) »: an instant read on the Paris clock,
 * without the seconds, its zone said, so that a message, a question or a
 * security event is dated as the appointments are, even from abroad (ADM-07).
 */
export function formatAdminDateTime(
  date: Date | string,
  language: UserLanguage = "fr"
): string {
  // The year in four digits in every language (German's short style writes « 24.12.26 »).
  const text = new Date(date).toLocaleString(
    ADMIN_DATE_LOCALES[language] ?? ADMIN_DATE_LOCALES.fr,
    {
      timeZone: ADMIN_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
  return (PARIS_TIME_WORDING[language] ?? PARIS_TIME_WORDING.fr)(text);
}

/** « 31/10/2026 »: the day of an instant on the Paris calendar, as the appointments' days (ADM-07). */
export function formatAdminDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("fr-FR", {
    timeZone: ADMIN_TIME_ZONE,
  });
}
