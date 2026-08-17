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
    expect(message.subject).toContain("Complément d’information");
    expect(message.html).toContain("Ne transmettez jamais de données de patients");
  });
});
