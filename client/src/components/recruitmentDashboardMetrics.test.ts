import { describe, expect, it } from "vitest";
import { nonNegativeCount, percentageLabel } from "./recruitmentDashboardMetrics";

describe("indicateurs du tableau de bord recrutement", () => {
  it("calcule les ratios sans inventer de pourcentage lorsqu’il n’y a pas de base", () => {
    expect(percentageLabel(3, 12)).toBe("25 %");
    expect(percentageLabel(0, 0)).toBe("—");
  });

  it("normalise les agrégats SQL nullables en compteurs affichables", () => {
    expect(nonNegativeCount(null)).toBe(0);
    expect(nonNegativeCount(-4)).toBe(0);
    expect(nonNegativeCount(7)).toBe(7);
  });
});
