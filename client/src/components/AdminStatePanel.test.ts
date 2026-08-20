import { describe, expect, it } from "vitest";
import { getAdminEmptyIllustrationClassName, getAdminStatePanelClassName } from "./AdminStatePanel";

describe("états administratifs", () => {
  it("distingue les tons d’état vide et d’erreur", () => {
    expect(getAdminStatePanelClassName("empty")).toContain("border-border");
    expect(getAdminStatePanelClassName("error")).toContain("border-destructive");
  });
});

describe("illustration d’état vide administratif", () => {
  it("utilise un traitement décoratif en couches sans contenu fictif", () => {
    const className = getAdminEmptyIllustrationClassName();
    expect(className).toContain("before:border-dashed");
    expect(className).toContain("after:bg-primary/5");
  });
});
