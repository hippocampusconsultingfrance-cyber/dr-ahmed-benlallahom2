import { describe, expect, it } from "vitest";
import { buildRecruitmentTemplateEmail } from "./_core/notifications";

describe("contrat isolé des notifications recrutement", () => {
  it("compose un email de prise de contact avec échappement HTML et référence", () => {
    const message = buildRecruitmentTemplateEmail("N'Golo", "CV-2026", "profile_interest");
    expect(message.subject).toContain("CV-2026");
    expect(message.html).toContain("<p>Bonjour N&#039;Golo,</p>");
    expect(message.html).toContain("Référence");
  });

  it("ne recopie pas un prénom piégé saisi dans le formulaire public (MAIL-01)", () => {
    for (const trapName of ["Amina <Martin>", "Votre colis est bloqué, payez sur https://colis-phish.example/fr", "Payez sur www.colis-phish.example"]) {
      const french = buildRecruitmentTemplateEmail(trapName, "CV-2026", "profile_interest");
      const english = buildRecruitmentTemplateEmail(trapName, "CV-2026", "additional_information", { language: "en" });
      expect(french.html).toContain("<p>Bonjour,</p>");
      expect(english.html).toContain("<p>Hello,</p>");
      for (const message of [french, english]) {
        expect(message.html).not.toMatch(/Martin|phish|colis|Payez/);
        expect(message.html).toContain("CV-2026");
      }
    }
  });

  it("compose un email de demande de complément sans transmettre de données cliniques", () => {
    const message = buildRecruitmentTemplateEmail("Amina", "CV-2026", "additional_information");
    expect(message.subject).toContain("Complément d’information");
    expect(message.html).toContain("Ne transmettez jamais de données de patients");
    expect(message.html).toContain("Communication professionnelle et confidentielle");
  });

  it("compose un modèle anglais lorsque l’administrateur le choisit", () => {
    const message = buildRecruitmentTemplateEmail("Amina", "CV-2026", "profile_interest", { language: "en" });
    expect(message.subject).toContain("Your profile has caught our attention");
    expect(message.html).toContain("<p>Hello Amina,</p>");
    expect(message.html).toContain("Reference:");
    expect(message.html).toContain("Professional and confidential communication");
    expect(message.html).not.toContain("Communication professionnelle et confidentielle");
  });

  it("insère le texte libre de complément avec échappement HTML", () => {
    const message = buildRecruitmentTemplateEmail("Amina", "CV-2026", "additional_information", {
      language: "fr",
      customRequest: "Veuillez joindre <votre> attestation\net vos disponibilités.",
    });
    expect(message.html).toContain("Documents ou informations demandés");
    expect(message.html).toContain("&lt;votre&gt; attestation<br />");
  });
});
