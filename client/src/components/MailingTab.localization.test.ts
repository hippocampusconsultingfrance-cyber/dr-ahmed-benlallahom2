import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("mailing administratif multilingue", () => {
  it("localise le titre, les contrôles, l’historique et les statuts de campagne", async () => {
    const source = await readFile(new URL("./MailingTab.tsx", import.meta.url), "utf8");
    expect(source).toContain("const mailingCopy = {");
    expect(source).toContain("const { language: interfaceLanguage } = useLanguage();");
    expect(source).toContain("{copy.title}");
    expect(source).toContain("{copy.intro}");
    expect(source).toContain("campaignStatusLabel(campaign.status, copy.statuses)");
    expect(source).toContain("{copy.reviewBeforeSending}");
    expect(source).toContain("{copy.history}");
    expect(source).toContain("{copy.confirmTitle}");
    expect(source).toContain("{copy.minimumScore}");
    expect(source).toContain("interfaceLanguage === \"zh\"");
  });
});
