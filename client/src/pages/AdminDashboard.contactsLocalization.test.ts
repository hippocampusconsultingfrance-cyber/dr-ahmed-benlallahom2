import { describe, expect, it } from "vitest";
import { adminContactsCopy } from "./AdminDashboard";

describe("messages administratifs localisés", () => {
  it("définit les retours, actions et états vides dans les quatre langues actives", () => {
    for (const copy of Object.values(adminContactsCopy)) {
      expect(copy.markedRead).not.toHaveLength(0);
      expect(copy.total(2)).not.toHaveLength(0);
      expect(copy.emptyDescription).not.toHaveLength(0);
    }
  });

  it("conserve des actions localisées pour les messages", () => {
    expect(adminContactsCopy.en.read).toBe("Read");
    expect(adminContactsCopy.de.markedRead).toBe("Als gelesen markiert");
    expect(adminContactsCopy.zh.emptyTitle).toBe("暂无消息");
  });
});
