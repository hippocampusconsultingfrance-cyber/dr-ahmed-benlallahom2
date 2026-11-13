import { useState, useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Accessibility, ChevronDown, CircleDot, Menu, X, Sun, Moon, Search, SlidersHorizontal } from "lucide-react";
import { scrollToSectionTop } from "@/lib/scrollToSection";
import { cn } from "@/lib/utils";
import { isNavigationDismissKey } from "./navigationKeyboard";
import { navigationAccessibilityCopy } from "./navigationAccessibilityCopy";
import LanguageMenu from "./LanguageMenu";

const readabilityLabel = { fr: "Lisibilité renforcée", en: "High readability", de: "Verbesserte Lesbarkeit", zh: "高可读性模式" } as const;
const oledLabel = { fr: "Noir OLED", en: "OLED black", de: "OLED-Schwarz", zh: "OLED 黑色" } as const;

type DisplayToggle = { key: string; label: string; icon: ReactNode; pressed?: boolean; onClick: () => void };

const displayToggleClass = "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary aria-pressed:text-primary";

/**
 * Thème, lisibilité renforcée et noir OLED, regroupés derrière un seul bouton « Affichage » de l'en-tête (PUB-08).
 * Son état ouvert est tenu par Navigation, qui efface l'offre d'anglais (EN-08) que la fenêtre couvrirait.
 */
