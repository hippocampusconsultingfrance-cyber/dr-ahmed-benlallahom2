import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("repères accessibles des pages légales", () => {
  it("nomme le groupe d’onglets dans chacune des quatre langues", async () => {
    const source = await readFile(new URL("./LegalPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('aria-label="Sections juridiques"');
    expect(source).toContain('aria-label="Legal sections"');
    expect(source).toContain('aria-label="Rechtliche Bereiche"');
    expect(source).toContain('aria-label="法律栏目"');
  });
});
