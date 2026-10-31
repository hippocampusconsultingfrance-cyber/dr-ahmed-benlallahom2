import { describe, expect, it } from "vitest";

describe("page de questions médicales — confirmation", () => {
  it("ne promet l’accusé de réception par email que s’il est parti (ABUS-01)", async () => {
    const { medicalQuestionSuccessBody } = await import("./MedicalQuestionsPage");
    const emailWords = { fr: /email/i, en: /email/i, de: /E-Mail/, zh: /邮件/ } as const;
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(medicalQuestionSuccessBody(language, true)).toMatch(emailWords[language]);
      expect(medicalQuestionSuccessBody(language, false)).not.toMatch(emailWords[language]);
    }
    expect(medicalQuestionSuccessBody("fr", false)).toBe("Elle sera examinée avant toute réponse. Notez votre référence confidentielle :");
  });
});

describe("page de questions médicales — refus de l’envoi", () => {
  it("distingue le plafond d’envois par connexion d’un anti-robot à renouveler (MAIL-01)", async () => {
    const { medicalQuestionSubmitError } = await import("./MedicalQuestionsPage");
    expect(medicalQuestionSubmitError("TOO_MANY_REQUESTS")).toBe("tooManyRequests");
    expect(medicalQuestionSubmitError("BAD_REQUEST")).toBe("turnstile");
    expect(medicalQuestionSubmitError(undefined)).toBe("turnstile");
  });

  it("n’entoure plus la case anti-robot d’un refus précédent quand le plafond est atteint ensuite", async () => {
    const { medicalQuestionAlert, medicalQuestionFeedback, medicalQuestionInvalidFields } = await import("./MedicalQuestionsPage");
    const form = { firstName: "Jeanne", lastName: "Martin", email: "jeanne@test.local", phone: "+33 6 12 34 56 78", question: "Puis-je garder mes lunettes jusqu’au bloc opératoire ?", privacy: true, publication: false, urgency: true };

    let feedback = medicalQuestionFeedback({ invalid: new Set(), rateLimited: false }, { type: "submit", invalid: medicalQuestionInvalidFields(form, "first-token") });
    feedback = medicalQuestionFeedback(feedback, { type: "refused", code: "BAD_REQUEST" });
    expect(feedback.invalid).toEqual(new Set(["turnstile"]));
    expect(medicalQuestionAlert(feedback)).toBe("error");

    // The renewed challenge is solved and the question sent again: this time the server reports the cap.
    feedback = medicalQuestionFeedback(feedback, { type: "submit", invalid: medicalQuestionInvalidFields(form, "second-token") });
    feedback = medicalQuestionFeedback(feedback, { type: "refused", code: "TOO_MANY_REQUESTS" });
    expect(feedback.invalid.size).toBe(0);
    expect(medicalQuestionAlert(feedback)).toBe("tooManyRequests");

    // A later submit with a field to fix shows the fields again, not the cap.
    feedback = medicalQuestionFeedback(feedback, { type: "submit", invalid: medicalQuestionInvalidFields({ ...form, phone: "" }, null) });
    expect(feedback).toEqual({ invalid: new Set(["phone", "turnstile"]), rateLimited: false });
    expect(medicalQuestionAlert(feedback)).toBe("error");
    feedback = medicalQuestionFeedback(feedback, { type: "edit", field: "phone" });
    expect(feedback.invalid).toEqual(new Set(["turnstile"]));
  });
});
