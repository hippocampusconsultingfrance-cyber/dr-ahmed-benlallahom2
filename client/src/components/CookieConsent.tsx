import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [cookieConsent, setCookieConsent] = useState<{
    essential: boolean;
    performance: boolean;
    preferences: boolean;
  } | null>(null);

  useEffect(() => {
    // Vérifier si l'utilisateur a déjà donné son consentement
    const stored = localStorage.getItem("cookieConsent");
    if (stored) {
      setCookieConsent(JSON.parse(stored));
    } else {
      setShowBanner(true);
    }
  }, []);

  const handleAcceptAll = () => {
    const consent = {
      essential: true,
      performance: true,
      preferences: true,
    };
    setCookieConsent(consent);
    localStorage.setItem("cookieConsent", JSON.stringify(consent));
    setShowBanner(false);
  };

  const handleAcceptEssential = () => {
    const consent = {
      essential: true,
      performance: false,
      preferences: false,
    };
    setCookieConsent(consent);
    localStorage.setItem("cookieConsent", JSON.stringify(consent));
    setShowBanner(false);
  };

  const handleCustomize = () => {
    // Rediriger vers la page de politique de confidentialité avec l'onglet cookies
    window.location.href = "/legal?tab=privacy#cookies";
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div
      className="cookie-consent-banner fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-lg z-50 animate-in slide-in-from-bottom duration-300"
      role="dialog"
      aria-label="Gestion des cookies"
      aria-live="polite"
    >
      <div className="container max-w-4xl py-6 px-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground mb-2">
              🍪 Gestion des Cookies
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Nous utilisons des cookies pour améliorer votre expérience. Vous pouvez accepter tous les cookies ou personnaliser vos préférences.
              <a href="/legal?tab=privacy#cookies" className="text-primary hover:underline ml-1">
                En savoir plus
              </a>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleAcceptEssential}
              >
                Essentiels uniquement
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCustomize}
              >
                Personnaliser
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptAll}
              >
                Accepter tous les cookies
              </Button>
            </div>
          </div>
          <button
            onClick={() => setShowBanner(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Fermer le bandeau de cookies"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
