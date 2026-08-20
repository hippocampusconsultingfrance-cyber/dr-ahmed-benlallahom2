import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("campagne LinkedIn de recrutement", () => {
  it("cadre le visuel de marque sans promesse ou contenu tiers", async () => {
    const root = process.cwd();
    const [source, rights] = await Promise.all([
      readFile(path.join(root, "LINKEDIN_RECRUITMENT_CAMPAIGN.md"), "utf8"),
      readFile(path.join(root, "VISUAL_ASSET_RIGHTS_REGISTER.md"), "utf8"),
    ]);
    for (const marker of ["/manus-storage/hippocampus-linkedin-recruitment-international_09269b3d.png", "3:4", "Europe, Canada, Moyen-Orient et Afrique", "sans promesse d’embauche", "Aucun logo tiers", "BRAND_KIT.md", "VISUAL_ASSET_RIGHTS_REGISTER.md"]) expect(source).toContain(marker);
    expect(rights).toContain("Visuels de campagne générés dans le projet");
    expect(rights).toContain("Visuel LinkedIn Hippocampus vérifié le 20 août 2026");
    expect(source).toContain("Validation visuelle");
    expect(source).toContain("1632 × 2176 px");
  });
});
