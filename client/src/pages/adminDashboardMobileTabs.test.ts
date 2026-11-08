import { describe, expect, it } from "vitest";
import { getActiveAdminTabLabel, type AdminTabOption } from "./adminDashboardMobileTabs";

describe("sélecteur mobile du tableau de bord", () => {
  const tabs: AdminTabOption<"overview" | "recruitment">[] = [
    { id: "overview", label: "Vue d’ensemble" },
    { id: "recruitment", label: "Candidatures" },
  ];

  it("retourne le libellé de l’onglet courant et un repli sûr", () => {
    expect(getActiveAdminTabLabel(tabs, "recruitment")).toBe("Candidatures");
    expect(getActiveAdminTabLabel(tabs, "unknown" as never)).toBe("Vue d’ensemble");
  });
});
