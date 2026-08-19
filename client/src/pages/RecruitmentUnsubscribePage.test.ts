import { describe, expect, it } from "vitest";
import { getRecruitmentUnsubscribeCopy } from "./RecruitmentUnsubscribePage";

describe("getRecruitmentUnsubscribeCopy", () => {
  it("provides a clear confirmation action in all supported languages", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = getRecruitmentUnsubscribeCopy(language);
      expect(copy.confirm.trim()).not.toHaveLength(0);
      expect(copy.success.trim()).not.toHaveLength(0);
      expect(copy.invalid.trim()).not.toHaveLength(0);
      expect(copy.metaTitle.trim()).not.toHaveLength(0);
      expect(copy.metaDescription.trim()).not.toHaveLength(0);
    }
  });

  it("uses distinct localized metadata for the public unsubscribe page", () => {
    expect(getRecruitmentUnsubscribeCopy("en").metaTitle).toBe("Recruitment unsubscribe | Hippocampus Consulting");
    expect(getRecruitmentUnsubscribeCopy("de").metaDescription).toContain("Recruiting-Mitteilungen");
    expect(getRecruitmentUnsubscribeCopy("zh").metaTitle).toContain("取消招聘订阅");
  });
});
