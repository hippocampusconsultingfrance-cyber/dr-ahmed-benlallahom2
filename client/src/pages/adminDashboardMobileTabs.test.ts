import { describe, expect, it } from "vitest";
import { getActiveAdminTabLabel } from "./adminDashboardMobileTabs";

describe("sélecteur mobile du tableau de bord", () => {
  const tabs = [
    { id: "overview", label: "Vue d’ensemble" },
    { id: "recruitment", label: "Candidatures" },
  ] as const;

  it("retourne le libellé de l’onglet courant et un repli sûr", () => {
    expect(getActiveAdminTabLabel(tabs, "recruitment")).toBe("Candidatures");
    expect(getActiveAdminTabLabel(tabs, "unknown" as never)).toBe("Vue d’ensemble");
  });
});
