/**
 * Choix de l'utilisateur sur les traceurs soumis à consentement.
 *
 * Seule la mesure d'audience (« performance ») est optionnelle. La langue, le thème, le
 * mode OLED et la lisibilité renforcée sont des préférences d'interface demandées par
 * l'utilisateur : stockage fonctionnel exempté de consentement (CNIL), qui n'est donc plus
 * présenté comme une catégorie à cocher (PUB-COOKIE-04 / LEGAL-15). Le choix est daté et
 * redemandé après 6 mois en cas de refus, 13 mois en cas d'acceptation.
 */
export type CookieConsentValue = {
  essential: true;
  performance: boolean;
  /** Date ISO du choix ; absente pour un choix antérieur à l'horodatage. */
  decidedAt?: string;
};

export const COOKIE_CONSENT_STORAGE_KEY = "cookieConsent";
/** Durées de validité recommandées par la CNIL. */
export const COOKIE_REFUSAL_VALIDITY_DAYS = 182;
export const COOKIE_ACCEPTANCE_VALIDITY_DAYS = 395;

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeCookieConsent(value: unknown): CookieConsentValue | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.performance !== "boolean") return null;
  // L'ancien champ « preferences » est ignoré : il n'avait aucun effet.
  const decidedAt = typeof candidate.decidedAt === "string" && !Number.isNaN(Date.parse(candidate.decidedAt)) ? candidate.decidedAt : undefined;
  return decidedAt ? { essential: true, performance: candidate.performance, decidedAt } : { essential: true, performance: candidate.performance };
}

export function createCookieConsent(performance: boolean, now: Date = new Date()): CookieConsentValue {
  return { essential: true, performance, decidedAt: now.toISOString() };
}

/** Un choix non daté (ancien format) ou trop ancien doit être redemandé. */
export function isCookieConsentExpired(consent: CookieConsentValue, now: number = Date.now()): boolean {
  if (!consent.decidedAt) return true;
  const ageDays = (now - Date.parse(consent.decidedAt)) / DAY_MS;
  return ageDays > (consent.performance ? COOKIE_ACCEPTANCE_VALIDITY_DAYS : COOKIE_REFUSAL_VALIDITY_DAYS);
}

/** Consentement mémorisé et toujours valable, sinon null. */
export function readValidCookieConsent(stored: string | null, now: number = Date.now()): CookieConsentValue | null {
  if (!stored) return null;
  try {
    const consent = normalizeCookieConsent(JSON.parse(stored));
    return consent && !isCookieConsentExpired(consent, now) ? consent : null;
  } catch {
    return null;
  }
}

export function shouldShowCookiePreferences(showBanner: boolean) {
  return !showBanner;
}
