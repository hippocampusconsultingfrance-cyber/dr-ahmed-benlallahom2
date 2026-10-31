import { describe, expect, it, vi } from "vitest";
import { holdsRecruitmentLanguages, recruitmentLanguageCodes, recruitmentLanguageNames, RECRUITMENT_LANGUAGES, sameRecruitmentLanguage } from "../shared/recruitmentLanguages";
import { professionalLanguageOptions } from "../client/src/pages/RecruitmentPage";

// Each text the table compares is folded through the admin search's folding: counted here.
const folding = vi.hoisted(() => ({ texts: [] as string[] }));
vi.mock("../shared/adminSearchFolding", async importOriginal => {
  const actual = await importOriginal<typeof import("../shared/adminSearchFolding")>();
  return { ...actual, foldAdminSearchText: (text: string) => { folding.texts.push(text); return actual.foldAdminSearchText(text); } };
});

// IA-02 — la table partagée des langues (shared/recruitmentLanguages.ts) :
// chaque langue sous ses noms français, anglais, allemand et chinois (et son
// propre nom), accents et casse à part, pour comparer le formulaire public,
// qui enregistre « French », à ce que l’admin tape, « Français ».

describe("langues du recrutement comparées par code (IA-02)", () => {
  it("donne le même code à chaque nom d’une langue, accents, casse et écritures à part", () => {
    for (const name of ["Français", "francais", "FRANÇAIS", "French", "Französisch", "Franzosisch", "法语", "franc\u0327ais"]) expect(recruitmentLanguageCodes(name)).toEqual(["fr"]);
    for (const name of ["Anglais", "English", "Englisch", "英语", "英文"]) expect(recruitmentLanguageCodes(name)).toEqual(["en"]);
    for (const name of ["Arabe", "arabe", "Arabic", "Arabisch", "阿拉伯语", "العربية", "العَرَبِيَّة"]) expect(recruitmentLanguageCodes(name)).toEqual(["ar"]);
    for (const name of ["Allemand", "German", "Deutsch", "德语"]) expect(recruitmentLanguageCodes(name)).toEqual(["de"]);
    for (const name of ["Chinois", "Chinese", "Chinesisch", "中文", "Mandarin"]) expect(recruitmentLanguageCodes(name)).toEqual(["zh"]);
  });

  it("reconnaît une langue dans une mention plus longue, et chacune de celles qu’elle cite", () => {
    expect(recruitmentLanguageCodes("Anglais courant (C1)")).toEqual(["en"]);
    expect(recruitmentLanguageCodes("Langue maternelle : française")).toEqual(["fr"]);
    expect(recruitmentLanguageCodes("Deutschkenntnisse")).toEqual(["de"]);
    expect(recruitmentLanguageCodes("英语（流利）")).toEqual(["en"]);
    expect(recruitmentLanguageCodes("Français, anglais et arabe")).toEqual(["fr", "en", "ar"]);
    // A French feminine or plural, a German ending.
    for (const [text, code] of [["Italienne", "it"], ["langue grecque", "el"], ["Russes", "ru"], ["Englischen", "en"], ["Deutscher Muttersprachler", "de"], ["Persane", "fa"]] as const) {
      expect(recruitmentLanguageCodes(text), text).toEqual([code]);
    }
    // Arabic written with the Persian yeh, as Persian and Urdu CVs write it.
    expect(recruitmentLanguageCodes("عربی")).toEqual(["ar"]);
  });

  it("ne reconnaît ni une langue absente de la table, ni une partie de nom, ni un nom au milieu d’un mot", () => {
    expect(recruitmentLanguageCodes("Wolof")).toEqual([]);
    expect(recruitmentLanguageCodes("fran")).toEqual([]);
    expect(recruitmentLanguageCodes("Antifrançais")).toEqual([]);
    expect(recruitmentLanguageCodes("")).toEqual([]);
    // Nor a name that starts another word: « polished » is not Polish, nor « Germany » German.
    expect(recruitmentLanguageCodes("English (polished)")).toEqual(["en"]);
    for (const text of ["Germany", "Russell", "Arabesque", "Deutschland", "Grecoromain"]) expect(recruitmentLanguageCodes(text), text).toEqual([]);
    expect(holdsRecruitmentLanguages(["English - polished"], "Polonais")).toBe(false);
  });

  it("dit si deux noms désignent la même langue, et si des langues tiennent toutes celles qu’une exigence cite", () => {
    expect(sameRecruitmentLanguage("Arabic", "arabe")).toBe(true);
    expect(sameRecruitmentLanguage("French", "Anglais")).toBe(false);
    expect(sameRecruitmentLanguage("Wolof", "Wolof")).toBe(false);
    expect(holdsRecruitmentLanguages(["French", "Arabic"], "Français")).toBe(true);
    expect(holdsRecruitmentLanguages(["English", "العربية"], "Anglais et arabe")).toBe(true);
    expect(holdsRecruitmentLanguages(["Arabic"], "Anglais et arabe")).toBe(false);
    expect(holdsRecruitmentLanguages(["Wolof"], "Wolof")).toBe(false);
  });

  it("donne tous les noms de chaque langue qu’un filtre nomme, sans doublon, aucun pour un terme qui n’en nomme pas", () => {
    const [names, ...others] = recruitmentLanguageNames("arabe");
    expect(others).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(["Arabe", "Arabic", "Arabisch", "阿拉伯语", "العربية"]));
    expect(new Set(names).size).toBe(names!.length);
    expect(recruitmentLanguageNames("Hindi")).toEqual([["Hindi", "印地语", "हिन्दी", "印地語"]]);
    // One list per language a term names, in the order of the table.
    const [english, arabic] = recruitmentLanguageNames("anglais, arabe");
    expect(english).toEqual(expect.arrayContaining(["Anglais", "English", "Englisch", "英语"]));
    expect(arabic).toEqual(expect.arrayContaining(["Arabe", "Arabic", "العربية"]));
    expect(recruitmentLanguageNames("angl")).toEqual([]);
  });

  it("ne replie et ne cherche chaque texte qu’une fois, avec le même résultat ensuite (IA-02)", () => {
    const texts = ["Anglais (B2)", "Arabe littéraire", "Wolof courant"];
    const first = texts.map(recruitmentLanguageCodes);
    folding.texts = [];
    // A mission ranks up to 2 000 candidates, a profile checks up to 10 000 dossiers, under the same few names.
    for (let round = 0; round < 2_000; round++) {
      expect(texts.map(recruitmentLanguageCodes)).toEqual(first);
      expect(sameRecruitmentLanguage("Arabe littéraire", "Anglais (B2)")).toBe(false);
      expect(holdsRecruitmentLanguages(["Anglais (B2)", "Arabe littéraire"], "Arabe littéraire")).toBe(true);
    }
    expect(folding.texts).toEqual([]);
    expect(first).toEqual([["en"], ["ar"], []]);

    // Past the bound of texts kept, and for a text longer than a language mention, the same codes.
    for (let index = 0; index < 2_100; index++) recruitmentLanguageCodes(`Langue ${index}`);
    const long = `${"Anglais courant, ".repeat(20)}arabe`;
    expect(texts.map(recruitmentLanguageCodes)).toEqual(first);
    expect(recruitmentLanguageCodes(long)).toEqual(["en", "ar"]);
    expect(recruitmentLanguageCodes(long)).toEqual(["en", "ar"]);
  });

  it("couvre chaque langue du formulaire public, sous sa valeur enregistrée et ses quatre libellés", () => {
    for (const option of professionalLanguageOptions.filter(item => item.value !== "Other")) {
      const [code] = recruitmentLanguageCodes(option.value);
      expect(code, option.value).toBeDefined();
      for (const label of Object.values(option.labels)) expect(recruitmentLanguageCodes(label), label).toEqual([code]);
    }
    // No name of the table names two languages.
    for (const language of RECRUITMENT_LANGUAGES) {
      for (const name of [...Object.values(language.names), ...language.otherNames]) expect(recruitmentLanguageCodes(name), name).toEqual([language.code]);
    }
  });
});
