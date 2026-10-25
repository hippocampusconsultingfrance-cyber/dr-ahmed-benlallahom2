// The tool only checks that a quote appears in the text it read from the CV.
// That text can hold passages nobody sees on screen, so a quote found there
// is something to compare with the CV, never a verified fact (IA-01).
export const CV_REVIEW_REMINDER = "Ouvrir le CV avant toute shortlist : les citations viennent du texte lu par l’outil, qui peut contenir des passages invisibles à l’écran.";

/** Headings of the CV reading in the candidate file: found in the text read, never "verified". */
export const CV_READING_LABELS = {
  summary: "Synthèse des citations trouvées dans le texte lu par l’outil",
  profile: "Profil trouvé dans le texte lu par l’outil",
  skills: "Compétences trouvées dans le texte lu par l’outil",
  noSkills: "Aucune compétence trouvée dans le texte lu par l’outil",
  credentials: "Certifications",
  strengths: "Éléments professionnels trouvés dans le texte lu par l’outil (à comparer au CV)",
} as const;

const FORM_SOURCE = "formulaire de candidature";

export function fieldEvidenceStatusLabel(item: { sourceLocation?: string; evidenceVerified?: boolean }) {
  if (item.sourceLocation === FORM_SOURCE) return "Donnée déclarée, non vérifiée dans le CV";
  return item.evidenceVerified ? "Citation trouvée dans le texte lu par l’outil (à comparer au CV)" : "Citation à vérifier manuellement";
}

/** Never green: a quote found in the text read is not a validated fact. */
export function fieldEvidenceStatusTone(item: { sourceLocation?: string; evidenceVerified?: boolean }) {
  return item.sourceLocation !== FORM_SOURCE && item.evidenceVerified ? "text-foreground" : "text-amber-700 dark:text-amber-300";
}

export function contradictionEvidenceLabel(evidenceVerified: boolean | undefined) {
  return evidenceVerified ? "citation trouvée dans le texte lu par l’outil" : "citation à vérifier";
}

// Analyses saved before this wording still call the server-generated summary,
// strengths and score justification "vérifié(e)s": they are shown with the
// current wording, without rewriting the database.
const LEGACY_CV_READING_WORDING: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Lecture automatisée : (\d+) citation\(s\) vérifiée\(s\) sur (\d+)\. /, "Lecture automatisée : $1 citation(s) sur $2 trouvée(s) dans le texte lu par l’outil, à comparer au CV. "],
  [/ disposent d’une preuve exploitable\. Revue humaine obligatoire\.$/, " s’appuient sur une citation de ce texte. Revue humaine obligatoire."],
  [/^Titre professionnel vérifié : /, "Titre professionnel trouvé dans le texte lu par l’outil : "],
  [/^(Spécialité|Compétence|Langue|Certification)\(s\) vérifiée\(s\) : /, "$1(s) trouvée(s) dans le texte lu par l’outil : "],
  [/^Score déterministe calculé uniquement à partir de faits professionnels vérifiés et rapprochés de la spécialité déclarée\.$/, "Score déterministe calculé uniquement à partir de faits professionnels trouvés dans le texte lu par l’outil et rapprochés de la spécialité déclarée, à comparer au CV."],
  [/^Score non présenté : les preuves vérifiées sont insuffisantes, /, "Score non présenté : les citations trouvées dans le texte lu par l’outil sont insuffisantes, "],
];

export function cvReadingTextForDisplay(text: string) {
  return LEGACY_CV_READING_WORDING.reduce((current, [legacy, wording]) => current.replace(legacy, wording), text);
}
