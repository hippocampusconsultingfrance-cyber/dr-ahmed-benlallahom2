import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UserLanguage } from "@/contexts/userPreferences";
import { cn } from "@/lib/utils";
import { getMenuFocusIndex, isNavigationDismissKey } from "./navigationKeyboard";
import { navigationAccessibilityCopy } from "./navigationAccessibilityCopy";

export const languageOptions: ReadonlyArray<{ code: UserLanguage; name: string; flag: string }> = [
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
];

/**
 * Offer made, in English, to a visitor whose browser declares no French and who has not chosen a
 * language (EN-08). "Stay in French" remembers French as the visitor's choice, which ends the offer.
 */
export const englishSuggestionCopy = {
  message: "This site is also available in English.",
  switchTo: "Switch to English",
  dismiss: "Stay in French",
} as const;

const toneClasses = {
  site: {
    button: "border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-background/50",
    menu: "bg-background border-border/50",
    current: "bg-primary text-primary-foreground",
    other: "text-foreground hover:bg-background/50",
    suggestion: "bg-background border-primary/40 text-foreground",
    suggestionAction: "text-primary",
  },
  // Espace candidat : fond sombre fixe, quel que soit le thème choisi.
  candidate: {
    button: "border-slate-700 text-slate-300 hover:text-white hover:border-cyan-300/50 hover:bg-slate-900/60",
    menu: "bg-slate-950 border-slate-700",
    current: "bg-cyan-500 text-slate-950",
    other: "text-slate-100 hover:bg-slate-900",
    suggestion: "bg-slate-950 border-cyan-300/40 text-slate-100",
    suggestionAction: "text-cyan-300",
  },
} as const;

/**
 * Language dropdown of the site header, also placed on the pages that do not
 * show <Navigation> (booking, payment confirmation, candidate space, recruitment
 * unsubscribe, 404, maintenance) so that a visitor arriving from a shared link can switch (EN-03).
 * The page changes language where it is, without reloading (EN-10). Under the button, English is
 * offered to a visitor the site would otherwise only show in French (EN-08), unless the page hides
 * the offer while something opens over it (Navigation's mobile menu).
 */
export default function LanguageMenu({ className, tone = "site", hideSuggestion = false }: { className?: string; tone?: keyof typeof toneClasses; hideSuggestion?: boolean }) {
  const colors = toneClasses[tone];
  const { language, setLanguage, suggestEnglish } = useLanguage();
  const accessibilityCopy = navigationAccessibilityCopy[language as keyof typeof navigationAccessibilityCopy] ?? navigationAccessibilityCopy.fr;
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const currentLang = languageOptions.find((option) => option.code === language);
  const shownCode = (currentLang?.code ?? language).toUpperCase();
  const offerShown = suggestEnglish && !open && !hideSuggestion;
  const [offerWidth, setOfferWidth] = useState<number>();

  // L'offre pend du bord droit du bouton : sur un téléphone étroit, elle se rétrécit au lieu de sortir de l'écran.
  useLayoutEffect(() => {
    if (!offerShown) return;
    const fit = () => setOfferWidth(Math.min(256, (containerRef.current?.getBoundingClientRect().right ?? 272) - 16));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [offerShown]);

  /** The page changes language where it is; the focus, on an option or the offer that goes away, returns to the button. */
  const choose = (code: UserLanguage) => {
    setOpen(false);
    setLanguage(code);
    buttonRef.current?.focus();
  };

  // Fermer le menu quand on clique ailleurs
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    containerRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (!isNavigationDismissKey(event.key)) return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const currentIndex = menuItems.findIndex((item) => item === document.activeElement);
    const nextIndex = getMenuFocusIndex(currentIndex < 0 ? 0 : currentIndex, menuItems.length, event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    menuItems[nextIndex]?.focus();
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        ref={buttonRef}
        className={cn("nav-control flex shrink-0 items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border text-sm font-medium transition-all duration-200", colors.button)}
        title={accessibilityCopy.changeLanguage}
        // Le nom commence par le code affiché (« FR »), que dit un utilisateur de commande vocale (A11Y-18, WCAG 2.5.3).
        aria-label={`${shownCode} — ${accessibilityCopy.changeLanguage}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
      >
        <span className="text-base" aria-hidden="true">{currentLang?.flag}</span>
        <span>{shownCode}</span>
        <ChevronDown
          className="w-3.5 h-3.5 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        />
      </button>

      {/* Google, qui lit les pages avec un navigateur anglais, voit l'offre : data-nosnippet la garde hors de ses extraits. */}
      {offerShown && (
        <div lang="en" data-nosnippet="" style={{ width: offerWidth }} className={cn("nav-language-suggestion absolute right-0 top-full z-50 mt-2 flex w-64 items-start gap-2 rounded-lg border p-3 text-sm shadow-lg", colors.suggestion)}>
          <p className="min-w-0 flex-1 leading-5">
            {englishSuggestionCopy.message}{" "}
            <button type="button" onClick={() => choose("en")} className={cn("font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", colors.suggestionAction)}>
              {englishSuggestionCopy.switchTo}
            </button>
          </p>
          <button type="button" onClick={() => choose("fr")} className="shrink-0 rounded-md p-1 opacity-75 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={englishSuggestionCopy.dismiss} title={englishSuggestionCopy.dismiss}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {open && (
        <div id={menuId} onKeyDown={handleMenuKeyDown} className={cn("nav-language-menu absolute right-0 mt-2 w-48 border rounded-lg shadow-lg z-50 overflow-hidden", colors.menu)} role="menu" aria-label={accessibilityCopy.chooseLanguage}>
          {languageOptions.map((option) => (
            <button
              key={option.code}
              type="button"
              lang={option.code}
              onClick={() => choose(option.code)}
              role="menuitem"
              className={cn("w-full px-4 py-3 text-left text-sm font-medium transition-colors", language === option.code ? colors.current : colors.other)}
            >
              <span className="text-base mr-2" aria-hidden="true">{option.flag}</span>
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
