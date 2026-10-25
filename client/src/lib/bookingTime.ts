/**
 * Times of the booking pages: consultations are scheduled in Paris time, and
 * the visitor's own time is added when it differs (RES-04).
 */
const BOOKING_LOCALES: Record<string, string> = { fr: "fr-FR", en: "en-GB", de: "de-DE", zh: "zh-CN" };

export function getBookingLocale(language: string): string {
  return BOOKING_LOCALES[language] ?? "en-GB";
}

/** "2026-10-29" for an instant in a time zone (the browser's when omitted). */
function calendarDayIn(date: Date, timeZone?: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * The visitor's own time for an instant when their time zone does not show
 * the same time as Paris: "22:00", or "ven. 02:30" when the day also differs;
 * null in France, Belgium… `timeZone` defaults to the browser's.
 */
export function formatVisitorTime(date: Date, locale: string, timeZone?: string): string | null {
  const format = (options: Intl.DateTimeFormatOptions, zone?: string) => new Intl.DateTimeFormat(locale, { ...options, hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(date);
  if (calendarDayIn(date, timeZone) !== calendarDayIn(date, "Europe/Paris")) return format({ weekday: "short" }, timeZone);
  const localTime = format({}, timeZone);
  return localTime === format({}, "Europe/Paris") ? null : localTime;
}
