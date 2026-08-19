import { describe, expect, it } from "vitest";
import { getRecruitmentCampaignTemplate, RECRUITMENT_CAMPAIGN_TEMPLATES } from "./recruitmentCampaignTemplates";

describe("modèles de campagnes recrutement", () => {
  it("propose les quatre zones de mission avec les deux langues opérationnelles", () => {
    expect(RECRUITMENT_CAMPAIGN_TEMPLATES.map(template => template.id)).toEqual(["europe", "canada", "middle_east", "offshore"]);
    expect(getRecruitmentCampaignTemplate("offshore", "fr")?.body).toContain("plateforme pétrolière");
    expect(getRecruitmentCampaignTemplate("offshore", "en")?.body).toContain("oil platform");
  });

  it("ignore les identifiants de modèle inconnus", () => {
    expect(getRecruitmentCampaignTemplate("unknown", "fr")).toBeNull();
  });
});
