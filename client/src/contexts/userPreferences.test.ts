import { describe, expect, it } from "vitest";
import {
  readInitialLanguage,
  readLanguageParameter,
  readLanguagePreference,
  readThemePreference,
  removeLanguageParameter,
  shouldSuggestEnglish,
} from "./userPreferences";

describe("préférences d’interface", () => {
  it("accepte uniquement les langues prises en charge", () => {
    expect(readLanguagePreference("de", "fr")).toBe("de");
    expect(readLanguagePreference("it", "fr")).toBe("fr");
  });

  it("distingue une langue choisie (lien ?lang=, choix mémorisé) de la langue par défaut (EN-08)", () => {
    expect(readInitialLanguage("?lang=en", "de", "fr")).toEqual({
      language: "en",
      chosen: true,
    });
    expect(readInitialLanguage("", "de", "fr")).toEqual({
      language: "de",
      chosen: true,
    });
    expect(readInitialLanguage("", "fr", "fr")).toEqual({
      language: "fr",
      chosen: true,
    });
    expect(readInitialLanguage("", null, "fr")).toEqual({
      language: "fr",
      chosen: false,
    });
    expect(readInitialLanguage("?lang=it", "it", "fr")).toEqual({
      language: "fr",
      chosen: false,
    });
  });

  it("ne propose l’anglais qu’à un navigateur sans français et sans choix fait (EN-08)", () => {
    for (const browser of [
      ["en-US", "en"],
      ["ar-AE"],
      ["de-DE", "de"],
      ["zh-CN"],
    ])
      expect(shouldSuggestEnglish("fr", false, browser), browser.join()).toBe(
        true
      );
    for (const browser of [
      ["fr-FR"],
      ["en-US", "fr"],
      ["ar-AE", "FR-ca"],
      ["fr"],
    ])
      expect(shouldSuggestEnglish("fr", false, browser), browser.join()).toBe(
        false
      );
    // A remembered choice or a ?lang= link, a page already in another language, an unknown browser: nothing is offered.
    expect(shouldSuggestEnglish("fr", true, ["en-US"])).toBe(false);
    expect(shouldSuggestEnglish("en", false, ["en-US"])).toBe(false);
    expect(shouldSuggestEnglish("fr", false, [])).toBe(false);
    // "fri" (a language tag that only starts like French) is not French.
    expect(shouldSuggestEnglish("fr", false, ["fri"])).toBe(true);
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
    expect(removeLanguageParameter(`${site}/booking?lang=en`)).toBe(
      `${site}/booking`
    );
    expect(
      removeLanguageParameter(
        `${site}/booking/confirmation?status=success&lang=en&trackingId=APT123456#top`
      )
    ).toBe(
      `${site}/booking/confirmation?status=success&trackingId=APT123456#top`
    );
    expect(
      removeLanguageParameter(
        `${site}/candidate/verify?email=a%2Bb%40example.com&token=x.y&lang=it`
      )
    ).toBe(`${site}/candidate/verify?email=a%2Bb%40example.com&token=x.y`);
    expect(
      removeLanguageParameter(`${site}/booking?status=success`)
    ).toBeNull();
    expect(removeLanguageParameter(`${site}/`)).toBeNull();
  });

  it("garde l’origine du site quand le chemin commence par « // » (EN-03)", () => {
    // Un chemin « //evil.example/x » relu seul désigne un autre hôte : history.replaceState lèverait
    // une SecurityError au-dessus de l’ErrorBoundary et la page resterait blanche.
    const address = removeLanguageParameter(
      "https://drahmedbenlallahom.com//evil.example/x?lang=en"
    );
    expect(address).toBe("https://drahmedbenlallahom.com//evil.example/x");
    expect(
      new URL(
        address!,
        "https://drahmedbenlallahom.com//evil.example/x?lang=en"
      ).origin
    ).toBe("https://drahmedbenlallahom.com");
  });

  it("n’accepte que les deux thèmes disponibles", () => {
    expect(readThemePreference("dark", "light")).toBe("dark");
    expect(readThemePreference("contrast", "dark")).toBe("dark");
    expect(readThemePreference(null, "light")).toBe("light");
  });
});
