/** A day in Paris, as the YYYY-MM-DD value of a date input. */
export const parisDay = (date: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));

/** Today in Paris, the bound of the admin's date inputs (an agreement, a renewal). */
export const todayInParis = () => parisDay(new Date());
