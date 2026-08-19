import { describe, expect, it } from "vitest";
import { getNextLanguage, readLanguagePreference, readThemePreference } from "./userPreferences";

describe("préférences d’interface", () => {
  it("accepte uniquement les langues prises en charge et respecte le cycle complet", () => {
    expect(readLanguagePreference("de", "fr")).toBe("de");
    expect(readLanguagePreference("it", "fr")).toBe("fr");
    expect(getNextLanguage("fr")).toBe("en");
    expect(getNextLanguage("en")).toBe("de");
    expect(getNextLanguage("de")).toBe("zh");
    expect(getNextLanguage("zh")).toBe("fr");
  });

  it("n’accepte que les deux thèmes disponibles", () => {
    expect(readThemePreference("dark", "light")).toBe("dark");
    expect(readThemePreference("contrast", "dark")).toBe("dark");
    expect(readThemePreference(null, "light")).toBe("light");
  });
});
