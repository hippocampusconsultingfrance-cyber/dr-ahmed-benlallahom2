import { describe, expect, it } from "vitest";
import { publicSearchIndex, searchPublicPages } from "./publicSearchIndex";
import { getSitemapRoutes } from "../../../server/routeSeo";

const hrefs = (query: string, language: "fr" | "en" | "de" | "zh") => searchPublicPages(query, language).map(result => result.entry.href);

describe("recherche publique", () => {
  it("ne référence que des parcours publics autorisés", () => {
    expect(publicSearchIndex.every((entry) => !entry.href.startsWith("/admin") && !entry.href.startsWith("/candidate-portal"))).toBe(true);
  });

  it("retrouve un parcours multilingue sans tenir compte des accents", () => {
    expect(searchPublicPages("réserver", "fr")[0]?.entry.href).toBe("/booking");
    expect(searchPublicPages("recruitment", "en")[0]?.entry.href).toBe("/recruitment");
    expect(searchPublicPages("常见问题", "zh")[0]?.entry.href).toBe("/faq");
  });

  it("oriente les recherches candidat et VVIP vers les routes réellement déclarées", () => {
    expect(searchPublicPages("espace candidat", "fr")[0]?.entry.href).toBe("/candidate/access");
    expect(searchPublicPages("VVIP offshore", "fr")[0]?.entry.href).toBe("/recruitment/vvip-offshore");
  });
});

describe("index enrichi (PUB-SEARCH-01)", () => {
  it("« anesthésie » renvoie les questions santé et la réservation, avec ou sans accent", () => {
    for (const query of ["anesthésie", "anesthesie", "Anesthésie générale"]) {
      const results = hrefs(query, "fr");
      expect(results[0], query).toBe("/questions-anesthesie");
    }
    expect(hrefs("anesthésie", "fr")).toContain("/booking");
  });

  it("trouve les termes métier testés par l'audit dans les 4 langues", () => {
    const expectations: Array<[string, "fr" | "en" | "de" | "zh", string]> = [
      ["réanimation", "fr", "/"],
      ["jeûne", "fr", "/questions-anesthesie"],
      ["tarif", "fr", "/booking"],
      ["IADE", "fr", "/recruitment"],
      ["infirmier", "fr", "/recruitment"],
      ["questions santé", "fr", "/questions-anesthesie"],
      ["presse", "fr", "/press"],
      ["Octopus", "fr", "/venture/octopus-talent"],
      ["anaesthesia", "en", "/questions-anesthesie"],
      ["anesthesia", "en", "/questions-anesthesie"],
      ["fasting", "en", "/questions-anesthesie"],
      ["nurse", "en", "/recruitment"],
      ["Narkose", "de", "/questions-anesthesie"],
      ["Honorar", "de", "/booking"],
      ["麻醉", "zh", "/questions-anesthesie"],
      ["护士", "zh", "/recruitment"],
    ];
    for (const [query, language, expected] of expectations) {
      expect(hrefs(query, language), `${language}:${query}`).toContain(expected);
    }
  });

  it("couvre toutes les pages publiques indexables du sitemap", () => {
    const indexed = new Set(publicSearchIndex.map(entry => entry.href));
    for (const route of getSitemapRoutes()) expect(indexed.has(route), route).toBe(true);
  });

  it("renseigne titre, description et mots-clés dans les 4 langues", () => {
    for (const entry of publicSearchIndex) {
      for (const language of ["fr", "en", "de", "zh"] as const) {
        expect(entry.title[language], `${entry.href} ${language}`).toBeTruthy();
        expect(entry.description[language], `${entry.href} ${language}`).toBeTruthy();
        expect(entry.keywords[language].length, `${entry.href} ${language}`).toBeGreaterThan(0);
      }
    }
  });

  it("ne propose pas les témoignages tant qu'ils sont masqués", () => {
    expect(publicSearchIndex.some(entry => entry.href === "/testimonials")).toBe(false);
    expect(hrefs("témoignages", "fr")).toEqual([]);
  });
});
