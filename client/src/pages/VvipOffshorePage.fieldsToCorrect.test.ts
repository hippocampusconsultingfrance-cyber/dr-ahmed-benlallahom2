import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));

const { default: VvipOffshorePage, vvipFieldsToCorrect, vvipOffshoreCopy } = await import("./VvipOffshorePage");
const { reportFieldsToCorrect } = await import("@/lib/formFieldsToCorrect");

const languages = ["fr", "en", "de", "zh"] as const;
// What an empty VVIP form refuses (its specialty is preselected), in the order the page checks it.
const emptyFormFields = ["firstName", "lastName", "email", "environments", "diplomaCountry", "cv", "gdprConsent", "turnstile"] as const;
const oversizedCv = { name: "cv.pdf", size: 4 * 1024 * 1024 + 1, type: "application/pdf" };

function stubFocus() {
  const frames: Array<() => void> = [];
  const focused: string[] = [];
  vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
  vi.stubGlobal("document", { getElementById: (id: string) => ({ focus: () => focused.push(id) }) });
  return { flush: () => frames.splice(0).forEach(frame => frame()), focused };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("A11Y-03 — formulaire VVIP refusé avant l’envoi", () => {
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
