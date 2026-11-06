import { describe, expect, it } from "vitest";

// The page itself (environments, CV picker, sending) is used in VvipOffshorePage.application.test.ts.
describe("candidature VVIP — erreurs publiques", () => {
  it("maps safe server errors to an actionable localized message", async () => {
    const { vvipOffshoreCopy, vvipSubmissionErrorMessage } = await import("./VvipOffshorePage");
    const cvRefused = { error: "Le contenu du CV ne correspond pas à un document PDF ou DOCX valide. Réenregistrez votre CV en DOCX ou imprimez-le en PDF depuis votre navigateur, puis réessayez.", code: "cv_validation_signature_invalid" };
    expect(vvipSubmissionErrorMessage(cvRefused, "fr")).toBe(cvRefused.error);
    expect(vvipSubmissionErrorMessage(cvRefused, "en")).toBe("The CV content does not match a valid PDF or DOCX document. Save your CV again as a DOCX or print it to PDF from your browser, then try again.");
    expect(vvipSubmissionErrorMessage({ error: "Échec base de données: relation cv_applications" }, "de")).toBe(vvipOffshoreCopy.de.genericError);
    expect(vvipSubmissionErrorMessage({}, "fr")).toBe(vvipOffshoreCopy.fr.genericError);

  });

  it("accepts valid mobile CV filenames even with a generic MIME type", async () => {
    const { isAcceptedVvipCvFile } = await import("./VvipOffshorePage");
    expect(isAcceptedVvipCvFile({ name: "cv-vvip.docx", size: 400_000, type: "application/octet-stream" })).toBe(true);
    expect(isAcceptedVvipCvFile({ name: "archive.zip", size: 400_000, type: "" })).toBe(false);
  });

  it("uses checkbox environments and sends every selected environment", async () => {
    const { VVIP_ENVIRONMENTS, buildVvipApplicationFormData, createInitialForm } = await import("./VvipOffshorePage");
    const environments = VVIP_ENVIRONMENTS.map(environment => environment.value);
    const body = buildVvipApplicationFormData({
      form: { ...createInitialForm("fr"), environments },
      cv: new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" }),
      specialty: "Médecin urgentiste (ATLS / ACLS)",
      diplomaCountry: "Maroc",
      turnstileToken: "turnstile-token",
      language: "fr",
    });
    expect(JSON.parse(String(body.get("targetCountries")))).toEqual(environments);
    expect(body.get("diplomaCountry")).toBe("Maroc");
  });
});
