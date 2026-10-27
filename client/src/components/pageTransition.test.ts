import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// L’enveloppe de chaque page et son renouvellement au changement de chemin sont
// vérifiés sur l’application montée (PageTransition.dom.test.ts) ; ici, la feuille de style.
describe("transition de page", () => {
  it("est courte et neutralisable", async () => {
    const css = await readFile(path.join(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain(".page-transition");
    expect(css).toContain("page-transition-enter 180ms");
    // Une transformation conservée après l'animation détache l'en-tête fixe (PUB-01) ; le
    // comportement est vérifié dans publicPages.browser.test.ts quand un Chromium est disponible.
    expect(css).not.toMatch(/animation: page-transition-enter[^;]*\b(both|forwards)\b/);
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(css).toContain("html.data-saver .page-transition");
  });
});
