import { useEffect } from "react";
import { useLocation } from "wouter";
import { isPrivateAreaPath } from "@/lib/privateAreaRoutes";
import { COOKIE_CONSENT_STORAGE_KEY } from "./cookieConsentState";
import { COOKIE_CONSENT_CHANGE_EVENT, shouldLoadAnalytics } from "./analyticsConsentLogic";

export const ANALYTICS_SCRIPT_ID = "consent-managed-analytics";

function syncAnalyticsScript(privateArea: boolean) {
  const existing = document.getElementById(ANALYTICS_SCRIPT_ID);

  // Jamais de mesure d'audience sur /admin ni /candidate, même avec l'accord donné sur le site public
  // (ADM-16) : un script déjà exécuté suivrait la navigation, la page repart donc sans lui.
  if (privateArea) {
    if (existing) {
      existing.remove();
      window.location.reload();
    }
    return;
  }

  const permitted = shouldLoadAnalytics(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT?.replace(/\/$/, "");
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;

  if (!permitted || !endpoint || !websiteId) {
    existing?.remove();
    return;
  }

  if (existing) return;
  const script = document.createElement("script");
  script.id = ANALYTICS_SCRIPT_ID;
  script.defer = true;
  script.src = `${endpoint}/umami`;
  script.dataset.websiteId = websiteId;
  document.head.appendChild(script);
}

/** Loads the audience measurement after consent, and only while the current route is public. */
export default function AnalyticsConsent() {
  const [location] = useLocation();
  const privateArea = isPrivateAreaPath(location);

  useEffect(() => {
    syncAnalyticsScript(privateArea);
    const resync = () => syncAnalyticsScript(privateArea);
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, resync);
    window.addEventListener("storage", resync);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, resync);
      window.removeEventListener("storage", resync);
    };
  }, [privateArea]);

  return null;
}
