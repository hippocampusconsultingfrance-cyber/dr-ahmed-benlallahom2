import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));

const { default: VvipOffshorePage, createInitialForm, VVIP_ENVIRONMENTS, vvipFieldsToCorrect, vvipInvalidFields, vvipOffshoreCopy } = await import("./VvipOffshorePage");
const { reportFieldsToCorrect } = await import("@/lib/formFieldsToCorrect");

const languages = ["fr", "en", "de", "zh"] as const;
// What the page refuses when sent empty, before the anti-bot check has given a token.
const emptyFormFields = vvipInvalidFields(createInitialForm("fr"), null, null, "", "fr");
const oversizedCv = { name: "cv.pdf", size: 4 * 1024 * 1024 + 1, type: "application/pdf" };
const acceptedCv = { name: "cv.docx", size: 300_000, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

function stubFocus() {
  const frames: Array<() => void> = [];
  const focused: string[] = [];
  vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
  vi.stubGlobal("document", { getElementById: (id: string) => ({ focus: () => focused.push(id) }) });
  return { flush: () => frames.splice(0).forEach(frame => frame()), focused };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("A11Y-03 — formulaire VVIP refusé avant l’envoi", () => {
  it.each(languages)("refuse les champs dans l’ordre du formulaire, sa spécialité étant présélectionnée (%s)", language => {
    const empty = createInitialForm(language);
    const specialties = vvipOffshoreCopy[language].specialties;
    const complete = { ...empty, firstName: "Amina", lastName: "Haddad", email: "amina@example.org", environments: [VVIP_ENVIRONMENTS[1].value], gdprConsent: true };

    expect([...vvipInvalidFields(empty, null, null, "", language)]).toEqual(["firstName", "lastName", "email", "environments", "diplomaCountry", "cv", "gdprConsent", "turnstile"]);
    expect([...vvipInvalidFields(complete, acceptedCv, "token", "Maroc", language)]).toEqual([]);
    // The last specialty of the page's language asks for the typed one.
    expect([...vvipInvalidFields({ ...complete, specialty: specialties[specialties.length - 1] }, oversizedCv, "token", "Maroc", language)]).toEqual(["specialtyCustom", "cv"]);
    expect([...vvipInvalidFields({ ...complete, specialty: "" }, acceptedCv, "token", "Maroc", language)]).toEqual(["specialty"]);
  });

  it("nomme chaque champ à reprendre au lieu de ne parler que du CV, et place le focus sur le premier", () => {
    const { flush, focused } = stubFocus();

    expect(reportFieldsToCorrect(vvipFieldsToCorrect(emptyFormFields, null, "fr"), "fr"))
      .toBe("À compléter ou corriger : Prénom, Nom, Email, Environnement de prédilection, Pays d’obtention du diplôme, CV, Consentement au traitement des données, Vérification anti-bot.");
    expect(reportFieldsToCorrect(vvipFieldsToCorrect(["specialtyCustom", "environments", "gdprConsent"], null, "en"), "en"))
      .toBe("Please complete or correct: Specify your medical or allied-health specialty, Preferred Environment, Consent to data processing.");
    flush();
    expect(focused).toEqual(["vvip-firstName", "vvip-specialty-custom"]);
  });

  it.each(languages)("distingue un CV manquant d’un CV joint mais trop lourd ou d’un autre format (%s)", language => {
    stubFocus();
    const t = vvipOffshoreCopy[language];

    const missing = reportFieldsToCorrect(vvipFieldsToCorrect(["email", "cv"], null, language), language);
    expect(missing).toContain(t.cvField);
    expect(missing).not.toContain(t.fileError);
    expect(reportFieldsToCorrect(vvipFieldsToCorrect(["cv"], oversizedCv, language), language)).toBe(t.fileError);
    expect(reportFieldsToCorrect(vvipFieldsToCorrect(["email", "cv"], oversizedCv, language), language)).toMatch(new RegExp(`${t.email}\\W+${t.fileError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  });

  it.each(languages)("rend un champ qui reçoit le focus pour chaque champ que l’alerte nomme (%s)", language => {
    view.language = language;
    const html = renderToStaticMarkup(createElement(VvipOffshorePage));

    for (const field of vvipFieldsToCorrect(["specialty", ...emptyFormFields], null, language).filter(candidate => candidate.focusId)) {
      expect(html, field.label).toContain(`id="${field.focusId}"`);
    }
  });
});
