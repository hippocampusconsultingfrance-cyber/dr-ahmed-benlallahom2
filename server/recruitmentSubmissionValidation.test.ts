import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const recruitmentPage = readFileSync(new URL("../client/src/pages/RecruitmentPage.tsx", import.meta.url), "utf8");

describe("validation de soumission de candidature", () => {
  it("accepte autant de pays ciblés que le formulaire public en propose", () => {
    expect(server).toContain("const RECRUITMENT_MAX_TARGET_COUNTRIES = 18;");
    expect(server).toContain(".max(RECRUITMENT_MAX_TARGET_COUNTRIES)");
    const choices = recruitmentPage.slice(recruitmentPage.indexOf("const countryOptions"), recruitmentPage.indexOf("const OTHER_TARGET_COUNTRY"));
    expect((choices.match(/value:/g) ?? []).length).toBe(18);
  });

  it("explique la limite de pays au lieu de retourner un rejet générique", () => {
    expect(server).toContain('issue.path[0] === "targetCountries" && issue.code === "too_big"');
    expect(server).toContain("Vous pouvez sélectionner jusqu’à ${RECRUITMENT_MAX_TARGET_COUNTRIES} pays ciblés.");
  });
});
