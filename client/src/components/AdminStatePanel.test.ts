import { describe, expect, it } from "vitest";
import { getAdminStatePanelClassName } from "./AdminStatePanel";

describe("états administratifs", () => {
  it("distingue les tons d’état vide et d’erreur", () => {
    expect(getAdminStatePanelClassName("empty")).toContain("border-border");
    expect(getAdminStatePanelClassName("error")).toContain("border-destructive");
  });
});
