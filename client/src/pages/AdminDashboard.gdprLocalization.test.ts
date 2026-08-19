import { describe, expect, it } from "vitest";
import { adminGdprCopy } from "./AdminDashboard";

describe("demandes RGPD administratives localisées", () => {
  it("définit types, statuts, actions et état vide dans les quatre langues actives", () => {
    for (const copy of Object.values(adminGdprCopy)) {
      expect(Object.values(copy.types)).toHaveLength(5);
      expect(Object.values(copy.statuses)).toHaveLength(4);
      expect(copy.total(2)).not.toHaveLength(0);
      expect(copy.emptyDescription).not.toHaveLength(0);
    }
  });

  it("conserve les termes RGPD prioritaires localisés", () => {
    expect(adminGdprCopy.en.types.deletion).toBe("Erasure");
    expect(adminGdprCopy.de.statuses.in_progress).toBe("In Bearbeitung");
    expect(adminGdprCopy.zh.emptyTitle).toBe("暂无隐私请求");
  });
});
