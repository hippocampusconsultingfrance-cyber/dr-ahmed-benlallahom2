import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

// L’ordre des liens de navigation est vérifié sur la barre montée (Navigation.dom.test.ts).
describe("page de recrutement principale", () => {
  it("place une Terre décorative derrière la page de recrutement principale", () => {
    const source = readSource("client/src/pages/RecruitmentHubPage.tsx");
    expect(source).toContain("/assets/medical-hero.svg");
    expect(source).toContain('aria-hidden="true"');
  });
});
