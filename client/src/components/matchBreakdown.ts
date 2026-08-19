export const MATCH_BREAKDOWN_LABELS = {
  specialty: "Spécialité",
  mobility: "Mobilité",
  certifications: "Certifications",
  languages: "Langues",
  experience: "Expérience",
  availability: "Disponibilité",
} as const;

export type MatchBreakdown = Record<keyof typeof MATCH_BREAKDOWN_LABELS, number>;

export function getPositiveMatchBreakdown(breakdown: MatchBreakdown) {
  return (Object.entries(MATCH_BREAKDOWN_LABELS) as [keyof MatchBreakdown, string][])
    .map(([key, label]) => ({ key, label, points: breakdown[key] }))
    .filter(item => item.points > 0);
}
