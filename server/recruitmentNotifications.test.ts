import { describe, expect, it } from "vitest";
import { buildRecruitmentTemplateEmail } from "./_core/notifications";

describe("contrat isolé des notifications recrutement", () => {
  it("compose un email de prise de contact avec échappement HTML et référence", () => {
    const message = buildRecruitmentTemplateEmail("Amina <Martin>", "CV-2026", "profile_interest");
    expect(message.subject).toContain("CV-2026");
    expect(message.html).toContain("Amina &lt;Martin&gt;");
    expect(message.html).toContain("Référence");
  });

  it("compose un email de demande de complément sans transmettre de données cliniques", () => {
    const message = buildRecruitmentTemplateEmail("Amina Martin", "CV-2026", "additional_information");
    expect(message.subject).toContain("Hippocampus Consulting");
    expect(message.subject).toContain("informations demandées");
    expect(message.html).toContain("Ne transmettez jamais de données de patients");
  });

  it("compose un modèle anglais lorsque l’administrateur le choisit", () => {
    const message = buildRecruitmentTemplateEmail("Amina Martin", "CV-2026", "profile_interest", { language: "en" });
    expect(message.subject).toContain("Hippocampus Consulting");
    expect(message.subject).toContain("follow-up on your application");
    expect(message.html).toContain("Hello Amina Martin");
    expect(message.html).toContain("Reference:");
  });

  it("insère le texte libre de complément avec échappement HTML", () => {
    const message = buildRecruitmentTemplateEmail("Amina Martin", "CV-2026", "additional_information", {
      language: "fr",
      customRequest: "Veuillez joindre <votre> attestation\net vos disponibilités.",
    });
    expect(message.html).toContain("Documents ou informations demandés");
    expect(message.html).toContain("&lt;votre&gt; attestation<br />");
  });

  it("affiche le logo Hippocampus Consulting dans les emails de recrutement", () => {
    const message = buildRecruitmentTemplateEmail("Amina Martin", "CV-2026", "profile_interest");
    expect(message.html).toContain("hippocampus-consulting-email-logo_c57dd3cd.jpg");
    expect(message.html).toContain('alt="Hippocampus Consulting"');
  });

  it("propose une version texte et un objet explicite pour la délivrabilité", () => {
    const message = buildRecruitmentTemplateEmail("Amina Martin", "CV-2026", "profile_interest");
    expect(message.subject).toContain("Hippocampus Consulting");
    expect(message.text).toContain("Amina Martin");
    expect(message.text).toContain("CV-2026");
  });
});
