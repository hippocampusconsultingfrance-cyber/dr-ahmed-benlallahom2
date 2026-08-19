import { describe, expect, it } from "vitest";
import { getMainContentTarget } from "./SkipToContent";

describe("accès direct au contenu principal", () => {
  it("attribue une cible et rend le main focalisable", () => {
    const main = { id: "", tabIndex: 0, focus: () => undefined };
    const target = getMainContentTarget({ querySelector: () => main });
    expect(target).toBe(main);
    expect(main.id).toBe("main-content");
    expect(main.tabIndex).toBe(-1);
  });

  it("ne crée pas de cible lorsqu’aucun main n’est présent", () => {
    expect(getMainContentTarget({ querySelector: () => null })).toBeNull();
  });
});
