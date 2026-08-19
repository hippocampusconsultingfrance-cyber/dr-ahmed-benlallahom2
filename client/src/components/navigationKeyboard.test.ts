import { describe, expect, it } from "vitest";
import { getMenuFocusIndex, isNavigationDismissKey } from "./navigationKeyboard";

describe("clavier de navigation", () => {
  it("déplace le focus dans le menu de langue avec retour circulaire", () => {
    expect(getMenuFocusIndex(0, 4, "ArrowDown")).toBe(1);
    expect(getMenuFocusIndex(0, 4, "ArrowUp")).toBe(3);
    expect(getMenuFocusIndex(3, 4, "ArrowDown")).toBe(0);
    expect(getMenuFocusIndex(2, 4, "Home")).toBe(0);
    expect(getMenuFocusIndex(1, 4, "End")).toBe(3);
  });

  it("réserve Échap à la fermeture des contrôles de navigation", () => {
    expect(isNavigationDismissKey("Escape")).toBe(true);
    expect(isNavigationDismissKey("Enter")).toBe(false);
  });
});
