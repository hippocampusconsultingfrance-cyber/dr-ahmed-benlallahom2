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
