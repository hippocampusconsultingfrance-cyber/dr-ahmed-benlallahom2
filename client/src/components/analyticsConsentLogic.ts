import { normalizeCookieConsent } from "./cookieConsentState";

export const COOKIE_CONSENT_CHANGE_EVENT = "cookie-consent-change";

export function shouldLoadAnalytics(storedConsent: string | null) {
  if (!storedConsent) return false;
  try {
    return normalizeCookieConsent(JSON.parse(storedConsent))?.performance === true;
  } catch {
    return false;
  }
}
