import { describe, expect, it } from "vitest";
import { notFoundCopy, notFoundSeo } from "./NotFound";

describe("NotFound SEO", () => {
  it("prevents indexing of a missing route", () => {
    expect(notFoundSeo.noIndex).toBe(true);
  });

  it("provides localized recovery actions in every active language", () => {
    for (const copy of Object.values(notFoundCopy)) {
      expect(copy.subtitle).not.toHaveLength(0);
      expect(copy.description).not.toHaveLength(0);
      expect(copy.goHome).not.toHaveLength(0);
      expect(copy.goBack).not.toHaveLength(0);
    }
    expect(notFoundCopy.zh.goHome).toBe("返回首页");
  });
});
