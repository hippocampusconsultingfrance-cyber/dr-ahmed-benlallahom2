import { describe, expect, it } from "vitest";
import { standardSubmissionErrorMessage } from "./RecruitmentPage";
import { vvipSubmissionErrorMessage } from "./VvipOffshorePage";

const languages = ["fr", "en", "de", "zh"] as const;
// Refusals of /api/recruitment/apply with their code (server/recruitmentApplyProtection.test.ts gets them from the real route).
const refusals = [
  { error: "La vérification de sécurité doit être renouvelée avant l’envoi.", code: "recruitment_security_check_required" },
  { error: "Trop de tentatives ont été effectuées. Patientez une heure avant de réessayer.", code: "recruitment_rate_limited" },
  { error: "Les informations de candidature sont invalides.", code: "recruitment_application_invalid" },
  { error: "Le service de candidature est temporairement indisponible.", code: "recruitment_service_unavailable" },
  { error: "Le CV ne doit pas dépasser 25 pages.", code: "cv_validation_pdf_page_limit_exceeded" },
  { error: "Le CV contient des macros, du contenu actif ou des objets intégrés.", code: "cv_validation_pdf_active_content" },
];

describe("formulaire de candidature standard — refus du serveur traduits (REC-03)", () => {
  it.each(languages)("affiche pour chaque code la même traduction que la page VVIP (%s)", language => {
    for (const refusal of refusals) {
      const shown = standardSubmissionErrorMessage(refusal, language, 400);
      expect(shown, refusal.code).toBe(vvipSubmissionErrorMessage(refusal, language, 400));
      if (language === "fr") expect(shown).toBe(refusal.error);
      else expect(shown, refusal.code).not.toBe(refusal.error);
    }
  });

  it("ne montre plus le texte français du serveur sur la page anglaise", () => {
    expect(standardSubmissionErrorMessage(refusals[1], "en", 400)).toBe("Too many attempts have been made. Wait one hour before trying again.");
    expect(standardSubmissionErrorMessage(refusals[0], "en", 400)).toBe("The security check must be renewed before sending.");
    // CV refused before the content checks (no code): the page's own CV hint in English.
    expect(standardSubmissionErrorMessage({ error: "Le CV ne doit pas dépasser 4 Mo. Compressez-le ou enregistrez-le en PDF, puis réessayez." }, "en", 400))
      .toBe("Please attach a PDF or DOCX CV up to 4 MB (the legacy Word .doc format is not accepted).");
    expect(standardSubmissionErrorMessage({ error: "Unexpected end of form" }, "en", 400)).toBe("Your application could not be sent. Check the information and try again.");
  });
});
