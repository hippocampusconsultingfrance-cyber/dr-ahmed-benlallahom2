import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const view = vi.hoisted(() => ({ language: "fr" as "fr" | "en" | "de" | "zh" }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: view.language, content: { hero: { bookConsultation: "Réserver" } } }) }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    medicalQuestions: {
      published: { useQuery: () => ({ isLoading: false, data: [] }) },
      submit: { useMutation: () => ({ isPending: false, mutate: () => undefined }) },
    },
  },
}));

const { default: MedicalQuestionsPage, medicalQuestionFieldsToCorrect, medicalQuestionInvalidFields } = await import("./MedicalQuestionsPage");
const { reportFieldsToCorrect } = await import("@/lib/formFieldsToCorrect");

const languages = ["fr", "en", "de", "zh"] as const;
const emptyForm = { firstName: "", lastName: "", email: "", phone: "", question: "", privacy: false, publication: false, urgency: false };

function stubFocus() {
  const frames: Array<() => void> = [];
  const focused: string[] = [];
  vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
  vi.stubGlobal("document", { getElementById: (id: string) => ({ focus: () => focused.push(id) }) });
  return { flush: () => frames.splice(0).forEach(frame => frame()), focused };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("A11Y-03 — question santé refusée avant l’envoi", () => {
  it("nomme chaque champ à reprendre au lieu du message générique, et place le focus sur le premier", () => {
    const { flush, focused } = stubFocus();

    expect(reportFieldsToCorrect(medicalQuestionFieldsToCorrect(medicalQuestionInvalidFields(emptyForm, null), "fr"), "fr"))
      .toBe("À compléter ou corriger : Prénom, Nom, Email, Téléphone, Votre question, Consentement au traitement de votre question, Avertissement sur les urgences, Vérification anti-bot.");
    expect(reportFieldsToCorrect(medicalQuestionFieldsToCorrect(medicalQuestionInvalidFields({ ...emptyForm, firstName: "Jeanne", lastName: "Martin", email: "jeanne@test.local", phone: "+33 6 12 34 56 78", question: "Trop court ?" }, "token"), "en"), "en"))
      .toBe("Please complete or correct: Your question, Consent to processing your question, Emergency notice.");
    flush();
    expect(focused).toEqual(["medical-question-firstName", "medical-question-text"]);

    // Only the security check is missing: it is named, focus stays where it is.
    expect(reportFieldsToCorrect(medicalQuestionFieldsToCorrect(["turnstile"], "de"), "de")).toBe("Bitte ergänzen oder korrigieren: Bot-Prüfung.");
    flush();
    expect(focused).toHaveLength(2);
  });

  it.each(languages)("rend un champ qui reçoit le focus pour chaque champ que l’alerte nomme (%s)", language => {
    view.language = language;
    const html = renderToStaticMarkup(createElement(MedicalQuestionsPage));
    const fields = medicalQuestionFieldsToCorrect(medicalQuestionInvalidFields(emptyForm, null), language);

    expect(fields.filter(field => field.focusId)).toHaveLength(7);
    for (const field of fields) expect(field.label, field.focusId).toBeTruthy();
    for (const field of fields.filter(candidate => candidate.focusId)) expect(html, field.label).toContain(`id="${field.focusId}"`);
  });
});
