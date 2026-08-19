import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { footerBrandLogoAltCopy, getHomeSectionHref } from "./Footer";

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

  it("réutilise le libellé de contact localisé pour le titre partagé", async () => {
    const source = await readFile(new URL("./Footer.tsx", import.meta.url), "utf8");
    expect(source).toContain("{content.nav.contact}</h4>");
    expect(source).not.toContain(">Contact</h4>");
  });
});
