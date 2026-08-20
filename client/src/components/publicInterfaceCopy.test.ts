import { describe, expect, it } from "vitest";
import { getPublicInterfaceCopy, publicInterfaceCopy } from "./publicInterfaceCopy";

describe("catalogue des libellés publics", () => {
  it("fournit les libellés de navigation et de pied de page dans les quatre langues", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const copy = publicInterfaceCopy[language];
      expect(copy.recruitment.length).toBeGreaterThan(0);
      expect(copy.employers.length).toBeGreaterThan(0);
      expect(copy.search.length).toBeGreaterThan(0);
      expect(copy.resources.length).toBeGreaterThan(0);
      expect(copy.press.length).toBeGreaterThan(0);
      expect(copy.readability.label.length).toBeGreaterThan(0);
      expect(copy.oled.enable.length).toBeGreaterThan(0);
    }
  });

  it("utilise le français comme repli sûr", () => {
    expect(getPublicInterfaceCopy("unsupported")).toBe(publicInterfaceCopy.fr);
  });
});
