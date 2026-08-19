import { describe, expect, it } from "vitest";
import { candidate360Copy } from "./Candidate360Dialog";

describe("fiche Candidate 360° localisée", () => {
  it("définit les sections, statuts, relances et états vides dans les quatre langues actives", () => {
    for (const copy of Object.values(candidate360Copy)) {
      expect(Object.values(copy.statuses)).toHaveLength(6);
      expect(Object.values(copy.followUpStatuses)).toHaveLength(3);
      expect(copy.description).not.toHaveLength(0);
      expect(copy.unavailable).not.toHaveLength(0);
    }
  });

  it("conserve les actions de suivi localisées", () => {
    expect(candidate360Copy.en.markCompleted).toBe("Mark completed");
    expect(candidate360Copy.de.timeline).toBe("Aktionschronologie");
    expect(candidate360Copy.zh.title).toBe("候选人 360° 档案");
  });
});
