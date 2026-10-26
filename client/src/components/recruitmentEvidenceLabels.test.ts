import { describe, expect, it } from "vitest";
import { contradictionEvidenceLabel, CV_READING_LABELS, CV_REVIEW_REMINDER, cvReadingTextForDisplay, extractionWarningLabel, fieldEvidenceStatusLabel, fieldEvidenceStatusTone } from "./recruitmentEvidenceLabels";

describe("libellés des preuves IA d’un CV (IA-01)", () => {
  it("une citation retrouvée dans le texte lu n’est jamais présentée comme vérifiée", () => {
    expect(fieldEvidenceStatusLabel({ sourceLocation: "page 1", evidenceVerified: true })).toBe("Citation trouvée dans le texte lu par l’outil (à comparer au CV)");
    expect(fieldEvidenceStatusLabel({ sourceLocation: "page 1", evidenceVerified: false })).toBe("Citation à vérifier manuellement");
    expect(fieldEvidenceStatusLabel({ evidenceVerified: undefined })).toBe("Citation à vérifier manuellement");
    expect(contradictionEvidenceLabel(true)).toBe("citation trouvée dans le texte lu par l’outil");
    expect(contradictionEvidenceLabel(undefined)).toBe("citation à vérifier");
    for (const label of [fieldEvidenceStatusLabel({ evidenceVerified: true }), contradictionEvidenceLabel(true)]) expect(label).not.toMatch(/vérifiée/i);
  });

  it("une donnée du formulaire reste une déclaration, même avec une citation retrouvée", () => {
    expect(fieldEvidenceStatusLabel({ sourceLocation: "formulaire de candidature", evidenceVerified: true })).toBe("Donnée déclarée, non vérifiée dans le CV");
  });

  it("rappelle d’ouvrir le CV avant toute shortlist", () => {
    expect(CV_REVIEW_REMINDER).toMatch(/^Ouvrir le CV avant toute shortlist/);
  });

  it("n’affiche jamais en vert une citation trouvée dans le texte lu", () => {
    expect(fieldEvidenceStatusTone({ sourceLocation: "page 1", evidenceVerified: true })).toBe("text-foreground");
    expect(fieldEvidenceStatusTone({ sourceLocation: "page 1", evidenceVerified: false })).toBe("text-amber-700 dark:text-amber-300");
    expect(fieldEvidenceStatusTone({ sourceLocation: "formulaire de candidature", evidenceVerified: true })).toBe("text-amber-700 dark:text-amber-300");
    for (const evidenceVerified of [true, false, undefined]) expect(fieldEvidenceStatusTone({ evidenceVerified })).not.toMatch(/emerald|green/);
  });

  it("ne titre aucune partie de la lecture du CV comme vérifiée", () => {
    for (const label of Object.values(CV_READING_LABELS)) expect(label).not.toMatch(/vérifi/i);
    expect(CV_READING_LABELS.profile).toBe("Profil trouvé dans le texte lu par l’outil");
    expect(CV_READING_LABELS.strengths).toMatch(/\(à comparer au CV\)$/);
  });

  it("affiche avec le libellé actuel les analyses déjà enregistrées qui disaient « vérifié »", () => {
    expect(cvReadingTextForDisplay("Lecture automatisée : 10 citation(s) vérifiée(s) sur 10. 3 expérience(s), 2 certification(s) et 1 langue(s) disposent d’une preuve exploitable. Revue humaine obligatoire."))
      .toBe("Lecture automatisée : 10 citation(s) sur 10 trouvée(s) dans le texte lu par l’outil, à comparer au CV. 3 expérience(s), 2 certification(s) et 1 langue(s) s’appuient sur une citation de ce texte. Revue humaine obligatoire.");
    expect(cvReadingTextForDisplay("Titre professionnel vérifié : Médecin anesthésiste-réanimateur.")).toBe("Titre professionnel trouvé dans le texte lu par l’outil : Médecin anesthésiste-réanimateur.");
    expect(cvReadingTextForDisplay("Spécialité(s) vérifiée(s) : Anesthésie.")).toBe("Spécialité(s) trouvée(s) dans le texte lu par l’outil : Anesthésie.");
    expect(cvReadingTextForDisplay("Compétence(s) vérifiée(s) : Réanimation, ALR.")).toBe("Compétence(s) trouvée(s) dans le texte lu par l’outil : Réanimation, ALR.");
    expect(cvReadingTextForDisplay("Langue(s) vérifiée(s) : Français, Anglais.")).toBe("Langue(s) trouvée(s) dans le texte lu par l’outil : Français, Anglais.");
    expect(cvReadingTextForDisplay("Certification(s) vérifiée(s) : ACLS.")).toBe("Certification(s) trouvée(s) dans le texte lu par l’outil : ACLS.");
    expect(cvReadingTextForDisplay("Score déterministe calculé uniquement à partir de faits professionnels vérifiés et rapprochés de la spécialité déclarée."))
      .toBe("Score déterministe calculé uniquement à partir de faits professionnels trouvés dans le texte lu par l’outil et rapprochés de la spécialité déclarée, à comparer au CV.");
    expect(cvReadingTextForDisplay("Score non présenté : les preuves vérifiées sont insuffisantes, contradictoires ou non rapprochées de la spécialité déclarée (50 % de couverture)."))
      .toBe("Score non présenté : les citations trouvées dans le texte lu par l’outil sont insuffisantes, contradictoires ou non rapprochées de la spécialité déclarée (50 % de couverture).");
    // Conclusion saved by the earlier recruitment-v5-verified-evidence prompt.
    expect(cvReadingTextForDisplay("Score non présenté : la couverture de preuves vérifiées est insuffisante (45 %)."))
      .toBe("Score non présenté : la couverture des citations trouvées dans le texte lu par l’outil est insuffisante (45 %).");
  });

  it("laisse intacts les textes actuels et ceux d’une autre origine", () => {
    for (const text of [
      "Lecture automatisée : 4 citation(s) sur 5 trouvée(s) dans le texte lu par l’outil, à comparer au CV. 1 expérience(s), 0 certification(s) et 1 langue(s) s’appuient sur une citation de ce texte. Revue humaine obligatoire.",
      "3 expérience(s) professionnelle(s) sourcée(s).",
      "Le texte du CV a été extrait avec succès. L’analyse IA complète est temporairement indisponible ; ce dossier doit être examiné manuellement.",
      "Compétence vérifiée : Réanimation, d’après le candidat.",
    ]) expect(cvReadingTextForDisplay(text)).toBe(text);
  });

  it("dit en clair, dans la fiche, le texte écarté de l’analyse et pourquoi, au lieu des codes bruts", () => {
    expect(extractionWarningLabel("invisible_text_ignored:571")).toBe("571 caractère(s) de texte invisible écarté(s) de l’analyse");
    expect(extractionWarningLabel("unverifiable_text_set_aside:74")).toBe("74 caractère(s) non vérifiable(s) écarté(s) de l’analyse");
    expect(extractionWarningLabel("pdf_font_not_drawable")).toBe("police non incorporée au PDF que l’outil ne sait pas dessiner : son texte n’a pas pu être vérifié");
    expect(extractionWarningLabel("pdf_visibility_check_unfinished")).toBe("contrôle de visibilité non terminé (document long ou lourd) : le texte non contrôlé est écarté");
    expect(extractionWarningLabel("pdf_text_page_3_insufficient_text")).toBe("page 3 : texte insuffisant");
    // Pages read by the vision, and what it noted on them.
    expect(extractionWarningLabel("vision_ocr_pages:2,3")).toBe("page(s) 2,3 relue(s) par la lecture visuelle (scan sous sa couche de texte)");
    expect(extractionWarningLabel("vision_ocr_first_3_pages_only")).toBe("seules les 3 premières pages ont été lues par la lecture visuelle");
    expect(extractionWarningLabel("page_2:tampon partiellement illisible")).toBe("page 2 (lecture visuelle) : tampon partiellement illisible");
    // Dossiers analysed before these warnings were named.
    expect(extractionWarningLabel("pdf_visibility_check_incomplete")).toBe("contrôle de visibilité incomplet (police non incorporée ou pages non contrôlées)");
    for (const code of ["pdf_text_on_image", "pdf_text_faint", "pdf_text_unmatched", "docx_white_text_near_drawing", "pdf_visibility_check_unavailable", "vision_ocr_fallback", "vision_ocr_no_rendered_pages", "white_text_on_drawing_kept:12"]) expect(extractionWarningLabel(code)).not.toMatch(/^[a-z_]+(:\d+)?$/);
    expect(extractionWarningLabel("legacy_doc_format_limited_extraction")).toBe("legacy_doc_format_limited_extraction");
  });
});
