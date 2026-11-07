/**
 * Size of a file in the page's language (EXPL-02): « 120 Ko » or « 1,5 Mo »
 * in French, « 120 KB » or « 1.5 MB » in English, with the units and the
 * decimal comma or point the page's copy and locale give, not « 0.00 MB »;
 * 0 for an empty file, at least 1 otherwise; two decimals at most, rounded up
 * above `maxBytes`, so that a file refused for a few bytes too many never
 * reads as the limit itself. Shared by the application form and the
 * candidate's vault.
 */
export function fileSizeLabel(bytes: number, locale: string, units: { kilobytes: string; megabytes: string }, maxBytes = Number.POSITIVE_INFINITY) {
  const kilobytes = bytes > 0 ? Math.max(1, Math.round(bytes / 1024)) : 0;
  if (kilobytes < 1024) return `${kilobytes.toLocaleString(locale)} ${units.kilobytes}`;
  const megabytes = bytes / (1024 * 1024);
  const shown = bytes > maxBytes ? Math.ceil(megabytes * 100) / 100 : megabytes;
  return `${shown.toLocaleString(locale, { maximumFractionDigits: 2 })} ${units.megabytes}`;
}
