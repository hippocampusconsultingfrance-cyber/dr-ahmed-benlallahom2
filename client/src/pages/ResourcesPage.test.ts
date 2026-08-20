import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("page Ressources médicales", () => {
  it("conserve les quatre langues, les filtres et les sources institutionnelles contrôlées", async () => {
    const source = await readFile(path.resolve(process.cwd(), "client/src/pages/ResourcesPage.tsx"), "utf8");

    expect(source).toContain("fr:");
    expect(source).toContain("en:");
    expect(source).toContain("de:");
    expect(source).toContain("zh:");
    expect(source).toContain("www.who.int/news-room/fact-sheets/detail/patient-safety");
    expect(source).toContain("www.has-sante.fr/jcms/c_2042652/en/patient-safety");
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain("aria-pressed");
    expect(source).toContain("aria-live=\"polite\"");
    expect(source).toContain('getLocalizedCopy(resourcesCopy, language, "fr")');
  });

  it("reste déclarée dans les routes et l’index de recherche publics", async () => {
    const [app, index] = await Promise.all([
      readFile(path.resolve(process.cwd(), "client/src/App.tsx"), "utf8"),
      readFile(path.resolve(process.cwd(), "client/src/lib/publicSearchIndex.ts"), "utf8"),
    ]);
    expect(app).toContain('path="/resources"');
    expect(index).toContain('href: "/resources"');
  });
});
