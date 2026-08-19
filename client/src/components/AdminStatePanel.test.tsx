// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { AdminEmptyState, getAdminStatePanelClassName } from "./AdminStatePanel";

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
});
