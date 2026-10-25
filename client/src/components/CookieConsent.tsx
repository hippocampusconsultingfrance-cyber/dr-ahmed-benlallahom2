import { Settings2, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent, readValidCookieConsent, shouldShowCookiePreferences, type CookieConsentValue } from "./cookieConsentState";
import { COOKIE_CONSENT_CHANGE_EVENT } from "./analyticsConsentLogic";

export const COOKIE_BANNER_OPEN_ATTRIBUTE = "data-cookie-banner-open";
export const COOKIE_BANNER_HEIGHT_PROPERTY = "--cookie-banner-height";

type CookieBannerRoot = Pick<HTMLElement, "setAttribute" | "removeAttribute">;

export function syncCookieBannerOpenAttribute(root: CookieBannerRoot, isOpen: boolean) {
  if (isOpen) {
    root.setAttribute(COOKIE_BANNER_OPEN_ATTRIBUTE, "true");
    return;
  }
  root.removeAttribute(COOKIE_BANNER_OPEN_ATTRIBUTE);
}

type CookieBannerHeightRoot = { style: Pick<CSSStyleDeclaration, "setProperty" | "removeProperty"> };

/**
 * Tient à jour sur la racine la hauteur réelle du bandeau ouvert, que la page laisse libre en bas
 * (index.css) ; renvoie la fonction qui arrête le suivi et retire la valeur.
 */
export function trackCookieBannerHeight(root: CookieBannerHeightRoot, banner: HTMLElement, Observer: typeof ResizeObserver | undefined = globalThis.ResizeObserver) {
  const syncHeight = () => root.style.setProperty(COOKIE_BANNER_HEIGHT_PROPERTY, `${banner.offsetHeight}px`);
  syncHeight();
  const observer = Observer ? new Observer(syncHeight) : null;
  observer?.observe(banner);
  return () => {
    observer?.disconnect();
    root.style.removeProperty(COOKIE_BANNER_HEIGHT_PROPERTY);
  };
}

/** Ancre de la section cookies de la politique de confidentialité (LegalPage, 4 langues). */
export const COOKIE_POLICY_HREF = "/legal?tab=privacy#cookies";

