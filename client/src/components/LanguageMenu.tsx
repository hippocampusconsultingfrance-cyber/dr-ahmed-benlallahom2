import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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

/** Remembers the choice and reloads the page so that it restarts in the new language. */
export function chooseLanguage(code: UserLanguage, current: UserLanguage) {
  if (code === current) return;
  localStorage.setItem("language", code);
  window.location.reload();
}

const toneClasses = {
  site: {
    button: "border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-background/50",
    menu: "bg-background border-border/50",
    current: "bg-primary text-primary-foreground",
    other: "text-foreground hover:bg-background/50",
  },
  // Espace candidat : fond sombre fixe, quel que soit le thème choisi.
  candidate: {
    button: "border-slate-700 text-slate-300 hover:text-white hover:border-cyan-300/50 hover:bg-slate-900/60",
    menu: "bg-slate-950 border-slate-700",
    current: "bg-cyan-500 text-slate-950",
    other: "text-slate-100 hover:bg-slate-900",
  },
} as const;

/**
 * Language dropdown of the site header, also placed on the pages that do not
 * show <Navigation> (booking, payment confirmation, candidate space, recruitment
 * unsubscribe, 404, maintenance) so that a visitor arriving from a shared link can switch (EN-03).
 */
export default function LanguageMenu({ className, tone = "site" }: { className?: string; tone?: keyof typeof toneClasses }) {
  const colors = toneClasses[tone];
  const { language } = useLanguage();
  const accessibilityCopy = navigationAccessibilityCopy[language as keyof typeof navigationAccessibilityCopy] ?? navigationAccessibilityCopy.fr;
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const currentLang = languageOptions.find((option) => option.code === language);

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
        aria-label={accessibilityCopy.changeLanguage}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
      >
        <span className="text-base" aria-hidden="true">{currentLang?.flag}</span>
        <span>{currentLang?.code.toUpperCase()}</span>
        <ChevronDown
          className="w-3.5 h-3.5 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={menuId} onKeyDown={handleMenuKeyDown} className={cn("nav-language-menu absolute right-0 mt-2 w-48 border rounded-lg shadow-lg z-50 overflow-hidden", colors.menu)} role="menu" aria-label={accessibilityCopy.chooseLanguage}>
          {languageOptions.map((option) => (
            <button
              key={option.code}
              type="button"
              lang={option.code}
              onClick={() => {
                setOpen(false);
                chooseLanguage(option.code, language);
              }}
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
