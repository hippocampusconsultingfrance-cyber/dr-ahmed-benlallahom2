import { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Accessibility, CircleDot, Menu, X, ChevronDown, Sun, Moon, Search } from "lucide-react";
import { getMenuFocusIndex, isNavigationDismissKey } from "./navigationKeyboard";
import { navigationAccessibilityCopy } from "./navigationAccessibilityCopy";

export default function Navigation() {
  const { content, language } = useLanguage();
  const { theme, toggleTheme, highReadability, toggleHighReadability, oledDark, toggleOledDark } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const readabilityCopy = {
    fr: { enable: "Activer la lisibilité renforcée", disable: "Désactiver la lisibilité renforcée", label: "Lisibilité renforcée" },
    en: { enable: "Enable high readability", disable: "Disable high readability", label: "High readability" },
    de: { enable: "Verbesserte Lesbarkeit aktivieren", disable: "Verbesserte Lesbarkeit deaktivieren", label: "Verbesserte Lesbarkeit" },
    zh: { enable: "启用高可读性模式", disable: "关闭高可读性模式", label: "高可读性模式" },
  }[language as "fr" | "en" | "de" | "zh"];
  const oledCopy = {
    fr: { enable: "Activer le noir OLED", disable: "Désactiver le noir OLED", label: "Noir OLED" },
    en: { enable: "Enable OLED black", disable: "Disable OLED black", label: "OLED black" },
    de: { enable: "OLED-Schwarz aktivieren", disable: "OLED-Schwarz deaktivieren", label: "OLED-Schwarz" },
    zh: { enable: "启用 OLED 黑色", disable: "关闭 OLED 黑色", label: "OLED 黑色" },
  }[language as "fr" | "en" | "de" | "zh"];
  const accessibilityCopy = navigationAccessibilityCopy[language as keyof typeof navigationAccessibilityCopy] ?? navigationAccessibilityCopy.fr;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  const languages = [
    { code: "fr", name: "Français", flag: "🇫🇷" },
    { code: "en", name: "English", flag: "🇬🇧" },
    { code: "de", name: "Deutsch", flag: "🇩🇪" },
    { code: "zh", name: "中文", flag: "🇨🇳" },
  ];

  const currentLang = languages.find((l) => l.code === language);
  const recruitmentLabel = { fr: "Recrutement", en: "Recruitment", de: "Recruiting", zh: "招聘" }[language];
  const employersLabel = { fr: "Employeurs", en: "Employers", de: "Arbeitgeber", zh: "雇主专区" }[language];
  const medicalQuestionsLabel = { fr: "Questions santé", en: "Health questions", de: "Gesundheitsfragen", zh: "健康问答" }[language];
  const isMedicalQuestionsPage = typeof window !== "undefined" && window.location.pathname === "/questions-anesthesie";
  const medicalQuestionsDesktopClass = isMedicalQuestionsPage
    ? "nav-link inline-flex h-10 items-center whitespace-nowrap text-sm font-medium text-primary transition-colors duration-200 hover:text-foreground relative after:absolute after:bottom-[2px] after:left-0 after:h-[2px] after:w-full after:bg-primary after:transition-all hover:after:bg-foreground"
    : "nav-link inline-flex h-10 items-center whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 relative after:absolute after:bottom-[2px] after:left-0 after:w-0 after:h-[2px] after:bg-primary after:transition-all hover:after:w-full";
  const medicalQuestionsMobileClass = isMedicalQuestionsPage
    ? "nav-mobile-link text-left text-lg font-medium text-primary py-2 border-b border-border/20"
    : "nav-mobile-link text-left text-lg font-medium text-foreground py-2 border-b border-border/20";

  const handleLanguageChange = (code: string) => {
    if (code !== language) {
      // Changer la langue en mettant à jour le localStorage
      localStorage.setItem("language", code);
      // Recharger la page pour appliquer la nouvelle langue
      window.location.reload();
    }
    setDropdownOpen(false);
  };

  // Fermer le dropdown quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const firstMenuItem = dropdownRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    firstMenuItem?.focus();
  }, [dropdownOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (!isNavigationDismissKey(event.key)) return;
      if (dropdownOpen) {
        event.preventDefault();
        setDropdownOpen(false);
        languageButtonRef.current?.focus();
      }
      if (mobileOpen) {
        event.preventDefault();
        setMobileOpen(false);
        mobileMenuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [dropdownOpen, mobileOpen]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLanguageMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(dropdownRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const currentIndex = menuItems.findIndex((item) => item === document.activeElement);
    const nextIndex = getMenuFocusIndex(currentIndex < 0 ? 0 : currentIndex, menuItems.length, event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    menuItems[nextIndex]?.focus();
  };

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    const currentPath = window.location.pathname;
    if (currentPath === "/" || currentPath === "") {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    window.location.href = `/#${id}`;
  };

  return (
    <header
      className={`site-nav fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/85 backdrop-blur-xl border-b border-border/40 shadow-2xl shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="container site-nav-container grid h-18 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 md:h-20 min-[1536px]:grid-cols-[auto_minmax(0,1fr)_auto]">
        {/* Logo — larger, more prominent */}
        <button
          onClick={() => scrollTo("hero")}
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
        </button>

        {/* Desktop Nav */}
        <nav className="hidden min-[1536px]:flex min-w-0 items-center justify-self-center gap-5" aria-label={accessibilityCopy.mainNavigation}>
          {[
            { id: "experience", label: content.nav.experience },
            { id: "services", label: content.nav.services },
            { id: "education", label: content.nav.education },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="nav-link inline-flex h-10 items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 relative after:absolute after:bottom-[2px] after:left-0 after:w-0 after:h-[2px] after:bg-primary after:transition-all hover:after:w-full"
            >
              {item.label}
            </button>
          ))}
          <a href="/recruitment" className="nav-link inline-flex h-10 items-center whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 relative after:absolute after:bottom-[2px] after:left-0 after:w-0 after:h-[2px] after:bg-primary after:transition-all hover:after:w-full">{recruitmentLabel}</a>
          <a href="/employers" className="nav-link inline-flex h-10 items-center whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 relative after:absolute after:bottom-[2px] after:left-0 after:w-0 after:h-[2px] after:bg-primary after:transition-all hover:after:w-full">{employersLabel}</a>
          <a href="/questions-anesthesie" className={medicalQuestionsDesktopClass}>{medicalQuestionsLabel}</a>
          <button onClick={() => scrollTo("contact")} className="nav-link inline-flex h-10 items-center whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors duration-200 relative after:absolute after:bottom-[2px] after:left-0 after:h-[2px] after:w-0 after:bg-primary after:transition-all hover:text-foreground hover:after:w-full">{content.nav.contact}</button>
        </nav>

        {/* Actions */}
        <div className="flex min-w-0 items-center gap-1.5 justify-self-end sm:gap-2">
          {/* Language Dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              ref={languageButtonRef}
              className="nav-control flex shrink-0 items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border border-border/50 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all duration-200 hover:bg-background/50"
              title={accessibilityCopy.changeLanguage}
              aria-label={accessibilityCopy.changeLanguage}
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
              aria-controls="language-menu"
            >
              <span className="text-base">{currentLang?.flag}</span>
              <span>{currentLang?.code.toUpperCase()}</span>
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform"
                style={{ transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>

            {dropdownOpen && (
              <div id="language-menu" onKeyDown={handleLanguageMenuKeyDown} className="nav-language-menu absolute right-0 mt-2 w-48 bg-background border border-border/50 rounded-lg shadow-lg z-50 overflow-hidden" role="menu" aria-label={accessibilityCopy.chooseLanguage}>
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    role="menuitem"
                    className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors ${
                      language === lang.code
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-background/50"
                    }`}
                  >
                    <span className="text-base mr-2">{lang.flag}</span>
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          {toggleTheme && (
            <button
              onClick={toggleTheme}
              className="nav-control nav-control-secondary hidden sm:inline-flex items-center justify-center p-2 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all duration-200"
              title={theme === "dark" ? accessibilityCopy.enableLight : accessibilityCopy.enableDark}
              aria-label={theme === "dark" ? accessibilityCopy.enableLight : accessibilityCopy.enableDark}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}

          {toggleHighReadability && readabilityCopy && (
            <button
              onClick={toggleHighReadability}
              className={`nav-control nav-control-secondary hidden sm:inline-flex items-center justify-center rounded-full border p-2 transition-all duration-200 ${highReadability ? "border-primary bg-primary/15 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
              title={highReadability ? readabilityCopy.disable : readabilityCopy.enable}
              aria-label={highReadability ? readabilityCopy.disable : readabilityCopy.enable}
              aria-pressed={highReadability}
            >
              <Accessibility className="h-4 w-4" />
            </button>
          )}

          {theme === "dark" && toggleOledDark && oledCopy && (
            <button
              onClick={toggleOledDark}
              className={`nav-control nav-control-secondary hidden sm:inline-flex items-center justify-center rounded-full border p-2 transition-all duration-200 ${oledDark ? "border-primary bg-primary/15 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
              title={oledDark ? oledCopy.disable : oledCopy.enable}
              aria-label={oledDark ? oledCopy.disable : oledCopy.enable}
              aria-pressed={oledDark}
            >
              <CircleDot className="h-4 w-4" />
            </button>
          )}

          <a href="/search" className="nav-control inline-flex shrink-0 items-center justify-center rounded-full border border-border/50 p-2 text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:text-foreground" aria-label={accessibilityCopy.search} title={accessibilityCopy.search}><Search className="h-4 w-4" /></a>

          {/* Réservation dès 1024 px : « Contact » reste dans les menus (PUB-02). */}
          <a href="/booking" className="nav-cta cta-primary hidden lg:inline-flex px-4 py-2.5 text-sm">
            {content.hero.bookConsultation}
          </a>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            ref={mobileMenuButtonRef}
            className="nav-control min-[1536px]:hidden inline-flex shrink-0 items-center justify-center p-2 text-foreground"
            aria-label={mobileOpen ? accessibilityCopy.closeMenu : accessibilityCopy.openMenu}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div id="mobile-navigation" className="mobile-navigation min-[1536px]:hidden bg-background/95 backdrop-blur-xl border-b border-border">
          <nav className="container py-6 flex flex-col gap-4" aria-label={accessibilityCopy.mobileNavigation}>
            <a href="/booking" onClick={() => setMobileOpen(false)} className="cta-primary px-5 py-3.5 text-sm w-full">
              {content.hero.bookConsultation}
            </a>
            {[
              { id: "experience", label: content.nav.experience },
              { id: "services", label: content.nav.services },
              { id: "education", label: content.nav.education },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="nav-mobile-link text-left text-lg font-medium text-foreground py-2 border-b border-border/20"
              >
                {item.label}
              </button>
            ))}
            <a href="/recruitment" onClick={() => setMobileOpen(false)} className="nav-mobile-link text-left text-lg font-medium text-foreground py-2 border-b border-border/20">{recruitmentLabel}</a>
            <a href="/employers" onClick={() => setMobileOpen(false)} className="nav-mobile-link text-left text-lg font-medium text-foreground py-2 border-b border-border/20">{employersLabel}</a>
            <a href="/questions-anesthesie" onClick={() => setMobileOpen(false)} className={medicalQuestionsMobileClass}>{medicalQuestionsLabel}</a>
            <button onClick={() => scrollTo("contact")} className="nav-mobile-link text-left text-lg font-medium text-foreground py-2 border-b border-border/20">{content.nav.contact}</button>
            <a href="/search" onClick={() => setMobileOpen(false)} className="nav-mobile-link flex items-center gap-2 text-left text-lg font-medium text-foreground py-2 border-b border-border/20"><Search className="h-4 w-4" />{language === "fr" ? "Rechercher" : language === "en" ? "Search" : language === "de" ? "Suche" : "搜索"}</a>
            {toggleTheme && <button onClick={toggleTheme} className="nav-mobile-link flex items-center gap-2 text-left text-lg font-medium text-foreground py-2 border-b border-border/20">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{theme === "dark" ? accessibilityCopy.enableLight : accessibilityCopy.enableDark}</button>}
            {toggleHighReadability && readabilityCopy && <button onClick={toggleHighReadability} className="nav-mobile-link flex items-center gap-2 text-left text-lg font-medium text-foreground py-2 border-b border-border/20" aria-pressed={highReadability}><Accessibility className="h-4 w-4" />{readabilityCopy.label}</button>}
            {theme === "dark" && toggleOledDark && oledCopy && <button onClick={toggleOledDark} className="nav-mobile-link flex items-center gap-2 text-left text-lg font-medium text-foreground py-2 border-b border-border/20" aria-pressed={oledDark}><CircleDot className="h-4 w-4" />{oledCopy.label}</button>}
          </nav>
        </div>
      )}
    </header>
  );
}
