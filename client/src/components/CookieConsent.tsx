import { useState, useEffect } from "react";
import { Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { COOKIE_CONSENT_STORAGE_KEY, normalizeCookieConsent, shouldShowCookiePreferences, type CookieConsentValue } from "./cookieConsentState";

const cookieCopy = {
  fr: { title: "Gestion des cookies", description: "Vous pouvez accepter tous les cookies ou personnaliser vos préférences.", learnMore: "En savoir plus", essential: "Essentiels uniquement", customize: "Personnaliser", acceptAll: "Accepter tous les cookies", settings: "Préférences cookies", settingsDescription: "Vous pouvez modifier votre choix à tout moment. Les cookies essentiels restent actifs car ils permettent le fonctionnement du site.", performance: "Cookies de performance", performanceDescription: "Mesurent l’utilisation du site pour aider à l’améliorer.", preferences: "Cookies de préférence", preferencesDescription: "Mémorisent vos choix d’affichage, tels que la langue ou le thème.", save: "Enregistrer mes préférences", close: "Fermer" },
  en: { title: "Cookie settings", description: "You can accept all cookies or customise your preferences.", learnMore: "Learn more", essential: "Essential only", customize: "Customise", acceptAll: "Accept all cookies", settings: "Cookie preferences", settingsDescription: "You may change your choice at any time. Essential cookies remain active because they enable the website to operate.", performance: "Performance cookies", performanceDescription: "Measure site usage to help improve it.", preferences: "Preference cookies", preferencesDescription: "Remember display choices such as language or theme.", save: "Save my preferences", close: "Close" },
  de: { title: "Cookie-Einstellungen", description: "Sie können alle Cookies akzeptieren oder Ihre Einstellungen anpassen.", learnMore: "Mehr erfahren", essential: "Nur essenzielle", customize: "Anpassen", acceptAll: "Alle Cookies akzeptieren", settings: "Cookie-Präferenzen", settingsDescription: "Sie können Ihre Auswahl jederzeit ändern. Essenzielle Cookies bleiben aktiv, da sie den Betrieb der Website ermöglichen.", performance: "Performance-Cookies", performanceDescription: "Messen die Nutzung der Website, um sie zu verbessern.", preferences: "Präferenz-Cookies", preferencesDescription: "Speichern Anzeigeoptionen wie Sprache oder Theme.", save: "Einstellungen speichern", close: "Schließen" },
  zh: { title: "Cookie 设置", description: "您可以接受所有 Cookie，或自定义偏好设置。", learnMore: "了解更多", essential: "仅必要 Cookie", customize: "自定义", acceptAll: "接受所有 Cookie", settings: "Cookie 偏好设置", settingsDescription: "您可随时更改选择。为保证网站正常运行，必要 Cookie 将保持启用。", performance: "性能 Cookie", performanceDescription: "用于衡量网站使用情况，以帮助改进服务。", preferences: "偏好 Cookie", preferencesDescription: "用于记住语言或主题等显示偏好。", save: "保存我的偏好", close: "关闭" },
} as const;

export default function CookieConsent() {
  const { language } = useLanguage();
  const copy = cookieCopy[language as keyof typeof cookieCopy] || cookieCopy.fr;
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [cookieConsent, setCookieConsent] = useState<CookieConsentValue | null>(null);
  const [draftConsent, setDraftConsent] = useState<CookieConsentValue>({ essential: true, performance: false, preferences: false });

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!stored) {
      setShowBanner(true);
      return;
    }
    try {
      const consent = normalizeCookieConsent(JSON.parse(stored));
      if (!consent) throw new Error("invalid cookie consent");
      setCookieConsent(consent);
      setDraftConsent(consent);
    } catch {
      localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
      setShowBanner(true);
    }
  }, []);

  const saveConsent = (consent: CookieConsentValue) => {
    setCookieConsent(consent);
    setDraftConsent(consent);
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent));
    setShowBanner(false);
    setShowPreferences(false);
  };

  const handleAcceptAll = () => {
    saveConsent({
      essential: true,
      performance: true,
      preferences: true,
    });
  };

  const handleAcceptEssential = () => {
    saveConsent({
      essential: true,
      performance: false,
      preferences: false,
    });
  };

  const handleCustomize = () => {
    setDraftConsent(cookieConsent || { essential: true, performance: false, preferences: false });
    setShowPreferences(true);
  };

  return (
    <>
      {showBanner && <div className="cookie-consent-banner fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background shadow-lg animate-in slide-in-from-bottom duration-300" role="dialog" aria-label={copy.title} aria-live="polite">
        <div className="container max-w-4xl px-4 py-6"><div className="flex items-start justify-between gap-4"><div className="flex-1"><h3 className="mb-2 font-semibold text-foreground">{copy.title}</h3><p className="mb-4 text-sm text-muted-foreground">{copy.description}<a href="/legal?tab=privacy#cookies" className="ml-1 text-primary hover:underline">{copy.learnMore}</a></p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={handleAcceptEssential}>{copy.essential}</Button><Button size="sm" variant="outline" onClick={handleCustomize}>{copy.customize}</Button><Button size="sm" onClick={handleAcceptAll}>{copy.acceptAll}</Button></div></div><button onClick={() => setShowBanner(false)} className="text-muted-foreground transition-colors hover:text-foreground" aria-label={copy.close}><X size={20} /></button></div></div>
      </div>}

      {shouldShowCookiePreferences(showBanner) && <button type="button" onClick={handleCustomize} className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={copy.settings}><Settings2 className="h-4 w-4" aria-hidden="true" />{copy.settings}</button>}

      {showPreferences && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={copy.settings}><section className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-foreground">{copy.settings}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.settingsDescription}</p></div><button type="button" onClick={() => setShowPreferences(false)} className="text-muted-foreground hover:text-foreground" aria-label={copy.close}><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-4"><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4"><input type="checkbox" checked disabled className="mt-1 h-4 w-4 accent-primary" /><span><span className="font-medium text-foreground">{copy.essential}</span><span className="mt-1 block text-sm text-muted-foreground">{copy.settingsDescription}</span></span></label><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4"><input type="checkbox" checked={draftConsent.performance} onChange={event => setDraftConsent(current => ({ ...current, performance: event.target.checked }))} className="mt-1 h-4 w-4 accent-primary" /><span><span className="font-medium text-foreground">{copy.performance}</span><span className="mt-1 block text-sm text-muted-foreground">{copy.performanceDescription}</span></span></label><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4"><input type="checkbox" checked={draftConsent.preferences} onChange={event => setDraftConsent(current => ({ ...current, preferences: event.target.checked }))} className="mt-1 h-4 w-4 accent-primary" /><span><span className="font-medium text-foreground">{copy.preferences}</span><span className="mt-1 block text-sm text-muted-foreground">{copy.preferencesDescription}</span></span></label></div><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setShowPreferences(false)}>{copy.close}</Button><Button onClick={() => saveConsent(draftConsent)}>{copy.save}</Button></div></section></div>}
    </>
  );
}
