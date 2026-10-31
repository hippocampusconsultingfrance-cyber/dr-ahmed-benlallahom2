import { describe, expect, it, vi } from "vitest";
import { givesRequiredLanguage, meetsRequiredLanguage, recruitmentLanguageCodes, recruitmentLanguageRequirements, RECRUITMENT_LANGUAGES } from "../shared/recruitmentLanguages";
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
    const [polish] = recruitmentLanguageRequirements("Polonais");
    expect(meetsRequiredLanguage(["English - polished"], polish!)).toBe(false);
  });

  it("ne lit que les flexions d’une langue, pas un pays ni une ville qui commence comme elle, ni un hôtel (IA-02)", () => {
    // The feminine and plural forms of the French names, turque included.
    for (const [text, code] of [["turque", "tr"], ["Turques", "tr"], ["Turcs", "tr"], ["grecque", "el"], ["langue grecque", "el"], ["Hébreux", "he"], ["coréenne", "ko"], ["Allemande", "de"]] as const) {
      expect(recruitmentLanguageCodes(text), text).toEqual([code]);
    }
    // Countries and cities, an English word ending as a French name does, a hotel group.
    for (const text of ["Grèce", "expérience en Grèce", "Turquie", "turquoise", "Germane", "Germany", "Deutschland", "Polska", "Mandarin Oriental", "Mandarin Oriental, Dubaï"]) {
      expect(recruitmentLanguageCodes(text), text).toEqual([]);
    }
    // A country named after a language, the language named next to it still found.
    for (const text of ["Émirats arabes unis", "Vereinigte Arabische Emirate", "الإمارات العربية المتحدة", "المملكة العربية السعودية"]) {
      expect(recruitmentLanguageCodes(text), text).toEqual([]);
    }
    expect(recruitmentLanguageCodes("Arabe (Émirats arabes unis)")).toEqual(["ar"]);
    expect(recruitmentLanguageCodes("اللغة العربية")).toEqual(["ar"]);
    expect(recruitmentLanguageCodes("Mandarin")).toEqual(["zh"]);
    const [greek] = recruitmentLanguageRequirements("Grec");
    expect(meetsRequiredLanguage(["expérience en Grèce"], greek!)).toBe(false);
    expect(meetsRequiredLanguage(["Grecque"], greek!)).toBe(true);
  });

  it("sépare les langues d’une exigence, sauf entre parenthèses, chacune avec ses codes (IA-02)", () => {
    const texts = (required: string) => recruitmentLanguageRequirements(required).map(requirement => requirement.text);
    for (const required of ["Anglais/Arabe", "anglais et arabe", "Anglais, Arabe", "Anglais; Arabe", "Anglais + Arabe", "Anglais & Arabe", "English and Arabic", "Englisch und Arabisch", "英语和阿拉伯语", "英语、阿拉伯语"]) {
      expect(recruitmentLanguageRequirements(required).map(requirement => requirement.codes), required).toEqual([["en"], ["ar"]]);
    }
    expect(texts("Anglais (C1/C2), arabe")).toEqual(["Anglais (C1/C2)", "arabe"]);
    // Several languages without a separator: one requirement, all of them required.
    expect(recruitmentLanguageRequirements("anglais arabe")).toEqual([{ text: "anglais arabe", codes: ["en", "ar"] }]);
    expect(recruitmentLanguageRequirements("Wolof")).toEqual([{ text: "Wolof", codes: [] }]);
    expect(recruitmentLanguageRequirements(" , / ")).toEqual([]);
  });

  it("dit si les langues d’un candidat tiennent une exigence : par code, ou par les mots entiers d’une langue hors table", () => {
    const [french] = recruitmentLanguageRequirements("Français");
    const [both] = recruitmentLanguageRequirements("anglais arabe");
    const [wolof] = recruitmentLanguageRequirements("Wolof");
    const [partial] = recruitmentLanguageRequirements("fran");
    expect(meetsRequiredLanguage(["French", "Arabic"], french!)).toBe(true);
    expect(meetsRequiredLanguage(["English", "العربية"], both!)).toBe(true);
    expect(meetsRequiredLanguage(["Arabic"], both!)).toBe(false);
    expect(meetsRequiredLanguage(["Wolof (courant)"], wolof!)).toBe(true);
    expect(meetsRequiredLanguage(["Wolofs"], wolof!)).toBe(false);
    expect(meetsRequiredLanguage(["Français"], partial!)).toBe(false);
    // The names that give it: those of one of its languages, not another.
    expect(["Arabic", "English (polished)", "Germany", "Arabisch"].filter(name => givesRequiredLanguage(name, both!))).toEqual(["Arabic", "English (polished)", "Arabisch"]);
    const [polish, german] = recruitmentLanguageRequirements("Polish, German");
    expect(givesRequiredLanguage("English (polished)", polish!)).toBe(false);
    expect(givesRequiredLanguage("Germany", german!)).toBe(false);
    expect(givesRequiredLanguage("Deutsch", german!)).toBe(true);
  });

  it("ne replie et ne cherche chaque texte qu’une fois, avec le même résultat ensuite (IA-02)", () => {
    const texts = ["Anglais (B2)", "Arabe littéraire", "Wolof courant"];
    const first = texts.map(recruitmentLanguageCodes);
    const [arabic] = recruitmentLanguageRequirements("Arabe littéraire");
    const [wolof] = recruitmentLanguageRequirements("Wolof courant");
    folding.texts = [];
    // A mission ranks up to 2 000 candidates, a profile checks up to 10 000 dossiers, under the same few names.
    for (let round = 0; round < 2_000; round++) {
      expect(texts.map(recruitmentLanguageCodes)).toEqual(first);
      expect(givesRequiredLanguage("Anglais (B2)", arabic!)).toBe(false);
      expect(meetsRequiredLanguage(["Anglais (B2)", "Arabe littéraire"], arabic!)).toBe(true);
      expect(meetsRequiredLanguage(["Anglais (B2)", "Wolof courant"], wolof!)).toBe(true);
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
