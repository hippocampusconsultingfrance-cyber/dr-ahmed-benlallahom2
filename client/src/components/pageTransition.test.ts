import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("transition de page", () => {
  it("est courte, déclenchée par le chemin et neutralisable", async () => {
    const root = process.cwd();
    const [component, css, app] = await Promise.all([
      readFile(path.join(root, "client/src/components/PageTransition.tsx"), "utf8"),
      readFile(path.join(root, "client/src/index.css"), "utf8"),
      readFile(path.join(root, "client/src/App.tsx"), "utf8"),
    ]);
    expect(component).toContain("useLocation");
    expect(component).toContain('key={location}');
    expect(css).toContain(".page-transition");
    expect(css).toContain("page-transition-enter 180ms");
    // Une transformation conservée après l'animation détache l'en-tête fixe (PUB-01) ; le
    // comportement est vérifié dans publicPages.browser.test.ts quand un Chromium est disponible.
    expect(css).not.toMatch(/animation: page-transition-enter[^;]*\b(both|forwards)\b/);
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(css).toContain("html.data-saver .page-transition");
    expect(app).toContain("<PageTransition><Router /></PageTransition>");
  });
});
