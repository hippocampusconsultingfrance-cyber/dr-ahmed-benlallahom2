import { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Menu, X, ChevronDown, Sun, Moon } from "lucide-react";

export default function Navigation() {
  const { content, language } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: "fr", name: "Français", flag: "🇫🇷" },
    { code: "en", name: "English", flag: "🇬🇧" },
    { code: "de", name: "Deutsch", flag: "🇩🇪" },
    { code: "zh", name: "中文", flag: "🇨🇳" },
  ];

  const currentLang = languages.find((l) => l.code === language);
  const recruitmentLabel = { fr: "Recrutement", en: "Recruitment", de: "Recruiting", zh: "招聘" }[language];
  const employersLabel = { fr: "Employeurs", en: "Employers", de: "Arbeitgeber", zh: "雇主专区" }[language];

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
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setMobileOpen(false);
    }
  };

  return (
    <header
      className={`site-nav fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/85 backdrop-blur-xl border-b border-border/40 shadow-2xl shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="container flex items-center justify-between gap-4 h-18 md:h-20">
        {/* Logo — larger, more prominent */}
        <button
          onClick={() => scrollTo("hero")}
          className="brand-lockup flex shrink-0 items-center gap-3 group"
          aria-label="Dr. Ahmed Ben Lallahom — Accueil"
        >
          <img
            src="/manus-storage/logo-abl_2afbc5e0.png"
            alt="Dr. Ahmed Ben Lallahom - Logo"
            className="w-10 h-10 md:w-11 md:h-11 transition-transform group-hover:scale-105"
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
        <nav className="hidden md:flex min-w-0 flex-1 items-center justify-end gap-6" aria-label="Navigation principale">
          {[
            { id: "experience", label: content.nav.experience },
            { id: "services", label: content.nav.services },
            { id: "education", label: content.nav.education },
            { id: "contact", label: content.nav.contact },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="nav-link text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-primary after:transition-all hover:after:w-full"
            >
              {item.label}
            </button>
          ))}
          <a href="/recruitment" className="nav-link whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-primary after:transition-all hover:after:w-full">{recruitmentLabel}</a>
          <a href="/employers" className="nav-link whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-primary after:transition-all hover:after:w-full">{employersLabel}</a>
        </nav>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-3">
          {/* Language Dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="nav-control flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all duration-200 hover:bg-background/50"
              title="Change language"
              aria-label="Change language"
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
            >
              <span className="text-base">{currentLang?.flag}</span>
              <span>{currentLang?.code.toUpperCase()}</span>
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform"
                style={{ transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>

            {dropdownOpen && (
              <div className="nav-language-menu absolute right-0 mt-2 w-48 bg-background border border-border/50 rounded-lg shadow-lg z-50 overflow-hidden" role="menu" aria-label="Choisir une langue">
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
              className="nav-control p-2 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all duration-200"
              title={theme === "dark" ? "Mode clair" : "Mode sombre"}
              aria-label={theme === "dark" ? "Activer le mode clair" : "Activer le mode sombre"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={() => scrollTo("contact")}
            className="nav-cta cta-primary hidden md:flex px-5 py-2.5 text-sm"
          >
            {content.nav.getInTouch}
          </button>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="nav-control md:hidden p-2 text-foreground"
            aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div id="mobile-navigation" className="mobile-navigation md:hidden bg-background/95 backdrop-blur-xl border-b border-border">
          <nav className="container py-6 flex flex-col gap-4" aria-label="Navigation mobile">
            {[
              { id: "experience", label: content.nav.experience },
              { id: "services", label: content.nav.services },
              { id: "education", label: content.nav.education },
              { id: "contact", label: content.nav.contact },
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
            <button
              onClick={() => scrollTo("contact")}
              className="nav-cta cta-primary mt-4 px-5 py-3.5 text-sm w-full"
            >
              {content.nav.getInTouch}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
