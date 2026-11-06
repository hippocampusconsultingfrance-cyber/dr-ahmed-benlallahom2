import { describe, expect, it } from "vitest";
import { getNextLanguage, readLanguageParameter, readLanguagePreference, readThemePreference, removeLanguageParameter } from "./userPreferences";

describe("préférences d’interface", () => {
  it("accepte uniquement les langues prises en charge et respecte le cycle complet", () => {
    expect(readLanguagePreference("de", "fr")).toBe("de");
    expect(readLanguagePreference("it", "fr")).toBe("fr");
    expect(getNextLanguage("fr")).toBe("en");
    expect(getNextLanguage("en")).toBe("de");
    expect(getNextLanguage("de")).toBe("zh");
    expect(getNextLanguage("zh")).toBe("fr");
  });

  it("lit la langue d’un lien ?lang= sans jamais en inventer une (EN-03)", () => {
    expect(readLanguageParameter("?lang=en")).toBe("en");
    expect(readLanguageParameter("?status=success&lang=DE")).toBe("de");
    expect(readLanguageParameter("?lang=%20zh%20")).toBe("zh");
    expect(readLanguageParameter("?lang=fr")).toBe("fr");
    expect(readLanguageParameter("?lang=en-GB")).toBeNull();
    expect(readLanguageParameter("?lang=")).toBeNull();
    expect(readLanguageParameter("")).toBeNull();
  });

  it("retire ?lang= de l’adresse en gardant les autres paramètres et l’ancre (EN-03)", () => {
    const site = "https://drahmedbenlallahom.com";
    expect(removeLanguageParameter(`${site}/booking?lang=en`)).toBe(`${site}/booking`);
    expect(removeLanguageParameter(`${site}/booking/confirmation?status=success&lang=en&trackingId=APT123456#top`))
      .toBe(`${site}/booking/confirmation?status=success&trackingId=APT123456#top`);
    expect(removeLanguageParameter(`${site}/candidate/verify?email=a%2Bb%40example.com&token=x.y&lang=it`))
      .toBe(`${site}/candidate/verify?email=a%2Bb%40example.com&token=x.y`);
    expect(removeLanguageParameter(`${site}/booking?status=success`)).toBeNull();
    expect(removeLanguageParameter(`${site}/`)).toBeNull();
  });

  it("garde l’origine du site quand le chemin commence par « // » (EN-03)", () => {
    // Un chemin « //evil.example/x » relu seul désigne un autre hôte : history.replaceState lèverait
    // une SecurityError au-dessus de l’ErrorBoundary et la page resterait blanche.
    const address = removeLanguageParameter("https://drahmedbenlallahom.com//evil.example/x?lang=en");
    expect(address).toBe("https://drahmedbenlallahom.com//evil.example/x");
    expect(new URL(address!, "https://drahmedbenlallahom.com//evil.example/x?lang=en").origin).toBe("https://drahmedbenlallahom.com");
  });

  it("n’accepte que les deux thèmes disponibles", () => {
    expect(readThemePreference("dark", "light")).toBe("dark");
    expect(readThemePreference("contrast", "dark")).toBe("dark");
    expect(readThemePreference(null, "light")).toBe("light");
  });
});
