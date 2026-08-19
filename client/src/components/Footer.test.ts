import { describe, expect, it } from "vitest";
import { getHomeSectionHref } from "./Footer";

describe("liens de navigation du pied de page", () => {
  it("redirige chaque section de l’accueil via un fragment d’URL portable", () => {
    expect(getHomeSectionHref("experience")).toBe("/#experience");
    expect(getHomeSectionHref("services")).toBe("/#services");
    expect(getHomeSectionHref("education")).toBe("/#education");
    expect(getHomeSectionHref("contact")).toBe("/#contact");
  });
});
