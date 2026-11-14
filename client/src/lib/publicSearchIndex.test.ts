import { describe, expect, it } from "vitest";
import {
  publicSearchIndex,
  publicShortcuts,
  searchPublicPages,
} from "./publicSearchIndex";
import { getSitemapRoutes } from "../../../server/routeSeo";

const hrefs = (query: string, language: "fr" | "en" | "de" | "zh") =>
  searchPublicPages(query, language).map(result => result.entry.href);

describe("recherche publique", () => {
  it("ne référence que des parcours publics autorisés", () => {
    expect(
      publicSearchIndex.every(
        entry =>
          !entry.href.startsWith("/admin") &&
          !entry.href.startsWith("/candidate-portal")
      )
    ).toBe(true);
  });

  it("retrouve un parcours multilingue sans tenir compte des accents", () => {
    expect(searchPublicPages("réserver", "fr")[0]?.entry.href).toBe("/booking");
    expect(searchPublicPages("recruitment", "en")[0]?.entry.href).toBe(
      "/recruitment"
    );
    expect(searchPublicPages("常见问题", "zh")[0]?.entry.href).toBe("/faq");
  });

  it("oriente les recherches candidat et VVIP vers les routes réellement déclarées", () => {
    expect(searchPublicPages("espace candidat", "fr")[0]?.entry.href).toBe(
      "/candidate/access"
    );
    expect(searchPublicPages("VVIP offshore", "fr")[0]?.entry.href).toBe(
      "/recruitment/vvip-offshore"
    );
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
      expect(hrefs(query, language), `${language}:${query}`).toContain(
        expected
      );
    }
  });

  it("couvre toutes les pages publiques indexables du sitemap", () => {
    const indexed = new Set(publicSearchIndex.map(entry => entry.href));
    for (const route of getSitemapRoutes())
      expect(indexed.has(route), route).toBe(true);
  });

  it("renseigne titre, description et mots-clés dans les 4 langues", () => {
    for (const entry of publicSearchIndex) {
      for (const language of ["fr", "en", "de", "zh"] as const) {
        expect(entry.title[language], `${entry.href} ${language}`).toBeTruthy();
        expect(
          entry.description[language],
          `${entry.href} ${language}`
        ).toBeTruthy();
        expect(
          entry.keywords[language].length,
          `${entry.href} ${language}`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("ne propose pas les témoignages tant qu'ils sont masqués", () => {
    expect(
      publicSearchIndex.some(entry => entry.href === "/testimonials")
    ).toBe(false);
    expect(hrefs("témoignages", "fr")).toEqual([]);
  });
});

describe("recherche sans résultat (PUB-28)", () => {
  it("mène « annuler » et « remboursement » à la FAQ et à la réservation, en français et en anglais", () => {
    for (const [query, language] of [
      ["annuler", "fr"],
      ["annulé", "fr"],
      ["remboursement", "fr"],
      ["rembourser", "fr"],
      ["cancel", "en"],
      ["cancelled", "en"],
      ["refund", "en"],
      ["reimbursement", "en"],
      ["stornieren", "de"],
      ["取消", "zh"],
    ] as const) {
      const results = searchPublicPages(query, language);
      expect(
        results
          .map(result => result.entry.href)
          .slice(0, 2)
          .sort(),
        `${language}:${query}`
      ).toEqual(["/booking", "/faq"]);
      expect(
        results.every(result => !result.partial),
        `${language}:${query}`
      ).toBe(true);
    }
  });

  it("garde le classement des pages qui contiennent tous les mots", () => {
    const results = searchPublicPages("espace candidat", "fr");
    expect(results[0]?.entry.href).toBe("/candidate/access");
    expect(
      results.every(result => !result.partial && result.matchedTerms === 2)
    ).toBe(true);
  });

  it("sans page qui contienne tous les mots, propose celles qui en contiennent au moins un, classées par score", () => {
    for (const [query, expected] of [
      ["recrutement Dubai", "/recruitment"],
      ["opération enfant", "/questions-anesthesie"],
    ] as const) {
      const results = searchPublicPages(query, "fr");
      expect(results[0]?.entry.href, query).toBe(expected);
      expect(
        results.every(result => result.partial && result.matchedTerms === 1),
        query
      ).toBe(true);
      const scores = results.map(result => result.score);
      expect(scores, query).toEqual(
        [...scores].sort((left, right) => right - left)
      );
    }
  });

  it("ne se rabat pas sur les mots vides ni sur une lettre seule, présents dans presque toutes les pages", () => {
    expect(hrefs("la zzzz", "fr")).toEqual([]);
    expect(hrefs("à de zzzz", "fr")).toEqual([]);
    expect(hrefs("x zzzz", "fr")).toEqual([]);
    expect(hrefs("the of zzzz", "en")).toEqual([]);
    expect(hrefs("der und zzzz", "de")).toEqual([]);
    expect(hrefs("zzzz", "fr")).toEqual([]);
    // Un mot chinois de deux caractères reste un vrai mot.
    expect(hrefs("麻醉 zzzz", "zh")).toContain("/questions-anesthesie");
  });

  it("se rabat sur un mot court du site, comme « cv »", () => {
    for (const language of ["fr", "en"] as const) {
      const results = searchPublicPages("cv dubai", language);
      expect(results[0]?.entry.href, language).toBe("/recruitment/standard");
      expect(
        results.every(result => result.partial),
        language
      ).toBe(true);
    }
  });

  it("ne compte pas la ponctuation autour des mots comme un mot", () => {
    for (const [query, language] of [
      ["annuler ?", "fr"],
      ["« annuler »", "fr"],
      ["cancel?", "en"],
      ["取消？", "zh"],
    ] as const) {
      const results = searchPublicPages(query, language);
      expect(
        results.map(result => result.entry.href).sort(),
        `${language}:${query}`
      ).toEqual(["/booking", "/faq"]);
      expect(
        results.every(result => !result.partial),
        `${language}:${query}`
      ).toBe(true);
    }
    expect(hrefs("?", "fr")).toEqual([]);
  });

  it("propose comme raccourcis de vraies pages du site, nommées dans les 4 langues", () => {
    const routes = new Set([...getSitemapRoutes(), "/#contact"]);
    expect(publicShortcuts.links.map(link => link.href)).toEqual([
      "/booking",
      "/questions-anesthesie",
      "/recruitment",
      "/employers",
      "/#contact",
    ]);
    for (const link of publicShortcuts.links) {
      expect(routes.has(link.href), link.href).toBe(true);
      for (const language of ["fr", "en", "de", "zh"] as const)
        expect(link.label[language], `${link.href} ${language}`).toBeTruthy();
    }
  });
});
