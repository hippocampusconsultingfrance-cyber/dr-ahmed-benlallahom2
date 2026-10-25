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
    expect(removeLanguageParameter("/booking", "?lang=en", "")).toBe("/booking");
    expect(removeLanguageParameter("/booking/confirmation", "?status=success&lang=en&trackingId=APT123456", "#top"))
      .toBe("/booking/confirmation?status=success&trackingId=APT123456#top");
    expect(removeLanguageParameter("/candidate/verify", "?email=a%2Bb%40example.com&token=x.y&lang=it", ""))
      .toBe("/candidate/verify?email=a%2Bb%40example.com&token=x.y");
    expect(removeLanguageParameter("/booking", "?status=success", "")).toBeNull();
    expect(removeLanguageParameter("/", "", "")).toBeNull();
  });

  it("n’accepte que les deux thèmes disponibles", () => {
    expect(readThemePreference("dark", "light")).toBe("dark");
    expect(readThemePreference("contrast", "dark")).toBe("dark");
    expect(readThemePreference(null, "light")).toBe("light");
  });
});
