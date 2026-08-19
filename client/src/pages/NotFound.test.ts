import { describe, expect, it } from "vitest";
import { notFoundSeo } from "./NotFound";

describe("NotFound SEO", () => {
  it("prevents indexing of a missing route", () => {
    expect(notFoundSeo.noIndex).toBe(true);
  });
});
