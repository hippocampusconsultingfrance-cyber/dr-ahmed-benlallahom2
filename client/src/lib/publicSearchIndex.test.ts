import { describe, expect, it } from "vitest";
import { publicSearchIndex, searchPublicPages } from "./publicSearchIndex";

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
