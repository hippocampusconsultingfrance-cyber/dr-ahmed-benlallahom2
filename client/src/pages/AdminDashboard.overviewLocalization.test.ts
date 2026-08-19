import { describe, expect, it } from "vitest";
import { adminOverviewCopy } from "./AdminDashboard";

describe("vue d’ensemble administrative localisée", () => {
  it("définit les indicateurs et raccourcis dans les quatre langues actives", () => {
    for (const copy of Object.values(adminOverviewCopy)) {
      expect(Object.values(copy).every(label => label.length > 0)).toBe(true);
    }
  });

  it("conserve des libellés métier localisés pour les raccourcis", () => {
    expect(adminOverviewCopy.en.applications).toBe("Applications");
    expect(adminOverviewCopy.de.missions).toBe("Aufträge");
    expect(adminOverviewCopy.zh.gdpr).toBe("隐私请求");
  });
});
