export const MATCH_BREAKDOWN_LABELS = {
  specialty: "Spécialité",
  mobility: "Mobilité",
  certifications: "Certifications",
  languages: "Langues",
  experience: "Expérience",
  availability: "Disponibilité",
} as const;

export type MatchBreakdown = Record<keyof typeof MATCH_BREAKDOWN_LABELS, number>;

/** The criteria that scored, named by `labels` (the mission screen's, in the admin's language). */
export function getPositiveMatchBreakdown(breakdown: MatchBreakdown, labels: Record<keyof MatchBreakdown, string> = MATCH_BREAKDOWN_LABELS) {
  return (Object.keys(MATCH_BREAKDOWN_LABELS) as Array<keyof MatchBreakdown>)
    .map(key => ({ key, label: labels[key], points: breakdown[key] }))
    .filter(item => item.points > 0);
}
