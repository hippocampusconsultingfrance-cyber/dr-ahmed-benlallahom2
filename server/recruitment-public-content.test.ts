import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const recruitmentPage = readFileSync(new URL("../client/src/pages/RecruitmentPage.tsx", import.meta.url), "utf8");
const vvipPage = readFileSync(new URL("../client/src/pages/VvipOffshorePage.tsx", import.meta.url), "utf8");

describe("contenu public des parcours recrutement", () => {
  it("affiche la réassurance confidentialité, consentement, revue humaine et délai sur les deux formulaires", () => {
    for (const source of [recruitmentPage, vvipPage]) {
      expect(source).toContain("publicTrustCopy");
      expect(source).toContain("humanReview");
      expect(source).toContain("timeline");
      expect(source).toContain("confidentiality");
      expect(source).toContain("consent");
    }
  });

  it("exclut les références aux résidences du positionnement VVIP", () => {
    for (const forbiddenTerm of ["Résidences de prestige", "Prestige residences", "Prestigeresidenzen", "高端宅邸"]) {
      expect(recruitmentPage).not.toContain(forbiddenTerm);
    }

    for (const forbiddenTerm of ["résidences royales", "Residences / Government", "VVIP Residences", "VVIP-Residenzen", "VVIP 宅邸"]) {
      expect(vvipPage).not.toContain(forbiddenTerm);
    }
  });
});
