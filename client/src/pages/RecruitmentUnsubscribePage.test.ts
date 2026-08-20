import { describe, expect, it } from "vitest";
import { getRecruitmentUnsubscribeCopy } from "./RecruitmentUnsubscribePage";

describe("getRecruitmentUnsubscribeCopy", () => {
  it("provides a clear confirmation action in all supported languages", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = getRecruitmentUnsubscribeCopy(language);
      expect(copy.confirm.trim()).not.toHaveLength(0);
      expect(copy.success.trim()).not.toHaveLength(0);
      expect(copy.invalid.trim()).not.toHaveLength(0);
    }
  });
});
