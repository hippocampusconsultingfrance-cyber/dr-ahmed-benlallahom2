// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { AdminEmptyState, adminStateCopy, getAdminStatePanelClassName } from "./AdminStatePanel";

describe("état vide administratif", () => {
  it("présente un repère accessible, un titre et une explication", () => {
    render(<AdminEmptyState icon={Inbox} title="Aucune candidature" description="Les nouveaux dossiers apparaîtront ici." />);

    expect(screen.getByLabelText("Aucune candidature")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Aucune candidature" })).toBeTruthy();
    expect(screen.getByText("Les nouveaux dossiers apparaîtront ici.")).toBeTruthy();
  });

  it("utilise une apparence distincte de l’état d’erreur", () => {
    expect(getAdminStatePanelClassName("empty")).toContain("bg-card");
    expect(getAdminStatePanelClassName("error")).toContain("bg-destructive");
  });

  it("définit un titre d’erreur dans les quatre langues actives", () => {
    expect(adminStateCopy.fr.loadErrorTitle).toBe("Impossible de charger ces données");
    expect(adminStateCopy.en.loadErrorTitle).toBe("These data could not be loaded");
    expect(adminStateCopy.de.loadErrorTitle).toBe("Diese Daten konnten nicht geladen werden");
    expect(adminStateCopy.zh.loadErrorTitle).toBe("无法加载这些数据");
  });
});
