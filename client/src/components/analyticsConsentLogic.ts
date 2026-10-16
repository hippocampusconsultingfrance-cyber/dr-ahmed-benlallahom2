import { readValidCookieConsent } from "./cookieConsentState";

export const COOKIE_CONSENT_CHANGE_EVENT = "cookie-consent-change";

/** Mesure d'audience uniquement avec un consentement « performance » daté et non expiré. */
export function shouldLoadAnalytics(storedConsent: string | null, now: number = Date.now()) {
  return readValidCookieConsent(storedConsent, now)?.performance === true;
}