function DisplayMenu({ label, toggles, open, setOpen }: { label: string; toggles: DisplayToggle[]; open: boolean; setOpen: (open: boolean) => void }) {
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Clic ailleurs ou Échap : la fenêtre se ferme, Échap rend le focus au bouton.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (!isNavigationDismissKey(event.key)) return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpen est le setter d’état de Navigation, le même à chaque rendu : seule l’ouverture pose ou retire l’écoute
  }, [open]);

  if (toggles.length === 0) return null;
  return (
    // Tab past its last entry closes the window, which no longer covers the page under the header; a focus
    // lost to nothing (a click in Safari) leaves it to the click-outside handler above.
    <div ref={containerRef} className="relative hidden sm:block" onBlur={(event) => { if (open && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`nav-control nav-control-secondary inline-flex items-center justify-center rounded-full border p-2 transition-all duration-200 ${open ? "border-primary/40 text-foreground" : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
        title={label}
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} role="group" aria-label={label} className="nav-display-menu absolute right-0 z-50 mt-2 w-60 rounded-lg border border-border/50 bg-background p-1 shadow-lg">
          {toggles.map((toggle) => (
            <button key={toggle.key} type="button" onClick={toggle.onClick} aria-pressed={toggle.pressed} className={displayToggleClass}>
              {toggle.icon}
              {toggle.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Navigation() {
  const { content, language } = useLanguage();
  const { theme, toggleTheme, highReadability, toggleHighReadability, oledDark, toggleOledDark } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileDisplayOpen, setMobileDisplayOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const copyLanguage = (language in readabilityLabel ? language : "fr") as keyof typeof readabilityLabel;
  const accessibilityCopy = navigationAccessibilityCopy[language as keyof typeof navigationAccessibilityCopy] ?? navigationAccessibilityCopy.fr;
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  // Le thème, puis la lisibilité renforcée et le noir OLED (en thème sombre), avec leur état.
  const displayToggles: DisplayToggle[] = [];
  if (toggleTheme) displayToggles.push({ key: "theme", label: theme === "dark" ? accessibilityCopy.enableLight : accessibilityCopy.enableDark, icon: theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />, onClick: toggleTheme });
  if (toggleHighReadability) displayToggles.push({ key: "readability", label: readabilityLabel[copyLanguage], icon: <Accessibility className="h-4 w-4" aria-hidden="true" />, pressed: highReadability, onClick: toggleHighReadability });
  if (theme === "dark" && toggleOledDark) displayToggles.push({ key: "oled", label: oledLabel[copyLanguage], icon: <CircleDot className="h-4 w-4" aria-hidden="true" />, pressed: oledDark, onClick: toggleOledDark });

  // Libellés courts, visibles dès 1024 px (PUB-08) ; « Consultation » mène à la réservation.
  const pageLinks = [
    { href: "/questions-anesthesie", label: content.nav.healthQuestions },
    { href: "/recruitment", label: content.nav.recruitment },
    { href: "/employers", label: content.nav.employers },
  ];
  const homeSections = [
    { id: "experience", label: content.nav.experience },
    { id: "services", label: content.nav.services },
    { id: "education", label: content.nav.education },
  ];
  const desktopLinkClass = (current: boolean) => current
    ? "nav-link inline-flex h-10 items-center whitespace-nowrap text-sm font-medium text-primary transition-colors duration-200 hover:text-foreground relative after:absolute after:bottom-[2px] after:left-0 after:h-[2px] after:w-full after:bg-primary after:transition-all hover:after:bg-foreground"
    : "nav-link inline-flex h-10 items-center whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 relative after:absolute after:bottom-[2px] after:left-0 after:w-0 after:h-[2px] after:bg-primary after:transition-all hover:after:w-full";
  const mobileLinkClass = (current = false) => `nav-mobile-link text-left text-lg font-medium ${current ? "text-primary" : "text-foreground"} py-2 border-b border-border/20`;

  // Le menu de langue (LanguageMenu) et le menu Affichage gèrent eux-mêmes Échap ; ici, le menu mobile.
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (!isNavigationDismissKey(event.key)) return;
      if (mobileOpen) {
        event.preventDefault();
        setMobileOpen(false);
        mobileMenuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileOpen]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  /**
   * Les entrées sont de vrais liens (/#section) : sur l'accueil, un clic simple fait défiler jusqu'à la
   * section sans quitter la page ; ailleurs, ou ouvert dans un nouvel onglet, le lien est suivi.
   */
  const followSectionLink = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    setMobileOpen(false);
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.location.pathname !== "/" && window.location.pathname !== "") return;
    const el = document.getElementById(id);
    if (!el) return;
    event.preventDefault();
    scrollToSectionTop(el);
  };

  return (
    <header
      className={`site-nav fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/85 backdrop-blur-xl border-b border-border/40 shadow-2xl shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="container site-nav-container grid h-18 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 md:h-20 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        {/* Logo — larger, more prominent */}
        <a
          href="/"
          onClick={(event) => followSectionLink(event, "hero")}
          className="brand-lockup flex min-w-10 shrink-0 items-center gap-3 group justify-self-start"
          aria-label={accessibilityCopy.home}
        >
          <img
            src="/assets/abl-logo.svg"
            alt=""
            width={44}
            height={44}
            className="h-10 w-10 min-w-10 shrink-0 md:h-11 md:w-11 md:min-w-11 transition-transform group-hover:scale-105"
            loading="lazy"
          />
          <div className="hidden sm:block">
            <span className="abl-signature text-[10px] uppercase tracking-[0.28em] text-primary font-bold block mb-0.5">
              ABL / HIPPOCAMPUS
            </span>
            <span className="font-display text-lg font-bold text-foreground block leading-tight">
              Dr. Ben Lallahom
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
              MD, DESAIC
            </span>
          </div>
        </a>

        {/* Desktop Nav : dès 1024 px, les rubriques principales ; les sections de l'accueil restent dans le pied de page. */}
        <nav className="hidden lg:flex min-w-0 items-center justify-self-center gap-4 xl:gap-5" aria-label={accessibilityCopy.mainNavigation}>
          <a href="/booking" className={desktopLinkClass(false)}>{content.nav.consultation}</a>
          {pageLinks.map((item) => (
            <a key={item.href} href={item.href} className={desktopLinkClass(currentPath === item.href)} aria-current={currentPath === item.href ? "page" : undefined}>{item.label}</a>
          ))}
          <a href="/#contact" onClick={(event) => followSectionLink(event, "contact")} className={desktopLinkClass(false)}>{content.nav.contact}</a>
        </nav>

        {/* Actions */}
        <div className="flex min-w-0 items-center gap-1.5 justify-self-end sm:gap-2">
          {/*
            Language Dropdown : l'offre d'anglais (EN-08) s'efface tant que le menu mobile ou le menu Affichage
            s'ouvre à sa place, et dès que la page défile, pour ne pas rester au-dessus du contenu.
          */}
          <LanguageMenu hideSuggestion={mobileOpen || displayOpen || scrolled} />

          <DisplayMenu label={accessibilityCopy.display} toggles={displayToggles} open={displayOpen} setOpen={setDisplayOpen} />

          <a href="/search" className="nav-control inline-flex shrink-0 items-center justify-center rounded-full border border-border/50 p-2 text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:text-foreground" aria-label={accessibilityCopy.search} title={accessibilityCopy.search}><Search className="h-4 w-4" /></a>

          {/*
            Réservation dans l'en-tête dès 1024 px (PUB-02) : par « Consultation » de la navigation, puis aussi
            par ce bouton dès 1280 px ; de 1024 à 1279 px, il ne laisserait pas la place aux rubriques (PUB-08).
          */}
          <a href="/booking" className="nav-cta cta-primary max-xl:hidden! px-4 py-2.5 text-sm">
            {content.hero.bookConsultation}
          </a>

          {/* Mobile menu toggle */}
          <button
            onClick={() => {
              setMobileOpen(!mobileOpen);
              setMobileDisplayOpen(false);
            }}
            ref={mobileMenuButtonRef}
            className="nav-control lg:hidden inline-flex shrink-0 items-center justify-center p-2 text-foreground"
            aria-label={mobileOpen ? accessibilityCopy.closeMenu : accessibilityCopy.openMenu}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu : l'en-tête est fixe, le menu défile donc lui-même sous la barre (h-18, md:h-20). */}
      {mobileOpen && (
        <div id="mobile-navigation" className="mobile-navigation lg:hidden max-h-[calc(100dvh-4.5rem)] md:max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain bg-background/95 backdrop-blur-xl border-b border-border">
          <nav className="container py-6 flex flex-col gap-4" aria-label={accessibilityCopy.mobileNavigation}>
            <a href="/booking" onClick={() => setMobileOpen(false)} className="cta-primary px-5 py-3.5 text-sm w-full">
              {content.hero.bookConsultation}
            </a>
            {pageLinks.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={mobileLinkClass(currentPath === item.href)} aria-current={currentPath === item.href ? "page" : undefined}>{item.label}</a>
            ))}
            <a href="/#contact" onClick={(event) => followSectionLink(event, "contact")} className={mobileLinkClass()}>{content.nav.contact}</a>
            {homeSections.map((item) => (
              <a key={item.id} href={`/#${item.id}`} onClick={(event) => followSectionLink(event, item.id)} className={mobileLinkClass()}>{item.label}</a>
            ))}
            <a href="/search" onClick={() => setMobileOpen(false)} className="nav-mobile-link flex items-center gap-2 text-left text-lg font-medium text-foreground py-2 border-b border-border/20"><Search className="h-4 w-4" />{language === "fr" ? "Rechercher" : language === "en" ? "Search" : language === "de" ? "Suche" : "搜索"}</a>
            {/* Sous 640 px, le thème, la lisibilité et le noir OLED ne sont que dans ce sous-menu (PUB-08). */}
            {displayToggles.length > 0 && (
              <button
                type="button"
                onClick={() => setMobileDisplayOpen(!mobileDisplayOpen)}
                className="nav-mobile-link flex items-center justify-between gap-2 text-left text-lg font-medium text-foreground py-2 border-b border-border/20"
                aria-expanded={mobileDisplayOpen}
                aria-controls="mobile-display-settings"
              >
                <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />{accessibilityCopy.display}</span>
                <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: mobileDisplayOpen ? "rotate(180deg)" : "rotate(0deg)" }} aria-hidden="true" />
              </button>
            )}
            {mobileDisplayOpen && (
              <div id="mobile-display-settings" role="group" aria-label={accessibilityCopy.display} className="-mt-2 flex flex-col gap-1 pl-4">
                {displayToggles.map((toggle) => (
                  <button key={toggle.key} type="button" onClick={toggle.onClick} aria-pressed={toggle.pressed} className={cn("nav-mobile-link", displayToggleClass, "text-base")}>
                    {toggle.icon}
                    {toggle.label}
                  </button>
                ))}
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
