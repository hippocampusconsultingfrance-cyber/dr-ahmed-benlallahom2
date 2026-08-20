import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("consentements obligatoires visibles", () => {
  it("applique des états de contraste, de focus et d’erreur rouge", async () => {
    const css = await readFile(new URL("../index.css", import.meta.url), "utf8");
    expect(css).toContain(".form-consent-checkbox");
    expect(css).toContain(".form-consent-item-invalid");
    expect(css).toContain(".candidate-consent-item-invalid");
    expect(css).toContain("#fb7185");
  });

  it("affiche les consentements candidat en erreur après une tentative d’inscription", async () => {
    const source = await readFile(new URL("./CandidateAccessPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("setConsentAttempted(true)");
    expect(source).toContain("candidate-consent-item-invalid");
  });

  it("signale aussi le consentement obligatoire du contact", async () => {
    const source = await readFile(new URL("../components/ContactSection.tsx", import.meta.url), "utf8");
    expect(source).toContain("setConsentAttempted(true)");
    expect(source).toContain("form-consent-item-invalid");
  });

  it("applique les états rouges aux champs requis et au fichier des candidatures", async () => {
    const [css, recruitment, vvip] = await Promise.all([
      readFile(new URL("../index.css", import.meta.url), "utf8"),
      readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8"),
      readFile(new URL("./VvipOffshorePage.tsx", import.meta.url), "utf8"),
    ]);
    expect(css).toContain(".form-field-invalid");
    expect(css).toContain(".form-file-invalid");
    expect(css).toContain("input[required]:user-invalid");
    expect(recruitment).toContain("const [invalidFields, setInvalidFields]");
    expect(vvip).toContain("const [invalidFields, setInvalidFields]");
  });
});
