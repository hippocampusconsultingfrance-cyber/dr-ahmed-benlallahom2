import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("langues professionnelles de la candidature", () => {
  it("propose les langues demandées sous forme de cases à cocher et une précision conditionnelle", async () => {
    const source = await readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8");
    for (const language of ["Arabic", "French", "English", "Spanish", "Portuguese", "German", "Chinese", "Other"]) expect(source).toContain(`value: \"${language}\"`);
    expect(source).toContain('type="checkbox" checked={form.languages.includes(option.value)}');
    expect(source).toContain('form.languages.includes("Other")');
    expect(source).toContain('id="recruitment-other-language"');
    expect(source).toContain('lang === "fr" ? "Email" : t.email');
  });

  it("sérialise les sélections de langues et le détail éventuel sans envoyer de valeur vide", async () => {
    const source = await readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("const submittedLanguages = form.languages.flatMap");
    expect(source).toContain('body.append("languages", JSON.stringify(submittedLanguages))');
  });

  it("publie une adresse canonique dédiée et ne contient aucun caractère nul", async () => {
    const source = await readFile(new URL("./RecruitmentPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('ogUrl="https://drahmedbenlallahom.com/recruitment/standard"');
    expect(source).not.toContain("\0");
  });
});
