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

  it("handles malformed JSON safely", () => {
    expect(parseRecruitmentJsonArray("not-json")).toEqual([]);
    expect(parseRecruitmentJsonArray(JSON.stringify(["France", 1, null]))).toEqual(["France"]);
  });

  it("supports the public marketing unsubscribe audit action", () => {
    const action: RecruitmentAuditAction = "unsubscribe";
    expect(action).toBe("unsubscribe");
  });
});
