import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { contentFr } from "@/data/content-fr";
import { contentEn } from "@/data/content-en";
import { contentDe } from "@/data/content-de";
import { contentZh } from "@/data/content-zh";
import { siteConfig } from "@/data/site-config";
import { readStoredPreference, writeStoredPreference } from "@/lib/browserStorage";
import { readInitialLanguage, removeLanguageParameter, shouldSuggestEnglish, type UserLanguage } from "./userPreferences";

type Language = UserLanguage;
type Content = typeof contentFr;

interface LanguageContextType {
  language: Language;
  content: Content;
  /** Puts the page in another language where it is, forms and their files kept, and remembers the choice (EN-10). */
  setLanguage: (language: Language) => void;
  /** English is offered to this visitor: no language chosen yet, a browser that declares no French (EN-08). */
  suggestEnglish: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

/** The browser's languages, read only to offer English (shouldSuggestEnglish), never to choose for the visitor. */
function browserLanguages(): readonly string[] {
  if (typeof window === "undefined" || typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ language: Language; chosen: boolean }>(() => {
    if (typeof window !== "undefined") {
      // Un lien en ?lang=en|fr|de|zh l’emporte sur la langue mémorisée (EN-03). Stockage refusé par le
      // navigateur : la langue par défaut, et le choix fait pour cette visite seulement (browserStorage).
      return readInitialLanguage(window.location.search, readStoredPreference("language"), siteConfig.defaultLanguage as Language);
    }
    return { language: siteConfig.defaultLanguage as Language, chosen: false };
  });
  // Read once, on arrival: the offer then lasts until the visitor chooses a language (setLanguage).
  const [englishOffered] = useState(() => shouldSuggestEnglish(state.language, state.chosen, browserLanguages()));
  const { language, chosen } = state;

  // Persister la langue choisie et synchroniser les métadonnées documentaires pour le SEO et l’accessibilité.
  // La langue par défaut n’est pas mémorisée : l’anglais reste proposé tant que le visiteur n’a pas choisi (EN-08).
  useEffect(() => {
    if (chosen) writeStoredPreference("language", language);
    document.documentElement.lang = language;
  }, [language, chosen]);

  // Une fois la langue du lien mémorisée (effet ci-dessus), ?lang= est retiré de l’adresse.
  useEffect(() => {
    const address = removeLanguageParameter(window.location.href);
    if (address) window.history.replaceState(window.history.state, "", address);
  }, []);

  const setLanguage = useCallback((next: Language) => setState({ language: next, chosen: true }), []);

  const content =
    language === "fr" ? contentFr :
    language === "en" ? contentEn :
    language === "de" ? contentDe :
    contentZh;

  return (
    <LanguageContext.Provider value={{ language, content, setLanguage, suggestEnglish: englishOffered && !chosen }}>
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
