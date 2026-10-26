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
  // Analyses saved by the earlier recruitment-v5-verified-evidence prompt.
  [/^Score non présenté : la couverture de preuves vérifiées est insuffisante/, "Score non présenté : la couverture des citations trouvées dans le texte lu par l’outil est insuffisante"],
];

/** Extraction warnings about the text left out of the analysis (IA-01) and the pages read by the vision, in the admin's words; others stay as stored. */
const EXTRACTION_WARNING_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^invisible_text_ignored:(\d+)$/, "$1 caractère(s) de texte invisible écarté(s) de l’analyse"],
  [/^unverifiable_text_set_aside:(\d+)$/, "$1 caractère(s) non vérifiable(s) écarté(s) de l’analyse"],
  [/^pdf_font_not_drawable$/, "police non incorporée au PDF que l’outil ne sait pas dessiner : son texte n’a pas pu être vérifié"],
  [/^pdf_text_faint$/, "mots d’une ligne visible recouverts en grande partie ou trop peu marqués pour être lus avec certitude"],
  [/^pdf_text_on_image$/, "texte sans encre posé sur une image, comme la couche OCR d’un scan : sa page est relue par la lecture visuelle quand il en fait l’essentiel, ou quand le reste est trop court"],
  [/^pdf_visibility_check_unfinished$/, "contrôle de visibilité non terminé (document long ou lourd) : le texte non contrôlé est écarté"],
  [/^pdf_text_unmatched$/, "texte que l’outil n’a pas pu rattacher à son dessin"],
  [/^docx_white_text_near_drawing$/, "texte blanc ou peu contrasté sur un fond incertain : zone de texte, image ou forme proche, style de tableau"],
  [/^pdf_visibility_check_unavailable$/, "texte lu sans contrôle de visibilité (lecteur isolé indisponible)"],
  [/^pdf_text_page_(\d+)_insufficient_text$/, "page $1 : texte insuffisant"],
  [/^vision_ocr_fallback$/, "pages relues par la lecture visuelle, le texte du PDF étant trop court une fois le texte écarté retiré"],
  [/^vision_ocr_pages:([\d,]+)$/, "page(s) $1 relue(s) par la lecture visuelle (scan sous sa couche de texte)"],
  // 3 pages until the vision read up to 8 (IA-01).
  [/^vision_ocr_first_(\d+)_pages_only$/, "seules les $1 premières pages ont été lues par la lecture visuelle"],
  [/^vision_ocr_no_rendered_pages$/, "aucune page n’a pu être dessinée pour la lecture visuelle"],
  [/^page_(\d+):(.+)$/, "page $1 (lecture visuelle) : $2"],
  // Saved before these warnings were named.
  [/^pdf_visibility_check_incomplete$/, "contrôle de visibilité incomplet (police non incorporée ou pages non contrôlées)"],
  [/^white_text_on_drawing_kept:(\d+)$/, "$1 caractère(s) de texte blanc posé sur une image, lus sans contrôle"],
];

export function extractionWarningLabel(warning: string) {
  const known = EXTRACTION_WARNING_LABELS.find(([code]) => code.test(warning));
  return known ? warning.replace(known[0], known[1]) : warning;
}

export function cvReadingTextForDisplay(text: string) {
  return LEGACY_CV_READING_WORDING.reduce((current, [legacy, wording]) => current.replace(legacy, wording), text);
}
