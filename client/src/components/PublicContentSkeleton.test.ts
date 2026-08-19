import { describe, expect, it } from "vitest";
import { getSkeletonCardCount, getSkeletonGridClass } from "./PublicContentSkeleton";

describe("PublicContentSkeleton", () => {
  it("borne le nombre de cartes pour préserver la lisibilité", () => {
    expect(getSkeletonCardCount()).toBe(3);
    expect(getSkeletonCardCount(0)).toBe(1);
    expect(getSkeletonCardCount(7)).toBe(4);
  });

  it("adapte la grille au contexte de contenu", () => {
    expect(getSkeletonGridClass(2)).toContain("lg:grid-cols-2");
    expect(getSkeletonGridClass(4)).toContain("xl:grid-cols-4");
  });
});
