import { MANUAL_REVIEW_FALLBACK_MODEL } from "@shared/recruitmentAiAnalysis";

/** Score chip of a dossier the AI provider refused to analyse (billing): no score was ever computed (REC-08). */
export const AI_ANALYSIS_UNAVAILABLE_LABEL = "Analyse IA indisponible";

/** True for a dossier saved without AI analysis, including those saved before the « degraded » status. */
export function isAiAnalysisUnavailable(application: { analysisStatus?: string | null; analysisModel?: string | null }) {
  return application.analysisStatus === "degraded" || application.analysisModel === MANUAL_REVIEW_FALLBACK_MODEL;
}

/** Heading and explanation of the dossiers a score threshold keeps although they have no verified score (INTL-02). */
export const SCORE_UNAVAILABLE_HEADING = "Score indisponible – à lire";
export const SCORE_UNAVAILABLE_EXPLANATION = "Ces dossiers n’ont pas de score vérifié (CV dans une autre langue, spécialité non reconnue, analyse en attente ou ancienne) : le seuil ne les écarte pas, lisez-les.";

/**
 * Order of an admin list read by score: the dossiers with a verified score
 * first, then those without one, which are no longer dropped by a threshold.
 * `firstUnscored` is where the « Score indisponible – à lire » heading goes
 * (-1 when every dossier has a score).
 */
export function scoredApplicationsFirst<T>(items: readonly T[], verifiedScore: (item: T) => number | null) {
  const scored = items.filter(item => verifiedScore(item) !== null);
  const unscored = items.filter(item => verifiedScore(item) === null);
  return { items: [...scored, ...unscored], firstUnscored: unscored.length > 0 ? scored.length : -1 };
}
