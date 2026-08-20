import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("page Presse", () => {
  it("reste multilingue, transparente sur les publications tierces et accessible depuis les parcours publics", async () => {
    const [page, app, search, footer] = await Promise.all([
      readFile(path.resolve(process.cwd(), "client/src/pages/PressPage.tsx"), "utf8"),
      readFile(path.resolve(process.cwd(), "client/src/App.tsx"), "utf8"),
      readFile(path.resolve(process.cwd(), "client/src/lib/publicSearchIndex.ts"), "utf8"),
      readFile(path.resolve(process.cwd(), "client/src/components/Footer.tsx"), "utf8"),
    ]);
    for (const language of ["fr:", "en:", "de:", "zh:"]) expect(page).toContain(language);
    expect(page).toContain("Aucune publication tierce n’est actuellement référencée");
    expect(page).toContain("sans une source stable et vérifiable");
    expect(app).toContain('path="/press"');
    expect(search).toContain('href: "/press"');
    expect(footer).toContain('href="/press"');
  });
});
