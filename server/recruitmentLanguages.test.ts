import { describe, expect, it, vi } from "vitest";
import { givesRequiredLanguage, meetsRequiredLanguage, recruitmentLanguageCodes, recruitmentLanguagePrefixCodes, recruitmentLanguageRequirements, RECRUITMENT_LANGUAGES } from "../shared/recruitmentLanguages";
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

  it("reconnaît l’hébreu sous chacun de ses noms et les adjectifs qui nomment une langue, pas les lieux qu’ils nomment aussi (IA-02)", () => {
    for (const name of ["hébraïque", "Hébraïque", "langue hébraïque", "études hébraïques", "hébreu", "Hébreux", "Hebrew", "Hebräisch", "Hebräische", "希伯来语", "希伯来文", "עברית"]) {
      expect(recruitmentLanguageCodes(name), name).toEqual(["he"]);
    }
    for (const [name, code] of [["langue arabique", "ar"], ["Persique", "fa"], ["langue hellénique", "el"], ["Hollandais", "nl"], ["hollandaise", "nl"]] as const) {
      expect(recruitmentLanguageCodes(name), name).toEqual([code]);
    }
    for (const text of ["golfe Persique", "Golfe-Persique", "pays du Golfe arabo-persique", "péninsule arabique", "Golfe arabique", "gomme arabique", "République hellénique"]) expect(recruitmentLanguageCodes(text), text).toEqual([]);
    const [hebrew] = recruitmentLanguageRequirements("Hébreu");
    expect(meetsRequiredLanguage(["Langue hébraïque"], hebrew!)).toBe(true);
    expect(meetsRequiredLanguage(["Hebrew"], recruitmentLanguageRequirements("hébraïque")[0]!)).toBe(true);
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
    expect(recruitmentLanguageRequirements("anglais arabe")).toEqual([{ text: "anglais arabe", codes: ["en", "ar"], anyOf: [] }]);
    expect(recruitmentLanguageRequirements("Wolof")).toEqual([{ text: "Wolof", codes: [], anyOf: [] }]);
    expect(recruitmentLanguageRequirements(" , / ")).toEqual([]);
    // A Chinese conjunction separates two names only: 及 is also the second character of 埃及, Egypt.
    expect(recruitmentLanguageRequirements("埃及阿拉伯语")).toEqual([{ text: "埃及阿拉伯语", codes: ["ar"], anyOf: [] }]);
    expect(recruitmentLanguageRequirements("英语及阿拉伯语").map(requirement => requirement.codes)).toEqual([["en"], ["ar"]]);
  });

  it("sépare deux langues à un tiret entre espaces, demi-cadratin ou cadratin, pas à un trait d’union ni avant un niveau (IA-02)", () => {
    for (const required of ["Anglais - Arabe", "Anglais – Arabe", "Anglais — Arabe", "Anglais–Arabe", "Anglais\u00a0-\u00a0Arabe", "English - Arabic", "Anglais (C1) – Arabe (notions)"]) {
      expect(recruitmentLanguageRequirements(required).map(requirement => requirement.codes), required).toEqual([["en"], ["ar"]]);
    }
    expect(recruitmentLanguageRequirements("Français - Anglais - Arabe").map(requirement => requirement.text)).toEqual(["Français", "Anglais", "Arabe"]);
    // As with « / », a candidate who has one of them meets one requirement of the two.
    const requirements = recruitmentLanguageRequirements("Anglais - Arabe");
    expect(requirements.map(requirement => meetsRequiredLanguage(["English"], requirement))).toEqual([true, false]);
    // A hyphen within a name, a level after a dash: one requirement.
    expect(recruitmentLanguageRequirements("serbo-croate")).toEqual([{ text: "serbo-croate", codes: [], anyOf: [] }]);
    expect(recruitmentLanguageRequirements("Anglais - courant")).toEqual([{ text: "Anglais - courant", codes: ["en"], anyOf: [] }]);
    expect(recruitmentLanguageRequirements("Arabe – langue maternelle")).toEqual([{ text: "Arabe – langue maternelle", codes: ["ar"], anyOf: [] }]);
    // A level between two dashes stays with the language before it, as « Anglais - Arabe courant » does.
    for (const [required, texts] of [
      ["Anglais - Arabe - courant", ["Anglais", "Arabe - courant"]],
      ["Anglais - C1 - Arabe", ["Anglais - C1", "Arabe"]],
      ["Anglais - Arabe courant", ["Anglais", "Arabe courant"]],
      ["埃及阿拉伯语和英语", ["埃及阿拉伯语", "英语"]],
    ] as const) {
      expect(recruitmentLanguageRequirements(required).map(requirement => requirement.text), required).toEqual(texts);
    }
  });

  it("lit une exigence qui laisse le choix comme une seule, tenue par l’une de ses langues (IA-02)", () => {
    const choices: Array<[string, string[], string[]]> = [
      ["Anglais ou arabe", ["en", "ar"], ["Anglais", "arabe"]], ["English or Arabic", ["en", "ar"], ["English", "Arabic"]],
      ["Englisch oder Arabisch", ["en", "ar"], ["Englisch", "Arabisch"]], ["anglais et/ou arabe", ["en", "ar"], ["anglais", "arabe"]],
      ["English and/or Arabic", ["en", "ar"], ["English", "Arabic"]], ["英语或阿拉伯语", ["en", "ar"], ["英语", "阿拉伯语"]], ["英语或者阿拉伯语", ["en", "ar"], ["英语", "阿拉伯语"]],
      ["Español o árabe", ["ar", "es"], ["Español", "árabe"]], ["Português e/ou árabe", ["ar", "pt"], ["Português", "árabe"]],
      ["Anglais, français ou arabe", ["fr", "en", "ar"], ["Anglais", "français", "arabe"]],
    ];
    for (const [required, codes, anyOf] of choices) {
      const requirements = recruitmentLanguageRequirements(required);
      expect(requirements, required).toEqual([{ text: required, codes, anyOf }]);
      expect(meetsRequiredLanguage(["Arabic"], requirements[0]!), required).toBe(true);
      expect(meetsRequiredLanguage(["Deutsch", "Wolof"], requirements[0]!), required).toBe(false);
    }
    expect(meetsRequiredLanguage(["Anglais"], recruitmentLanguageRequirements("English or Arabic")[0]!)).toBe(true);
    // A language the table does not know among them, by its words.
    const [wolofOrEnglish] = recruitmentLanguageRequirements("Wolof ou anglais");
    expect(meetsRequiredLanguage(["Wolof (courant)"], wolofOrEnglish!)).toBe(true);
    expect(meetsRequiredLanguage(["Wolof courant"], recruitmentLanguageRequirements("Allemand et/ou wolof")[0]!)).toBe(true);
    expect(meetsRequiredLanguage(["Wolofs"], wolofOrEnglish!)).toBe(false);
    expect(givesRequiredLanguage("Arabic", wolofOrEnglish!)).toBe(false);
    // Between brackets, a choice is a qualifier: « Anglais (ou arabe) » requires English.
    expect(recruitmentLanguageRequirements("Anglais (ou arabe)")).toEqual([{ text: "Anglais (ou arabe)", codes: ["en", "ar"], anyOf: [] }]);
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
    // Its words whole in the name, or the name's in its own, what either says between brackets aside.
    for (const [required, name] of [["Wolof courant", "Wolof"], ["Wolof (courant)", "Wolof"], ["Wolof courant", "Wolof (C1)"], ["Swahili courant", "Swahili"], ["Créole haïtien", "Créole"], ["Wolof", "wolof courant"]]) {
      expect(meetsRequiredLanguage([name], recruitmentLanguageRequirements(required)[0]!), `${required} / ${name}`).toBe(true);
    }
    for (const [required, name] of [["Wolof courant", "Wolofs"], ["Wolof courant", "Bambara courant"], ["Créole haïtien", "Créoles"]]) {
      expect(meetsRequiredLanguage([name], recruitmentLanguageRequirements(required)[0]!), `${required} / ${name}`).toBe(false);
    }
    // A language of the table is compared by its code only, not by its name within one the table does not know.
    expect(meetsRequiredLanguage(["Mandarin"], recruitmentLanguageRequirements("Mandarin Oriental")[0]!)).toBe(false);
    expect(meetsRequiredLanguage(["Français"], partial!)).toBe(false);
    // The names that give it: those of one of its languages, not another.
    expect(["Arabic", "English (polished)", "Germany", "Arabisch"].filter(name => givesRequiredLanguage(name, both!))).toEqual(["Arabic", "English (polished)", "Arabisch"]);
    const [polish, german] = recruitmentLanguageRequirements("Polish, German");
    expect(givesRequiredLanguage("English (polished)", polish!)).toBe(false);
    expect(givesRequiredLanguage("Germany", german!)).toBe(false);
    expect(givesRequiredLanguage("Deutsch", german!)).toBe(true);
  });

  it("trouve les langues dont un nom commence par un texte d’au moins trois lettres, comme le filtre Langue pendant la frappe (IA-02)", () => {
    for (const [typed, codes] of [["angl", ["en"]], ["Arab", ["ar"]], ["fran", ["fr"]], ["deu", ["de"]], ["阿拉伯", ["ar"]], ["anglais", ["en"]]] as const) {
      expect(recruitmentLanguagePrefixCodes(typed), typed).toEqual(codes);
    }
    for (const typed of ["an", "fr", " - ", "wol", "germany", "polished"]) expect(recruitmentLanguagePrefixCodes(typed), typed).toEqual([]);
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
