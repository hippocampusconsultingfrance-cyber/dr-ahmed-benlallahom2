import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));

const { default: RecruitmentPage, standardFieldsToCorrect } = await import("./RecruitmentPage");
const { reportFieldsToCorrect } = await import("@/lib/formFieldsToCorrect");

const languages = ["fr", "en", "de", "zh"] as const;
// What an empty form refuses, in the order the page checks it.
const emptyFormFields = ["firstName", "lastName", "email", "specialty", "diplomaCountry", "targetCountries", "cv", "gdprConsent", "turnstile"] as const;
const fileError = {
  fr: "Veuillez joindre un CV au format PDF ou DOCX de 4 Mo maximum (le format Word ancien .doc n’est pas accepté).",
  en: "Please attach a PDF or DOCX CV up to 4 MB (the legacy Word .doc format is not accepted).",
};
const refusedCv = { name: "cv.doc", size: 300_000, type: "application/msword" };

function render(language: (typeof languages)[number]) {
  view.language = language;
  return renderToStaticMarkup(createElement(RecruitmentPage));
}

function stubFocus() {
  const frames: Array<() => void> = [];
  const focused: string[] = [];
  vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
  vi.stubGlobal("document", { getElementById: (id: string) => ({ focus: () => focused.push(id) }) });
  return { flush: () => frames.splice(0).forEach(frame => frame()), focused };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("A11Y-03 — formulaire standard refusé avant l’envoi", () => {
  it("nomme chaque champ d’un envoi à vide au lieu de « Champ obligatoire » et place le focus sur le premier", () => {
    const { flush, focused } = stubFocus();

    expect(reportFieldsToCorrect(standardFieldsToCorrect(emptyFormFields, null, "fr"), "fr"))
      .toBe("À compléter ou corriger : Prénom, Nom, Email, Spécialité / profession, Pays d’obtention du diplôme, Pays ciblés, CV, Consentement au traitement des données, Vérification anti-bot.");
    expect(reportFieldsToCorrect(standardFieldsToCorrect(emptyFormFields, null, "en"), "en"))
      .toBe("Please complete or correct: First name, Last name, Professional email, Specialty / profession, Country where the diploma was obtained, Target countries, CV, Consent to data processing, Anti-bot verification.");
    flush();
    expect(focused).toEqual(["recruitment-firstName", "recruitment-firstName"]);

    reportFieldsToCorrect(standardFieldsToCorrect(["otherTargetCountry", "gdprConsent"], null, "en"), "en");
    flush();
    expect(focused.at(-1)).toBe("recruitment-other-target-country");
  });

  it("distingue un CV manquant d’un CV joint mais refusé pour son format ou sa taille", () => {
    stubFocus();
    for (const language of ["fr", "en"] as const) {
      const missing = reportFieldsToCorrect(standardFieldsToCorrect(["firstName", "cv"], null, language), language);
      expect(missing).toMatch(/, CV\.$/);
      expect(missing).not.toContain(fileError[language]);

      expect(reportFieldsToCorrect(standardFieldsToCorrect(["cv"], refusedCv, language), language)).toBe(fileError[language]);
      const withOthers = reportFieldsToCorrect(standardFieldsToCorrect(["firstName", "cv", "gdprConsent"], refusedCv, language), language);
      expect(withOthers.endsWith(fileError[language])).toBe(true);
      expect(withOthers).not.toMatch(/, CV[,.]/);
    }
  });

  it.each(languages)("rend un champ qui reçoit le focus pour chaque champ que l’alerte nomme (%s)", language => {
    const html = render(language);
    const fields = standardFieldsToCorrect(emptyFormFields, null, language);

    for (const field of fields.filter(candidate => candidate.focusId)) expect(html, field.label).toContain(`id="${field.focusId}"`);
    // Shown only with "Other": the alert names them only then.
    expect(standardFieldsToCorrect(["specialtyCustom", "otherTargetCountry"], null, language).map(field => field.focusId)).toEqual(["recruitment-specialty-custom", "recruitment-other-target-country"]);
    expect(html).toMatch(/<input[^>]*id="recruitment-cv"[^>]*aria-describedby="recruitment-cv-hint"/);
    expect(html).toMatch(/<p id="recruitment-cv-hint"[^>]*>[^<]*PDF[^<]*DOCX[^<]*4 M[Bo][^<]*<\/p>/);
  });
});
