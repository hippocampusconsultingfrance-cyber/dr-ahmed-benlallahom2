// The tool only checks that a quote appears in the text it read from the CV.
// That text can hold passages nobody sees on screen, so a quote found there
// is something to compare with the CV, never a verified fact (IA-01).
export const CV_REVIEW_REMINDER = "Ouvrir le CV avant toute shortlist : les citations viennent du texte lu par l’outil, qui peut contenir des passages invisibles à l’écran.";

export function fieldEvidenceStatusLabel(item: { sourceLocation?: string; evidenceVerified?: boolean }) {
  if (item.sourceLocation === "formulaire de candidature") return "Donnée déclarée, non vérifiée dans le CV";
  return item.evidenceVerified ? "Citation trouvée dans le texte lu par l’outil (à comparer au CV)" : "Citation à vérifier manuellement";
}

export function contradictionEvidenceLabel(evidenceVerified: boolean | undefined) {
  return evidenceVerified ? "citation trouvée dans le texte lu par l’outil" : "citation à vérifier";
}
