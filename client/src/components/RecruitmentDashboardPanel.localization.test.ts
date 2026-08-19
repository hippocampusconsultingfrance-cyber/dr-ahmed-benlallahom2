import { describe, expect, it } from "vitest";
import { recruitmentDashboardCopy } from "./RecruitmentDashboardPanel";

describe("pilotage Recrutement localisé", () => {
  it("définit les indicateurs, analyses et délivrabilité dans les quatre langues actives", () => {
    for (const copy of Object.values(recruitmentDashboardCopy)) {
      expect(copy.intro).not.toHaveLength(0);
      expect(copy.dueFollowUps(2)).not.toHaveLength(0);
      expect(copy.metrics.responseDetail(2, 3)).not.toHaveLength(0);
      expect(copy.analysis.needsReview).not.toHaveLength(0);
    }
  });

  it("conserve les libellés de pilotage prioritaires localisés", () => {
    expect(recruitmentDashboardCopy.en.title).toBe("Recruitment overview");
    expect(recruitmentDashboardCopy.de.delivery.delivered).toBe("Zugestellt");
    expect(recruitmentDashboardCopy.zh.analysis.completed).toBe("已完成");
  });
});
