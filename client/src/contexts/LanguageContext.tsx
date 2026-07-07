import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { contentFr } from "@/data/content-fr";
import { contentEn } from "@/data/content-en";
import { siteConfig } from "@/data/site-config";

type Language = "fr" | "en";
type Content = typeof contentFr;

interface LanguageContextType {
  language: Language;
  content: Content;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(siteConfig.defaultLanguage);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === "fr" ? "en" : "fr"));
  }, []);

  const content = language === "fr" ? contentFr : contentEn;

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
