import { describe, expect, it, vi } from "vitest";
import { givesRequiredLanguage, meetsRequiredLanguage, recruitmentLanguageCodes, recruitmentLanguageListRequirements, recruitmentLanguagePrefixCodes, recruitmentLanguageRequirements, RECRUITMENT_LANGUAGES } from "../shared/recruitmentLanguages";
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
    // Hebrew with its points, as with the Arabic harakat.
    for (const name of ["Hébreu", "עברית", "עִבְרִית"]) expect(recruitmentLanguageCodes(name)).toEqual(["he"]);
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

  it("lit une langue absente de la table à côté d’un tiret comme une langue, pas comme un niveau, et un tiret collé d’un côté comme un séparateur (IA-02)", () => {
    // Before: « Serbo-croate – Anglais » was English alone, met by an English speaker.
    for (const [required, texts] of [
      ["Serbo-croate – Anglais", ["Serbo-croate", "Anglais"]],
      ["Wolof – Anglais", ["Wolof", "Anglais"]],
      ["Anglais – Wolof", ["Anglais", "Wolof"]],
      ["Anglais - Wolof courant", ["Anglais", "Wolof courant"]],
      ["Berbère - Arabe - courant", ["Berbère", "Arabe - courant"]],
      // Named in French, English, German or Chinese, by its ISO 639 code, or among the few names it gives none of.
      ["Arabe – Kabyle", ["Arabe", "Kabyle"]],
      ["Anglais – Tagalog", ["Anglais", "Tagalog"]],
      ["English – Swahili", ["English", "Swahili"]],
      ["Englisch – Suaheli", ["Englisch", "Suaheli"]],
      ["英语和沃洛夫语", ["英语", "沃洛夫语"]],
      ["Arabe – Tamazight", ["Arabe", "Tamazight"]],
      // Levels, a language test or a level with its digits stay with their language.
      ["Anglais - IELTS 7.5", ["Anglais - IELTS 7.5"]],
      ["Anglais – très bon niveau", ["Anglais – très bon niveau"]],
      ["Englisch - fließend", ["Englisch - fließend"]],
      ["Anglais - mother tongue - Arabe", ["Anglais - mother tongue", "Arabe"]],
      ["英语 - 流利", ["英语 - 流利"]],
      ["Arabe littéraire – dialecte du Golfe", ["Arabe littéraire – dialecte du Golfe"]],
      // A dash with a space on one side only, or a full width or small em dash.
      ["Anglais- Arabe", ["Anglais", "Arabe"]],
      ["Anglais -Arabe", ["Anglais", "Arabe"]],
      [`Anglais ${String.fromCodePoint(0xff0d)} Arabe`, ["Anglais", "Arabe"]],
      [`Anglais${String.fromCodePoint(0xfe58)}Arabe`, ["Anglais", "Arabe"]],
      [`Anglais ${String.fromCodePoint(0x2e3a)} Arabe`, ["Anglais", "Arabe"]],
      ["Anglais- courant", ["Anglais- courant"]],
      ["serbo-croate", ["serbo-croate"]],
    ] as const) {
      expect(recruitmentLanguageRequirements(required).map(requirement => requirement.text), required).toEqual(texts);
    }
    // As with « / »: a candidate who speaks English only meets one requirement of the two.
    for (const required of ["Serbo-croate – Anglais", "Wolof – Anglais", "Anglais – Wolof", "Serbo-croate / Anglais", "Anglais- Arabe"]) {
      expect(recruitmentLanguageRequirements(required).map(requirement => meetsRequiredLanguage(["English"], requirement)).sort(), required).toEqual([false, true]);
    }
    // A language outside the table under its usual name, which Intl.DisplayNames gives otherwise (Twi: « Akan »,
    // Kirundi: « roundi », Sotho: « sotho du Sud », créole: « créole haïtien ») or has no ISO 639-1 code for
    // (Cantonese, Dari, Cebuano, Pulaar, Dioula, Sorani, Tigré): before, it qualified the language beside it.
    for (const [required, texts] of [
      ["Cantonais – Anglais", ["Cantonais", "Anglais"]], ["Cantonese – English", ["Cantonese", "English"]], ["粤语 – 英语", ["粤语", "英语"]],
      ["中文 – 粤语", ["中文", "粤语"]], ["广东话 – 英语", ["广东话", "英语"]], ["Twi – English", ["Twi", "English"]], ["Luganda – English", ["Luganda", "English"]],
      ["Kirundi – Français", ["Kirundi", "Français"]], ["Sotho – English", ["Sotho", "English"]], ["Ndebele – English", ["Ndebele", "English"]],
      ["Créole – Français", ["Créole", "Français"]], ["Gaelic – English", ["Gaelic", "English"]], ["Frison – Néerlandais", ["Frison", "Néerlandais"]],
      ["Gaélique – Anglais", ["Gaélique", "Anglais"]], ["Dari – Anglais", ["Dari", "Anglais"]], ["Cebuano – English", ["Cebuano", "English"]],
      ["Pulaar – Français", ["Pulaar", "Français"]], ["Dioula – Français", ["Dioula", "Français"]], ["Sorani – Arabe", ["Sorani", "Arabe"]],
      ["Tigré – Arabe", ["Tigré", "Arabe"]], ["Tshiluba – Français", ["Tshiluba", "Français"]], ["English – isiZulu", ["English", "isiZulu"]],
    ] as const) {
      expect(recruitmentLanguageRequirements(required).map(requirement => requirement.text), required).toEqual(texts);
      expect(recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(["English", "French", "Arabic", "Dutch", "Chinese"], requirement)), required).toHaveLength(1);
    }
    // Not a word that only reads, accents aside, as a language's name (« moré », Mooré: « more »).
    expect(recruitmentLanguageRequirements("English – more than B2").map(requirement => requirement.text)).toEqual(["English – more than B2"]);
    const [wolof] = recruitmentLanguageRequirements("Wolof – Anglais");
    expect(wolof).toEqual({ text: "Wolof", codes: [], anyOf: [] });
    expect(meetsRequiredLanguage(["Wolof (courant)"], wolof!)).toBe(true);
  });

  it("reconnaît une langue hors table sous chacun de ses noms, par le code de la langue qu’il nomme, comme une langue de la table (IA-02)", () => {
    // The form records the language in the page's language, the AI reads it in the CV's, the admin writes the mission in French.
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    for (const [required, names] of [
      ["Cantonais – Anglais", ["English", "Cantonese"]], ["Cantonais – Anglais", ["English", "粤语"]], ["Cantonais – Anglais", ["English", "Kantonesisch"]],
      ["Cantonais / Anglais", ["English", "Cantonese"]], ["粤语 – 英语", ["English", "Cantonais"]], ["Chinois – Cantonais", ["Chinese", "Cantonese"]],
      ["Gaélique – Anglais", ["English", "Gaelic"]], ["Frison – Anglais", ["English", "Frisian"]], ["Dioula – Français", ["French", "Dyula"]],
      ["Twi – Anglais", ["English", "Twi"]], ["Sorani – Arabe", ["Arabic", "Central Kurdish"]],
    ] as const) {
      // Before: one of the two requirements, its words not found in the other name (8 language points of 15).
      expect(met(required, [...names]), `${required} / ${names.join(", ")}`).toBe(2);
    }
    // English only, or another language of no common name: one requirement of the two.
    expect(met("Cantonais – Anglais", ["English"])).toBe(1);
    expect(met("Cantonais – Anglais", ["English", "Hakka"])).toBe(1);
    expect(met("Gaélique – Anglais", ["English", "Irish"])).toBe(1);
    const [cantonese] = recruitmentLanguageRequirements("Cantonais");
    expect(["Cantonese", "粤语", "广东话", "Mandarin", "Chinese"].filter(name => givesRequiredLanguage(name, cantonese!))).toEqual(["Cantonese", "粤语", "广东话"]);
  });

  it("reconnaît une langue hors table sous ses noms usuels (noms ISO anglais, graphies courantes, noms que les candidats écrivent) et une macrolangue ou une famille par chacun de ses membres (IA02-R3-NOMS-BIS)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    for (const [required, names] of [
      ["Pachto – Anglais", ["English", "Pushto"]], ["Pachto – Anglais", ["English", "Pashtu"]], ["Pendjabi – Anglais", ["English", "Panjabi"]],
      ["Azerbaïdjanais – Anglais", ["English", "Azeri"]], ["Indonésien – Anglais", ["English", "Bahasa Indonesia"]], ["Malais – Anglais", ["English", "Bahasa Melayu"]],
      ["Népalais – Anglais", ["English", "Nepalese"]], ["Peul – Français", ["French", "Fulani"]], ["Peul – Français", ["French", "Pulaar"]],
      // A macrolanguage or a family, met by each of its languages.
      ["Berbère – Français", ["French", "Kabyle"]], ["Berbère – Français", ["French", "Tachelhit"]], ["Kurde – Anglais", ["English", "Sorani"]],
      ["Kurde – Anglais", ["English", "Kurmanji"]], ["Serbo-croate – Anglais", ["English", "Serbian"]], ["Serbo-croate – Anglais", ["English", "Bosnian"]],
      ["Serbo-croate – Anglais", ["English", "Croatian"]],
    ] as const) {
      // Before (ddcc047): one of the two requirements, 8 language points of 15, neither the profile nor the Langue filter.
      expect(met(required, [...names]), `${required} / ${names.join(", ")}`).toBe(2);
    }
    // English only meets one of them; a language of the family does not meet another of its languages.
    for (const required of ["Kurde – Anglais", "Pachto – Anglais", "Serbo-croate – Anglais"]) expect(met(required, ["English"]), required).toBe(1);
    expect(met("Sorani – Anglais", ["English", "Kurdish"])).toBe(1);
    // French names that are languages: two requirements, not one met by French or English alone (before: « Moré – Français » was French).
    for (const required of ["Moré – Français", "Azéri – Anglais", "Malinké – Français", "Comorien – Français", "Pidgin – Anglais"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
      expect(met(required, ["French", "English"]), required).toBe(1);
    }
    expect(met("Moré – Français", ["French", "Mooré"])).toBe(2);
    // « more », a word, is no language without its accent.
    expect(recruitmentLanguageRequirements("English – more than B2").map(requirement => requirement.text)).toEqual(["English – more than B2"]);
  });

  it("reconnaît une langue hors table sous le nom que ses locuteurs lui donnent, et les membres d’une famille que la table nommait sans les lire (IA02-R3-NOMS-BIS)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    for (const [required, names] of [
      // The language's own name (Intl.DisplayNames in that language), and its spellings the candidates write.
      ["Serbo-croate – Anglais", ["English", "Srpski"]], ["Serbo-croate – Anglais", ["English", "Српски"]], ["Serbo-croate – Anglais", ["English", "Hrvatski"]],
      ["Serbo-croate – Anglais", ["English", "Bosanski"]], ["Serbo-croate – Anglais", ["English", "Montenegrin"]], ["Berbère – Français", ["French", "Taqbaylit"]],
      ["Berbère – Français", ["French", "Tarifit"]], ["Berbère – Français", ["French", "Rifain"]], ["Berbère – Français", ["French", "Riffian"]],
      ["Kurde – Anglais", ["English", "کوردی"]], ["Malayalam – Anglais", ["English", "മലയാളം"]], ["Tamoul – Anglais", ["English", "தமிழ்"]],
      ["Bengali – Anglais", ["English", "বাংলা"]], ["Népalais – Anglais", ["English", "नेपाली"]], ["Cingalais – Anglais", ["English", "සිංහල"]],
      ["Pendjabi – Anglais", ["English", "ਪੰਜਾਬੀ"]], ["Pendjabi – Anglais", ["English", "پنجابی"]], ["Somali – Anglais", ["English", "Soomaali"]],
      ["Somali – Anglais", ["English", "Af-Soomaali"]], ["Kinyarwanda – Français", ["French", "Ikinyarwanda"]], ["Ouzbek – Anglais", ["English", "Oʻzbek"]],
      ["Arménien – Anglais", ["English", "Հայերեն"]], ["Géorgien – Anglais", ["English", "ქართული"]], ["Thaï – Anglais", ["English", "ภาษาไทย"]],
      ["Vietnamien – Anglais", ["English", "Tiếng Việt"]], ["Bulgare – Anglais", ["English", "Български"]], ["Hongrois – Anglais", ["English", "Magyar"]],
      ["Tchèque – Anglais", ["English", "Čeština"]], ["Suédois – Anglais", ["English", "Svenska"]], ["Norvégien – Anglais", ["English", "Norsk"]],
      ["Norvégien – Anglais", ["English", "Bokmål"]], ["Norvégien – Anglais", ["English", "Nynorsk"]], ["Danois – Anglais", ["English", "Dansk"]],
      ["Finnois – Anglais", ["English", "Suomi"]], ["Yiddish – Anglais", ["English", "ייִדיש"]], ["Yiddish – Anglais", ["English", "יידיש"]],
      // English names still in use for a country's language.
      ["Birman – Anglais", ["English", "Myanmar"]], ["Birman – Anglais", ["English", "Burmese"]], ["Khmer – Anglais", ["English", "Cambodian"]],
      ["Lao – Anglais", ["English", "Laotian"]], ["Tagalog – Anglais", ["English", "Pilipino"]],
    ] as const) {
      // Before (d300a39): one of the two requirements, 8 language points of 15, neither the profile nor the Langue filter.
      expect(met(required, [...names]), `${required} / ${names.join(", ")}`).toBe(2);
    }
    // English alone still meets one of them; a member of a family does not meet another of its members.
    for (const required of ["Serbo-croate – Anglais", "Kurde – Anglais", "Norvégien – Anglais"]) expect(met(required, ["English"]), required).toBe(1);
    expect(met("Berbère – Français", ["French"])).toBe(1);
    expect(met("Bokmål – Anglais", ["English", "Nynorsk"])).toBe(1);
    expect(met("Croate – Anglais", ["English", "Srpski"])).toBe(1);
  });

  it("garde avec sa langue ce qui la qualifie après un tiret : une exigence, une préférence, une variété ou une région, en français, anglais, allemand et chinois (IA-02)", () => {
    // Before: « Anglais – obligatoire » was two requirements, English and « obligatoire », met by nobody.
    const qualified: Array<[string, string]> = [
      ["Anglais – obligatoire", "en"], ["Anglais – exigé", "en"], ["Anglais – requis", "en"], ["Anglais – indispensable", "en"], ["Anglais – impératif", "en"],
      ["Anglais – minimum B2", "en"], ["Anglais – courant exigé", "en"], ["Anglais – niveau C1 exigé", "en"], ["Anglais – IELTS 7 requis", "en"],
      ["Anglais – courant (obligatoire)", "en"], ["Anglais – atout", "en"], ["Arabe – souhaité", "ar"], ["Arabe – un plus", "ar"], ["Arabe – apprécié", "ar"],
      ["English – required", "en"], ["English – mandatory", "en"], ["English – essential", "en"], ["English – desirable", "en"], ["Arabic – preferred", "ar"],
      ["Deutsch – erforderlich", "de"], ["Englisch – wünschenswert", "en"], ["英语 – 必须", "en"], ["英语 – 优先", "en"],
      ["Arabe – Golfe", "ar"], ["Arabic – Gulf", "ar"], ["Arabe – égyptien", "ar"], ["Arabe – levantin", "ar"], ["Arabe – maghrébin", "ar"], ["Arabe – Fusha", "ar"],
      ["Portugais – Brésil", "pt"], ["Anglais – UK", "en"], ["Anglais – US", "en"], ["Espagnol – Amérique latine", "es"], ["Spanish – Latin American", "es"],
    ];
    const speaker: Record<string, string> = { en: "English", ar: "Arabic", de: "German", pt: "Portuguese", es: "Spanish" };
    for (const [required, code] of qualified) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: [code], anyOf: [] }]);
      expect(meetsRequiredLanguage([speaker[code]!], recruitmentLanguageRequirements(required)[0]!), required).toBe(true);
    }
    expect(recruitmentLanguageRequirements("Anglais – obligatoire, Arabe – souhaité").map(requirement => requirement.codes)).toEqual([["en"], ["ar"]]);
  });

  it("lit un pays après un tiret comme ce qui qualifie la langue voisine, même quand son nom est aussi celui d’une langue hors table, et une langue comme une seconde exigence (IA02-R4-REGIONS)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // « Indonesia » is Indonesian in its own language, « Myanmar » an English name of Burmese: before, a second
    // requirement, which a candidate who speaks English did not meet (8 language points of 15, neither the profile nor the Langue filter).
    for (const required of [
      "English – Indonesia", "English – Myanmar", "English – Myanmar (Burma)", "Anglais – Myanmar", "Anglais – Myanmar (Birmanie)", "Englisch – Myanmar",
      "English – Malaysia", "English – Philippines", "Anglais – Indonésie",
    ]) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: ["en"], anyOf: [] }]);
      expect(met(required, ["English"]), required).toBe(1);
    }
    // A language beside a dash, named so in French or English, is still a requirement of its own, which English alone does not meet.
    for (const required of ["Wolof – Anglais", "Serbo-croate – Anglais", "Anglais – Wolof", "Indonésien – Anglais", "Birman – Anglais", "Anglais – Birman", "Arménien – Anglais"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
      expect(met(required, ["English"]), required).toBe(1);
    }
    // A candidate's language is still read under these names.
    expect(met("Birman – Anglais", ["English", "Myanmar"])).toBe(2);
    expect(met("Indonésien – Anglais", ["English", "Indonesia"])).toBe(2);
  });

  it("lit encore un pays après un tiret comme ce qui qualifie la langue voisine quand un mot d’exigence, un niveau ou un autre mot l’accompagne (IA02-R4-REGIONS-MOTS)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // Before: the country was a region only when nothing else was written beside it, a second requirement otherwise.
    for (const required of [
      "English – Myanmar required", "English – Indonesia only", "English – Myanmar office", "Anglais – Myanmar obligatoire", "Anglais – Indonesia exigé",
      "English – C1 Myanmar", "English – Myanmar (Burma) required", "Englisch – Myanmar erforderlich", "English – Kongo-Kinshasa required",
      "English – Malaysia required", "Anglais – Indonésie obligatoire", "English – Thailand only",
    ]) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: ["en"], anyOf: [] }]);
      expect(met(required, ["English"]), required).toBe(1);
    }
    // A language named beside it, or a name of a language that holds the country's (« Bahasa Indonesia »), is still a requirement of its own.
    for (const required of ["Wolof – Anglais obligatoire", "Arménien – Anglais requis", "English – Bahasa Indonesia", "English – Myanmar Wolof", "Anglais – Birman obligatoire"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
      expect(met(required, ["English"]), required).toBe(1);
    }
  });

  it("lit une région ou une province après un tiret comme ce qui qualifie la langue voisine, quand son nom tient celui d’une langue hors table parmi d’autres mots (IA02-R4-REGIONS-SOUS-NATIONALES)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // Before (a2ff644): a second requirement, the name of a language the table does not know (tamil, basque, wallon, corse,
    // jawa, kongo, somali, afar, yoruba, thaï, navajo) found whole in it, which a candidate who speaks the language beside
    // it did not meet (8 language points of 15, neither the profile nor the Langue filter); 600b1c3 read it as here.
    for (const [required, code, speaker] of [
      ["English – Tamil Nadu", "en", "English"], ["Anglais – Tamil Nadu obligatoire", "en", "English"], ["Français – Pays basque", "fr", "French"],
      ["Espagnol – Pays basque", "es", "Spanish"], ["Spanish – Basque Country required", "es", "Spanish"], ["Français – Brabant wallon", "fr", "French"],
      ["Français – Corse-du-Sud", "fr", "French"], ["Français – Haute-Corse obligatoire", "fr", "French"], ["English – Jawa Barat", "en", "English"],
      ["Français – Kongo Central", "fr", "French"], ["Français – Province du Kongo-Central", "fr", "French"], ["English – Somali Region", "en", "English"],
      ["Anglais – région Afar", "en", "English"], ["Anglais – pays yoruba", "en", "English"], ["English – Thái Nguyên", "en", "English"],
      ["English – Navajo Nation", "en", "English"], ["English – C1 Tamil Nadu required", "en", "English"], ["英语 – Tamil Nadu", "en", "English"],
    ] as const) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: [code], anyOf: [] }]);
      expect(met(required, [speaker]), required).toBe(1);
    }
  });

  it("lit un pays écrit avec le nom d’une langue hors table après un tiret comme ce qui qualifie la langue voisine (IA02-R4-REGIONS-SOUS-NATIONALES)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // Before (a2ff644): a second requirement, the name of the language lying outside the country's; one, as on 600b1c3.
    for (const required of ["Anglais – Sénégal wolof", "Anglais – Burkina Faso moré", "English – Ghana Twi", "English – Kongo-Kinshasa Lingala", "English – Myanmar Shan State"]) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: ["en"], anyOf: [] }]);
      expect(met(required, ["English"]), required).toBe(1);
    }
  });

  it("lit un nom de pays écrit comme Intl.DisplayNames l’écrit en français, anglais, allemand ou chinois après un tiret comme ce qui qualifie la langue voisine, même s’il s’écrit aussi comme le nom d’une langue hors table (IA02-R4-REGIONS-SOUS-NATIONALES)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // Before (a2ff644): a second requirement, the German name of the country being the French name of its language without
    // its accents (Indonesien, Georgien, Armenien) or its German or English name (Fidschi, Nauru); one, as on 600b1c3.
    for (const [required, code] of [
      ["Englisch – Indonesien", "en"], ["Englisch – Indonesien erforderlich", "en"], ["Englisch – Georgien", "en"], ["Englisch – Armenien", "en"],
      ["Englisch – Fidschi", "en"], ["English – Nauru", "en"], ["English – Nauru required", "en"], ["Deutsch – Georgien", "de"],
      // Written with other accents than Intl.DisplayNames's, a country still when it is none of its language's names.
      ["Português – Indonésia", "pt"],
    ] as const) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: [code], anyOf: [] }]);
      expect(met(required, ["English", "German", "Portuguese"]), required).toBe(1);
    }
    // The French name of the language, written with its accents, is no country's: still a requirement of its own.
    for (const required of ["Anglais – Arménien", "Arménien – Anglais", "Anglais – Indonésien", "Géorgien – Anglais", "ANGLAIS – ARMÉNIEN"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
      expect(met(required, ["English"]), required).toBe(1);
    }
    expect(met("Arménien – Anglais", ["English", "Armenian"])).toBe(2);
  });

  it("lit une partie faite du seul nom d’une langue hors table, ses mots d’exigence, de niveau ou de test, ses chiffres et sa ponctuation à part, comme une seconde exigence (IA-02)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // A requirement of its own, as « Wolof – Anglais » is, which the language beside it alone does not meet.
    for (const [required, texts] of [
      ["Anglais – Wolof obligatoire", ["Anglais", "Wolof obligatoire"]], ["English – Tamil required", ["English", "Tamil required"]],
      ["Français – Basque (C1)", ["Français", "Basque (C1)"]], ["Anglais – Wolof langue maternelle", ["Anglais", "Wolof langue maternelle"]],
      ["English – Yoruba native speaker", ["English", "Yoruba native speaker"]], ["Englisch – Baskisch fließend", ["Englisch", "Baskisch fließend"]],
      ["English – Swahili B2", ["English", "Swahili B2"]], ["Anglais – Wolof à l'oral", ["Anglais", "Wolof à l'oral"]],
      ["Anglais – Wolof niveau B2 minimum", ["Anglais", "Wolof niveau B2 minimum"]], ["English – Twi IELTS", ["English", "Twi IELTS"]],
      ["Anglais – Wolof serait un plus", ["Anglais", "Wolof serait un plus"]], ["英语和粤语流利", ["英语", "粤语流利"]],
      ["中文 – 粤语 HSK五级", ["中文", "粤语 HSK五级"]], ["English – Myanmar Wolof", ["English", "Myanmar Wolof"]],
      // Wholly the name of a language, which is also a province's: a language.
      ["Français – Corse", ["Français", "Corse"]],
    ] as const) {
      expect(recruitmentLanguageRequirements(required).map(requirement => requirement.text), required).toEqual(texts);
      expect(met(required, ["English", "French", "German", "Chinese"]), required).toBe(1);
    }
    // The readings of the earlier rounds hold.
    for (const required of ["Anglais – obligatoire", "Arabe – Golfe", "Portugais – Brésil", "English – Indonesia required", "English – Myanmar required"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(1);
    }
    for (const required of ["Wolof – Anglais", "Serbo-croate – Anglais", "Cantonais – Anglais", "Twi – English", "Kurde – Anglais", "Moré – Français"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
    }
    expect(met("Kurde – Anglais", ["English", "Sorani"])).toBe(2);
  });

  it("lit une partie faite du nom d’une langue hors table et de mots d’exigence comme une seconde exigence, quelle que soit la tournure de l’exigence (IA02-R5-MOTS-EXIGENCE)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // Before (749519f): « serait un plus » two requirements, « serait un atout » one, « required » two, « is required » one,
    // « von Vorteil » two, « wäre von Vorteil » one, « 粤语流利 » two, « 熟练掌握粤语 » one: the language lost, met by English alone.
    for (const [lead, language, phrasings] of [
      ["Anglais", "Wolof", [
        "Wolof serait un plus", "Wolof serait un atout", "Wolof est un atout", "Wolof constitue un atout", "Wolof un avantage", "Wolof serait un avantage",
        "Wolof souhaité", "Wolof fortement souhaité", "Wolof vivement souhaité", "Wolof fortement apprécié", "Wolof fortement recommandé", "Wolof absolument",
        "Wolof attendu", "Wolof exigible", "Wolof aisance orale", "Wolof aisance à l'oral", "Wolof attestation de niveau",
      ]],
      ["English", "Tamil", [
        "Tamil required", "Tamil is required", "Tamil is essential", "Tamil is an advantage", "Tamil would be an advantage", "Tamil would be an asset",
        "Tamil a big plus", "Tamil a strong asset", "Tamil strongly preferred", "Tamil highly preferred", "Tamil highly desirable", "Tamil must-have",
        "Tamil nice-to-have", "Tamil near-native", "Tamil upper-intermediate", "Tamil good command", "Tamil excellent command", "Tamil strong command",
        "Tamil verbal", "Tamil communication skills", "Tamil B2 or above", "Tamil native or bilingual",
      ]],
      ["Englisch", "Tamil", [
        "Tamil von Vorteil", "Tamil wäre von Vorteil", "Tamil ist von Vorteil", "Tamil ist Pflicht", "Tamil ein Plus", "Tamil Sprachkenntnisse",
        "Tamil fundierte Kenntnisse", "Tamil sichere Kenntnisse", "Tamil auf muttersprachlichem Niveau", "Tamil B2 oder höher",
      ]],
      ["英语", "粤语", ["粤语流利", "熟练掌握粤语", "粤语者优先", "掌握粤语", "能熟练使用粤语", "会说粤语", "能说粤语", "粤语流利者优先", "粤语为母语", "粤语听说读写", "粤语沟通能力", "具备粤语沟通能力"]],
    ] as const) {
      for (const phrasing of phrasings) {
        for (const required of [`${lead} – ${phrasing}`, `${phrasing} – ${lead}`]) {
          expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
          expect(met(required, [lead]), required).toBe(1);
          expect(met(required, [lead, language]), required).toBe(2);
        }
      }
    }
    // A place, a use or a preposition that says where still qualifies the language beside it.
    for (const required of ["English – Tamil Nadu", "Français – en Corse", "Anglais – Wolof du Sénégal", "English – Tamil in clinic", "Anglais – Wolof pour les gardes", "Englisch – Tamil mit Patienten", "英语 – 粤语地区"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(1);
    }
  });

  it("garde avec sa langue ce qui la qualifie après une virgule, une barre oblique ou une conjonction quand il ne nomme aucune langue (IA02-R5-SEPARATEUR-QUALIFICATIFS)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // Before: « Anglais – parlé et écrit » was « Anglais – parlé » and « écrit », a requirement nobody meets (8 language points of 15,
    // neither the profile nor the Langue filter, even with six languages declared).
    for (const [required, code, speaker] of [
      ["Anglais – parlé et écrit", "en", "English"], ["English – spoken and written", "en", "English"], ["Englisch – fließend in Wort und Schrift", "en", "English"],
      ["Anglais – lu, écrit, parlé", "en", "English"], ["Anglais – C1/C2", "en", "English"], ["Anglais – Dubaï et Abou Dabi", "en", "English"],
      ["English – UAE and Qatar", "en", "English"], ["Arabe – Golfe et Levant", "ar", "Arabic"], ["English – Bosnia and Herzegovina", "en", "English"],
      ["English – Jammu and Kashmir", "en", "English"], ["Espagnol – Castilla y León", "es", "Spanish"], ["English – Malaysia and Indonesia", "en", "English"],
      ["英语 – 口语，必须", "en", "English"], ["Anglais – C1 ou C2", "en", "English"], ["English – UAE and Japan", "en", "English"],
    ] as const) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: [code], anyOf: [] }]);
      expect(met(required, [speaker]), required).toBe(1);
    }
    expect(met("Anglais – parlé et écrit", ["English", "Arabic", "French", "German", "Spanish", "Persian"])).toBe(1);
    // A part that names a language is still a requirement of its own, with what qualifies it.
    for (const [required, texts] of [
      ["Anglais et arabe", ["Anglais", "arabe"]], ["Anglais – obligatoire, Arabe – souhaité", ["Anglais – obligatoire", "Arabe – souhaité"]],
      ["Anglais – Wolof parlé et écrit", ["Anglais", "Wolof parlé et écrit"]], ["Anglais – Wolof parlé, écrit", ["Anglais", "Wolof parlé, écrit"]],
      ["obligatoire : anglais, arabe", ["obligatoire : anglais", "arabe"]], ["Anglais, Sérère", ["Anglais", "Sérère"]],
      ["Anglais (C1/C2), arabe", ["Anglais (C1/C2)", "arabe"]], ["Wolof, Sérère", ["Wolof", "Sérère"]],
    ] as const) {
      expect(recruitmentLanguageRequirements(required).map(requirement => requirement.text), required).toEqual(texts);
    }
    expect(met("Anglais – Wolof parlé, écrit", ["English", "Wolof"])).toBe(2);
    // The Langue filter still reads a second language being typed after a separator, not a country written whole.
    expect(recruitmentLanguageRequirements("anglais, ara").map(requirement => requirement.text)).toEqual(["anglais", "ara"]);
    expect(recruitmentLanguageRequirements("English – UAE and Russia")).toHaveLength(1);
    // A choice between two languages is still one requirement met by either.
    expect(recruitmentLanguageRequirements("Anglais ou arabe")).toEqual([{ text: "Anglais ou arabe", codes: ["en", "ar"], anyOf: ["Anglais", "arabe"] }]);
  });

  it("ne lit pas le nom d’une langue de la table pris dans le nom d’un lieu ou d’une autre langue comme cette langue, ni un pays écrit dans la langue du texte (IA02-R5-TABLE-DANS-LIEU)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // Before: a second requirement of the language the place's name holds (Persian, French, Russian, Dutch, Italian, Turkish),
    // which the speaker of the language beside it did not meet (8 language points of 15, neither the profile nor the Langue filter).
    for (const [required, code, speaker] of [
      ["Englisch – Italien", "en", "English"], ["Englisch – Italien erforderlich", "en", "English"], ["Deutsch – Italien", "de", "German"],
      ["English – Persian Gulf", "en", "English"], ["Englisch – Persischer Golf", "en", "English"], ["Arabic – Persian Gulf", "ar", "Arabic"],
      ["English – French Polynesia", "en", "English"], ["Anglais – Polynésie française", "en", "English"], ["Anglais – Guyane française", "en", "English"],
      ["English – French Guiana", "en", "English"], ["Englisch – Französisch-Polynesien", "en", "English"], ["English – Russian Federation", "en", "English"],
      ["English – Dutch Caribbean", "en", "English"], ["Anglais – Suisse italienne", "en", "English"], ["Anglais – Kurdistan turc", "en", "English"],
      ["Anglais – Îles Turques-et-Caïques", "en", "English"], ["Anglais – Pays basque français", "en", "English"], ["Arabe – monde arabe", "ar", "Arabic"],
    ] as const) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: [code], anyOf: [] }]);
      expect(met(required, [speaker]), required).toBe(1);
    }
    // Between brackets, the place adds no language to the requirement; the candidate who writes it keeps their language.
    expect(recruitmentLanguageRequirements("Arabic (Persian Gulf)")).toEqual([{ text: "Arabic (Persian Gulf)", codes: ["ar"], anyOf: [] }]);
    expect(recruitmentLanguageCodes("Arabe (golfe Persique)")).toEqual(["ar"]);
    expect(recruitmentLanguageCodes("Français (Polynésie française)")).toEqual(["fr"]);
    // The name of a language the table does not know that holds a name of the table is that language only (Kurdish, not German).
    expect(recruitmentLanguageCodes("库尔德语")).toEqual([]);
    expect(recruitmentLanguageCodes("南非荷兰语")).toEqual([]);
    expect(recruitmentLanguageCodes("Hakka Chinese")).toEqual([]);
    expect(met("库尔德语 – 英语", ["English", "German"])).toBe(1);
    expect(met("库尔德语 – 英语", ["English", "Kurdish"])).toBe(2);
    // Written in French, « Italien » is Italian: a requirement of its own, as alone or with a German word only.
    for (const required of ["Anglais – Italien", "Italien – Anglais", "Français – Italien", "Anglais – Italien erforderlich"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
      expect(met(required, ["English", "French"]), required).toBe(1);
      expect(met(required, ["English", "French", "Italian"]), required).toBe(2);
    }
    expect(recruitmentLanguageRequirements("Italien")).toEqual([{ text: "Italien", codes: ["it"], anyOf: [] }]);
    // A language of the table with its variety stays a requirement of its own.
    for (const required of ["Anglais – Arabe littéraire", "English – Gulf Arabic", "Anglais – Portugais du Brésil", "English – Arabic (Gulf)"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
    }
  });

  it("ne fait le qualificatif de la langue d’avant, après un séparateur, que d’une partie entièrement faite de mots de qualification connus : un nom de langue qu’aucune liste ne connaît reste une exigence (IA02-R5-LISTE-NOM-INCONNU)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    const listed = (terms: string[], names: string[]) => recruitmentLanguageListRequirements(terms).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // Before (c97413e): « Français, Darija » was one requirement, « Français, Darija », met by French alone (15 points, the
    // profile and the Langue filter): Darija, a word no list knows, qualified French and was lost.
    for (const [required, texts, lead, unknown] of [
      ["Français, Darija", ["Français", "Darija"], ["French"], ["Darija"]],
      ["Darija, Français", ["Darija", "Français"], ["French"], ["Darija"]],
      ["Anglais, Hassaniya", ["Anglais", "Hassaniya"], ["English"], ["Hassaniya"]],
      ["Français; Zarma", ["Français", "Zarma"], ["French"], ["Zarma"]],
      ["Français, Baoulé, Alsacien", ["Français", "Baoulé", "Alsacien"], ["French"], ["Baoulé", "Alsacien"]],
      ["Deutsch, Arabisch, Somalisch, Tigrinisch", ["Deutsch", "Arabisch", "Somalisch", "Tigrinisch"], ["German", "Arabic"], ["Somalisch", "Tigrinisch"]],
      ["Englisch, Tamilisch", ["Englisch", "Tamilisch"], ["English"], ["Tamilisch"]],
      ["English, Teochew", ["English", "Teochew"], ["English"], ["Teochew"]],
      ["英语，印尼语", ["英语", "印尼语"], ["English"], ["印尼语"]],
      ["Anglais – courant, Darija", ["Anglais – courant", "Darija"], ["English"], ["Darija"]],
      ["Anglais – lu, écrit, Darija", ["Anglais – lu, écrit", "Darija"], ["English"], ["Darija"]],
      ["Anglais – Wolof, Darija", ["Anglais", "Wolof", "Darija"], ["English", "Wolof"], ["Darija"]],
    ] as const) {
      expect(recruitmentLanguageRequirements(required).map(requirement => requirement.text), required).toEqual(texts);
      expect(met(required, [...lead]), required).toBe(lead.length);
      expect(met(required, [...lead, ...unknown]), required).toBe(texts.length);
      // A mission's text split at its commas, a profile typed with commas: the same requirements.
      const terms = required.split(/[,;，]/).map(term => term.trim());
      expect(recruitmentLanguageListRequirements(terms).length, required).toBe(texts.length);
      expect(listed(terms, [...lead]), required).toBe(lead.length);
    }
    // The short Chinese names and « castillan » of the languages of the table are those languages.
    for (const [required, code] of [["英语，阿语", "ar"], ["英语，西语", "es"], ["英语，葡语", "pt"], ["英语，意语", "it"], ["英语，荷语", "nl"], ["英语，朝鲜语", "ko"], ["Anglais, Castillan", "es"]] as const) {
      expect(recruitmentLanguageRequirements(required).map(requirement => requirement.codes), required).toEqual([["en"], [code]]);
      expect(met(required, ["English"]), required).toBe(1);
    }
    expect(met("英语，阿语", ["English", "Arabic"])).toBe(2);
    // Known qualification words, countries and places, and the places a dash opened, still qualify the language before them.
    for (const [required, code, speaker] of [
      ["Anglais – lu, écrit, parlé", "en", "English"], ["Anglais – C1/C2", "en", "English"], ["English – UAE, Qatar", "en", "English"],
      ["Anglais, Qatar", "en", "English"], ["Anglais – C1, 5 ans", "en", "English"], ["Anglais – courant, Arabie saoudite", "en", "English"],
      ["Anglais – Riyad, Dubaï", "en", "English"], ["Arabe – Golfe, Levant", "ar", "Arabic"], ["英语 – 利雅得、迪拜", "en", "English"],
      ["Anglais – Tamil Nadu et Kerala, Dubaï", "en", "English"], ["Portugais – Brésil, Angola", "pt", "Portuguese"],
    ] as const) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: [code], anyOf: [] }]);
      expect(listed(required.split(/[,、]/).map(term => term.trim()), [speaker]), required).toBe(1);
    }
    // A language among those places is still a requirement of its own.
    for (const required of ["Anglais – Golfe, Wolof", "Anglais – Riyad, arabe", "English – Dubai, Tamil required"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
    }
  });

  it("lit les lieux qu’un tiret ouvre comme un tout, après une virgule ou une conjonction, tant qu’ils ne nomment aucune langue (IA02-R5-LIEU-APRES-SEPARATEUR)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // Before (749519f): « Kerala », « Dubai » or « Dubaï » after a separator was a requirement nobody meets.
    for (const required of ["English – Tamil Nadu and Kerala", "Anglais – Pays haoussa et Dubaï", "English – Abu Dhabi and Dubai", "Englisch – Riad, Dubai"]) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: ["en"], anyOf: [] }]);
      expect(met(required, ["English"]), required).toBe(1);
    }
    // After a separator, a part that names a language is a second requirement, whatever words are written with it, even a
    // place's (IA02-R6-LANGUE-APRES-LIEUX: a language is never lost; one requirement too many, as on c97413e and 749519f);
    // a level opens no places.
    for (const required of [
      "English – Kerala, Tamil", "Anglais – Dubaï et Wolof courant", "Anglais – courant, Dubaï",
      "English – Kerala and Tamil Nadu", "English – Dubai, Somali Region", "Anglais – Dubaï et Pays haoussa",
    ]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
    }
  });

  it("garde comme exigence une langue connue écrite avec d’autres mots après les lieux qu’un tiret ouvre, dans le texte comme dans une liste (IA02-R6-LANGUE-APRES-LIEUX)", () => {
    // Before (b1544cf): among the places a dash opened, a part was a second language only when wholly a language's name:
    // « créole martiniquais », « swahili pour les patients » went on with the places, and the speaker of the language at the
    // head met all the requirement (15 language points of 15, the profile and the Langue filter), as on neither c97413e nor 749519f.
    for (const [required, lead, texts, other] of [
      ["Français – Martinique, créole martiniquais", "French", ["Français – Martinique", "créole martiniquais"], "Créole martiniquais"],
      ["Français – La Réunion, créole réunionnais", "Français", ["Français – La Réunion", "créole réunionnais"], "Créole réunionnais"],
      ["Français – Guadeloupe, créole guadeloupéen", "Français", ["Français – Guadeloupe", "créole guadeloupéen"], "Créole"],
      ["Anglais – Cameroun, pidgin camerounais", "English", ["Anglais – Cameroun", "pidgin camerounais"], "Pidgin"],
      ["Anglais – Dubaï, swahili pour les patients", "English", ["Anglais – Dubaï", "swahili pour les patients"], "Swahili"],
      ["English – Dubai, Tagalog for patient communication", "English", ["English – Dubai", "Tagalog for patient communication"], "Tagalog"],
      ["Anglais – Riyad, tagalog avec les patients", "Anglais", ["Anglais – Riyad", "tagalog avec les patients"], "Tagalog"],
      ["Anglais – Golfe, wolof du Sénégal", "Anglais", ["Anglais – Golfe", "wolof du Sénégal"], "Wolof"],
      ["Englisch – Dubai, Tigrinya für Patienten", "Englisch", ["Englisch – Dubai", "Tigrinya für Patienten"], "Tigrinya"],
      ["Anglais – Dubaï, swahili également", "Anglais", ["Anglais – Dubaï", "swahili également"], "Swahili"],
    ] as const) {
      // A mission's text, and a profile typed with commas as the page splits it.
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements(required.split(",").map(term => term.trim()))]) {
        expect(requirements.map(requirement => requirement.text), required).toEqual(texts);
        expect(requirements.filter(requirement => meetsRequiredLanguage([lead], requirement)), required).toHaveLength(1);
        expect(requirements.filter(requirement => meetsRequiredLanguage([lead, other], requirement)), required).toHaveLength(2);
      }
    }
    // The places a dash opened still go on with the words no list knows, and the countries known here.
    for (const required of ["Anglais – Riyad, Dubaï", "Arabe – Golfe, Levant", "英语 – 利雅得、迪拜", "English – UAE, Qatar", "Portugais – Brésil, Angola", "Anglais – Tamil Nadu et Kerala, Dubaï"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(1);
      expect(recruitmentLanguageListRequirements(required.split(/[,、]/).map(term => term.trim())), required).toHaveLength(1);
    }
  });

  it("lit une durée comme un niveau dans les quatre langues, et le pluriel anglais d’aucun mot d’une ou deux lettres (IA02-R5-ANS)", () => {
    const met = (required: string, names: string[]) => recruitmentLanguageRequirements(required).filter(requirement => meetsRequiredLanguage(names, requirement)).length;
    // Before: « Wolof 5 ans » was wholly a language by accident (« an », an English article, and its plural « s »), while
    // « Wolof 5 years », « Wolof 5 Jahre » and « 粤语5年 » qualified the language beside them: the language lost.
    for (const [lead, part, language] of [
      ["Anglais", "Wolof 5 ans", "Wolof"], ["Anglais", "Wolof 2 ans minimum", "Wolof"], ["Anglais", "Wolof 6 mois", "Wolof"], ["English", "Wolof 5 years", "Wolof"],
      ["English", "Tamil 3 yrs", "Tamil"], ["Englisch", "Wolof 5 Jahre", "Wolof"], ["Englisch", "Wolof mindestens 2 Jahre", "Wolof"], ["英语", "粤语5年", "粤语"],
    ] as const) {
      for (const required of [`${lead} – ${part}`, `${part} – ${lead}`]) {
        expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
        expect(met(required, [lead]), required).toBe(1);
        expect(met(required, [lead, language]), required).toBe(2);
      }
    }
    // A duration alone qualifies the language, after a dash as after a separator.
    for (const required of ["Anglais – 5 ans", "English – 5 years", "Englisch – 5 Jahre", "英语 – 5年", "Anglais – C1, 5 ans minimum", "English – fluent, 3 years"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(1);
      expect(met(required, ["English"]), required).toBe(1);
    }
  });

  it("lit le golfe arabe et l’espace arabe comme des lieux, pas comme l’arabe (IA02-R5-TABLE-DANS-LIEU-NON-LISTE)", () => {
    for (const required of ["Anglais – Golfe arabe", "Anglais – pays du Golfe arabe", "Englisch – arabischer Raum", "Englisch – im arabischen Raum"]) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: ["en"], anyOf: [] }]);
    }
    // Arabic of the Gulf is still Arabic.
    expect(recruitmentLanguageRequirements("Anglais – Arabe du Golfe").map(requirement => requirement.codes)).toEqual([["en"], ["ar"]]);
  });

  it("lit les mêmes mots de compétence, de durée en lettres et d’expérience dans les quatre langues : un nom de langue écrit après eux reste une exigence (IA02-R7-QUALIFICATIF-HORS-LISTE)", () => {
    // Before (daf844a): « lu, écrit, parlé » and « 2 ans » were known, « read », « gelesen », « deux ans », « two years »,
    // « 两年 » or « 3 years of experience » were not: written after a dash, they opened « places », the language no list knows
    // that followed went on with them, and the speaker of the language at the head met all (15 language points of 15, the
    // profile and the Langue filter), as in neither the French nor the digits.
    for (const [lead, speaker, qualifiers, separator, name] of [
      ["Anglais", "English", ["lu, écrit, parlé", "compris", "deux ans", "deux ans minimum", "3 ans d'expérience", "3 ans d'exercice"], ", ", "Darija"],
      ["English", "English", ["read, written, spoken", "read and written", "understood", "two years", "two years minimum", "3 years of experience", "3 years of practice"], ", ", "Teochew"],
      ["Englisch", "English", ["gelesen, geschrieben, gesprochen", "verstanden", "Lesen und Schreiben", "zwei Jahre", "mindestens zwei Jahre", "3 Jahre Berufserfahrung"], ", ", "Tigrinisch"],
      ["英语", "English", ["两年", "两年以上", "听得懂", "三年工作经验", "三年以上经验"], "，", "上海话"],
    ] as const) {
      for (const qualifier of qualifiers) {
        const required = `${lead} – ${qualifier}${separator}${name}`;
        // The qualifier alone is still one requirement met by the language at the head.
        expect(recruitmentLanguageRequirements(`${lead} – ${qualifier}`), qualifier).toHaveLength(1);
        expect(meetsRequiredLanguage([speaker], recruitmentLanguageRequirements(`${lead} – ${qualifier}`)[0]!), qualifier).toBe(true);
        // A mission's text (and the Langue filter), the same text split as a mission does, a profile typed with commas.
        for (const requirements of [
          recruitmentLanguageRequirements(required),
          recruitmentLanguageListRequirements(required.split(/[,;\n，]/).map(term => term.trim())),
          recruitmentLanguageListRequirements(required.split(",").map(term => term.trim())),
        ]) {
          expect(requirements.map(requirement => requirement.text).at(-1), required).toBe(name);
          expect(requirements.filter(requirement => meetsRequiredLanguage([speaker], requirement)), required).toHaveLength(requirements.length - 1);
          expect(requirements.every(requirement => meetsRequiredLanguage([speaker, name], requirement)), required).toBe(true);
        }
      }
    }
  });

  it("lit les autres noms courants d’une langue de la table comme cette langue, entiers seulement, et 国语 après un pays comme la langue de ce pays (IA02-R7-ALIAS)", () => {
    // Before (daf844a): no list knew these names; after the places a dash opened they went on with them, and the
    // language of the table they name was lost.
    for (const [names, code] of [
      [["Castilian", "Kastilisch", "Kastilische"], "es"],
      [["Putonghua", "Hochchinesisch", "Standardchinesisch", "国语", "國語", "台湾国语"], "zh"],
      [["Modern Standard Arabic", "Fusha", "Fus'ha", "Khaleeji", "Khaliji", "Hocharabisch", "Modernes Hocharabisch", "Standardarabisch", "Golfarabisch"], "ar"],
      [["Hochdeutsch"], "de"],
      [["Flemish", "Flamand", "flamande", "Flämisch", "弗拉芒语"], "nl"],
      [["韩国语", "韓國語"], "ko"],
    ] as const) {
      for (const name of names) expect(recruitmentLanguageCodes(name), name).toEqual([code]);
    }
    for (const [required, lead, other] of [
      ["English – Dubai, Castilian", "English", "Spanish"], ["Englisch – Dubai, Hocharabisch", "English", "Arabic"],
      ["英语 – 迪拜，国语", "English", "中文"], ["English – Riyadh, Fusha", "English", "العربية"], ["Anglais – Dubaï, Putonghua", "English", "Mandarin"],
    ] as const) {
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements(required.split(/[,，]/).map(term => term.trim()))]) {
        expect(requirements, required).toHaveLength(2);
        expect(requirements.every(requirement => meetsRequiredLanguage([lead], requirement)), required).toBe(false);
        expect(requirements.every(requirement => meetsRequiredLanguage([lead, other], requirement)), required).toBe(true);
      }
    }
    // 国语 after a country's name, or a word for countries, is no Mandarin; the words these names start with are no language being typed.
    for (const text of ["外国语", "外国语言", "泰国语", "多国语言", "精通多国语言"]) expect(recruitmentLanguageCodes(text), text).toEqual([]);
    for (const text of ["Golf", "Hoch", "Standard", "Flam", "Modern", "Khal"]) expect(recruitmentLanguagePrefixCodes(text), text).toEqual([]);
    expect(recruitmentLanguageRequirements("Arabisch – Levante, Golf")).toEqual([{ text: "Arabisch – Levante, Golf", codes: ["ar"], anyOf: [] }]);
    // Another name of the language beside a dash is a variety of it, as « Arabe – Golfe » is: one requirement.
    for (const [required, code] of [["Arabe – Fusha", "ar"], ["Chinois – Mandarin", "zh"], ["Arabic – Gulf Arabic", "ar"], ["Espagnol – castillan", "es"]] as const) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: [code], anyOf: [] }]);
    }
  });

  it("lit une partie qui a son propre tiret, après un séparateur, comme une nouvelle exigence menée par ce qui précède son tiret, jamais avec l’exigence d’avant (IA02-R7-TIRET-PROPRE)", () => {
    // Before (daf844a): « Wolof – Dakar » opened places, « Romani – notions » went on with them in one requirement that either
    // language met: Wolof, a language the lists know, was no longer required.
    for (const [required, texts, languages] of [
      ["Arabe – courant ; Wolof – Dakar ; Romani – notions", ["Arabe – courant", "Wolof – Dakar", "Romani – notions"], ["Arabic", "Wolof", "Romani"]],
      ["English – fluent; Amharic – read, written and spoken; Aramaic – basic", ["English – fluent", "Amharic – read, written and spoken", "Aramaic – basic"], ["English", "Amharic", "Aramaic"]],
      ["Anglais – Dubaï, Darija – Casablanca", ["Anglais – Dubaï", "Darija – Casablanca"], ["English", "Darija"]],
      ["Englisch – Dubai; Tigrinisch – Grundkenntnisse", ["Englisch – Dubai", "Tigrinisch – Grundkenntnisse"], ["English", "Tigrinisch"]],
      ["英语 – 迪拜；上海话 – 流利", ["英语 – 迪拜", "上海话 – 流利"], ["English", "上海话"]],
    ] as const) {
      expect(recruitmentLanguageRequirements(required).map(requirement => requirement.text), required).toEqual(texts);
      // A mission's text split at its semicolons and commas, and each language: none can be left out.
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements(required.split(/[,;\n；]/).map(term => term.trim()))]) {
        expect(requirements.every(requirement => meetsRequiredLanguage([...languages], requirement)), required).toBe(true);
        for (const left of languages) {
          expect(requirements.every(requirement => meetsRequiredLanguage(languages.filter(language => language !== left), requirement)), `${required} sans ${left}`).toBe(false);
        }
      }
    }
    // What precedes the dash qualifies the language when it is only known qualification words, or a known place.
    for (const required of ["Anglais – Riyad, niveau – C1", "English – UAE, Qatar – Doha", "Anglais – C1, 5 ans minimum", "English – UAE, Qatar"]) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: ["en"], anyOf: [] }]);
    }
  });

  // IA02-R7-PARITE: each concept of the closed list, in French, English, German and Chinese. Before (ac75d5a), in at least one
  // of the four languages, the qualifier was no word of the list: written after a dash, it opened « places », the language no
  // list knows written after it went on with them, and the speaker of the language at the head met the whole text.
  const QUALIFIER_CONCEPTS: ReadonlyArray<readonly [concept: string, phrases: readonly (readonly [fr: string, en: string, de: string, zh: string])[]]> = [
    ["les verbes lire, écrire, parler, comprendre", [["lire, écrire, parler", "read, write, speak", "lesen, schreiben, sprechen", "读，写，说"], ["comprendre", "understand", "verstehen", "听懂"], ["savoir lire et écrire", "able to read and write", "lesen und schreiben können", "能读写"]]],
    ["les compétences", [["compétences orales", "oral skills", "mündliche Kenntnisse", "口语能力"], ["compétences linguistiques", "language skills", "Sprachkenntnisse", "语言能力"], ["compétence", "competence", "Kompetenz", "能力"]]],
    ["au moins, minimum", [["au moins trois ans", "at least three years", "mindestens drei Jahre", "至少三年"], ["trois ans minimum", "three years minimum", "drei Jahre mindestens", "最少三年"]]],
    ["plus de, more than, mehr als, 以上", [["plus de deux ans", "more than two years", "mehr als zwei Jahre", "两年以上"], ["plus de 2 ans", "over 2 years", "über 2 Jahre", "超过2年"], ["plusieurs années", "several years", "mehrere Jahre", "多年"]]],
    ["la pratique et l’expérience, et de quoi", [["5 ans de pratique", "5 years of practice", "5 Jahre Praxis", "五年实践"], ["expérience de 3 ans", "experience of 3 years", "Erfahrung von 3 Jahren", "3年的经验"]]],
    ["l’usage professionnel et quotidien", [["usage professionnel", "professional use", "beruflicher Gebrauch", "工作使用"], ["usage quotidien", "daily use", "täglicher Gebrauch", "日常使用"], ["au quotidien", "everyday", "im Alltag", "日常"]]],
    ["les niveaux de LinkedIn, élevé, à l’aise", [
      ["notions", "elementary proficiency", "Grundkenntnisse", "初级"], ["compétence professionnelle limitée", "limited working proficiency", "gute Kenntnisse", "有限工作能力"],
      ["compétence professionnelle", "professional working proficiency", "fließend", "专业工作能力"], ["capacité professionnelle complète", "full professional proficiency", "verhandlungssicher", "全面专业工作能力"],
      ["niveau élevé", "high level", "hohes Niveau", "高水平"], ["niveau soutenu", "high level", "hohes Niveau", "高水平"], ["à l'aise", "comfortable", "sicher", "自如"],
      ["à l'aise en conversation", "comfortable in conversation", "sicher im Gespräch", "会话自如"],
    ]],
  ];
  const QUALIFIED_LANGUAGES = [["Anglais", ", ", "Darija"], ["English", ", ", "Teochew"], ["Englisch", ", ", "Tigrinisch"], ["英语", "，", "上海话"]] as const;

  it.each(QUALIFIER_CONCEPTS)("lit %s dans les quatre langues : seuls, ils qualifient la langue ; un nom de langue écrit après eux reste une exigence (IA02-R7-PARITE)", (_, phrases) => {
    for (const phrase of phrases) {
      for (let index = 0; index < QUALIFIED_LANGUAGES.length; index += 1) {
        const [lead, separator, name] = QUALIFIED_LANGUAGES[index]!;
        const qualified = `${lead} – ${phrase[index]}`;
        // The qualifier alone is one requirement, met by the language at the head.
        expect(recruitmentLanguageRequirements(qualified), qualified).toHaveLength(1);
        expect(meetsRequiredLanguage(["English"], recruitmentLanguageRequirements(qualified)[0]!), qualified).toBe(true);
        // A mission's text (and the Langue filter), the same text split as a mission does, a profile typed with commas.
        const required = `${qualified}${separator}${name}`;
        for (const requirements of [
          recruitmentLanguageRequirements(required),
          recruitmentLanguageListRequirements(required.split(/[,;\n，]/).map(term => term.trim())),
          recruitmentLanguageListRequirements(required.split(",").map(term => term.trim())),
        ]) {
          expect(requirements.map(requirement => requirement.text).at(-1), required).toBe(name);
          expect(requirements.every(requirement => meetsRequiredLanguage(["English"], requirement)), required).toBe(false);
          expect(requirements.every(requirement => meetsRequiredLanguage(["English", name], requirement)), required).toBe(true);
        }
      }
    }
  });

  it("lit « read, write, speak » comme « lu, écrit, parlé » : une exigence, tenue par l’anglais (IA02-R7-PARITE)", () => {
    // Before (ac75d5a): « read » was a word of the list, « write » and « speak » were not: three requirements, two that nobody met.
    for (const required of ["English – read, write, speak", "English – read, write and speak", "English – speak and understand", "Anglais – lire, écrire, parler", "Englisch – lesen, schreiben, sprechen"]) {
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements(required.split(",").map(term => term.trim()))]) {
        expect(requirements, required).toHaveLength(1);
        expect(meetsRequiredLanguage(["English"], requirements[0]!), required).toBe(true);
      }
    }
  });

  it("ne lit un autre nom d’une langue de la table que comme un nom à lui : ni dans le nom d’un lieu, ni dans « X国语言 », ni l’acronyme MSA (IA02-R7-ALIAS-DANS-LIEU)", () => {
    // Before (ac75d5a): 国语 in 所在国语言 (the host country's language), flamand in « Brabant flamand » and « MSA » were read as
    // Mandarin, Dutch and Arabic: a requirement of a language of the table, that only its speakers met, where 749519f and daf844a
    // read one requirement met by the language at the head.
    for (const [required, lead] of [
      ["英语 – 所在国语言", "英语"], ["英语 – 熟悉该国语言", "英语"], ["英语 – 驻在国语言", "英语"], ["英语 – 东道国语言", "英语"], ["英语 – 目的国语言", "英语"],
      ["英语 – 派驻国语言", "英语"], ["英语 – 对象国语言", "英语"], ["英语 – 居住国语言", "英语"], ["英语 – 赴任国语言", "英语"], ["英语 – 工作国语言", "英语"],
      ["英语 – 全国语言", "英语"], ["英语 – 民国语文", "英语"], ["英语 – 外国语", "英语"], ["英语 – 本国语言", "英语"],
      ["Français – Brabant flamand", "Français"], ["Anglais – Communauté flamande", "Anglais"], ["Anglais – Région flamande", "Anglais"],
      ["English – Flemish Region", "English"], ["English – Flemish Brabant", "English"], ["Englisch – Flämische Region", "Englisch"], ["Englisch – Flämische Gemeinschaft", "Englisch"],
      ["Français – MSA", "Français"], ["English – MSA certified", "English"],
    ] as const) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(1);
      expect(meetsRequiredLanguage([lead], recruitmentLanguageRequirements(required)[0]!), required).toBe(true);
    }
    for (const text of ["所在国语言", "该国语言", "驻在国语言", "全国语言", "民国语文", "所在国语", "该国语"]) expect(recruitmentLanguageCodes(text), text).toEqual([]);
    // The host country's language is no Mandarin: a speaker of Chinese does not meet it.
    for (const requirements of [recruitmentLanguageRequirements("英语，所在国语言优先"), recruitmentLanguageListRequirements(["英语", "所在国语言优先"])]) {
      expect(requirements.every(requirement => meetsRequiredLanguage(["英语", "中文"], requirement))).toBe(false);
    }
    // 国语 where 国 starts a word, after a separator, a conjunction, another name, a word of the list or 台湾, is still Mandarin.
    for (const text of ["国语", "國語", "台湾国语", "臺灣國語", "会说国语", "流利的国语", "粤语国语", "粤语及国语", "国语流利"]) expect(recruitmentLanguageCodes(text), text).toContain("zh");
    // Flemish, Fusha and Modern Standard Arabic as names of their own still name Dutch and Arabic.
    for (const [text, code] of [["Flamand", "nl"], ["Flemish", "nl"], ["Flämisch", "nl"], ["Fusha", "ar"], ["Modern Standard Arabic", "ar"]] as const) {
      expect(recruitmentLanguageCodes(text), text).toEqual([code]);
    }
    expect(recruitmentLanguageRequirements("English – Dubai, Flemish").map(requirement => requirement.codes)).toEqual([["en"], ["nl"]]);
  });

  it("lit 和, 及 et 与 comme « et », « and », « und » : un nom après la conjonction est une exigence à lui, même inconnu des listes (IA02-R7-CONJONCTION-CHINOISE)", () => {
    // Before (ac75d5a, and daf844a, 749519f): 上海话, a name no list knows, was kept with English after 和, 及 or 与, as it was not
    // after « et », « and », « und », nor after « ， »: the speaker of English met the whole text.
    for (const [required, texts] of [
      ["英语和上海话", ["英语", "上海话"]], ["英语 – 流利和上海话", ["英语 – 流利", "上海话"]], ["英语 – 流利及潮州话", ["英语 – 流利", "潮州话"]],
      ["英语 – 流利与潮州话", ["英语 – 流利", "潮州话"]], ["英语 – 两年以上和上海话", ["英语 – 两年以上", "上海话"]], ["英语 – 迪拜和上海话优先", ["英语 – 迪拜", "上海话优先"]],
      ["英语和Darija", ["英语", "Darija"]],
    ] as const) {
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements([required])]) {
        expect(requirements.map(requirement => requirement.text), required).toEqual(texts);
        expect(requirements.every(requirement => meetsRequiredLanguage(["English"], requirement)), required).toBe(false);
        expect(requirements.every(requirement => meetsRequiredLanguage(["English", texts[1].replace("优先", "")], requirement)), required).toBe(true);
      }
    }
    // Wholly the known words a language is qualified with, or a Chinese phrase of what the language is used for (和 and 与 also
    // mean « with »), it still qualifies the language before it.
    for (const required of ["英语 – 口语和书面流利", "英语 – 听力和口语", "英语 – 阅读和写作", "英语 – 与患者沟通", "英语 – 能与患者沟通", "英语 – 日常用语和专业术语"]) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: ["en"], anyOf: [] }]);
    }
  });

  it("lit un nom chinois de langue, qu’il finit par 语, 话, 文 ou 言, comme une exigence après les lieux qu’un tiret ouvre aussi (IA02-R7-CONJONCTION-CHINOISE)", () => {
    // Before (ac75d5a, daf844a): 上海话 or 台语, after « 迪拜 », went on with the places and the speaker of English met the whole text.
    for (const [required, name] of [["英语 – 迪拜，上海话", "上海话"], ["英语 – 迪拜，上海话优先", "上海话"], ["英语 – 多哈，会说台语", "台语"], ["英语 – 利雅得、迪拜，四川话", "四川话"]] as const) {
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements(required.split(/[，、]/).map(term => term.trim()))]) {
        expect(requirements, required).toHaveLength(2);
        expect(requirements.every(requirement => meetsRequiredLanguage(["English"], requirement)), required).toBe(false);
        expect(requirements.every(requirement => meetsRequiredLanguage(["English", name], requirement)), required).toBe(true);
      }
    }
    // A place, a use, or a word of the list that ends as a name does (术语, 用语, 语言) still goes on with the places.
    for (const required of ["英语 – 迪拜，阿布扎比", "英语 – 迪拜，与患者沟通", "英语 – 迪拜，医学术语", "英语 – 迪拜，日常用语", "英语 – 迪拜，所在国语言", "英语 – 利雅得、迪拜"]) {
      expect(recruitmentLanguageRequirements(required), required).toEqual([{ text: required, codes: ["en"], anyOf: [] }]);
    }
  });

  // IA02-R7B-NOM-CHINOIS-FAUX-POSITIF: everyday Chinese words that end with 话, 文 or 言 as a language's Chinese name does.
  const CHINESE_EVERYDAY_WORDS = [
    "电话", "打电话", "接听电话", "通话", "讲话", "说话", "谈话", "电话沟通能力", "论文", "撰写论文", "医学论文", "公文", "作文", "课文", "原文", "全文", "正文", "外文",
    "发言", "留言", "前言", "方言", "文言", "文言文", "土话", "本地话",
  ];
  const CHINESE_CONTEXTS: ReadonlyArray<readonly [context: string, write: (word: string) => string]> = [
    ["après les lieux qu’un tiret ouvre", word => `英语 – 迪拜，${word}`], ["après 和", word => `英语 – 听说读写和${word}`], ["après 及", word => `英语 – 流利及${word}`], ["après une langue et 和", word => `英语和${word}`],
  ];

  it.each(CHINESE_CONTEXTS)("lit un mot chinois courant qui finit par 话, 文 ou 言 %s comme « téléphone », « phone » ou « Telefon » : il qualifie la langue (IA02-R7B-NOM-CHINOIS-FAUX-POSITIF)", (_, write) => {
    // Before (b81633b): any such word was read as a language's Chinese name, a requirement that nobody met; daf844a and ac75d5a
    // read one requirement met by English, as « Anglais – Dubaï, réponse au téléphone » and « English – Dubai, answering the phone ».
    for (const word of CHINESE_EVERYDAY_WORDS) {
      const required = write(word);
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements([required])]) {
        expect(requirements.map(requirement => requirement.text), required).toEqual([required]);
        expect(meetsRequiredLanguage(["English"], requirements[0]!), required).toBe(true);
      }
    }
    for (const required of ["Anglais – Dubaï, réponse au téléphone", "English – Dubai, answering the phone", "Englisch – Dubai, Telefonate"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(1);
    }
  });

  it.each(CHINESE_CONTEXTS)("lit toujours %s un nom chinois de langue qui finit par 话, 文 ou 言 après un nom connu de langue, de peuple ou de lieu comme une exigence (IA02-R7B-NOM-CHINOIS-FAUX-POSITIF)", (_, write) => {
    // A Chinese province, area or city (上海, 潮州, 四川, 温州, 潮汕, 东北), a country or a region of Intl.DisplayNames (台湾, 香港,
    // 新加坡), a language (英, 日, 希腊, 斯瓦希里), a people (藏, 维), a usual short name (印尼), or 白话 and 官话, written whole.
    for (const name of [
      "上海话", "潮州话", "四川话", "温州话", "潮汕话", "陕西话", "东北话", "福州话", "广府话", "白话", "官话", "台湾话", "香港话", "新加坡话",
      "上海話", "溫州話", "東北話", "白話", "台灣話", "希腊文", "荷兰文", "斯瓦希里文", "藏文", "维文", "蒙文", "印尼文", "越文", "会说上海话", "上海话优先",
    ]) {
      const required = write(name);
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements([required])]) {
        expect(requirements, required).toHaveLength(2);
        expect(requirements.every(requirement => meetsRequiredLanguage(["English"], requirement)), required).toBe(false);
        expect(requirements.every(requirement => meetsRequiredLanguage(["English", name.replace("会说", "").replace("优先", "")], requirement)), required).toBe(true);
      }
    }
    // The names of the lists and of the table, as before: 广东话, 客家话, 闽南话 by their codes, 中文, 日文, 法文 by the table's.
    for (const [name, declared] of [["广东话", "粤语"], ["廣東話", "Cantonese"], ["客家话", "客家話"], ["闽南话", "闽南话"], ["普通话", "中文"], ["中文", "Chinese"], ["日文", "Japanese"], ["法文", "French"]] as const) {
      const requirements = recruitmentLanguageRequirements(write(name));
      expect(requirements, name).toHaveLength(2);
      expect(requirements.every(requirement => meetsRequiredLanguage(["English"], requirement)), name).toBe(false);
      expect(requirements.every(requirement => meetsRequiredLanguage(["English", declared], requirement)), name).toBe(true);
    }
  });

  it.each(CHINESE_CONTEXTS)("lit %s le nom chinois en 文 ou 话 d’une langue qu’Intl.DisplayNames nomme hors des listes comme une exigence, et 白话, 官话 et 平话 partout où ils finissent un mot (IA02-R8-NOM-CHINOIS-HORS-LISTES-PERDU)", (_, write) => {
    // Before (ebc5768): 拉丁文, 梵文, 巴利文, 平话... were everyday words, and the language was lost after the places a dash opened
    // or after 和, 及, 与; b81633b kept them. X文 and X话 are a language's name when X语 is one: 拉丁语, 梵语, 巴利语, 吴语.
    for (const name of [
      "拉丁文", "拉丁话", "医学拉丁文", "梵文", "巴利文", "阿拉米文", "科普特文", "罗兴亚文", "吉普赛文", "夏威夷文", "世界文", "吴话", "满文", "和田文",
      "史瓦希里文", "阿維斯塔文", "平话", "桂南平话", "西南官话", "中原官话", "广东白话", "白話", "官話", "维文", "新疆维文", "蒙文",
    ]) {
      const required = write(name);
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements([required])]) {
        expect(requirements, required).toHaveLength(2);
        expect(requirements.every(requirement => meetsRequiredLanguage(["English"], requirement)), required).toBe(false);
        expect(requirements.every(requirement => meetsRequiredLanguage(["English", name], requirement)), required).toBe(true);
      }
    }
  });

  it.each(CHINESE_CONTEXTS)("lit %s un mot courant qui finit par un nom de peuple d’un caractère, par 白话 ou par 官话 comme « compliments » ou « franc-parler » : il qualifie la langue (IA02-R8-MOTS-ORDINAIRES-RESTANTS)", (_, write) => {
    // Before (ebc5768, as b81633b): 恭维话 (compliments: 维 of 维文 at the end of 恭维), 大白话 and 明白话 (plain words), 打官话
    // (officialese) were a language nobody spoke; daf844a and ac75d5a read one requirement met by English.
    for (const word of ["恭维话", "大白话", "明白话", "打官话", "说大白话", "讲明白话"]) {
      const required = write(word);
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements([required])]) {
        expect(requirements.map(requirement => requirement.text), required).toEqual([required]);
        expect(meetsRequiredLanguage(["English"], requirements[0]!), required).toBe(true);
      }
    }
  });

  it.each(CHINESE_CONTEXTS)("lit %s 白话, 官话, 平话 ou un peuple d’un caractère après un qualificatif, un verbe ou un lieu qu’aucune liste ne connaît comme une exigence, comme « cantonais local » (IA02-R8B-NOM-CHINOIS-APRES-QUALIFICATIF-PERDU)", (_, write) => {
    // Before (3df46bb): they were names only where they started a word or followed a listed place, and after 熟悉, 了解, 当地, 本地,
    // 地道, 标准, 正宗, 湖广, 德宏, 西双版纳, 新 or 老 the language was lost; ebc5768 and b81633b kept them, as « local Cantonese ».
    for (const [word, name] of [
      ["熟悉白话", "白话"], ["了解白话", "白话"], ["当地白话", "白话"], ["本地白话", "白话"], ["地道白话", "白话"], ["熟悉白話", "白話"], ["当地官话", "官话"],
      ["标准官话", "官话"], ["湖广官话", "官话"], ["正宗平话", "平话"], ["德宏傣文", "傣文"], ["西双版纳傣文", "傣文"], ["新傣文", "傣文"], ["熟悉维文", "维文"],
      ["老瑶文", "瑶文"], ["老瑤文", "瑤文"], ["新蒙文", "蒙文"],
    ] as const) {
      const required = write(word);
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements([required])]) {
        expect(requirements, required).toHaveLength(2);
        expect(requirements.every(requirement => meetsRequiredLanguage(["English"], requirement)), required).toBe(false);
        expect(requirements.every(requirement => meetsRequiredLanguage(["English", name], requirement)), required).toBe(true);
      }
    }
    for (const required of ["English – Guangzhou, local Cantonese", "Anglais – Canton, cantonais local"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
    }
  });

  it.each(CHINESE_CONTEXTS)("lit %s 大白话, 明白话, 打官话 et 恭维话, en caractères simplifiés ou traditionnels, comme des mots courants : la liste fermée des exceptions (IA02-R8B-NOM-CHINOIS-APRES-QUALIFICATIF-PERDU)", (_, write) => {
    // The closed list of everyday words that end as 白话, 官话 or a people of one character does: 大 and 明 before 白话, 打 before
    // 官话, 恭 before 维. Any other character before them leaves the language's name (above).
    for (const word of ["大白话", "大白話", "明白话", "明白話", "打官话", "打官話", "恭维话", "恭維話", "说大白话", "说明白话", "不说恭维话"]) {
      const required = write(word);
      for (const requirements of [recruitmentLanguageRequirements(required), recruitmentLanguageListRequirements([required])]) {
        expect(requirements.map(requirement => requirement.text), required).toEqual([required]);
        expect(meetsRequiredLanguage(["English"], requirements[0]!), required).toBe(true);
      }
    }
  });

  it("lit le nom chinois en 文 ou 话 de chaque langue qu’Intl.DisplayNames nomme en chinois, codes de deux et de trois lettres, comme une exigence (IA02-R8-NOM-CHINOIS-HORS-LISTES-PERDU)", () => {
    // Every language this host's Intl.DisplayNames names in simplified or traditional Chinese (拉丁语, 阿维斯塔语, 吴语; 拉丁文,
    // 史瓦希里文): written with 文 or 话 after the places a dash opened, and with 话 after 和, English alone does not meet the text.
    // A name of the table's languages within it (古英文, 中古英文) is that language; one split at a conjunction within it, not
    // at its start, is the known risk (奈及利亞皮欽話, Nigerian Pidgin in traditional characters, after 和). Should a newer ICU name
    // more languages in Chinese, each one this test lists is to be added to CHINESE_NAMED_LANGUAGE_CODES.
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const codes = Array.from(letters).flatMap(first => Array.from(letters).flatMap(second => [first + second, ...Array.from(letters, third => first + second + third)]));
    const lost: string[] = [];
    for (const locale of ["zh", "zh-Hant"]) {
      const display = new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
      for (const code of codes) {
        if (["mis", "mul", "und", "zxx"].includes(code)) continue;
        const name = (display.of(code) ?? "").replace(/[(（][^)）]*[)）]/g, "").trim();
        const stem = name.slice(0, -1);
        if (!/^\p{Script=Han}+$/u.test(name) || !"语語话話文言".includes(name.at(-1)!) || "语語话話文言".includes(stem.at(-1)!) || "国國".includes(stem)) continue;
        if (recruitmentLanguageCodes(name).length) continue;
        const written = [`英语 – 迪拜，${stem}文`, `英语 – 迪拜，${stem}话`, ...(/^.+[和及与與]/u.test(stem) ? [] : [`英语和${stem}话`])];
        for (const required of written) {
          if (recruitmentLanguageRequirements(required).every(requirement => meetsRequiredLanguage(["English"], requirement))) lost.push(`${code} ${required}`);
        }
      }
    }
    expect(lost).toEqual([]);
  });

  it("sans Intl.DisplayNames (un navigateur ou un Node.js sans ses données), garde les noms de sa propre liste et ce qui qualifie une langue (IA-02)", async () => {
    vi.stubGlobal("Intl", { ...Intl, DisplayNames: undefined });
    vi.resetModules();
    try {
      const languages = await import("../shared/recruitmentLanguages");
      expect(languages.recruitmentLanguageRequirements("Serbo-croate – Anglais").map(requirement => requirement.text)).toEqual(["Serbo-croate", "Anglais"]);
      expect(languages.recruitmentLanguageRequirements("Berbère – Arabe").map(requirement => requirement.text)).toEqual(["Berbère", "Arabe"]);
      expect(languages.recruitmentLanguageRequirements("Anglais – obligatoire").map(requirement => requirement.text)).toEqual(["Anglais – obligatoire"]);
      expect(languages.recruitmentLanguageRequirements("Cantonais – Anglais").map(requirement => requirement.text)).toEqual(["Cantonais", "Anglais"]);
      expect(languages.recruitmentLanguageRequirements("Twi – English").map(requirement => requirement.text)).toEqual(["Twi", "English"]);
      // Myanmar, of the list, is a country beside a dash there too.
      expect(languages.recruitmentLanguageRequirements("English – Myanmar").map(requirement => requirement.text)).toEqual(["English – Myanmar"]);
      expect(languages.recruitmentLanguageRequirements("English – Myanmar required").map(requirement => requirement.text)).toEqual(["English – Myanmar required"]);
      // Kabyle is only named by Intl.DisplayNames: without it, the part qualifies Arabic, as before.
      expect(languages.recruitmentLanguageRequirements("Arabe – Kabyle").map(requirement => requirement.text)).toEqual(["Arabe – Kabyle"]);
      // The name of a language of the list among other words is a place there too; with its requirement words only, a language.
      expect(languages.recruitmentLanguageRequirements("Anglais – Burkina Faso moré").map(requirement => requirement.text)).toEqual(["Anglais – Burkina Faso moré"]);
      expect(languages.recruitmentLanguageRequirements("Anglais – pays twi").map(requirement => requirement.text)).toEqual(["Anglais – pays twi"]);
      expect(languages.recruitmentLanguageRequirements("Anglais – Twi obligatoire").map(requirement => requirement.text)).toEqual(["Anglais", "Twi obligatoire"]);
      // The places of the list, and the qualifiers after a separator, there too.
      for (const required of ["English – French Polynesia", "Anglais – Guyane française", "English – Persian Gulf", "Anglais – parlé et écrit", "English – UAE and Qatar"]) {
        expect(languages.recruitmentLanguageRequirements(required).map(requirement => requirement.codes), required).toEqual([["en"]]);
      }
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
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

  it("ne lit qu’une fois la liste d’un profil de 12 termes de 80 caractères, quel que soit le nombre de dossiers (IA02-R5-COUT-PROFIL)", () => {
    // Before (c97413e): a list longer than 800 characters as JSON was read again for each of the 10 000 dossiers a request
    // checks, its places and regions too: ten to twenty times slower.
    const pad = (term: string) => `${term} ${"·".repeat(80)}`.slice(0, 80);
    const profiles = [
      Array.from({ length: 12 }, (_, index) => pad(`${["Anglais", "Arabe", "Français", "Espagnol"][index % 4]} – courant, niveau C1 minimum, lu, écrit et parlé, usage ${index}`)),
      [pad("Darija – Maroc, Rabat, Casablanca, Fès, Marrakech, Tanger, Agadir, Oujda"), ...["Kénitra", "Tétouan", "Safi", "Nador", "Settat", "Larache", "Khouribga", "Taza", "El Jadida", "Essaouira", "Ifrane"].map(pad)],
      Array.from({ length: 12 }, (_, index) => pad(`Langue régionale numéro ${index + 1} des patients du service, à préciser avec la direction`)),
    ];
    const dossiers = [["English"], ["French", "Arabic"], ["Darija", "Français"], ["Deutsch", "Wolof"]];
    const check = (terms: string[]) => dossiers.map(names => recruitmentLanguageListRequirements(terms).every(requirement => meetsRequiredLanguage(names, requirement)));
    const first = profiles.map(check);
    expect(profiles.every(terms => terms.length === 12 && terms.every(term => term.length === 80))).toBe(true);
    folding.texts = [];
    for (let round = 0; round < 2_500; round++) profiles.forEach((terms, index) => expect(check(terms)).toEqual(first[index]));
    expect(folding.texts).toHaveLength(0);
    // The places a dash opened go on over the terms: one requirement, met by Darija.
    expect(first[1]).toEqual([false, false, true, false]);
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
