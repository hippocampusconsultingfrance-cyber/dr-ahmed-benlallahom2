import { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Menu, X, ChevronDown } from "lucide-react";

export default function Navigation() {
  const { content, language } = useLanguage();
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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/85 backdrop-blur-xl border-b border-border/40 shadow-2xl shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="container flex items-center justify-between h-18 md:h-20">
        {/* Logo — larger, more prominent */}
        <button onClick={() => scrollTo("hero")} className="flex items-center gap-3 group">
          <img
            src="/manus-storage/logo-abl_2afbc5e0.png"
            alt="Dr. Ahmed Ben Lallahom - Logo"
            className="w-10 h-10 md:w-11 md:h-11 transition-transform group-hover:scale-105"
            loading="lazy"
          />
          <div className="hidden sm:block">
            <span className="font-display text-lg font-bold text-foreground block leading-tight">
              Dr. Ben Lallahom
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
              MD, DESAIC
            </span>
          </div>
        </button>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { id: "experience", label: content.nav.experience },
            { id: "services", label: content.nav.services },
            { id: "education", label: content.nav.education },
            { id: "contact", label: content.nav.contact },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-primary after:transition-all hover:after:w-full"
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Language Dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all duration-200 hover:bg-background/50"
              title="Change language"
            >
              <span className="text-base">{currentLang?.flag}</span>
              <span>{currentLang?.code.toUpperCase()}</span>
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform"
                style={{ transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-background border border-border/50 rounded-lg shadow-lg z-50 overflow-hidden">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
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

          <button
            onClick={() => scrollTo("contact")}
            className="hidden md:block px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all duration-200 active:scale-[0.97] shadow-md shadow-primary/20"
          >
            {content.nav.getInTouch}
          </button>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-foreground"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border">
          <nav className="container py-6 flex flex-col gap-4">
            {[
              { id: "experience", label: content.nav.experience },
              { id: "services", label: content.nav.services },
              { id: "education", label: content.nav.education },
              { id: "contact", label: content.nav.contact },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="text-left text-lg font-medium text-foreground py-2 border-b border-border/20"
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => scrollTo("contact")}
              className="mt-4 px-5 py-3.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold w-full"
            >
              {content.nav.getInTouch}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
