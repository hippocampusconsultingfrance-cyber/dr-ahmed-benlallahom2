import { describe, expect, it } from "vitest";
import { VVIP_CUSTOM_SPECIALTY_MAX_LENGTH, VVIP_ENVIRONMENTS, buildVvipApplicationFormData, createInitialForm, vvipOffshoreCopy, vvipSubmissionErrorMessage } from "./VvipOffshorePage";

// Length limit of cv_applications.specialty, checked by /api/recruitment/apply.
const API_SPECIALTY_MAX_LENGTH = 160;
const languages = ["fr", "en", "de", "zh"] as const;
const allEnvironments = VVIP_ENVIRONMENTS.map(environment => environment.value);

function bodyFor(specialty: string, environments: string[] = allEnvironments) {
  return buildVvipApplicationFormData({
    form: { ...createInitialForm("fr"), firstName: "Amira", lastName: "Haddad", email: "amira@example.test", environments, certifications: "ATLS, ACLS, HUET" },
    cv: new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" }),
    specialty,
    diplomaCountry: "Maroc",
    turnstileToken: "turnstile-token-of-this-attempt",
  });
}

describe("INTL-03 — spécialité VVIP envoyée à l’API", () => {
  it("garde le préfixe VVIP sans recopier les environnements, qui partent dans targetCountries et le message", () => {
    const body = bodyFor("Infirmier(ère) paramédical(e) Offshore / Rig Medic");
    expect(body.get("specialty")).toBe("[VVIP / Offshore] Infirmier(ère) paramédical(e) Offshore / Rig Medic");
    expect(JSON.parse(String(body.get("targetCountries")))).toEqual(allEnvironments);
    expect(String(body.get("message"))).toContain(`Environnements: ${allEnvironments.join(", ")}`);
  });

  it.each(languages)("reste sous 160 caractères avec les 4 environnements, pour chaque spécialité proposée (%s)", language => {
    for (const specialty of vvipOffshoreCopy[language].specialties) {
      expect(String(bodyFor(specialty).get("specialty")).length, specialty).toBeLessThanOrEqual(API_SPECIALTY_MAX_LENGTH);
    }
  });

  it("fixe la longueur maximale d’« Autre spécialité » pour qu’elle tienne avec le préfixe sous la limite de l’API", () => {
    const longestCustomSpecialty = "Médecin ".repeat(40).slice(0, VVIP_CUSTOM_SPECIALTY_MAX_LENGTH);
    expect(String(bodyFor(longestCustomSpecialty).get("specialty")).length).toBeLessThanOrEqual(API_SPECIALTY_MAX_LENGTH);
  });
});

