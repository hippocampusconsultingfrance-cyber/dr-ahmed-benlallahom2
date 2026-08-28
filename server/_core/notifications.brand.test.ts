import { describe, expect, it } from "vitest";
import { buildHippocampusEmailShell, buildRecruitmentTemplateEmail } from "./notifications";

describe("identité visuelle des emails Hippocampus", () => {
  it("encadre les contenus dans une en-tête de marque réutilisable", () => {
    const html = buildHippocampusEmailShell("<p>Contenu test</p>");
    expect(html).toContain("ABL / HIPPOCAMPUS");
    expect(html).toContain("Hippocampus Consulting");
    expect(html).toContain("https://drahmedbenlallahom.com/assets/abl-logo.svg");
    expect(html).not.toContain("/manus-storage/");
    expect(html).toContain('alt="Hippocampus Consulting"');
    expect(html).toContain("#071827");
    expect(html).toContain("Contenu test");
  });

  it("applique le shell au modèle de recrutement", () => {
    const email = buildRecruitmentTemplateEmail("Dr Test", "REC-123", "profile_interest");
    expect(email.html).toContain("ABL / HIPPOCAMPUS");
    expect(email.html).toContain("REC-123");
  });

  it("conserve un conteneur email compatible avec les clients HTML classiques", () => {
    const html = buildHippocampusEmailShell("<h2>Informations</h2>");
    expect(html).toContain("max-width:600px");
    expect(html).toContain("background:#ffffff");
    expect(html).toContain("Communication professionnelle et confidentielle");
  });
});
