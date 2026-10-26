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

/** « Licence DHA (extraite du CV par l’IA) », origins in the order above. */
export function recruitmentFactLabel(fact: RecruitmentFact) {
  const origins = RECRUITMENT_FACT_ORIGINS.filter(origin => fact.origins.includes(origin));
  return origins.length ? `${fact.name} (${origins.map(origin => RECRUITMENT_FACT_ORIGIN_LABELS[origin]).join(", ")})` : fact.name;
}