// Seule la mesure d'audience est soumise à consentement : la langue, le thème et la lisibilité
// sont un stockage fonctionnel exempté, décrit comme tel au lieu d'une case sans effet (PUB-COOKIE-04).
export const cookieCopy = {
  fr: { title: "Gestion des cookies", description: "Avec votre accord, nous mesurons l’audience du site afin de l’améliorer. Vous pouvez accepter, refuser ou personnaliser ce choix, puis le modifier à tout moment.", learnMore: "En savoir plus", essential: "Essentiels uniquement", customize: "Personnaliser", acceptAll: "Accepter tous les cookies", settings: "Préférences cookies", settingsDescription: "Vous pouvez modifier votre choix à tout moment depuis le bouton « Préférences cookies ».", essentialDescription: "Toujours actifs : sécurité, anti-robot des formulaires et mémorisation de votre choix.", performance: "Mesure d’audience", performanceDescription: "Statistiques de fréquentation anonymisées pour améliorer le site. Désactivée par défaut.", functional: "Préférences d’affichage", functionalDescription: "La langue, le thème et la lisibilité que vous choisissez sont enregistrés sur votre appareil pour fournir le service demandé. Ce stockage fonctionnel est exempté de consentement et ne sert à aucun suivi.", save: "Enregistrer mes préférences", close: "Fermer" },
  en: { title: "Cookie settings", description: "With your consent, we measure site traffic to improve the site. You can accept, refuse or customise this choice and change it at any time.", learnMore: "Learn more", essential: "Essential only", customize: "Customise", acceptAll: "Accept all cookies", settings: "Cookie preferences", settingsDescription: "You can change your choice at any time with the “Cookie preferences” button.", essentialDescription: "Always on: security, form bot protection and remembering your choice.", performance: "Audience measurement", performanceDescription: "Anonymised traffic statistics used to improve the site. Off by default.", functional: "Display preferences", functionalDescription: "The language, theme and readability you choose are stored on your device to provide the service you asked for. This functional storage is exempt from consent and is never used for tracking.", save: "Save my preferences", close: "Close" },
  de: { title: "Cookie-Einstellungen", description: "Mit Ihrer Zustimmung messen wir die Nutzung der Website, um sie zu verbessern. Sie können zustimmen, ablehnen oder die Auswahl anpassen und jederzeit ändern.", learnMore: "Mehr erfahren", essential: "Nur essenzielle", customize: "Anpassen", acceptAll: "Alle Cookies akzeptieren", settings: "Cookie-Präferenzen", settingsDescription: "Sie können Ihre Auswahl jederzeit über die Schaltfläche „Cookie-Präferenzen“ ändern.", essentialDescription: "Immer aktiv: Sicherheit, Bot-Schutz der Formulare und Speicherung Ihrer Auswahl.", performance: "Reichweitenmessung", performanceDescription: "Anonymisierte Besuchsstatistiken zur Verbesserung der Website. Standardmäßig deaktiviert.", functional: "Anzeigeeinstellungen", functionalDescription: "Die von Ihnen gewählte Sprache, das Design und die Lesbarkeit werden auf Ihrem Gerät gespeichert, um den gewünschten Dienst zu erbringen. Diese funktionale Speicherung ist einwilligungsfrei und dient keinem Tracking.", save: "Einstellungen speichern", close: "Schließen" },
  zh: { title: "Cookie 设置", description: "经您同意，我们会统计网站访问量以改进网站。您可以接受、拒绝或自定义此选择，并可随时更改。", learnMore: "了解更多", essential: "仅必要 Cookie", customize: "自定义", acceptAll: "接受所有 Cookie", settings: "Cookie 偏好设置", settingsDescription: "您可随时通过“Cookie 偏好设置”按钮更改选择。", essentialDescription: "始终启用：安全、表单防机器人保护以及记住您的选择。", performance: "访问量统计", performanceDescription: "用于改进网站的匿名访问统计，默认关闭。", functional: "显示偏好", functionalDescription: "您选择的语言、主题和可读性设置保存在您的设备上，用于提供您所请求的服务。此类功能性存储无需同意，且不用于任何跟踪。", save: "保存我的偏好", close: "关闭" },
} as const;

