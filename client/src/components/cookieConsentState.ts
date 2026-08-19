export type CookieConsentValue = {
  essential: true;
  performance: boolean;
  preferences: boolean;
};

export const COOKIE_CONSENT_STORAGE_KEY = "cookieConsent";

export function normalizeCookieConsent(value: unknown): CookieConsentValue | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.performance !== "boolean" || typeof candidate.preferences !== "boolean") return null;
  return { essential: true, performance: candidate.performance, preferences: candidate.preferences };
}

export function shouldShowCookiePreferences(showBanner: boolean) {
  return !showBanner;
}
