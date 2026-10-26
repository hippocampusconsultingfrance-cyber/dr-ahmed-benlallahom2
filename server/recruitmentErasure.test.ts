import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const recruitmentTab = readFileSync(new URL("../client/src/components/RecruitmentTab.tsx", import.meta.url), "utf8");

describe("effacement RGPD des candidatures", () => {
  it("explique clairement à l’administrateur la portée de l’effacement et son résultat", () => {
    expect(recruitmentTab).toContain("Effacer RGPD + preuve");
    expect(recruitmentTab).toContain("Seule une preuve d’effacement anonymisée est conservée");
    expect(recruitmentTab).toContain("describeErasureReport");
    expect(recruitmentTab).not.toContain("révocation immédiate de l’accès au document");
  });
});