export default function CookieConsent({ showPreferencesShortcut = true }: { showPreferencesShortcut?: boolean } = {}) {
  const { language } = useLanguage();
  const copy = cookieCopy[language as keyof typeof cookieCopy] || cookieCopy.fr;
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [cookieConsent, setCookieConsent] = useState<CookieConsentValue | null>(null);
  const [draftPerformance, setDraftPerformance] = useState(false);
  const preferencesTriggerRef = useRef<HTMLElement | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Choix absent, illisible, non daté ou expiré (6 mois si refus, 13 mois si accord) : on redemande.
    const consent = readValidCookieConsent(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
    if (!consent) {
      localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
      setShowBanner(true);
      return;
    }
    setCookieConsent(consent);
    setDraftPerformance(consent.performance);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    syncCookieBannerOpenAttribute(root, showBanner);
    return () => root.removeAttribute(COOKIE_BANNER_OPEN_ATTRIBUTE);
  }, [showBanner]);

  useEffect(() => {
    if (!showBanner || !bannerRef.current) return;
    return trackCookieBannerHeight(document.documentElement, bannerRef.current);
  }, [showBanner]);

  const saveConsent = (performance: boolean) => {
    const withdrawn = cookieConsent?.performance === true && !performance;
    const consent = createCookieConsent(performance);
    setCookieConsent(consent);
    setDraftPerformance(performance);
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent));
    window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGE_EVENT));
    setShowBanner(false);
    setShowPreferences(false);
    // Un script de mesure déjà exécuté continuerait de suivre la navigation : rechargement au retrait.
    if (withdrawn) window.location.reload();
  };

  const handleAcceptAll = () => saveConsent(true);

  const handleAcceptEssential = () => saveConsent(false);

  const handleCustomize = (event?: MouseEvent<HTMLElement>) => {
    preferencesTriggerRef.current = event?.currentTarget ?? document.activeElement as HTMLElement | null;
    setDraftPerformance(cookieConsent?.performance ?? false);
    setShowPreferences(true);
  };

  const closePreferences = () => {
    setShowPreferences(false);
  };

  return (
    <>
      {showBanner && <div ref={bannerRef} className="cookie-consent-banner fixed bottom-0 left-0 right-0 z-50 border-t border-primary/30 bg-background/98 shadow-2xl backdrop-blur-sm animate-in slide-in-from-bottom duration-300" role="dialog" aria-label={copy.title} aria-live="polite">
        <div className="container max-w-4xl px-4 py-6"><div className="flex items-start justify-between gap-4"><div className="flex-1"><h2 className="mb-2 text-base font-semibold text-foreground">{copy.title}</h2><p className="mb-4 text-sm text-muted-foreground">{copy.description}<a href={COOKIE_POLICY_HREF} className="ml-1 font-medium text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{copy.learnMore}</a></p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={handleAcceptEssential}>{copy.essential}</Button><Button size="sm" variant="outline" onClick={handleCustomize}>{copy.customize}</Button><Button size="sm" onClick={handleAcceptAll}>{copy.acceptAll}</Button></div></div><button onClick={() => setShowBanner(false)} className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={copy.close}><X size={20} /></button></div></div>
      </div>}

      {showPreferencesShortcut && shouldShowCookiePreferences(showBanner) && <button type="button" onClick={handleCustomize} className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={copy.settings}><Settings2 className="h-4 w-4" aria-hidden="true" />{copy.settings}</button>}

      {/* Fenêtre modale Radix : focus initial dans la fenêtre, tabulation piégée, Échap pour fermer (PUB-A11Y-04). */}
      <Dialog open={showPreferences} onOpenChange={open => { if (!open) closePreferences(); }}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-6 sm:max-w-lg"
          onCloseAutoFocus={event => {
            // Rend le focus au bouton qui a ouvert la fenêtre (bandeau ou pastille).
            const trigger = preferencesTriggerRef.current;
            if (trigger?.isConnected) {
              event.preventDefault();
              trigger.focus();
            }
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-semibold text-foreground">{copy.settings}</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">{copy.settingsDescription}</DialogDescription>
            </div>
            <button type="button" onClick={closePreferences} className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={copy.close}><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          <div className="mt-2 space-y-4">
            <label className="flex items-start gap-3 rounded-xl border border-border p-4"><input type="checkbox" checked disabled className="mt-1 h-4 w-4 accent-primary" /><span><span className="font-medium text-foreground">{copy.essential}</span><span className="mt-1 block text-sm text-muted-foreground">{copy.essentialDescription}</span></span></label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4"><input type="checkbox" checked={draftPerformance} onChange={event => setDraftPerformance(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /><span><span className="font-medium text-foreground">{copy.performance}</span><span className="mt-1 block text-sm text-muted-foreground">{copy.performanceDescription}</span></span></label>
            <div className="rounded-xl border border-dashed border-border p-4" data-testid="cookie-functional-storage"><p className="font-medium text-foreground">{copy.functional}</p><p className="mt-1 text-sm text-muted-foreground">{copy.functionalDescription}</p></div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <a href={COOKIE_POLICY_HREF} className="text-sm font-medium text-primary underline underline-offset-2 hover:no-underline">{copy.learnMore}</a>
            <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={closePreferences}>{copy.close}</Button><Button onClick={() => saveConsent(draftPerformance)}>{copy.save}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
