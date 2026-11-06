import { describe, expect, it } from "vitest";
import { footerBrandLogoAltCopy, getHomeSectionHref } from "./Footer";

// Titres et liens rendus dans les quatre langues : Footer.dom.test.ts.
describe("liens de navigation du pied de page", () => {
  it("redirige chaque section de l’accueil via un fragment d’URL portable", () => {
    expect(getHomeSectionHref("experience")).toBe("/#experience");
    expect(getHomeSectionHref("services")).toBe("/#services");
    expect(getHomeSectionHref("education")).toBe("/#education");
    expect(getHomeSectionHref("contact")).toBe("/#contact");
  });

  it("propose une alternative de marque dans les quatre langues actives", () => {
    expect(Object.keys(footerBrandLogoAltCopy)).toEqual(["fr", "en", "de", "zh"]);
    for (const alt of Object.values(footerBrandLogoAltCopy)) {
      expect(alt.trim()).not.toHaveLength(0);
    }
  });
});
