import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("libellés français des formulaires", () => {
  it("utilise Email sans qualificatif professionnel dans les parcours concernés", () => {
    const pages = ["CandidateAccessPage.tsx", "EmployersPage.tsx", "RecruitmentPage.tsx", "VvipOffshorePage.tsx"];
    for (const page of pages) {
      const source = readFileSync(new URL(`./${page}`, import.meta.url), "utf8");
      expect(source).not.toContain("Email professionnel");
    }
  });
});
