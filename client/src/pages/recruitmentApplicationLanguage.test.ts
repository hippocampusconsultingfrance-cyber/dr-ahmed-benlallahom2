import { describe, expect, it } from "vitest";
import { buildStandardApplicationFormData, initialForm } from "./RecruitmentPage";
import { buildVvipApplicationFormData, createInitialForm, vvipOffshoreCopy } from "./VvipOffshorePage";

// /api/recruitment/apply reads the optional multipart field "language" (fr, en, de or zh) to
// write the confirmation in the language of the form (EN-02).
const languages = ["fr", "en", "de", "zh"] as const;
const cv = () => new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" });

describe("candidatures standard et VVIP — langue affichée envoyée à l’API", () => {
  it.each(languages)("envoie la langue du formulaire standard, avec la spécialité en français (%s)", language => {
    const body = buildStandardApplicationFormData({
      form: { ...initialForm, firstName: "Amina", lastName: "Haddad", email: "amina@example.test", specialty: "Médecine d’urgence", targetCountries: ["Canada"], gdprConsent: true },
      cv: cv(),
      specialty: "Médecine d’urgence",
      diplomaCountry: "Maroc",
      turnstileToken: "turnstile-token-of-this-attempt",
      language,
    });

    expect(body.get("language")).toBe(language);
    expect(body.get("specialty")).toBe("Médecine d’urgence");
    expect(body.get("diplomaCountry")).toBe("Maroc");
    expect(JSON.parse(String(body.get("targetCountries")))).toEqual(["Canada"]);
    expect(body.getAll("language")).toHaveLength(1);
  });

  it.each(languages)("envoie la langue du formulaire VVIP (%s)", language => {
    const body = buildVvipApplicationFormData({
      form: { ...createInitialForm(language), firstName: "Amira", lastName: "Haddad", email: "amira@example.test", environments: ["Moyen-Orient (Gouvernement / VVIP)"] },
      cv: cv(),
      specialty: vvipOffshoreCopy[language].specialties[0],
      diplomaCountry: "Maroc",
      turnstileToken: "turnstile-token-of-this-attempt",
      language,
    });

    expect(body.get("language")).toBe(language);
    expect(body.getAll("language")).toHaveLength(1);
  });
});
