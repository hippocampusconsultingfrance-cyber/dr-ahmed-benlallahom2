import { describe, expect, it } from "vitest";
import { matchesRecruitmentProfile, parseRecruitmentJsonArray, type RecruitmentAuditAction } from "./recruitmentAudit";

describe("recruitment matching profiles", () => {
  it("matches score, country, language and skill requirements", () => {
    expect(matchesRecruitmentProfile({
      score: 86,
      specialty: "Anesthésie-réanimation",
      targetCountries: ["Allemagne", "France"],
      languages: ["Français", "Allemand"],
      extractedSkills: ["Réanimation", "Échographie"] ,
      profile: {
        targetCountry: "Allemagne",
        specialty: "anesthésie",
        minimumScore: 80,
        requiredLanguages: JSON.stringify(["Allemand"]),
        requiredSkills: JSON.stringify(["Réanimation"]),
      },
    })).toBe(true);
  });

  it("rejects profiles missing a required language or score", () => {
    expect(matchesRecruitmentProfile({
      score: 62,
      specialty: "Cardiologie",
      targetCountries: ["France"],
      languages: ["Français"],
      extractedSkills: ["Échographie"],
      profile: {
        targetCountry: "France",
        specialty: "cardiologie",
        minimumScore: 80,
        requiredLanguages: JSON.stringify(["Allemand"]),
        requiredSkills: JSON.stringify(["Échographie"]),
      },
    })).toBe(false);
  });

  it("keeps a dossier without a verified score for reading, whatever the minimum score (INTL-02)", () => {
    const profile = { targetCountry: null, specialty: "anesthésie", minimumScore: 80, requiredLanguages: JSON.stringify(["Anglais"]), requiredSkills: null };
    const candidate = { score: null, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], languages: ["Anglais"], extractedSkills: [], profile };
    expect(matchesRecruitmentProfile(candidate)).toBe(true);
    expect(matchesRecruitmentProfile({ ...candidate, score: 79 })).toBe(false);
    // The other criteria still apply.
    expect(matchesRecruitmentProfile({ ...candidate, languages: ["Arabe"] })).toBe(false);
  });

  it("compare le pays cible et les langues requises comme les filtres de la liste, accents, casse et écritures à part (IA-02)", () => {
    const candidate = { score: 70, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], languages: ["Français", "العَرَبِيَّة"], extractedSkills: [] };
    const profile = (targetCountry: string | null, requiredLanguages: string[]) => ({ targetCountry, specialty: null, minimumScore: 0, requiredLanguages: JSON.stringify(requiredLanguages), requiredSkills: null });
    for (const country of ["emirats", "Emirats arabes unis", "ÉMIRATS", "e\u0301mirats"]) {
      expect(matchesRecruitmentProfile({ ...candidate, profile: profile(country, []) })).toBe(true);
    }
    // Arabic typed without its harakat, as the admin search finds it.
    for (const language of ["francais", "FRANCAIS", "Français", "العربية"]) {
      expect(matchesRecruitmentProfile({ ...candidate, profile: profile(null, [language]) })).toBe(true);
    }
    // Another country, a language the dossier lacks or only part of its name: still refused.
    expect(matchesRecruitmentProfile({ ...candidate, profile: profile("Qatar", []) })).toBe(false);
    expect(matchesRecruitmentProfile({ ...candidate, profile: profile(null, ["francais", "anglais"]) })).toBe(false);
    expect(matchesRecruitmentProfile({ ...candidate, profile: profile(null, ["fran"]) })).toBe(false);
  });

  it("retrouve une langue requise sous un autre de ses noms, celui que le formulaire enregistre (IA-02)", () => {
    // The public form records « French » and « Arabic », even from its French page.
    const candidate = { score: 70, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], languages: ["French", "Arabic"], extractedSkills: [] };
    const profile = (requiredLanguages: string[]) => ({ targetCountry: null, specialty: null, minimumScore: 0, requiredLanguages: JSON.stringify(requiredLanguages), requiredSkills: null });
    for (const required of [["Français"], ["francais"], ["arabe"], ["Arabisch"], ["阿拉伯语"], ["العربية"], ["Français", "Arabe"], ["Français et arabe"]]) {
      expect(matchesRecruitmentProfile({ ...candidate, profile: profile(required) }), required.join(", ")).toBe(true);
    }
    // A language the dossier lacks, under any name, or only part of a name: still refused.
    for (const required of [["Anglais"], ["English"], ["Français", "Anglais"], ["Anglais et arabe"], ["fran"]]) {
      expect(matchesRecruitmentProfile({ ...candidate, profile: profile(required) }), required.join(", ")).toBe(false);
    }
    // A language the table does not know is compared by its letters.
    expect(matchesRecruitmentProfile({ ...candidate, languages: ["Wolof"], profile: profile(["wolof"]) })).toBe(true);
  });

  it("lit les langues d’un profil, saisies avec des virgules, comme un seul texte : ce qui ne nomme aucune langue qualifie la langue d’avant (IA02-R5-SEPARATEUR-QUALIFICATIFS)", () => {
    const candidate = { score: 70, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], languages: ["English"], extractedSkills: [] };
    const profile = (requiredLanguages: string[]) => ({ targetCountry: null, specialty: null, minimumScore: 0, requiredLanguages: JSON.stringify(requiredLanguages), requiredSkills: null });
    // Before: « écrit » and « parlé », typed after a comma, were two requirements nobody meets.
    for (const required of [["Anglais – lu", "écrit", "parlé"], ["English – UAE", "Qatar"], ["Anglais – C1", "C2"], ["obligatoire", "Anglais"]]) {
      expect(matchesRecruitmentProfile({ ...candidate, profile: profile(required) }), required.join(", ")).toBe(true);
    }
    for (const required of [["Anglais", "arabe"], ["Anglais", "Wolof serait un atout"], ["Anglais – Wolof", "Darija"]]) {
      expect(matchesRecruitmentProfile({ ...candidate, profile: profile(required) }), required.join(", ")).toBe(false);
    }
    expect(matchesRecruitmentProfile({ ...candidate, languages: ["English", "Wolof", "Darija"], profile: profile(["Anglais – Wolof", "Darija"]) })).toBe(true);
  });

  it("garde comme exigence un nom de langue qu’aucune liste ne connaît, saisi après une virgule, et lit les noms courts chinois des langues de la table (IA02-R5-LISTE-NOM-INCONNU)", () => {
    const candidate = { score: 70, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], extractedSkills: [] };
    const profile = (requiredLanguages: string[]) => ({ targetCountry: null, specialty: null, minimumScore: 0, requiredLanguages: JSON.stringify(requiredLanguages), requiredSkills: null });
    // Before (c97413e): Darija, Somalisch or 阿语 qualified the language before them, and the candidate who had only it was in the profile.
    for (const [required, lead, all] of [
      [["Français", "Darija"], ["French"], ["French", "Darija"]],
      [["Deutsch", "Arabisch", "Somalisch", "Tigrinisch"], ["Deutsch", "Arabisch"], ["Deutsch", "Arabisch", "Somalisch", "Tigrinisch"]],
      [["英语", "阿语"], ["English"], ["English", "Arabic"]],
      [["Anglais", "Castillan"], ["English"], ["English", "Spanish"]],
    ] as const) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: [...lead], profile: profile([...required]) }), required.join(", ")).toBe(false);
      expect(matchesRecruitmentProfile({ ...candidate, languages: [...all], profile: profile([...required]) }), required.join(", ")).toBe(true);
    }
    // The places a dash opened go on after a comma: « Anglais – Riyad », « Dubaï » is one requirement, met by English.
    expect(matchesRecruitmentProfile({ ...candidate, languages: ["English"], profile: profile(["Anglais – Riyad", "Dubaï"]) })).toBe(true);
  });

  it("garde comme exigence une langue écrite avec d’autres mots, saisie après les lieux qu’un tiret ouvre (IA02-R6-LANGUE-APRES-LIEUX)", () => {
    const candidate = { score: 70, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], extractedSkills: [] };
    const profile = (requiredLanguages: string[]) => ({ targetCountry: null, specialty: null, minimumScore: 0, requiredLanguages: JSON.stringify(requiredLanguages), requiredSkills: null });
    // Before (b1544cf): the créole and the swahili went on with the places, and the candidate who had only French or English was in the profile.
    for (const [required, lead, all] of [
      [["Français – Martinique", "créole martiniquais"], ["French"], ["French", "Créole martiniquais"]],
      [["Anglais – Dubaï", "swahili pour les patients"], ["English"], ["English", "Swahili"]],
    ] as const) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: [...lead], profile: profile([...required]) }), required.join(", ")).toBe(false);
      expect(matchesRecruitmentProfile({ ...candidate, languages: [...all], profile: profile([...required]) }), required.join(", ")).toBe(true);
    }
  });

  it("garde comme exigence, dans un profil saisi avec des virgules, une langue écrite après un qualificatif de l’une des quatre langues, un autre nom d’une langue de la table et une partie qui a son propre tiret (IA02-R7)", () => {
    const candidate = { score: 70, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], extractedSkills: [] };
    const profile = (requiredLanguages: string[]) => ({ targetCountry: null, specialty: null, minimumScore: 0, requiredLanguages: JSON.stringify(requiredLanguages), requiredSkills: null });
    // Before (daf844a): the candidate who had only English, or Arabic and Romani, was in the profile.
    for (const [required, lead, all] of [
      [["English – read", "written", "spoken", "Darija"], ["English"], ["English", "Darija"]],
      [["Englisch – zwei Jahre", "Tigrinisch"], ["English"], ["English", "Tigrinisch"]],
      [["Anglais – deux ans", "Shimaoré"], ["English"], ["English", "Shimaoré"]],
      [["英语 – 两年以上", "上海话"], ["English"], ["English", "上海话"]],
      [["Englisch – Dubai", "Hocharabisch"], ["English"], ["English", "Arabic"]],
      [["Arabe – courant ; Wolof – Dakar ; Romani – notions"], ["Arabic", "Romani"], ["Arabic", "Wolof", "Romani"]],
    ] as const) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: [...lead], profile: profile([...required]) }), required.join(", ")).toBe(false);
      expect(matchesRecruitmentProfile({ ...candidate, languages: [...all], profile: profile([...required]) }), required.join(", ")).toBe(true);
    }
    // The qualifiers alone are still one requirement, met by English.
    expect(matchesRecruitmentProfile({ ...candidate, languages: ["English"], profile: profile(["English – read", "written", "spoken"]) })).toBe(true);
  });

  it("garde comme exigence, dans un profil saisi avec des virgules, un nom de langue écrit après un mot de qualification de chacune des quatre langues ou après 和, 及, 与, et ne lit un autre nom d’une langue que comme un nom à lui (IA02-R7-PARITE, IA02-R7-ALIAS-DANS-LIEU, IA02-R7-CONJONCTION-CHINOISE)", () => {
    const candidate = { score: 70, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], extractedSkills: [] };
    const profile = (requiredLanguages: string[]) => ({ targetCountry: null, specialty: null, minimumScore: 0, requiredLanguages: JSON.stringify(requiredLanguages), requiredSkills: null });
    // Before (ac75d5a): the candidate who had only English was in the profile.
    for (const [required, name] of [
      [["Anglais – compétences linguistiques", "Shimaoré"], "Shimaoré"], [["Anglais – lire", "écrire", "parler", "Darija"], "Darija"], [["English – at least three years", "Teochew"], "Teochew"],
      [["English – over 2 years", "Teochew"], "Teochew"], [["Englisch – täglicher Gebrauch", "Tigrinisch"], "Tigrinisch"], [["英语 – 有限工作能力", "上海话"], "上海话"],
      [["Anglais – capacité professionnelle complète", "Darija"], "Darija"], [["英语 – 流利和上海话"], "上海话"],
    ] as const) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English"], profile: profile([...required]) }), required.join(", ")).toBe(false);
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English", name], profile: profile([...required]) }), required.join(", ")).toBe(true);
    }
    // Before (ac75d5a): « write », « speak » were requirements nobody met; 国语 in 驻在国语言 and « Communauté flamande » named Mandarin and Dutch.
    for (const [required, lead] of [[["English – read", "write", "speak"], "English"], [["英语 – 驻在国语言"], "英语"], [["Anglais – Communauté flamande"], "Anglais"]] as const) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: [lead], profile: profile([...required]) }), required.join(", ")).toBe(true);
    }
  });

  it("ne lit, dans un profil, un mot chinois qui finit par 话, 文 ou 言 comme un nom de langue qu’après un nom connu de langue, de peuple ou de lieu (IA02-R7B-NOM-CHINOIS-FAUX-POSITIF)", () => {
    const candidate = { score: 70, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], extractedSkills: [] };
    const profile = (requiredLanguages: string[]) => ({ targetCountry: null, specialty: null, minimumScore: 0, requiredLanguages: JSON.stringify(requiredLanguages), requiredSkills: null });
    // Before (b81633b): the candidate who had English was not in the profile, 电话, 论文 or 方言 read as a language nobody spoke.
    for (const required of [["英语 – 迪拜，接听电话"], ["英语 – 利雅得", "撰写论文"], ["英语 – 听说读写和打电话"], ["英语 – 阅读和翻译医学论文"], ["英语 – 迪拜", "方言"]]) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English"], profile: profile(required) }), required.join(", ")).toBe(true);
    }
    for (const [required, name] of [[["英语 – 迪拜", "上海话"], "上海话"], [["英语 – 流利和潮汕话"], "潮汕话"]] as const) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English"], profile: profile([...required]) }), required.join(", ")).toBe(false);
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English", name], profile: profile([...required]) }), required.join(", ")).toBe(true);
    }
  });

  it("lit, dans un profil, le nom chinois en 文 ou 话 d’une langue qu’Intl.DisplayNames nomme hors des listes comme une exigence, et un mot courant en 话 comme un mot (IA02-R8-NOM-CHINOIS-HORS-LISTES-PERDU, IA02-R8-MOTS-ORDINAIRES-RESTANTS)", () => {
    const candidate = { score: 70, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], extractedSkills: [] };
    const profile = (requiredLanguages: string[]) => ({ targetCountry: null, specialty: null, minimumScore: 0, requiredLanguages: JSON.stringify(requiredLanguages), requiredSkills: null });
    // Before (ebc5768): the candidate who had English alone was in the profile, 拉丁文 (Latin) or 梵文 (Sanskrit) read as everyday words.
    for (const [required, name] of [[["英语 – 迪拜", "拉丁文"], "拉丁文"], [["英语和梵文"], "梵文"], [["英语 – 迪拜，巴利文"], "巴利文"]] as const) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English"], profile: profile([...required]) }), required.join(", ")).toBe(false);
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English", name], profile: profile([...required]) }), required.join(", ")).toBe(true);
    }
    // Before (ebc5768, as b81633b): the candidate who had English was not in the profile, 恭维话 or 大白话 read as a language nobody spoke.
    for (const required of [["英语 – 迪拜", "恭维话"], ["英语和大白话"], ["英语 – 迪拜，明白话"]]) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English"], profile: profile(required) }), required.join(", ")).toBe(true);
    }
  });

  it("lit, dans un profil, 白话, 官话 ou un peuple d’un caractère après un qualificatif ou un lieu qu’aucune liste ne connaît comme une exigence, et 大白话 ou 恭维话 comme un mot (IA02-R8B-NOM-CHINOIS-APRES-QUALIFICATIF-PERDU)", () => {
    const candidate = { score: 70, specialty: "Anesthésie-réanimation", targetCountries: ["Émirats arabes unis"], extractedSkills: [] };
    const profile = (requiredLanguages: string[]) => ({ targetCountry: null, specialty: null, minimumScore: 0, requiredLanguages: JSON.stringify(requiredLanguages), requiredSkills: null });
    // Before (3df46bb): the candidate who had English alone was in the profile, 熟悉白话, 当地官话 or 傣文 after 德宏 read as everyday words.
    for (const [required, name] of [[["英语 – 香港", "熟悉白话"], "白话"], [["英语和当地官话"], "官话"], [["英语 – 德宏", "傣文"], "傣文"], [["英语 – 香港", "德宏傣文"], "傣文"]] as const) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English"], profile: profile([...required]) }), required.join(", ")).toBe(false);
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English", name], profile: profile([...required]) }), required.join(", ")).toBe(true);
    }
    for (const required of [["英语 – 迪拜", "大白话"], ["英语和恭维话"]]) {
      expect(matchesRecruitmentProfile({ ...candidate, languages: ["English"], profile: profile(required) }), required.join(", ")).toBe(true);
    }
  });

  it("handles malformed JSON safely", () => {
    expect(parseRecruitmentJsonArray("not-json")).toEqual([]);
    expect(parseRecruitmentJsonArray(JSON.stringify(["France", 1, null]))).toEqual(["France"]);
  });

  it("supports the public marketing unsubscribe audit action", () => {
    const action: RecruitmentAuditAction = "unsubscribe";
    expect(action).toBe("unsubscribe");
  });
});
