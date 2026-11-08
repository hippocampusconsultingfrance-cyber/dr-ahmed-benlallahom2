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
      ["Arabe – Golfe", "ar"], ["Arabic – Gulf", "ar"], ["Arabe – égyptien", "ar"], ["Arabe – levantin", "ar"], ["Arabe – maghrébin", "ar"], ["Arabe – MSA", "ar"],
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
    for (const required of ["Wolof – Anglais obligatoire", "Arménien – Anglais requis", "English – Bahasa Indonesia", "English – Myanmar Wolof", "Anglais – Sénégal wolof", "Anglais – Birman obligatoire", "Anglais – Burkina Faso moré"]) {
      expect(recruitmentLanguageRequirements(required), required).toHaveLength(2);
      expect(met(required, ["English"]), required).toBe(1);
    }
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
