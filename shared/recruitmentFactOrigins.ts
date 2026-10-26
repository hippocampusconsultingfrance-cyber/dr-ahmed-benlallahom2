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
