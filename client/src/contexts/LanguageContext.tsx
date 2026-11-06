import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { contentFr } from "@/data/content-fr";
import { contentEn } from "@/data/content-en";
import { contentDe } from "@/data/content-de";
import { contentZh } from "@/data/content-zh";
import { siteConfig } from "@/data/site-config";
import { getNextLanguage, readLanguageParameter, readLanguagePreference, removeLanguageParameter, type UserLanguage } from "./userPreferences";

type Language = UserLanguage;
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
      // Un lien en ?lang=en|fr|de|zh l’emporte sur la langue mémorisée (EN-03).
      return readLanguageParameter(window.location.search)
        ?? readLanguagePreference(localStorage.getItem("language"), siteConfig.defaultLanguage as Language);
    }
    return siteConfig.defaultLanguage as Language;
  });

  // Persister la langue et synchroniser les métadonnées documentaires pour le SEO et l’accessibilité
  useEffect(() => {
    localStorage.setItem("language", language);
    document.documentElement.lang = language;
  }, [language]);

  // Une fois la langue du lien mémorisée (effet ci-dessus), ?lang= est retiré de l’adresse.
  useEffect(() => {
    const address = removeLanguageParameter(window.location.href);
    if (address) window.history.replaceState(window.history.state, "", address);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const nextLang = getNextLanguage(prev);
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
