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

  it("borne « Autre spécialité » pour que le texte libre le plus long tienne avec le préfixe", () => {
    const longestCustomSpecialty = "Médecin ".repeat(40).slice(0, VVIP_CUSTOM_SPECIALTY_MAX_LENGTH);
    expect(String(bodyFor(longestCustomSpecialty).get("specialty")).length).toBeLessThanOrEqual(API_SPECIALTY_MAX_LENGTH);
  });
});

describe("REC-03 / INTL-03 — message affiché après un refus du serveur", () => {
  const serverMessages = {
    security: "La vérification de sécurité doit être renouvelée avant l’envoi.",
    rateLimited: "Trop de tentatives ont été effectuées. Patientez une heure avant de réessayer.",
    invalid: "Les informations de candidature sont invalides.",
    unavailable: "Le service de candidature est temporairement indisponible.",
  };

  it("affiche en français le message réel du serveur, sans le remplacer par « remplir les champs obligatoires »", () => {
    for (const message of Object.values(serverMessages)) {
      expect(vvipSubmissionErrorMessage({ error: message }, "fr")).toBe(message);
    }
    expect(vvipSubmissionErrorMessage({ error: serverMessages.invalid }, "fr")).not.toBe(vvipOffshoreCopy.fr.required);
  });

  it.each(["en", "de", "zh"] as const)("traduit chaque message connu du serveur (%s)", language => {
    const t = vvipOffshoreCopy[language];
    const shown = Object.values(serverMessages).map(message => vvipSubmissionErrorMessage({ error: message }, language));
    expect(new Set(shown).size, "un message distinct par cause").toBe(shown.length);
    for (const message of shown) {
      expect(message).not.toBe(t.required);
      expect(message).not.toBe(t.genericError);
      expect(Object.values(serverMessages), "traduit, pas le texte français").not.toContain(message);
    }
    expect(vvipSubmissionErrorMessage({ error: "Le CV ne doit pas dépasser 4 Mo. Compressez-le ou enregistrez-le en PDF, puis réessayez." }, language)).toBe(t.fileError);
    expect(vvipSubmissionErrorMessage({ error: "La candidature n’a pas pu être enregistrée." }, language)).toBe(t.genericError);
  });
});
