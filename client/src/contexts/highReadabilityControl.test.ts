import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Le bouton, la classe sur <html> et la préférence gardée sont exercés dans
// components/Navigation.dom.test.ts ; ici, ce que la classe change à la page.
describe("feuille de style de la lisibilité renforcée", () => {
  it("applique une taille de police sûre et des interlignes plus amples", async () => {
    const css = await readFile(path.join(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain("html.high-readability");
    expect(css).toContain("font-size: 106.25%");
    expect(css).toContain("html.high-readability p");
  });
});
