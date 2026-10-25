import { describe, expect, it } from "vitest";
import { filterRecruitmentSpecialties, recruitmentSpecialtyCategories, recruitmentSpecialtyLabel } from "./recruitmentSpecialties";

const languages = ["fr", "en", "de", "zh"] as const;
const items = recruitmentSpecialtyCategories.flatMap(group => group.items);
const found = (query: string, language: (typeof languages)[number]) => filterRecruitmentSpecialties(query, language).flatMap(group => group.items.map(item => item.value));

describe("REC-04 — spécialités du formulaire standard", () => {
  it("garde l’intitulé français comme valeur envoyée, quelle que soit la langue affichée", () => {
    expect(items).toHaveLength(64);
    expect(new Set(items.map(item => item.value)).size).toBe(items.length);
    for (const item of items) {
      expect(item.labels.fr, item.value).toBe(item.value);
      for (const language of ["en", "de", "zh"] as const) expect(item.labels[language].trim(), `${item.value} (${language})`).not.toBe("");
    }
    // Values read by the page itself and by the admin filters.
    expect(items.map(item => item.value)).toEqual(expect.arrayContaining(["Médecine d’urgence", "Anesthésie-réanimation", "Infirmier(ère) anesthésiste (IADE)", "Autre spécialité ou profession"]));
  });

  it("donne pour une valeur enregistrée le libellé de la langue de la page, et laisse telle quelle une spécialité saisie", () => {
    expect(recruitmentSpecialtyLabel("Médecine d’urgence", "fr")).toBe("Médecine d’urgence");
    expect(recruitmentSpecialtyLabel("Médecine d’urgence", "en")).toBe("Emergency medicine");
    expect(recruitmentSpecialtyLabel("Pédiatrie", "de")).toBe("Pädiatrie");
    expect(recruitmentSpecialtyLabel("Pédiatrie", "zh")).toBe("儿科");
    expect(recruitmentSpecialtyLabel("Perfusionniste", "en")).toBe("Perfusionniste");
  });

  it.each(languages)("trouve une spécialité tapée en anglais ou en français, sans accents (%s)", language => {
    expect(found("emergency", language)).toContain("Médecine d’urgence");
    expect(found("cardiology", language)).toEqual(expect.arrayContaining(["Cardiologie", "Cardiologie interventionnelle"]));
    expect(found("pediatrie", language)).toContain("Pédiatrie");
    expect(found("pediatric", language)).toEqual(expect.arrayContaining(["Pédiatrie", "Chirurgie pédiatrique", "Infirmier(ère) puériculteur(trice)"]));
    expect(found("ANESTHESIE", language)).toContain("Anesthésie-réanimation");
    // Straight apostrophe for the typographic one, British spellings for the American ones.
    expect(found("d'urgence", language)).toContain("Médecine d’urgence");
    expect(found("paediatrics", language)).toContain("Pédiatrie");
    expect(found("anaesthetist", language)).toContain("Infirmier(ère) anesthésiste (IADE)");
    const nurses = found("nurse", language);
    expect(nurses).toEqual(expect.arrayContaining(["Infirmier(ère) anesthésiste (IADE)", "Infirmier(ère) de bloc opératoire (IBODE)", "Infirmier(ère) puériculteur(trice)"]));
    expect(nurses).not.toContain("Cardiologie");
    expect(found("zzz", language)).toEqual([]);
  });

  it("cherche aussi dans les libellés de la langue de la page", () => {
    expect(found("Unfallchirurgie", "de")).toEqual(["Chirurgie orthopédique et traumatologie"]);
    expect(found("Unfallchirurgie", "en")).toEqual([]);
    expect(found("儿科", "zh")).toEqual(expect.arrayContaining(["Pédiatrie", "Infirmier(ère) puériculteur(trice)"]));
  });

  it("garde toutes les spécialités d’une catégorie dont le nom correspond", () => {
    const nursing = recruitmentSpecialtyCategories.find(group => group.category.en === "Nursing & Allied Health")!;
    expect(filterRecruitmentSpecialties("allied health", "en")).toEqual([nursing]);
    expect(filterRecruitmentSpecialties("paramedical", "fr")).toEqual([nursing]);
    expect(filterRecruitmentSpecialties("  ", "en")).toBe(recruitmentSpecialtyCategories);
  });
});
