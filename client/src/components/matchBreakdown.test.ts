import { describe, expect, it } from "vitest";
import { getPositiveMatchBreakdown } from "./matchBreakdown";

describe("détail explicable du score de matching", () => {
  it("ne retourne que les critères ayant contribué au score", () => {
    expect(getPositiveMatchBreakdown({
      specialty: 35,
      mobility: 0,
      certifications: 20,
      languages: 0,
      experience: 10,
      availability: 0,
    })).toEqual([
      { key: "specialty", label: "Spécialité", points: 35 },
      { key: "certifications", label: "Certifications", points: 20 },
      { key: "experience", label: "Expérience", points: 10 },
    ]);
  });
});
