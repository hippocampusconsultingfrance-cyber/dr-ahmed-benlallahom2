/**
 * Where a certification or a language retained for a candidate comes from
 * (IA-02): the application form, the text the AI read in the CV (which can
 * hold passages invisible on screen, IA-01), or an admin who checked it. Shown
 * in the mission screen, the shortlist export and the certification filter;
 * only a confirmed certification earns points in a mission's matching.
 */
export const RECRUITMENT_FACT_ORIGINS = ["declared", "extracted", "confirmed"] as const;
export type RecruitmentFactOrigin = (typeof RECRUITMENT_FACT_ORIGINS)[number];

export const RECRUITMENT_FACT_ORIGIN_LABELS: Record<RecruitmentFactOrigin, string> = {
  declared: "déclarée par le candidat",
  extracted: "extraite du CV par l’IA",
  confirmed: "confirmée par l’admin",
};

export type RecruitmentFact = { name: string; origins: RecruitmentFactOrigin[] };

const comparable = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr-FR").trim();

/** Whether a searched term (the admin's certification filter) appears in a fact's name, case and accents aside. */
export function recruitmentFactNameContains(name: string, search: string) {
  const term = comparable(search);
  return term.length > 0 && comparable(name).includes(term);
}

/** The fact with its origins, in the order above, named by `labels` (a screen translated into the admin's language). */
export function recruitmentFactLabelWith(fact: RecruitmentFact, labels: Record<RecruitmentFactOrigin, string>) {
  const origins = RECRUITMENT_FACT_ORIGINS.filter(origin => fact.origins.includes(origin));
  return origins.length ? `${fact.name} (${origins.map(origin => labels[origin]).join(", ")})` : fact.name;
}

/** « Licence DHA (extraite du CV par l’IA) », origins in the order above. */
export const recruitmentFactLabel = (fact: RecruitmentFact) => recruitmentFactLabelWith(fact, RECRUITMENT_FACT_ORIGIN_LABELS);

/** Last moment a certification is valid (YYYY, YYYY-MM or YYYY-MM-DD), or null when the date cannot be read. */
export function certificationExpiry(expiresAt: string) {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(expiresAt.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 12;
  const day = match[3]
    ? Number(match[3])
    : new Date(Date.UTC(year, month, 0)).getUTCDate();
  const expiry = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return Number.isFinite(expiry.getTime()) ? expiry : null;
}

/** How precisely an expiry is known: to the day, the month or the year the CV or the admin gave. */
export type CertificationExpiryDate = { precision: "day" | "month" | "year"; date: string };

/**
 * A certification's expiry as every admin screen and the employer's file write
 * it (IA-02), in that locale: « 30/06/2027 » to the day, « mai 2023 » for a
 * month alone, « 2023 » for a year; the precision chooses the preposition
 * (« le 30/06/2027 », « en mai 2023 »). An unreadable date is given as stored.
 */
export function certificationExpiryDate(expiresAt: string, locale = "fr-FR"): CertificationExpiryDate {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(expiresAt.trim());
  const [year, month, day] = match ? [Number(match[1]), Number(match[2] ?? 1), Number(match[3] ?? 1)] : [0, 0, 0];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!match || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { precision: "day", date: expiresAt };
  const precision = match[3] ? "day" : match[2] ? "month" : "year";
  const parts: Intl.DateTimeFormatOptions = precision === "day" ? { day: "2-digit", month: "2-digit", year: "numeric" } : precision === "month" ? { month: "long", year: "numeric" } : { year: "numeric" };
  return { precision, date: new Intl.DateTimeFormat(locale, { ...parts, timeZone: "UTC" }).format(date) };
}

/** « le 30/06/2027 », « en mai 2023 », « en 2023 »: an expiry in the French of the admin sheet, its history and the employer's file. */
export function certificationExpiryInFrench(expiresAt: string) {
  const { precision, date } = certificationExpiryDate(expiresAt);
  return `${precision === "day" ? "le" : "en"} ${date}`;
}

/** A confirmed renewal's expiry lies at most this many years ahead (IA-02): a later one is a typing error. */
export const CERTIFICATION_RENEWAL_MAX_YEARS = 15;

/** The latest expiry a renewal confirmed on that day (YYYY-MM-DD, Paris) accepts: 2041-10-26 on 2026-10-26. */
export function latestCertificationRenewalDay(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year! + CERTIFICATION_RENEWAL_MAX_YEARS, month! - 1, day)).toISOString().slice(0, 10);
}

/**
 * Whether a certification is still valid: no date, or one not yet passed. An
 * unreadable date counts as expired. Shared by the CV analysis, a mission's
 * matching and the admin sheet, which offers to confirm the renewal of an
 * expired one.
 */
export function certificationDateIsCurrent(
  expiresAt: string | null | undefined,
  referenceDate = new Date()
) {
  if (!expiresAt) return true;
  const expiry = certificationExpiry(expiresAt);
  return expiry !== null && expiry >= referenceDate;
}

/**
 * « ACLS (extraite du CV par l’IA), expirée en mai 2023 »: a certification with
 * its origins and, when it has one, whether it is still valid, dated as the
 * admin screens date it, « selon le CV, à vérifier » when only a CV whose
 * analysis retained no facts gives that date. The employer's file and the
 * certification filter of the applications, in French (IA-02).
 */
export const certificationFactLabel = (fact: RecruitmentFact & { expiresAt?: string | null; expiryUnverified?: boolean }) => fact.expiresAt
  ? `${recruitmentFactLabel(fact)}, ${certificationDateIsCurrent(fact.expiresAt) ? "expire" : "expirée"} ${certificationExpiryInFrench(fact.expiresAt)}${fact.expiryUnverified ? " selon le CV, à vérifier" : ""}`
  : recruitmentFactLabel(fact);
