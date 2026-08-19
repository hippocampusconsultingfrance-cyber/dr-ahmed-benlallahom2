import { useEffect } from "react";
import { COOKIE_CONSENT_STORAGE_KEY } from "./cookieConsentState";
import { COOKIE_CONSENT_CHANGE_EVENT, shouldLoadAnalytics } from "./analyticsConsent";

const ANALYTICS_SCRIPT_ID = "consent-managed-analytics";

function syncAnalyticsScript() {
  const existing = document.getElementById(ANALYTICS_SCRIPT_ID);
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

export default function AnalyticsConsent() {
  useEffect(() => {
    syncAnalyticsScript();
    const resync = () => syncAnalyticsScript();
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, resync);
    window.addEventListener("storage", resync);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, resync);
      window.removeEventListener("storage", resync);
    };
  }, []);

  return null;
}
