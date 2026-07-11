import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { contentFr } from "@/data/content-fr";
import { contentEn } from "@/data/content-en";
import { contentDe } from "@/data/content-de";
import { contentZh } from "@/data/content-zh";
import { siteConfig } from "@/data/site-config";

type Language = "fr" | "en" | "de" | "zh";
type Content = typeof contentFr;

interface LanguageContextType {
  language: Language;
  content: Content;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("language");
      if (saved === "fr" || saved === "en" || saved === "de" || saved === "zh") {
        return saved;
      }
    }
    return siteConfig.defaultLanguage;
  });

  // Sauvegarder la langue dans localStorage quand elle change
  useEffect(() => {
    localStorage.setItem("language", language);
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const languages: Language[] = ["fr", "en", "de", "zh"];
      const currentIndex = languages.indexOf(prev);
      const nextIndex = (currentIndex + 1) % languages.length;
      const nextLang = languages[nextIndex];
      localStorage.setItem("language", nextLang);
      return nextLang;
    });
  }, []);

  const content = 
    language === "fr" ? contentFr :
    language === "en" ? contentEn :
    language === "de" ? contentDe :
    contentZh;

  return (
    <LanguageContext.Provider value={{ language, content, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
