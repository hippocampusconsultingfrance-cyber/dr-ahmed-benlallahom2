/** A day in Paris, as the YYYY-MM-DD value of a date input. */
export const parisDay = (date: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));

/** Today in Paris, the bound of the admin's date inputs (an agreement, a renewal). */
export const todayInParis = () => parisDay(new Date());

/** A day (YYYY-MM-DD, Paris) a refusal of the server names, as that locale writes it: 24/10/2026, 24.10.2026, 2026/10/24. */
export const localeDay = (day: string, locale: string) => new Date(`${day}T12:00:00.000Z`).toLocaleDateString(locale, { timeZone: "Europe/Paris" });
