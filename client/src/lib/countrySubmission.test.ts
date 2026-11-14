import { describe, expect, it } from "vitest";
import {
  countryCodeOf,
  countryLabel,
  resolveCountryForSubmission,
  WORLDWIDE_COUNTRY_CODES,
} from "./countrySubmission";

const countries = [
  { code: "FR", label: "France" },
  { code: "TN", label: "Tunisie" },
];

describe("resolveCountryForSubmission", () => {
  it("conserve le pays contrôlé par React lorsqu’il est présent", () => {
    expect(resolveCountryForSubmission("TN", "France", countries)).toBe("TN");
  });

  it("récupère, en code, le pays visible prérempli par un navigateur mobile quand l’état est vide", () => {
    // The standard form's search field shows the name, the VVIP select holds the code.
    expect(resolveCountryForSubmission("", "Tunisie", countries)).toBe("TN");
    expect(resolveCountryForSubmission("", " TN ", countries)).toBe("TN");
  });

  it("ne valide pas une valeur de pays absente, non textuelle ou hors de la liste", () => {
    expect(resolveCountryForSubmission("", null)).toBe("");
    expect(resolveCountryForSubmission("", new File(["x"], "cv.pdf"))).toBe("");
    expect(resolveCountryForSubmission("", "Tunis", countries)).toBe("");
  });
});

describe("EN-11 — pays du diplôme enregistré en code ISO", () => {
  it("donne le même code pour le pays nommé dans chaque langue des formulaires, et pour le code lui-même", () => {
    for (const name of [
      "Tunisie",
      "Tunisia",
      "Tunesien",
      "突尼斯",
      "TN",
      " tunisie ",
    ])
      expect(countryCodeOf(name), name).toBe("TN");
    expect(countryCodeOf("Allemagne")).toBe("DE");
    expect(countryCodeOf("Deutschland")).toBe("DE");
    // Typographic or plain apostrophe, as a pasted name may come.
    expect(countryCodeOf("Côte d’Ivoire")).toBe("CI");
    expect(countryCodeOf("Côte d'Ivoire")).toBe("CI");
  });

  it("ne reconnaît ni un pays inconnu, ni un code hors de la liste, ni une valeur vide", () => {
    for (const value of ["Atlantis", "ZZ", "tn-", "", "   ", null, undefined])
      expect(countryCodeOf(value), String(value)).toBeNull();
  });

  it("nomme un code dans la langue de l’écran, et traduit un nom enregistré avant EN-11", () => {
    expect(countryLabel("TN", "fr")).toBe("Tunisie");
    expect(countryLabel("TN", "en")).toBe("Tunisia");
    expect(countryLabel("TN", "de")).toBe("Tunesien");
    expect(countryLabel("TN", "zh")).toBe("突尼斯");
    expect(countryLabel("Tunisia", "fr")).toBe("Tunisie");
    expect(countryLabel("Tunesien", "fr")).toBe("Tunisie");
  });

  it("montre tel quel ce qui ne désigne aucun pays, et rien pour une valeur absente", () => {
    expect(countryLabel("Atlantis", "fr")).toBe("Atlantis");
    expect(countryLabel(null, "fr")).toBe("");
  });

  it("reconnaît chaque pays de la liste sous son nom français, anglais, allemand et chinois", () => {
    expect(WORLDWIDE_COUNTRY_CODES).toHaveLength(249);
    for (const code of WORLDWIDE_COUNTRY_CODES) {
      for (const language of ["fr", "en", "de", "zh"])
        expect(
          countryCodeOf(countryLabel(code, language)),
          `${code} ${language}`
        ).toBe(code);
    }
  });
});