describe("REC-03 / INTL-03 — message affiché après un refus du serveur", () => {
  // Responses of /api/recruitment/apply (server/recruitmentApplyVvip.test.ts gets them from the real route).
  const serverRefusals = [
    { error: "La vérification de sécurité doit être renouvelée avant l’envoi.", code: "recruitment_security_check_required" },
    { error: "Trop de tentatives ont été effectuées. Patientez une heure avant de réessayer.", code: "recruitment_rate_limited" },
    { error: "Les informations de candidature sont invalides.", code: "recruitment_application_invalid" },
    { error: "Le service de candidature est temporairement indisponible.", code: "recruitment_service_unavailable" },
  ];
  // Each CV code of server/recruitmentFileValidation.ts, by refusal reason.
  const cvRefusals = {
    legacyFormat: ["cv_validation_legacy_doc_refused"],
    tooLargeWhenOpened: ["cv_validation_docx_decompressed_size_exceeded", "cv_validation_pdf_decompressed_size_exceeded", "cv_validation_pdf_image_too_large", "cv_validation_pdf_processing_timeout"],
    pageLimit: ["cv_validation_pdf_page_limit_exceeded"],
    passwordProtected: ["cv_validation_pdf_encrypted", "cv_validation_docx_encrypted"],
    activeContent: ["cv_validation_pdf_active_content", "cv_validation_docx_active_content", "cv_validation_doc_active_content"],
    invalidContent: ["cv_validation_signature_invalid", "cv_validation_type_mismatch", "cv_validation_pdf_page_structure_invalid", "cv_validation_docx_container_invalid"],
  };
  const frenchCvMessage = "Le CV est refusé (texte français du serveur).";

  it("affiche en français le message réel du serveur, sans le remplacer par « remplir les champs obligatoires »", () => {
    for (const refusal of serverRefusals) expect(vvipSubmissionErrorMessage(refusal, "fr")).toBe(refusal.error);
    for (const code of Object.values(cvRefusals).flat()) expect(vvipSubmissionErrorMessage({ error: frenchCvMessage, code }, "fr"), code).toBe(frenchCvMessage);
    expect(vvipSubmissionErrorMessage(serverRefusals[2], "fr")).not.toBe(vvipOffshoreCopy.fr.required);
  });

  it.each(["en", "de", "zh"] as const)("traduit chaque refus connu du serveur d’après son code (%s)", language => {
    const t = vvipOffshoreCopy[language];
    const shown = serverRefusals.map(refusal => vvipSubmissionErrorMessage(refusal, language));
    for (const codes of Object.values(cvRefusals)) {
      const translations = new Set(codes.map(code => vvipSubmissionErrorMessage({ error: frenchCvMessage, code }, language)));
      expect(translations.size, `un seul texte pour ${codes.join(", ")}`).toBe(1);
      shown.push(...translations);
    }

    expect(new Set(shown).size, "un message distinct par cause").toBe(shown.length);
    for (const message of shown) {
      expect([t.required, t.genericError, t.fileError]).not.toContain(message);
      expect(serverRefusals.map(refusal => refusal.error), "traduit, pas le texte français").not.toContain(message);
      expect(message).not.toBe(frenchCvMessage);
    }
    expect(vvipSubmissionErrorMessage({ error: frenchCvMessage, code: "cv_validation_pdf_page_limit_exceeded" }, language)).toContain("25");
  });

  it.each(languages)("garde le texte CV général pour un CV refusé sans code et le message générique pour le reste (%s)", language => {
    const t = vvipOffshoreCopy[language];
    const oversized = "Le CV ne doit pas dépasser 4 Mo. Compressez-le ou enregistrez-le en PDF, puis réessayez.";

    expect(vvipSubmissionErrorMessage({ error: oversized }, language)).toBe(language === "fr" ? oversized : t.fileError);
    expect(vvipSubmissionErrorMessage({ error: "La candidature n’a pas pu être enregistrée." }, language)).toBe(t.genericError);
    // Technical upload errors (multer, busboy) are not shown, even in French.
    expect(vvipSubmissionErrorMessage({ error: "Unexpected end of form" }, language)).toBe(t.genericError);
    expect(vvipSubmissionErrorMessage({ error: "Unexpected field" }, language)).toBe(t.genericError);
  });

  it.each(languages)("après une erreur serveur 5xx, demande de réessayer plutôt que de vérifier les informations (%s)", language => {
    const t = vvipOffshoreCopy[language];
    // 500 of the route, then a gateway timeout or error page that is not JSON.
    const failures = [
      vvipSubmissionErrorMessage({ error: "La candidature n’a pas pu être enregistrée." }, language, 500),
      vvipSubmissionErrorMessage({}, language, 504),
      vvipSubmissionErrorMessage({}, language, 502),
    ];
    expect(new Set(failures).size).toBe(1);
    expect([t.genericError, t.required, t.fileError]).not.toContain(failures[0]);
    if (language === "fr") expect(failures[0]).toBe("Le service de candidature est momentanément indisponible. Réessayez dans quelques instants.");
    if (language === "en") expect(failures[0]).toBe("The application service is momentarily unavailable. Please try again in a few moments.");
    // A 503 with its code keeps the server's reason, a 4xx without code stays generic.
    expect(vvipSubmissionErrorMessage(serverRefusals[3], language, 503)).toBe(vvipSubmissionErrorMessage(serverRefusals[3], language));
    expect(vvipSubmissionErrorMessage({}, language, 413)).toBe(t.genericError);
  });
});
