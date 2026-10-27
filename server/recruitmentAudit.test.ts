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

  it("handles malformed JSON safely", () => {
    expect(parseRecruitmentJsonArray("not-json")).toEqual([]);
    expect(parseRecruitmentJsonArray(JSON.stringify(["France", 1, null]))).toEqual(["France"]);
  });

  it("supports the public marketing unsubscribe audit action", () => {
    const action: RecruitmentAuditAction = "unsubscribe";
    expect(action).toBe("unsubscribe");
  });
});
