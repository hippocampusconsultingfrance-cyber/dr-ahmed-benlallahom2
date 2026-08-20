import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("géométrie des recherches", () => {
  it("réserve un espace explicite entre l’icône, le texte et l’action d’effacement", async () => {
    const root = process.cwd();
    const [styles, recruitment, resources, search] = await Promise.all([
      readFile(path.join(root, "client/src/index.css"), "utf8"),
      readFile(path.join(root, "client/src/pages/RecruitmentPage.tsx"), "utf8"),
      readFile(path.join(root, "client/src/pages/ResourcesPage.tsx"), "utf8"),
      readFile(path.join(root, "client/src/pages/SearchPage.tsx"), "utf8"),
    ]);

    for (const marker of [".site-search-shell", ".site-search-icon", ".site-search-input", "padding-left: 3.35rem;", ".site-search-clear"]) expect(styles).toContain(marker);
    for (const source of [recruitment, resources, search]) expect(source).toContain("site-search-input");
    expect(recruitment).toContain("site-search-input-with-clear");
  });
});
